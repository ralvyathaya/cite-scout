import { expect, test, type Page } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoCapabilities } from '../../src/client/pages/v2/GeoWorkspace';
import type { GeoObservationPage } from '../../src/shared/geo';

async function workspace(page: Page, claude = false, legacy = false, enabled = false) {
  const fixture = new GeoFixtureWorkspace(new Date(), claude);
  const writes: string[] = [];
  await page.route(/\/api\/(?:v2\/|billing\/status)/, async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    if (request.method() !== 'GET') writes.push(path);
    const data = await fixture.request(path);
    if (path === '/geo/capabilities') {
      const capabilities = data as GeoCapabilities;
      // Historical captures remain readable against a disabled or older server.
      if (!enabled) delete capabilities.engines.claude_web_search;
      if (legacy)
        for (const capability of Object.values(capabilities.engines)) delete capability.enabled;
    }
    await route.fulfill({ json: { data } });
  });
  return { fixture, writes };
}

test('disabled Claude is hidden in settings, legacy capabilities are safe, and four slots remain', async ({
  page,
}) => {
  await workspace(page, false, true);
  await page.goto('/app/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit monitoring', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit monitoring configuration' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Claude Web Search API' })).toHaveCount(0);
  await expect(page.getByText('4 of 4 engine slots selected.')).toBeVisible();
  const openai = page.getByRole('checkbox', { name: 'OpenAI Web Search API', exact: true });
  await expect(openai).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Perplexity', exact: true }).uncheck();
  await expect(openai).toBeEnabled();
  await openai.check();
  await expect(page.getByRole('checkbox', { name: 'Perplexity', exact: true })).toBeDisabled();
  await page.goto('/app/questions');
  await expect(page.getByRole('heading', { name: 'Prompts', exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByRole('link', { name: /Claude/ })).toHaveCount(0);
});

test('enabled Claude shares four slots and cancelling keeps the saved selection', async ({
  page,
}) => {
  const { writes } = await workspace(page, true, false, true);
  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Edit monitoring', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit monitoring configuration' });
  const claude = dialog.getByRole('checkbox', { name: 'Claude Web Search API', exact: true });
  const openai = dialog.getByRole('checkbox', { name: 'OpenAI Web Search API', exact: true });
  await expect(claude).toBeChecked();
  await expect(openai).toBeDisabled();
  await claude.uncheck();
  await openai.check();
  await expect(claude).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Edit monitoring', exact: true }).click();
  await expect(claude).toBeChecked();
  await expect(openai).not.toBeChecked();
  expect(writes).toEqual([]);
});

test('stored Claude evidence renders across monitoring, sources, analysis, competitors and trends while disabled', async ({
  page,
}, testInfo) => {
  const { fixture, writes } = await workspace(page, true);
  const saved = (await fixture.request(
    '/geo/observations?engine=claude_web_search',
  )) as GeoObservationPage;
  const observation = saved.observations[0];
  if (!observation) throw new Error('Expected synthetic Claude capture');
  await page.goto('/app/questions');
  const icon = page.getByRole('table').locator('img[src="/engines/claude.svg"]').first();
  await expect(icon).toBeVisible();
  expect(
    await icon.evaluate(
      (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
    ),
  ).toBe(true);
  await page.goto('/app/observations?engine=claude_web_search');
  await expect(page.getByRole('table').getByText('Claude Web Search API').first()).toBeVisible();
  await page.goto(`/app/observations/${observation.id}?engine=claude_web_search`);
  await expect(page.getByRole('heading', { name: 'Answer details', exact: true })).toBeVisible();
  await expect(page.locator('#original-evidence strong').first()).toHaveText('Rival');
  await expect(
    page.locator('#answer-sources').getByRole('link', { name: /Synthetic independent/ }),
  ).toBeVisible();
  await expect(page.locator('#answer-sources svg[style]').first()).toHaveCSS(
    'color',
    'rgb(255, 69, 0)',
  );
  await page.getByText('Capture details', { exact: true }).click();
  await expect(page.getByText('claude-sonnet-5-5', { exact: false }).first()).toBeVisible();
  for (const [path, title] of [
    ['sources', 'Sources'],
    ['diagnoses', 'Diagnoses'],
    ['competitors', 'Competitors'],
    ['trends', 'Trends'],
  ]) {
    await page.goto(`/app/${String(path)}?engine=claude_web_search`);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  }
  expect(writes).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('claude-trends.png'), fullPage: true });
});

test('local Claude fixture is visibly synthetic and makes no provider calls', async ({ page }) => {
  const providerCalls: string[] = [];
  page.on('request', (request) => {
    if (/api\.(anthropic|openai|perplexity)\.com/.test(request.url()))
      providerCalls.push(request.url());
  });
  await page.goto('/app/observations?fixture=1&claudeFixture=1&engine=claude_web_search');
  await expect(page.getByText(/synthetic data/i, { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('table').getByText('Claude Web Search API').first()).toBeVisible();
  expect(providerCalls).toEqual([]);
});
