import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../src/server';
import { rateLimits } from '../../src/db/schema';
import { feedbackRecipient } from '../../src/shared/feedback';
import { cookie, db, seed, withBindings } from './fixtures';

const origin = 'https://citescout.test';
const bindings = withBindings({
  APP_ENV: 'test',
  APP_URL: origin,
  EXTERNAL_INTEGRATIONS_ENABLED: 'true',
  RESEND_API_KEY: 'synthetic-resend-key',
});
function input() {
  return {
    requestId: crypto.randomUUID(),
    kind: 'bug',
    message: 'The answer view needs a clearer source label.',
    page: '/app/observations',
  };
}
function send(
  session: string,
  body: unknown = input(),
  headers: Record<string, string> = {},
  config = bindings,
) {
  return worker.fetch(
    new Request(`${origin}/api/feedback`, {
      method: 'POST',
      headers: { Cookie: session, Origin: origin, 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    config,
  );
}
function accepted() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() =>
      Promise.resolve(Response.json({ id: 'synthetic-email-id' }, { status: 201 })),
    );
}
function emailPayload(options: RequestInit | undefined): Record<string, unknown> {
  if (typeof options?.body !== 'string') throw new Error('Expected an email JSON payload.');
  return JSON.parse(options.body) as Record<string, unknown>;
}

describe('authenticated feedback delivery', () => {
  beforeEach(async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('UNEXPECTED_NETWORK'));
    await env.DB.prepare("DELETE FROM rate_limits WHERE key LIKE 'feedback:%'").run();
  });
  afterEach(() => vi.restoreAllMocks());

  it('accepts feedback without a paid subscription or project, using a fixed recipient and safe plain text', async () => {
    const { userId, projectId } = await seed(0);
    await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(projectId).run();
    const fetcher = accepted();
    const body = {
      ...input(),
      email: 'reply@example.test',
      message: '<script>unsafe markup stays plain text</script>\nA source link looks wrong.',
    };
    const response = await send(await cookie(userId), body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { submitted: true } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const firstCall = fetcher.mock.calls[0];
    if (!firstCall) throw new Error('Email was not dispatched.');
    const [url, options] = firstCall;
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(options?.headers).get('Idempotency-Key')).toBe(
      `feedback/${userId}/${body.requestId}`,
    );
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const email = emailPayload(options);
    expect(email.to).toEqual([feedbackRecipient]);
    expect(email.from).toBe(env.RESEND_FROM_EMAIL);
    expect(email.reply_to).toBe('reply@example.test');
    expect(email.text).toContain(body.message);
    expect(email.text).toContain(`${origin}/app/observations`);
    expect(email.text).toContain(userId);
    expect(email.html).toBeUndefined();
    expect(email.subject).not.toContain(body.message);
  });

  it('rejects anonymous requests before sending email', async () => {
    expect((await send('')).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['https://attacker.example', 'null', ''])(
    'rejects foreign or missing origin %s',
    async (Origin) => {
      const { userId } = await seed(0);
      expect((await send(await cookie(userId), input(), { Origin })).status).toBe(403);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    { kind: 'unknown' },
    { message: '   ' },
    { message: 'x'.repeat(3001) },
    { email: 'reply@example.test\r\nBcc: attacker@example.test' },
    { page: '/app/settings?token=secret' },
    { page: '/app/settings#secret' },
    { page: 'https://attacker.example' },
    { page: '//attacker.example' },
    { requestId: 'not-a-uuid' },
    { to: 'attacker@example.test' },
    { userId: 'another-account' },
  ])('rejects invalid or overridden payload %j', async (change) => {
    const { userId } = await seed(0);
    expect((await send(await cookie(userId), { ...input(), ...change })).status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects malformed, oversized and non-JSON bodies without sending', async () => {
    const { userId } = await seed(0);
    const session = await cookie(userId);
    expect((await send(session, '{broken')).status).toBe(422);
    expect((await send(session, input(), { 'Content-Type': 'text/plain' })).status).toBe(415);
    expect((await send(session, 'x'.repeat(20_000))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps reply email optional and reuses a user-scoped delivery key on retry', async () => {
    const { userId } = await seed(0);
    const session = await cookie(userId);
    const body = input();
    const fetcher = accepted();
    expect((await send(session, body)).status).toBe(200);
    expect((await send(session, body)).status).toBe(200);
    const calls = fetcher.mock.calls.map(([, options]) => ({
      key: new Headers(options?.headers).get('Idempotency-Key'),
      body: emailPayload(options),
    }));
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0]?.body.reply_to).toBeUndefined();
  });

  it.each(['disabled', 'missing-key', 'missing-binding'])(
    'returns unavailable for %s integration without a fake success',
    async (reason) => {
      const { userId } = await seed(0);
      const config = {
        ...bindings,
        ...(reason === 'disabled'
          ? { EXTERNAL_INTEGRATIONS_ENABLED: 'false' }
          : { RESEND_API_KEY: '' }),
      };
      if (reason === 'missing-binding') Reflect.deleteProperty(config, 'RESEND_API_KEY');
      const response = await send(await cookie(userId), input(), {}, config);
      expect(response.status).toBe(503);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['error', 'timeout', 'missing-id'])(
    'retains a retryable error for provider %s, without automatic retries',
    async (failure) => {
      const { userId } = await seed(0);
      const fetcher = vi.spyOn(globalThis, 'fetch');
      if (failure === 'timeout')
        fetcher.mockRejectedValue(new DOMException('private upstream detail', 'TimeoutError'));
      else
        fetcher.mockResolvedValue(
          Response.json(failure === 'missing-id' ? {} : { message: 'private upstream detail' }, {
            status: failure === 'error' ? 500 : 200,
          }),
        );
      const response = await send(await cookie(userId));
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('private upstream detail');
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('limits each account to five attempts per hour without affecting another account', async () => {
    const first = await seed(0),
      second = await seed(0);
    const session = await cookie(first.userId);
    const fetcher = accepted();
    for (let i = 0; i < 5; i++) expect((await send(session)).status).toBe(200);
    const denied = await send(session);
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect((await send(await cookie(second.userId))).status).toBe(200);
  });

  it('enforces a shared daily cap before contacting the email provider', async () => {
    const started = Math.floor(Date.now() / 86_400_000) * 86_400_000;
    await db.insert(rateLimits).values({
      key: 'feedback:global',
      count: 50,
      windowStartedAt: new Date(started),
      expiresAt: new Date(started + 86_400_000),
    });
    const { userId } = await seed(0);
    expect((await send(await cookie(userId))).status).toBe(429);
    expect(fetch).not.toHaveBeenCalled();
  });
});
