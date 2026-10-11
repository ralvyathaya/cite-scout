import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { createAuth } from './auth';
import { getConfig } from './config';
import { projectRoutes } from './routes/project';
import { competitorRoutes, promptRoutes } from './routes/dashboard';
import { billingRoutes, handleLemonWebhook } from './routes/billing';
import { loginRoutes } from './routes/login';
import { scanRoutes } from './routes/scans';
import { processDueScans } from './v2/scans';
import { v2Routes } from './v2/routes';
import { accountRoutes } from './routes/account';
import { operatorRoutes } from './routes/operator';
import { processGeoCollectors } from './v2/collectors';
import { processGeoAnalysis } from './v2/analysis';
import { BodyTooLargeError } from './http';

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
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com', 'https://cloud.umami.is'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: [
        "'self'",
        'https://challenges.cloudflare.com',
        'https://cloud.umami.is',
        'https://api-gateway.umami.dev',
      ],
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

  let status: number;
  let outcome = 'ok';

  try {
    await next();
    status = c.res.status;
  } catch (error) {
    // Rethrow after recording, so app.onError still shapes the response.
    logRequest(
      requestId,
      c.req.path,
      c.req.method,
      error instanceof BodyTooLargeError ? 413 : 500,
      startedAt,
      'error',
    );
    throw error;
  }

  if (status >= 500) outcome = 'error';
  else if (status >= 400) outcome = 'rejected';

  logRequest(requestId, c.req.path, c.req.method, status, startedAt, outcome);
});

function logRequest(
  requestId: string,
  route: string,
  method: string,
  status: number,
  startedAt: number,
  outcome: string,
): void {
  console.log(
    JSON.stringify({
      event: 'request_completed',
      route,
      method,
      status,
      outcome,
      request_id: requestId,
      duration_ms: Math.round(performance.now() - startedAt),
    }),
  );
}

app.get('/api/health', (c) => c.json({ data: { status: 'ok', service: 'citescout' } }));
app.get('/api/public-config', (c) =>
  c.json({
    data: {
      turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
      googleOAuthAvailable: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
      integrationsEnabled: getConfig(c.env).EXTERNAL_INTEGRATIONS_ENABLED === 'true',
    },
  }),
);
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
// Legacy reads remain available for old evidence links; writes cannot bypass v2 history/trial rules.
app.use('/api/*', async (c, next) => {
  if (
    /^\/api\/dashboard(\/|$)/.test(c.req.path) ||
    (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) &&
      /^\/api\/(project|prompts|competitors|scans)(\/|$)/.test(c.req.path))
  ) {
    const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
    if (!session)
      return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
    return c.json(
      { error: { code: 'USE_V2_FLOW', message: 'Use the buyer-question workflow.' } },
      409,
    );
  }
  await next();
});
app.route('/api/v2', v2Routes);
app.route('/api/project', projectRoutes);
app.route('/api/prompts', promptRoutes);
app.route('/api/competitors', competitorRoutes);
app.route('/api/billing', billingRoutes);
app.route('/api/login', loginRoutes);
app.route('/api/scans', scanRoutes);
app.route('/api/account', accountRoutes);
app.route('/api/operator', operatorRoutes);
app.post('/api/webhooks/lemonsqueezy', (c) => handleLemonWebhook(c.req.raw, c.env));

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } }, 404);
  }
  return c.text('Not found', 404);
});

app.onError((error, c) => {
  // Oversized request bodies are a client error, never a server fault.
  if (error instanceof BodyTooLargeError) {
    return c.json(
      { error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large.' } },
      413,
    );
  }

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
  const callLimit = Number(env.MAX_PROVIDER_CALLS_PER_CRON_INVOCATION);
  await processDueScans(
    env,
    env.GEO_SCANS_ENABLED === 'true' ? Math.floor(callLimit / 2) : callLimit,
    new Date(controller.scheduledTime),
  );
  await processGeoCollectors(
    env,
    env.GEO_SCANS_ENABLED === 'true' ? Math.ceil(callLimit / 2) : callLimit,
    new Date(controller.scheduledTime),
  );
  await processGeoAnalysis(env, 5, new Date(controller.scheduledTime));
  await env.DB.prepare('DELETE FROM product_events WHERE received_at < ?')
    .bind(Date.now() - 90 * 86400000)
    .run();
}

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<CloudflareBindings>;
