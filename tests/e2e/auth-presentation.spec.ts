import { expect, test } from '@playwright/test';

test('configured Google errors leave email sign-in available and retain its draft on failure', async ({
  page,
}) => {
  const socialRequests: unknown[] = [];
  const emailRequests: unknown[] = [];
  await page.route('**/api/public-config', (route) =>
    route.fulfill({
      json: {
        data: {
          turnstileSiteKey: '',
          integrationsEnabled: false,
          googleOAuthAvailable: true,
        },
      },
    }),
  );
  await page.route('**/api/auth/sign-in/social', async (route) => {
    socialRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 503,
      json: { error: { message: 'Google sign-in is temporarily unavailable.' } },
    });
  });
  await page.route('**/api/login/magic-link', async (route) => {
    emailRequests.push(route.request().postDataJSON());
    await route.fulfill(
      emailRequests.length === 1
        ? { status: 503, json: { error: { message: 'Could not send your link. Try again.' } } }
        : { json: { data: { accepted: true, message: 'Check your inbox for your secure link.' } } },
    );
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Google sign-in is temporarily unavailable.');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  expect(socialRequests).toEqual([
    { provider: 'google', callbackURL: '/app/overview', disableRedirect: true },
  ]);

  const email = page.getByLabel('Work email', { exact: true });
  await email.fill('owner@example.com');
  await page.getByRole('button', { name: 'Email my secure link', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Could not send your link. Try again.');
  await expect(email).toHaveValue('owner@example.com');
  await expect(page.getByRole('button', { name: 'Email my secure link' })).toBeEnabled();
  await page.getByRole('button', { name: 'Email my secure link', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Check your inbox for your secure link.');
  expect(emailRequests).toEqual([
    {
      email: 'owner@example.com',
      turnstileToken: 'local-development',
      callbackURL: '/app/overview',
    },
    {
      email: 'owner@example.com',
      turnstileToken: 'local-development',
      callbackURL: '/app/overview',
    },
  ]);
  await expect(page).toHaveURL(/\/login$/);
});

test('email sign-in still requires verification and blocks an expired token', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.addInitScript(() => {
    window.turnstile = {
      render(container, options) {
        container.style.width = options.size === 'compact' ? '150px' : '300px';
        const verify = document.createElement('button');
        verify.type = 'button';
        verify.textContent = 'Complete synthetic verification';
        verify.addEventListener('click', () => {
          options.callback('synthetic-verification');
        });
        const expire = document.createElement('button');
        expire.type = 'button';
        expire.textContent = 'Expire synthetic verification';
        expire.addEventListener('click', options['expired-callback']);
        container.append(verify, expire);
        return 'synthetic-widget';
      },
    };
  });
  await page.route('**/api/public-config', (route) =>
    route.fulfill({
      json: {
        data: {
          turnstileSiteKey: 'synthetic-site-key',
          integrationsEnabled: true,
          googleOAuthAvailable: false,
        },
      },
    }),
  );
  const requests: unknown[] = [];
  await page.route('**/api/login/magic-link', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { data: { accepted: true, message: 'Check your inbox.' } } });
  });
  await page.goto('/login');
  const submit = page.getByRole('button', { name: 'Email my secure link', exact: true });
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  await expect(submit).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Complete synthetic verification' }).click();
  await expect(submit).toBeEnabled();
  await page.getByRole('button', { name: 'Expire synthetic verification' }).click();
  await expect(submit).toBeDisabled();
  await page.getByLabel('Work email', { exact: true }).fill('owner@example.com');
  await page.getByRole('button', { name: 'Complete synthetic verification' }).click();
  await submit.click();
  await expect(page.getByRole('status')).toHaveText('Check your inbox.');
  expect(requests).toEqual([
    {
      email: 'owner@example.com',
      turnstileToken: 'synthetic-verification',
      callbackURL: '/app/overview',
    },
  ]);
});

test('unavailable sign-in configuration is readable at 320px and cannot submit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route('**/api/public-config', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Configuration unavailable.' } } }),
  );
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to CiteScout');
  await expect(page.getByRole('status')).toHaveText(
    'Could not load email verification. Refresh to try email sign-in again.',
  );
  await expect(page.getByRole('button', { name: 'Email my secure link' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Terms', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy Policy', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('Google is immediately visible and checks readiness only on click, independent of email config', async ({
  page,
}) => {
  let releaseConfig!: () => void;
  const configReady = new Promise<void>((resolve) => {
    releaseConfig = resolve;
  });
  let releaseGoogle!: () => void;
  const googleReady = new Promise<void>((resolve) => {
    releaseGoogle = resolve;
  });
  let socialRequests = 0;
  await page.route('**/api/public-config', async (route) => {
    await configReady;
    await route.fulfill({
      json: { data: { integrationsEnabled: false, googleOAuthAvailable: false } },
    });
  });
  await page.route('**/api/auth/sign-in/social', async (route) => {
    socialRequests += 1;
    await googleReady;
    await route.fulfill({
      status: 404,
      json: { code: 'PROVIDER_NOT_FOUND', message: 'Provider not found' },
    });
  });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const google = page.getByRole('button', { name: 'Continue with Google', exact: true });
  await expect(google).toBeVisible();
  await expect(google).toBeEnabled();
  await expect(page.getByRole('status')).toBeEmpty();
  expect(socialRequests).toBe(0);
  await google.click();
  const connecting = page.getByRole('button', { name: 'Connecting to Google…', exact: true });
  await expect(connecting).toBeDisabled();
  await expect(connecting).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => socialRequests).toBe(1);
  releaseGoogle();
  await expect(page.getByRole('status')).toHaveText(
    'Google sign-in is not configured here yet. Use a secure email link instead.',
  );
  await expect(google).toBeEnabled();
  releaseConfig();
  await expect(page.getByRole('button', { name: 'Email my secure link' })).toBeEnabled();
  expect(socialRequests).toBe(1);
});

test('ready Google sign-in navigates to the returned authorization URL', async ({ page }) => {
  await page.route('**/api/public-config', (route) =>
    route.fulfill({ json: { data: { integrationsEnabled: false } } }),
  );
  const authorizationURL = 'https://accounts.google.com/o/oauth2/v2/auth?synthetic=1';
  await page.route(authorizationURL, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic Google authorization</h1>' }),
  );
  await page.route('**/api/auth/sign-in/social', (route) =>
    route.fulfill({ json: { url: authorizationURL, redirect: false } }),
  );
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page).toHaveURL(authorizationURL);
  await expect(page.getByRole('heading', { name: 'Synthetic Google authorization' })).toBeVisible();
});

test('a stalled Google request times out and restores both sign-in options', async ({ page }) => {
  await page.route('**/api/public-config', (route) =>
    route.fulfill({ json: { data: { integrationsEnabled: false } } }),
  );
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/sign-in/social', async (route) => {
    await pending;
    await route.fulfill({ status: 503, json: {} });
  });
  await page.goto('/login');
  await page.getByLabel('Work email', { exact: true }).fill('owner@example.com');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Google sign-in took too long. Try again or use a secure email link.',
    { timeout: 15_000 },
  );
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Email my secure link' })).toBeEnabled();
  await expect(page.getByLabel('Work email', { exact: true })).toHaveValue('owner@example.com');
  release();
});
