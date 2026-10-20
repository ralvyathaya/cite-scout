import { expect, test, type Page } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoObservationPage } from '../../src/shared/geo';
import type { GeoSourceOpportunity } from '../../src/shared/geo-actions';

async function workspace(page: Page) {
  const fixture = new GeoFixtureWorkspace();
  const saved = (await fixture.request('/geo/observations?days=30')) as GeoObservationPage;
  const capture = saved.observations[0];
  if (!capture) throw new Error('Expected fixture answer');
  const base = ((await fixture.request('/geo/sources?days=30')) as GeoSourceOpportunity[])[0];
  if (!base) throw new Error('Expected fixture source');
  const ids = Array.from({ length: 8 }, (_, index) => `source-answer-${String(index + 1)}`);
  const source = (
    url: string,
    title: string,
    observationIds: string[],
    role: GeoSourceOpportunity['role'] = 'third_party',
  ) => ({
    ...base,
    url,
    title,
    domain: new URL(url).hostname,
    role,
    observationIds,
    observations: observationIds.length,
  });
  const sources = [
    {
      ...source('https://www.youtube.com/watch?v=guide', 'Video buyer guide', ids.slice(0, 7)),
      answerReferences: 7,
    },
    {
      ...source(
        'https://youtube.com/watch?v=pricing',
        'Video pricing guide',
        ids.slice(3),
        'competitor_owned',
      ),
      answerReferences: 5,
    },
    {
      ...source('https://reddit.com/r/tools', 'Community search result', ids.slice(0, 2)),
      answerReferences: 0,
      returnedResults: 2,
      inlineReferences: 0,
    },
    ...Array.from({ length: 27 }, (_, index) =>
      source(
        `https://site${String(index)}.example/guide`,
        `Guide ${String(index).padStart(2, '0')}`,
        ids.slice(0, 1),
      ),
    ),
  ];
  const reads: string[] = [],
    writes: string[] = [];
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    if (request.method() !== 'GET') writes.push(path);
    let data: unknown;
    if (url.pathname === '/api/v2/geo/sources') data = sources;
    else if (/\/geo\/observations\/source-answer-\d+$/u.test(url.pathname)) {
      const id = url.pathname.split('/').at(-1) ?? '';
      reads.push(id);
      data = {
        ...capture,
        id,
        context: { ...capture.context, promptText: `Buyer prompt for ${id}` },
      };
    } else if (
      /\/geo\/observations\/source-answer-\d+\/(analyses|page-checks)$/u.test(url.pathname)
    )
      data = [];
    else data = await fixture.request(path, request.postDataJSON(), request.method());
    await route.fulfill({ json: { data } });
  });
  return { fixture, capture, sources, ids, reads, writes };
}

async function filter(page: Page, name: string, value: string) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 768;
  if (mobile) await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const controls = mobile
    ? page.getByRole('dialog', { name: 'Sources filters' })
    : page.getByLabel('Sources filters', { exact: true });
  await controls.getByLabel(name, { exact: true }).selectOption(value);
  if (mobile) await page.keyboard.press('Escape');
}

test('sources provide Pages and Domains with unique totals, mixed owners, filtering and pagination', async ({
  page,
}, testInfo) => {
  const { reads, writes } = await workspace(page);
  await page.goto('/app/sources');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(26);
  await expect(page.getByText('1–25 of 30 pages', { exact: false })).toBeVisible();
  await filter(page, 'Sort sources', 'name');
  await expect(
    page
      .getByRole('table')
      .getByRole('row')
      .nth(1)
      .getByRole('link', { name: 'Community search result', exact: true }),
  ).toBeVisible();
  await filter(page, 'Sort sources', 'referenced');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(6);
  await page
    .getByRole('navigation', { name: 'Sources views' })
    .getByRole('link', { name: 'Domains' })
    .click();
  await expect(page).not.toHaveURL(/page=2/);
  await expect(
    page.getByRole('table', { name: 'Saved source domains in the selected scope' }),
  ).toBeVisible();
  await page.getByLabel('Search sources').fill('youtube');
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'youtube.com', exact: true }) });
  await expect(row.getByText('Mixed', { exact: true })).toBeVisible();
  await expect(row.locator('[data-label="Pages"]')).toHaveText('2');
  await expect(row.locator('[data-label="Answers"]')).toHaveText('8');
  await page.evaluate(() => {
    scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path: testInfo.outputPath('source-domains.png'), fullPage: true });
  await row.getByRole('link', { name: 'View pages', exact: true }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Clear domain filter' })).toBeVisible();
  await filter(page, 'Ownership', 'competitor_owned');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
  await filter(page, 'Ownership', 'all');
  await page.getByRole('button', { name: 'Clear domain filter' }).click();
  await page.getByLabel('Search sources').fill('Community');
  await expect(page.getByRole('table').locator('[data-label="Referenced"]')).toHaveText(['0']);
  await expect(page).not.toHaveURL(/[?&]domain=/u);
  await page.goBack();
  await expect(page.getByLabel('Search sources')).toHaveValue('youtube');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(3);
  await page.goForward();
  await expect(page.getByRole('table').locator('[data-label="Referenced"]')).toHaveText(['0']);
  expect(reads).toEqual([]);
  expect(writes).toEqual([]);
});

test('source evidence reads five at a time, caches previews, and restores the exact source view', async ({
  page,
}, testInfo) => {
  const { reads, writes } = await workspace(page);
  await page.goto('/app/sources?days=14&q=Video');
  const sourceRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: 'Video buyer guide', exact: true }) });
  const open = sourceRow.getByRole('button', { name: 'View evidence' });
  await open.click();
  await expect(
    page.getByRole('link', { name: 'Buyer prompt for source-answer-5', exact: true }),
  ).toBeVisible();
  expect(reads).toHaveLength(5);
  await page.getByRole('button', { name: 'Load 5 more answers' }).click();
  await expect(
    page.getByRole('link', { name: 'Buyer prompt for source-answer-7', exact: true }),
  ).toBeVisible();
  expect(reads).toHaveLength(7);
  await open.click();
  await open.click();
  await expect(
    page.getByRole('link', { name: 'Buyer prompt for source-answer-1', exact: true }),
  ).toBeVisible();
  expect(reads).toHaveLength(7);
  await page.getByRole('link', { name: 'Buyer prompt for source-answer-1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Answer details', exact: true })).toBeVisible();
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  await expect(breadcrumb.getByRole('link', { name: 'Answers', exact: true })).toHaveAttribute(
    'href',
    '/app/observations?days=14',
  );
  await expect(breadcrumb.getByText('Answer details', { exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.evaluate(() => {
    scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path: testInfo.outputPath('answer-breadcrumb.png') });
  await page.getByRole('link', { name: 'Back to Sources', exact: true }).click();
  await expect(page).toHaveURL('/app/sources?days=14&q=Video');
  await expect(page.getByLabel('Search sources')).toHaveValue('Video');
  expect(writes.filter((path) => /runs|analyses|page-checks|scans/u.test(path))).toEqual([]);
});

test('saved source icons use real hostnames, keep a compact preview, and lead to the exact answer sources', async ({
  page,
}) => {
  const { fixture } = await workspace(page);
  const saved = (await fixture.request('/geo/observations?days=30')) as GeoObservationPage;
  const observation = saved.observations[0];
  if (!observation) throw new Error('Expected fixture answer');
  observation.capture.sources = [
    'https://m.youtube.com/watch?v=a',
    'https://youtu.be/a',
    'https://reddit.com/r/a',
    'https://youtube.com.evil.test/a',
    'https://unknown.example/a',
  ].map((url, index) => ({
    id: String(index),
    url,
    canonicalUrl: url,
    title: `Source ${String(index)}`,
    referenceLevel: 'retrieved',
  }));
  await page.route('**/api/v2/geo/observations?**', (route) =>
    route.fulfill({ json: { data: { observations: [observation], nextCursor: null } } }),
  );
  await page.route(`**/api/v2/geo/observations/${observation.id}`, (route) =>
    route.fulfill({ json: { data: observation } }),
  );
  await page.goto('/app/observations?days=30&engine=perplexity&cursor=older');
  const link = page.getByRole('link', { name: /^View sources:/ });
  await expect(link.locator('svg')).toHaveCount(3);
  await expect(link).toContainText('+2');
  await link.focus();
  await expect(page.getByRole('tooltip')).toContainText(
    'Source identities do not establish citation use',
  );
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#answer-sources$/);
  const sources = page.locator('#answer-sources');
  await expect(sources.getByRole('link', { name: 'Source 0', exact: true })).toBeVisible();
  await expect(sources.locator('.lucide-globe')).toHaveCount(2);
  await expect(
    sources.getByText('Returned search result · citation use unverified', { exact: true }),
  ).toHaveCount(5);
  await page
    .getByRole('navigation', { name: 'Breadcrumb', exact: true })
    .getByRole('link', { name: 'Answers', exact: true })
    .click();
  await expect(page).toHaveURL('/app/observations?days=30&engine=perplexity&cursor=older');
});

test('source read failures, empty results and oversized scopes remain distinct', async ({
  page,
}) => {
  await workspace(page);
  await page.route('**/api/v2/geo/sources?**', (route) =>
    route.fulfill({
      status: 422,
      json: { error: { code: 'GEO_SCOPE_TOO_LARGE', message: 'GEO_SCOPE_TOO_LARGE' } },
    }),
  );
  await page.goto('/app/sources');
  await expect(page.getByRole('alert')).toContainText('Choose a shorter period');
  await expect(page.getByText('of 0 pages', { exact: false })).toHaveCount(0);
  await page.unroute('**/api/v2/geo/sources?**');
  await page.route('**/api/v2/geo/sources?**', (route) => route.fulfill({ json: { data: [] } }));
  await page.getByRole('button', { name: 'Retry saved sources' }).click();
  await expect(page.getByText('No saved sources match this scope', { exact: false })).toBeVisible();
});

test('source loading and a missing response do not show empty counts', async ({ page }) => {
  await workspace(page);
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v2/geo/sources?**', async (route) => {
    await pending;
    await route.fulfill({ json: { data: null } });
  });
  await page.goto('/app/sources');
  await expect(page.getByRole('status')).toHaveText('Loading saved sources…');
  release?.();
  await expect(page.getByRole('alert')).toContainText('Saved sources are unavailable');
  await expect(page.getByText('of 0 pages', { exact: false })).toHaveCount(0);
});

test('failed evidence metadata retains a working answer link and retries only that preview', async ({
  page,
}) => {
  const { reads } = await workspace(page);
  await page.route('**/api/v2/geo/observations/source-answer-1', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Preview unavailable' } } }),
  );
  await page.goto('/app/sources?q=Video');
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name: 'Video buyer guide', exact: true }) });
  await row.getByRole('button', { name: 'View evidence' }).click();
  const failed = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Retry preview' }) });
  await expect(
    failed.getByRole('link', { name: 'Open saved answer', exact: true }),
  ).toHaveAttribute('href', '/app/observations/source-answer-1?days=7');
  await expect(page.getByText('Preview unavailable.', { exact: false })).toBeVisible();
  await page.unroute('**/api/v2/geo/observations/source-answer-1');
  await page.getByRole('button', { name: 'Retry preview' }).click();
  await expect(
    page.getByRole('link', { name: 'Buyer prompt for source-answer-1', exact: true }),
  ).toBeVisible();
  expect(reads.filter((id) => id === 'source-answer-1')).toHaveLength(1);
});

test('sources and answer breadcrumbs stay usable at desktop and mobile widths', async ({
  page,
}, testInfo) => {
  await workspace(page);
  for (const width of [1280, 1440, 320, 390]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/app/sources?q=Video');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByLabel('Search sources')).toBeVisible();
    await expect(page.getByLabel('Period', { exact: true })).toBeVisible();
    if (width >= 1280) expect((await page.getByRole('table').boundingBox())?.y).toBeLessThan(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => {
      scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.screenshot({
      path: testInfo.outputPath(`sources-${String(width)}.png`),
      fullPage: true,
    });
  }
});
