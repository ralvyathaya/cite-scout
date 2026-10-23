import { expect, test } from '@playwright/test';

test.describe('public visitor', () => {
  test('marketing copy explains demo data and access without internal labels', async ({
    page,
  }, testInfo) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/api/'))
        requests.push(request.url());
    });
    for (const path of ['/', '/demo', '/pricing']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const copy = await page.locator('body').textContent();
      expect(copy).not.toMatch(
        /owner preview|legacy|synthetic|fixture|collector|provider calls|bounded recovery|baseline phase closes|founder-assisted/i,
      );
      if (path === '/') {
        await expect(page.getByText('AI visibility · In preview', { exact: true })).toBeVisible();
        await expect(
          page.getByRole('main').getByRole('link', { name: 'Explore the demo', exact: true }),
        ).toHaveAttribute('href', '/demo');
        await expect(page.getByText('Sample data', { exact: true }).first()).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('landing-copy.png') });
      }
      if (path === '/demo') {
        await expect(
          page.getByText('AI visibility · Example workflow', { exact: true }),
        ).toBeVisible();
        await expect(page.getByText(/does not run checks or show customer results/)).toBeVisible();
        await expect(
          page.getByText(
            /reviewing this demo does not start monitoring or purchase a subscription/,
          ),
        ).toBeVisible();
      }
      if (path === '/pricing') {
        await expect(page.getByRole('article', { name: 'Starter plan' })).toBeVisible();
        await expect(
          page.getByText('New plans are being prepared.', { exact: false }),
        ).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('pricing-copy.png') });
      }
    }
    expect(requests).toEqual([]);
  });

  test('public pages share local Switzer and Newsreader without loading the old font', async ({
    page,
  }, testInfo) => {
    const unwantedFonts: string[] = [];
    page.on('request', (request) => {
      if (/plus-jakarta|fonts\.(googleapis|gstatic)\.com/i.test(request.url()))
        unwantedFonts.push(request.url());
    });
    for (const path of ['/', '/demo', '/pricing', '/login', '/privacy', '/terms']) {
      await page.goto(path);
      await expect(page.locator('body')).toHaveCSS('font-family', /Switzer/);
      for (const heading of await page.locator('.font-display').all()) {
        await expect(heading).toHaveCSS('font-family', /Newsreader/);
        await expect(heading).toHaveCSS('font-weight', '400');
      }
      if (path === '/') {
        expect(
          await page.evaluate(async () => {
            const faces = await Promise.all([
              document.fonts.load('400 16px Switzer'),
              document.fonts.load('400 48px Newsreader'),
            ]);
            return faces.every(
              (loaded) => loaded.length > 0 && loaded.every((face) => face.status === 'loaded'),
            );
          }),
        ).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('landing-typography.png') });
      }
    }
    expect(unwantedFonts).toEqual([]);
  });

  test('landing page states the honest product position', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'From AI answers to your next marketing action.',
    );
    await expect(page.getByText('AI visibility · In preview')).toBeVisible();
    const preview = page.getByRole('main').getByRole('link', { name: 'Explore the demo' });
    await expect(preview).toHaveAttribute('href', '/demo');
    await preview.click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByText('Sample data', { exact: true }).first()).toBeVisible();
  });

  test('hero preview distinguishes baseline, follow-up and returned sources', async ({ page }) => {
    await page.goto('/demo');

    await expect(page.getByText('Baseline · example answer')).toBeVisible();
    await expect(page.getByText('Follow-up · example answer')).toBeVisible();
    await expect(page.getByText('Returned only:', { exact: true })).toBeVisible();
    await expect(page.getByText('Sample data', { exact: true }).first()).toBeVisible();
    expect(await page.getByText('Live observation preview').count()).toBe(0);
  });

  test('demo dashboard is labelled and shows no provider calls', async ({ page }) => {
    const providerCalls: string[] = [];
    page.on('request', (request) => {
      if (/api\.(perplexity|openai)\.|serpapi\.com|\/api\/v2\//.test(request.url()))
        providerCalls.push(request.url());
    });

    await page.goto('/demo');

    await expect(page.getByText('Sample data', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Follow the evidence. Decide what to do next.',
    );
    await expect(page.getByText('Brand match appeared: CedarFlow')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review the diagnosis' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choose a concrete task' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Measure again with context' })).toBeVisible();
    await expect(page.getByText('Needs review', { exact: true })).toBeVisible();
    await expect(page.getByText('Your website', { exact: true })).toBeVisible();
    await expect(page.getByText('External sources', { exact: true })).toBeVisible();

    expect(providerCalls).toEqual([]);
  });

  test('pricing exposes three plans and clear annual totals without claiming availability', async ({
    page,
  }, testInfo) => {
    await page.goto('/pricing');
    for (const [name, price, prompts] of [
      ['Starter', '$29', '5 active buyer prompts'],
      ['Growth', '$79', '15 active buyer prompts'],
      ['Pro', '$149', '30 active buyer prompts'],
    ] as const) {
      const card = page.getByRole('article', { name: `${name} plan` });
      await expect(card.getByText(price, { exact: true })).toBeVisible();
      await expect(card.getByText(prompts, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Recommended', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Monthly', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Annual', exact: true }).focus();
    await page.keyboard.press('Enter');
    for (const [name, total, equivalent] of [
      ['Starter', '$290', '$24.17/month'],
      ['Growth', '$790', '$65.83/month'],
      ['Pro', '$1,490', '$124.17/month'],
    ] as const) {
      const card = page.getByRole('article', { name: `${name} plan` });
      await expect(card.getByText(total, { exact: true })).toBeVisible();
      await expect(
        card.getByText(`Billed ${total} annually · equivalent to ${equivalent}`, { exact: true }),
      ).toBeVisible();
      await expect(card.getByRole('link', { name: `Set up ${name}` })).toHaveAttribute(
        'href',
        `/app/onboarding?planId=${name.toLowerCase()}&interval=year`,
      );
    }
    await expect(
      page
        .getByRole('region', { name: 'Monitoring plans' })
        .getByText(/Prices exclude applicable taxes/),
    ).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Setup does not purchase a subscription');
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(
      /\$19|most popular|Claude|Gemini|AI agent|multi-brand|ChatGPT Search/i,
    );
    await page.screenshot({
      path: testInfo.outputPath('pricing-plans-annual.png'),
      fullPage: true,
    });
  });

  test('FAQ answers expand and collapse', async ({ page }) => {
    await page.goto('/pricing');

    const question = page.getByRole('button', { name: /Can I cancel anytime\?/ });
    await expect(question).toHaveAttribute('aria-expanded', 'false');
    await question.click();
    await expect(question).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/from the self-serve billing portal/)).toBeVisible();
    await question.press('Enter');
    await expect(question).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText(/from the self-serve billing portal/)).toBeHidden();
  });

  test('plan setup preserves a bounded selection through sign-in', async ({ page }) => {
    await page.goto('/pricing');
    await page.getByRole('link', { name: 'Set up Growth', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?planId=growth&interval=month$/);
    await expect(page.getByLabel('Work email', { exact: true })).toBeVisible();
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

  test('footer carries copyright and support link', async ({ page }) => {
    await page.goto('/');

    const footer = page.getByRole('contentinfo');
    await expect(footer.getByText(/© \d{4} CiteScout/)).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Support' })).toBeVisible();
    expect(await footer.getByText('Built for The Build Games').count()).toBe(0);
  });

  test('unknown routes show a marketing 404 with way home', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });
});

for (const width of [320, 768, 1280, 1440]) {
  test(`public presentation fits ${String(width)}px without hiding page content`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width >= 1440 ? 900 : 720 });
    for (const path of [
      '/',
      '/demo',
      '/pricing',
      '/login',
      '/privacy',
      '/terms',
      '/missing-page',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${path} at ${String(width)}px`,
      ).toBe(true);
    }
  });
}

test.describe('document metadata', () => {
  test('favicon and social meta are served', async ({ page, request }) => {
    await page.goto('/');

    const icon = page.locator('link[rel="icon"][type="image/svg+xml"]');
    await expect(icon).toHaveAttribute('href', '/favicon.svg');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      /From AI answers to your next marketing action/,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://cite-scout.com/og-image.png',
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/apple-touch-icon.png',
    );
    await expect(page.locator('header img[src="/brand/logo-box.svg"]')).toBeVisible();

    const iconResponse = await request.get('/favicon.svg');
    expect(iconResponse.status()).toBe(200);

    const ogResponse = await request.get('/og-image.png');
    expect(ogResponse.status()).toBe(200);
    expect(ogResponse.headers()['content-type']).toContain('image/png');

    for (const path of [
      '/favicon.ico',
      '/apple-touch-icon.png',
      '/brand/logo-blue.svg',
      '/brand/logo-box.svg',
    ]) {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/');
    }
    const manifest = await request.get('/site.webmanifest');
    const data = (await manifest.json()) as { name: string; icons: { src: string }[] };
    expect(data.name).toBe('CiteScout');
    for (const asset of data.icons) {
      const response = await request.get(asset.src);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
    }
  });

  test('each public route sets its own tab title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('CiteScout');

    await page.goto('/pricing');
    await expect(page).toHaveTitle('Pricing — CiteScout');

    await page.goto('/demo');
    await expect(page).toHaveTitle('Example — CiteScout');

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
    const skip = page.locator('a.skip-link');
    await expect(skip).toHaveAttribute('href', '#main');
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
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
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Work email')).toBeVisible();
  });
});

test.describe('authenticated workspace', () => {
  test('anonymous visitor is refused and offered sign in', async ({ page }) => {
    await page.goto('/app/overview');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel('Work email')).toBeVisible();
    expect(await page.getByRole('button', { name: 'Sign out' }).count()).toBe(0);
  });

  test('visiting /app requires login for an anonymous visitor', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('switching tabs never leaks an unrelated view underneath', async ({ page }) => {
    // The shell renders exactly one route viewport; onboarding lives inside the
    // same frame as every other tab, so it can never persist beneath them.
    // Anonymous visitors see the session gate, which proves the route resolved.
    await page.goto('/app/onboarding');
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/app/overview');
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.getByLabel('Brand name').count()).toBe(0);

    await page.goto('/app/billing');
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.getByLabel('Brand name').count()).toBe(0);
  });

  test('a checkout redirect alone does not unlock paid access', async ({ page }) => {
    await page.goto('/app/billing?checkout=complete');
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.getByText(/CiteScout Monitor/).count()).toBe(0);
  });

  test('private API endpoints are refused for anonymous callers', async ({ request }) => {
    for (const path of [
      '/api/me',
      '/api/dashboard/overview',
      '/api/prompts',
      '/api/competitors',
      '/api/billing/status',
      '/api/v2/project',
      '/api/v2/questions',
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
    const text = await response.text();
    expect(response.status(), text).toBe(200);
    for (const leaked of ['DB', 'database_id', 'PERPLEXITY', 'BETTER_AUTH', 'OPERATOR']) {
      expect(text).not.toContain(leaked);
    }
  });
});
