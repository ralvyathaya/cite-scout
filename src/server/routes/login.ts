import { Hono } from 'hono';
import { z } from 'zod';
import { safeRedirect } from '../../domain/redirects';
import { verifyTurnstile } from '../../integrations/turnstile/verify';
import { createAuth } from '../auth';
import { getConfig } from '../config';
import { readJsonLimited } from '../http';
import { consumeRateLimit } from '../rate-limit';

const loginSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  turnstileToken: z.string().max(2048),
  callbackURL: z.string().optional(),
});
export const loginRoutes = new Hono<{ Bindings: CloudflareBindings }>();

loginRoutes.post('/magic-link', async (c) => {
  const parsed = loginSchema.safeParse(await readJsonLimited(c.req.raw));
  const generic = {
    data: {
      accepted: true,
      message: 'If the request is valid, a sign-in link will arrive shortly.',
    },
  };
  if (!parsed.success) return c.json(generic);
  const config = getConfig(c.env);
  const clientKey = c.req.header('CF-Connecting-IP') ?? 'unknown';
  if (!(await consumeRateLimit(c.env.DB, `magic-link:${clientKey}`, 5, 60))) return c.json(generic);
  const expectedHostname = new URL(config.APP_URL).hostname;
  if (config.EXTERNAL_INTEGRATIONS_ENABLED === 'true') {
    const valid = await verifyTurnstile({
      token: parsed.data.turnstileToken,
      secret: c.env.TURNSTILE_SECRET_KEY,
      expectedAction: 'magic_link',
      expectedHostname,
      remoteIp: c.req.header('CF-Connecting-IP'),
    });
    if (!valid) return c.json(generic);
  }
  await createAuth(c.env).api.signInMagicLink({
    body: {
      email: parsed.data.email,
      callbackURL: safeRedirect(parsed.data.callbackURL, config.APP_URL),
    },
    headers: c.req.raw.headers,
  });
  return c.json(generic);
});
