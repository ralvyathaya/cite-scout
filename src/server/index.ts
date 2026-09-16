import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { createAuth } from './auth';
import { getConfig } from './config';
import { projectRoutes } from './routes/project';
import { billingRoutes, handleLemonWebhook } from './routes/billing';
import { loginRoutes } from './routes/login';
import { scanRoutes } from './routes/scans';
import { runScheduledScans } from './cron';
import { accountRoutes } from './routes/account';

interface AppEnv {
  Bindings: CloudflareBindings;
}

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  getConfig(c.env);
  await next();
});

app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
      frameSrc: ['https://challenges.cloudflare.com'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
    referrerPolicy: 'strict-origin-when-cross-origin',
  }),
);

app.use('/api/*', async (c, next) => {
  const startedAt = performance.now();
  const requestId = c.req.header('cf-ray') ?? crypto.randomUUID();
  c.header('X-Request-ID', requestId);
  await next();
  console.log(
    JSON.stringify({
      event: 'request_completed',
      route: c.req.path,
      method: c.req.method,
      status: c.res.status,
      request_id: requestId,
      duration_ms: Math.round(performance.now() - startedAt),
    }),
  );
});

app.get('/api/health', (c) => c.json({ data: { status: 'ok', service: 'promptwatch' } }));
app.post('/api/auth/sign-in/magic-link', (c) =>
  c.json(
    { error: { code: 'TURNSTILE_REQUIRED', message: 'Use the protected login endpoint.' } },
    403,
  ),
);
app.all('/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));
app.get('/api/me', async (c) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  return c.json({
    data: {
      user: { id: session.user.id, email: session.user.email },
      session: { expiresAt: session.session.expiresAt },
    },
  });
});
app.route('/api/project', projectRoutes);
app.route('/api/billing', billingRoutes);
app.route('/api/login', loginRoutes);
app.route('/api/scans', scanRoutes);
app.route('/api/account', accountRoutes);
app.post('/api/webhooks/lemonsqueezy', (c) => handleLemonWebhook(c.req.raw, c.env));

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } }, 404);
  }
  return c.text('Not found', 404);
});

app.onError((error, c) => {
  console.error(
    JSON.stringify({ event: 'request_failed', route: c.req.path, error_code: 'INTERNAL_ERROR' }),
  );
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
    500,
  );
});

async function scheduled(controller: ScheduledController, env: CloudflareBindings): Promise<void> {
  console.log(
    JSON.stringify({
      event: 'cron_invoked',
      scheduled_time: new Date(controller.scheduledTime).toISOString(),
      cron: controller.cron,
    }),
  );
  await runScheduledScans(env, controller.scheduledTime);
}

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<CloudflareBindings>;
