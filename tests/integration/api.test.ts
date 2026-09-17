import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const ORIGIN = 'https://citescout.test';

function call(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(`${ORIGIN}${path}`, init));
}

describe('public API surface', () => {
  it('exposes a health endpoint that leaks no bindings or secrets', async () => {
    const response = await call('/api/health');
    expect(response.status).toBe(200);

    const text = await response.clone().text();
    const body = await response.json<{ data: Record<string, unknown> }>();

    expect(body.data.status).toBe('ok');
    // The payload must not echo binding names, ids, or secret material.
    for (const leaked of [
      'DB',
      'database_id',
      'PERPLEXITY',
      'LEMON',
      'BETTER_AUTH',
      'RESEND',
      'OPERATOR',
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  it('exposes only the public Turnstile site key, never the secret', async () => {
    const response = await call('/api/public-config');
    expect(response.status).toBe(200);

    const text = await response.clone().text();
    const body = await response.json<{ data: Record<string, unknown> }>();

    expect(Object.keys(body.data).sort()).toEqual(['integrationsEnabled', 'turnstileSiteKey']);
    expect(text).not.toContain('TURNSTILE_SECRET');
    expect(text).not.toContain(env.TURNSTILE_SECRET_KEY);
  });

  it('returns a typed 404 envelope for unknown API routes', async () => {
    const response = await call('/api/does-not-exist');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found.' },
    });
  });

  it('sets hardening headers on API responses', async () => {
    const response = await call('/api/health');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });
});

describe('authentication is required for every private resource', () => {
  const privateRoutes: [string, string][] = [
    ['GET', '/api/me'],
    ['GET', '/api/project'],
    ['GET', '/api/dashboard/overview'],
    ['GET', '/api/dashboard/responses'],
    ['GET', '/api/prompts'],
    ['POST', '/api/prompts'],
    ['GET', '/api/competitors'],
    ['POST', '/api/competitors'],
    ['GET', '/api/billing/status'],
    ['POST', '/api/billing/checkout'],
    ['POST', '/api/billing/portal'],
    ['POST', '/api/scans/trial'],
    ['POST', '/api/scans/today'],
    ['DELETE', '/api/account'],
    ['DELETE', '/api/project'],
  ];

  for (const [method, path] of privateRoutes) {
    it(`rejects anonymous ${method} ${path}`, async () => {
      const response = await call(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
      });
      expect(response.status).toBe(401);
      const body = await response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('UNAUTHENTICATED');
    });
  }

  it('rejects an unauthenticated trial scan before touching the provider', async () => {
    const response = await call('/api/scans/trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: crypto.randomUUID(), promptIds: [crypto.randomUUID()] }),
    });
    expect(response.status).toBe(401);
  });
});

describe('authentication boundary hardening', () => {
  it('never lets the native Better Auth magic-link route bypass Turnstile', async () => {
    const response = await call('/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'someone@example.com' }),
    });
    expect(response.status).toBe(403);
    const body = await response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('TURNSTILE_REQUIRED');
  });

  it('returns a generic accepted response from the protected login endpoint', async () => {
    const response = await call('/api/login/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'someone@example.com', turnstileToken: 'local-development' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json<{ data: { accepted: boolean; message: string } }>();
    expect(body.data.accepted).toBe(true);
  });

  it('does not reveal whether an email exists', async () => {
    const first = await call('/api/login/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' },
      body: JSON.stringify({
        email: 'definitely-new@example.com',
        turnstileToken: 'local-development',
      }),
    });
    const second = await call('/api/login/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.11' },
      body: JSON.stringify({ email: 'also-new@example.com', turnstileToken: 'local-development' }),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.text()).toBe(await second.text());
  });

  it('rejects an oversized login body instead of buffering it', async () => {
    const response = await call('/api/login/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'a@example.com',
        turnstileToken: 'x',
        padding: 'z'.repeat(40_000),
      }),
    });
    // Either a validation failure or an explicit size rejection is acceptable; a
    // 200 with silently dropped data is not.
    expect([401, 403, 413, 422]).toContain(response.status);
  });
});

describe('operator endpoint is closed by default', () => {
  it('rejects a missing operator credential', async () => {
    const response = await call('/api/operator/billing/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'someone' }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects an empty bearer token', async () => {
    const response = await call('/api/operator/billing/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' },
      body: JSON.stringify({ userId: 'someone' }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects an incorrect operator credential', async () => {
    const response = await call('/api/operator/billing/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-secret' },
      body: JSON.stringify({ userId: 'someone' }),
    });
    expect(response.status).toBe(401);
  });
});

describe('webhook endpoint rejects unverifiable deliveries', () => {
  it('rejects a delivery with no signature', async () => {
    const response = await call('/api/webhooks/lemonsqueezy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meta: { event_name: 'subscription_created' } }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects a delivery with a malformed signature', async () => {
    const response = await call('/api/webhooks/lemonsqueezy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Signature': 'not-hex' },
      body: JSON.stringify({ meta: { event_name: 'subscription_created' } }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects a delivery signed with the wrong secret', async () => {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('attacker-secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const body = JSON.stringify({
      meta: { event_name: 'subscription_created' },
      data: { type: 'subscriptions', id: '1', attributes: {} },
    });
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    const signature = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const response = await call('/api/webhooks/lemonsqueezy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
      body,
    });
    expect(response.status).toBe(401);
  });
});
