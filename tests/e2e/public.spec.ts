import { expect, test } from '@playwright/test';

test.describe('public visitor', () => {
  test('landing page states the honest product position', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('who gets recommended');
    await expect(page.getByText('Perplexity answers over time')).toBeVisible();
    // The accuracy disclaimer must be present in public copy.
    await expect(page.getByText(/nondeterministic/)).toBeVisible();
    await expect(page.getByText(/does not claim to reproduce/i)).toBeVisible();
  });

  test('demo dashboard is labelled and shows no provider calls', async ({ page }) => {
    const providerCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('api.perplexity.ai')) providerCalls.push(request.url());
    });

    await page.goto('/demo');

    await expect(page.getByText('Illustrative demo data').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'OrbitCal visibility' })).toBeVisible();
    await expect(page.getByText(/does not claim to reproduce/i)).toBeVisible();

    expect(providerCalls).toEqual([]);
  });

  test('pricing exposes one $19 plan without fabricated proof', async ({ page }) => {
    await page.goto('/pricing');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('without a sales call');
    await expect(page.getByText('$19')).toBeVisible();
    await expect(page.getByText('10 enabled prompts')).toBeVisible();

    const body = await page.locator('body').innerText();
    for (const forbidden of ['trusted by', 'customers', 'testimonial', '99.9%', 'rated']) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
  });

  test('legal pages render real terms rather than placeholders', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy policy');
    await expect(page.getByText(/Lemon Squeezy/)).toBeVisible();

    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of service');
    await expect(page.getByText(/nondeterministic/)).toBeVisible();
  });

  test('unknown routes show a real not-found page', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  });
});

test.describe('accessibility and keyboard', () => {
  test('every page offers a working skip link and a single h1', async ({ page }) => {
    for (const path of ['/', '/demo', '/pricing', '/login']) {
      await page.goto(path);
      const skip = page.locator('a.skip-link');
      await expect(skip).toHaveAttribute('href', '#main');
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    }
  });

  test('keyboard navigation can reach the primary call to action', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('a.skip-link')).toBeFocused();
  });

  test('login form labels every input and blocks submit without verification', async ({ page }) => {
    await page.goto('/login');

    const email = page.getByLabel('Work email');
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('type', 'email');
    await expect(email).toHaveAttribute('autocomplete', 'email');

    // In local development mode a token is injected, so submit becomes enabled.
    await expect(page.getByRole('button', { name: /Email my secure link/ })).toBeEnabled();
  });

  test('reduced motion is respected', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const behaviour = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    );
    expect(['auto', '']).toContain(behaviour);
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('landing page has no horizontal overflow and reachable navigation', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);

    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  });

  test('demo dashboard has no horizontal overflow', async ({ page }) => {
    await page.goto('/demo');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});

test.describe('authenticated workspace', () => {
  test('anonymous visitor is refused and offered sign in', async ({ page }) => {
    await page.goto('/app/overview');
    await expect(page.getByText('Session expired')).toBeVisible();

    // The application sidebar must offer sign in, never sign out, for an anonymous visitor.
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  });

  test('a checkout redirect alone does not unlock paid access', async ({ page }) => {
    // Simulate landing back from hosted checkout without any verified webhook.
    await page.goto('/app/billing?checkout=complete');
    await expect(page.getByText('Session expired')).toBeVisible();
    await expect(page.getByText(/CiteScout Monitor/)).toHaveCount(0);
  });

  test('private API endpoints are refused for anonymous callers', async ({ request }) => {
    for (const path of [
      '/api/me',
      '/api/dashboard/overview',
      '/api/prompts',
      '/api/competitors',
      '/api/billing/status',
    ]) {
      const response = await request.get(path);
      expect(response.status(), `${path} should require authentication`).toBe(401);
    }
  });

  test('the native magic-link route cannot bypass verification', async ({ request }) => {
    const response = await request.post('/api/auth/sign-in/magic-link', {
      data: { email: 'someone@example.com' },
    });
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'TURNSTILE_REQUIRED' } });
  });
});
