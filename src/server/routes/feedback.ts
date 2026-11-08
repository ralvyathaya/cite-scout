import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { sendFeedbackEmail } from '../../integrations/resend/email';
import { feedbackSchema } from '../../shared/feedback';
import { createAuth } from '../auth';
import { readJson, requireSession } from '../http';
import { consumeRateLimit } from '../rate-limit';

export const feedbackRoutes = new Hono<{ Bindings: CloudflareBindings }>();
feedbackRoutes.use(
  '*',
  bodyLimit({
    maxSize: 16_384,
    onError: (c) =>
      c.json(
        {
          error: {
            code: 'BODY_TOO_LARGE',
            message: 'Feedback is too large. Please shorten your message.',
          },
        },
        413,
      ),
  }),
);

feedbackRoutes.post('/', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session)
    return c.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in to send feedback.' } },
      401,
    );

  const local = c.env.APP_ENV === 'development' && c.env.DEPLOYMENT_ENV === 'local';
  const origins = local
    ? [
        'http://localhost:5173',
        'http://localhost:4173',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:4173',
      ]
    : [new URL(c.env.APP_URL).origin];
  if (!origins.includes(c.req.header('Origin') ?? ''))
    return c.json(
      { error: { code: 'INVALID_ORIGIN', message: 'Send feedback from your CiteScout app.' } },
      403,
    );
  if (c.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
    return c.json(
      { error: { code: 'INVALID_CONTENT_TYPE', message: 'Send feedback as JSON.' } },
      415,
    );

  const parsed = feedbackSchema.safeParse(await readJson(c.req.raw));
  if (!parsed.success)
    return c.json(
      {
        error: {
          code: 'INVALID_FEEDBACK',
          message: 'Choose a category, enter 10–3,000 characters, and check your optional email.',
        },
      },
      422,
    );

  const unavailable = {
    error: {
      code: 'FEEDBACK_UNAVAILABLE',
      message:
        'We couldn’t confirm your feedback was submitted. Your message is still here; please try again.',
    },
  };
  const apiKey = z.string().trim().min(1).safeParse(c.env.RESEND_API_KEY);
  if (c.env.EXTERNAL_INTEGRATIONS_ENABLED !== 'true' || !apiKey.success)
    return c.json(unavailable, 503);

  for (const [key, limit, window] of [
    [`feedback:user:${session.user.id}`, 5, 3600],
    ['feedback:global', 50, 86400],
  ] as const) {
    if (!(await consumeRateLimit(c.env.DB, key, limit, window))) {
      c.header('Retry-After', String(window - (Math.floor(Date.now() / 1000) % window)));
      return c.json(
        {
          error: {
            code: 'FEEDBACK_RATE_LIMITED',
            message: 'Feedback limit reached. Please try again later; your message is still here.',
          },
        },
        429,
      );
    }
  }

  try {
    await sendFeedbackEmail({
      apiKey: apiKey.data,
      from: c.env.RESEND_FROM_EMAIL,
      appUrl: c.env.APP_URL,
      userId: session.user.id,
      feedback: parsed.data,
    });
    return c.json({ data: { submitted: true } });
  } catch {
    return c.json(unavailable, 503);
  }
});
