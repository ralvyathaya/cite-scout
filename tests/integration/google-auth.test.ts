import { expect, it } from 'vitest';
import { createAuth } from '../../src/server/auth';
import { withBindings } from './fixtures';

function bindings(overrides: Record<string, string> = {}) {
  return withBindings({
    APP_ENV: 'development',
    DEPLOYMENT_ENV: 'local',
    APP_URL: 'http://localhost:5173',
    GOOGLE_CLIENT_ID: 'synthetic.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
    ...overrides,
  });
}

function signIn(origin: string, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      Cookie: 'synthetic=1',
      ...headers,
    },
    body: JSON.stringify({
      provider: 'google',
      callbackURL: '/app/overview',
      disableRedirect: true,
    }),
  });
}

it.each([
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
])(
  'uses the current local origin for the Google callback at %s without calling Google',
  async (origin) => {
    const response = await createAuth(bindings()).handler(signIn(origin));
    expect(response.status).toBe(200);
    const body = await response.json<{ url: string; redirect: boolean }>();
    const authorization = new URL(body.url);
    expect(authorization.origin).toBe('https://accounts.google.com');
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      `${origin}/api/auth/callback/google`,
    );
    expect(authorization.searchParams.get('state')).toBeTruthy();
    expect(body.redirect).toBe(false);
    expect(response.headers.get('set-cookie')).toBeTruthy();
  },
);

it('does not derive a callback from an untrusted forwarded host or accept a foreign origin', async () => {
  const auth = createAuth(bindings());
  const response = await auth.handler(
    signIn('http://localhost:4173', { 'X-Forwarded-Host': 'attacker.example' }),
  );
  expect(response.status).toBe(200);
  const body = await response.json<{ url: string }>();
  expect(new URL(body.url).searchParams.get('redirect_uri')).toBe(
    'http://localhost:4173/api/auth/callback/google',
  );
  const rejected = await auth.handler(
    signIn('http://localhost:4173', { Origin: 'https://attacker.example' }),
  );
  expect(rejected.status).toBe(403);
});

it.each(['staging', 'production'])(
  'keeps the canonical HTTPS callback and rejects localhost origins in %s',
  async (deployment) => {
    const origin =
      deployment === 'staging' ? 'https://staging.cite-scout.com' : 'https://cite-scout.com';
    const auth = createAuth(
      bindings({
        APP_ENV: 'production',
        DEPLOYMENT_ENV: deployment,
        APP_URL: origin,
        TEST_AUTH_ENABLED: 'false',
        OPERATOR_SECRET: 'synthetic-operator-secret-at-least-32-characters',
      }),
    );
    const response = await auth.handler(signIn(origin));
    expect(response.status).toBe(200);
    const body = await response.json<{ url: string }>();
    expect(new URL(body.url).searchParams.get('redirect_uri')).toBe(
      `${origin}/api/auth/callback/google`,
    );
    const rejected = await auth.handler(signIn(origin, { Origin: 'http://localhost:4173' }));
    expect(rejected.status).toBe(403);
  },
);

it('returns provider unavailable when Google credentials are missing without granting a session', async () => {
  const response = await createAuth(
    bindings({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }),
  ).handler(signIn('http://localhost:4173'));
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: 'PROVIDER_NOT_FOUND' });
  expect(response.headers.get('set-cookie')).toBeNull();
});
