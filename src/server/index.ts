import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

interface AppEnv {
  Bindings: CloudflareBindings;
}

const app = new Hono<AppEnv>();

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

function scheduled(controller: ScheduledController): void {
  console.log(
    JSON.stringify({
      event: 'cron_invoked',
      scheduled_time: new Date(controller.scheduledTime).toISOString(),
      cron: controller.cron,
    }),
  );
}

export default {
  fetch: app.fetch,
  scheduled,
} satisfies ExportedHandler<CloudflareBindings>;
