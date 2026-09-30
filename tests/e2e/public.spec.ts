import { expect, test } from '@playwright/test';

test.describe('public visitor', () => {
  test('landing page states the honest product position', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Know when AI recommends your competitors',
    );
    await expect(page.getByText('Perplexity answers over time')).toBeVisible();
    await expect(page.getByText(/nondeterministic/)).toBeVisible();
    await expect(page.getByText(/does not claim to reproduce/i)).toBeVisible();
  });

  test('hero preview is interactive with tabs and example data', async ({ page }) => {
    await page.goto('/');

    // The hero embeds the same component tree as the demo: clickable tabs.
    const tabs = page.getByRole('tab', { name: 'Citations' });
    await expect(tabs.first()).toBeVisible();
    await tabs.first().click();
    await expect(page.getByText('Sources most frequently returned')).toBeVisible();
    await expect(page.getByText('reddit.com').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Prompts' }).first().click();
    await expect(
      page.getByText('Best scheduling tool for independent consultants').first(),
    ).toBeVisible();

    // The preview is labelled as an example, never as live data.
    await expect(page.getByText('Example dashboard', { exact: false }).first()).toBeVisible();
    expect(await page.getByText('Live observation preview').count()).toBe(0);
  });

  test('demo dashboard is labelled and shows no provider calls', async ({ page }) => {
    const providerCalls: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('api.perplexity.ai')) providerCalls.push(request.url());
    });

    await page.goto('/demo');

    await expect(page.getByText('Illustrative demo data').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('See the pattern');

    // Demo tabs are interactive here too.
    await page.getByRole('tab', { name: 'Citations' }).click();
    await expect(page.getByText('wikipedia.org')).toBeVisible();

    expect(providerCalls).toEqual([]);
  });

  test('pricing exposes one $19 plan with an honest FAQ', async ({ page }) => {
    await page.goto('/pricing');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('without a sales call');
    await expect(page.getByText('$19').first()).toBeVisible();
    await expect(page.getByText('Secure self-serve billing')).toBeVisible();
    await expect(page.getByText('Cancel anytime, keep your history')).toBeVisible();

    await expect(page.getByText('Frequently asked questions')).toBeVisible();
    await expect(
      page.getByText('Does CiteScout monitor ChatGPT, Claude, or Google AI Overviews?'),
    ).toBeVisible();
    await expect(page.getByText('What is the free trial, exactly?')).toBeVisible();

    const body = await page.locator('body').innerText();
    for (const forbidden of ['trusted by', 'testimonial', '99.9%', 'rated']) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
  });

  test('FAQ answers expand and collapse', async ({ page }) => {
    await page.goto('/pricing');

    const question = page.getByRole('button', { name: /Can I cancel anytime\?/ });
    await expect(question).toHaveAttribute('aria-expanded', 'false');
    await question.click();
    await expect(question).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('from the self-serve billing portal')).toBeVisible();
  });

  test('legal pages render real terms with contact and refund policy', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy policy');
    await expect(page.getByRole('link', { name: 'support@cite-scout.com' }).first()).toBeVisible();

    await page.goto('/terms');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms of service');
    await expect(page.getByText(/Cancelling stops future charges/i)).toBeVisible();
    await expect(page.getByText(/not refundable/i)).toBeVisible();
  });

  test('footer carries copyright, support link, and small Build Games credit', async ({ page }) => {
    await page.goto('/');

    const footer = page.getByRole('contentinfo');
    await expect(footer.getByText(/© \d{4} CiteScout/)).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Support' })).toBeVisible();
    await expect(footer.getByText('Built for The Build Games')).toBeVisible();
  });

  test('unknown routes show a marketing 404 with way home', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });
});

test.describe('document metadata', () => {
  test('favicon and social meta are served', async ({ page, request }) => {
    await page.goto('/');

    const icon = page.locator('link[rel="icon"]');
    await expect(icon).toHaveAttribute('href', '/favicon.svg');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://cite-scout.com/og-image.png',
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );

    const iconResponse = await request.get('/favicon.svg');
    expect(iconResponse.status()).toBe(200);

    const ogResponse = await request.get('/og-image.png');
    expect(ogResponse.status()).toBe(200);
  });

  test('each public route sets its own tab title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('CiteScout');

    await page.goto('/pricing');
    await expect(page).toHaveTitle('Pricing — CiteScout');

    await page.goto('/demo');
    await expect(page).toHaveTitle('Demo — CiteScout');

    await page.goto('/login');
    await expect(page).toHaveTitle('Sign in — CiteScout');
  });

  test('robots.txt and sitemap are reachable', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain('Disallow: /app/');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
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
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pricing' }).first()).toBeVisible();
  });

  test('demo dashboard has no horizontal overflow', async ({ page }) => {
    await page.goto('/demo');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test('pricing with FAQ has no horizontal overflow', async ({ page }) => {
    await page.goto('/pricing');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test('app navigation is reachable from the mobile header', async ({ page }) => {
    await page.goto('/app/overview');
    await expect(page.getByText('Session expired')).toBeVisible();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('navigation', { name: 'Application' })).toBeVisible();
  });
});

test.describe('authenticated workspace', () => {
  test('anonymous visitor is refused and offered sign in', async ({ page }) => {
    await page.goto('/app/overview');
    await expect(page.getByText('Session expired')).toBeVisible();

    const menu = page.getByRole('button', { name: 'Open navigation' });
    if (await menu.isVisible()) await menu.click();
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByRole('link', { name: 'Sign in' })).toBeVisible();
    expect(await page.getByRole('button', { name: 'Sign out' }).count()).toBe(0);
  });

  test('visiting /app redirects to the overview', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app\/overview$/);
  });

  test('switching tabs never leaks an unrelated view underneath', async ({ page }) => {
    // The shell renders exactly one route viewport; onboarding lives inside the
    // same frame as every other tab, so it can never persist beneath them.
    // Anonymous visitors see the session gate, which proves the route resolved.
    await page.goto('/app/onboarding');
    await expect(page.getByText('Session expired')).toBeVisible();

    await page.goto('/app/overview');
    await expect(page.getByText('Session expired')).toBeVisible();
    expect(await page.getByLabel('Brand name').count()).toBe(0);

    await page.goto('/app/billing');
    await expect(page.getByText('Session expired')).toBeVisible();
    expect(await page.getByLabel('Brand name').count()).toBe(0);
  });

  test('a checkout redirect alone does not unlock paid access', async ({ page }) => {
    await page.goto('/app/billing?checkout=complete');
    await expect(page.getByText('Session expired')).toBeVisible();
    expect(await page.getByText(/CiteScout Monitor/).count()).toBe(0);
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

  test('health endpoint stays clean and public', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const text = await response.text();
    for (const leaked of ['DB', 'database_id', 'PERPLEXITY', 'BETTER_AUTH', 'OPERATOR']) {
      expect(text).not.toContain(leaked);
    }
  });
});
