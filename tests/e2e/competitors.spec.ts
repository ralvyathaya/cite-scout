import { expect, test, type Page } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoObservationPage } from '../../src/shared/geo';
import type { GeoAnalysis } from '../../src/shared/geo-analysis';

async function workspace(page: Page) {
  const fixture = new GeoFixtureWorkspace();
  const saved = (await fixture.request('/geo/observations?days=30')) as GeoObservationPage;
  const analyses = (await fixture.request('/geo/analyses')) as GeoAnalysis[];
  const observations = saved.observations.slice(0, 4).map((observation, index) => ({
    ...observation,
    context: {
      ...observation.context,
      promptText:
        [
          'Which tool suits a small team?',
          'Which product fits a larger team?',
          'Compare the alternatives',
          'Older buyer question',
        ][index] ?? '',
      brand: { ...observation.context.brand, name: 'Saved Brand' },
      competitors:
        index === 2
          ? []
          : [
              { id: 'alpha', name: 'Alpha competitor', domain: 'alpha.example' },
              { id: 'beta', name: 'Beta competitor', domain: null },
            ],
    },
  }));
  if (observations.length !== 4) throw new Error('Expected four saved answers');
  const completed = analyses.find((analysis) => analysis.state === 'completed');
  if (!completed) throw new Error('Expected a completed analysis');
  const results: GeoAnalysis[] = observations
    .filter((_, index) => index !== 1)
    .map((observation) => ({
      ...completed,
      id: `comparison-${observation.id}`,
      observationId: observation.id,
      classification: {
        ...completed.classification,
        observationId: observation.id,
        brandPresence: 'absent',
        brandStance: 'not_applicable',
        competitors: [{ id: 'alpha', stance: 'conditional_recommendation' }],
      },
    }));
  const reads: string[] = [],
    writes: string[] = [];
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    if (request.method() !== 'GET') writes.push(path);
    let data: unknown;
    if (url.pathname === '/api/v2/geo/observations') {
      reads.push(path);
      data = {
        observations: url.searchParams.has('cursor')
          ? observations.slice(3)
          : observations.slice(0, 3),
        nextCursor: url.searchParams.has('cursor') ? null : 'older',
      };
    } else if (url.pathname === '/api/v2/geo/analyses') {
      reads.push(path);
      data = results;
    } else {
      const observation = observations.find(
        (answer) => url.pathname === `/api/v2/geo/observations/${answer.id}`,
      );
      data = observation ?? (await fixture.request(path, request.postDataJSON(), request.method()));
    }
    await route.fulfill({ json: { data } });
  });
  return { reads, writes, observations };
}

async function choose(page: Page, name: string, value: string) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 768;
  if (mobile) await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const filters = mobile
    ? page.getByRole('dialog', { name: 'Competitor filters' })
    : page.getByLabel('Competitor filters', { exact: true });
  await filters.getByLabel(name, { exact: true }).selectOption(value);
  if (mobile) await page.keyboard.press('Escape');
}

test('competitors show compact comparisons, preserve saved context, and only refresh saved evidence', async ({
  page,
}) => {
  const { reads, writes } = await workspace(page);
  await page.goto('/app/competitors');
  const table = page.getByRole('table', {
    name: 'Competitor comparisons in loaded analyzed answers',
  });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(
    page.getByText('2 shown · 2 of 3 loaded captures analyzed', { exact: false }),
  ).toBeVisible();
  const first = table
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Which tool suits a small team?' }) });
  await expect(first.locator('[data-label="Your brand"]')).toContainText('Saved Brand');
  await expect(first.locator('[data-label="Your brand"]')).toContainText('Not mentioned');
  await expect(first.locator('[data-label="Competitors"]')).toContainText(
    'Recommended with conditions',
  );
  await expect(first.locator('[data-label="Competitors"]')).toContainText('Unclear');
  await expect(table.getByText("No competitors in this saved answer's context")).toBeVisible();
  await expect(page.getByText('Context version', { exact: false })).toHaveCount(0);
  const details = first.getByRole('button', { name: /^Comparison details:/ });
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Comparison details', exact: true })).toContainText(
    'Context version',
  );
  await page.keyboard.press('Escape');
  await expect(details).toBeFocused();
  await expect(page.getByRole('link', { name: 'Manage competitors', exact: true })).toHaveAttribute(
    'href',
    '/app/settings#brand-context',
  );
  await page.getByLabel('Search comparisons').fill('Alpha');
  await expect(table.getByRole('row')).toHaveCount(2);
  const before = reads.length;
  await page.getByRole('button', { name: 'Refresh saved comparisons', exact: true }).click();
  await expect.poll(() => reads.length).toBe(before + 2);
  await choose(page, 'Engine', 'perplexity');
  await expect.poll(() => reads.some((path) => path.includes('engine=perplexity'))).toBe(true);
  await page.getByLabel('Period', { exact: true }).selectOption('14');
  await expect(page).toHaveURL(/days=14/u);
  expect(writes).toEqual([]);
});

test('comparison pagination and answer navigation preserve period, engine, prompt and search', async ({
  page,
}) => {
  const { observations, writes } = await workspace(page);
  const promptId = observations[0]?.context.promptId ?? '';
  const start = `/app/competitors?days=14&engine=perplexity&promptId=${encodeURIComponent(promptId)}`;
  await page.goto(start);
  await page.getByRole('button', { name: 'Older answers', exact: true }).click();
  await expect(page).toHaveURL(/cursor=older/u);
  await expect(
    page.getByRole('rowheader', { name: 'Older buyer question', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Search comparisons').fill('Older');
  await expect(page).toHaveURL(/q=Older/u);
  const origin = new URL(page.url()).pathname + new URL(page.url()).search;
  await page.getByRole('link', { name: 'View answer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Answer details', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Back to Competitors', exact: true }),
  ).toHaveAttribute('href', origin);
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  await expect(breadcrumb.getByRole('link', { name: 'Answers', exact: true })).toHaveAttribute(
    'href',
    `/app/observations?days=14&engine=perplexity&promptId=${encodeURIComponent(promptId)}&cursor=older`,
  );
  await page.getByRole('link', { name: 'Back to Competitors', exact: true }).click();
  await expect(page).toHaveURL(origin);
  await expect(page.getByLabel('Search comparisons')).toHaveValue('Older');
  await page.getByRole('button', { name: 'First page', exact: true }).click();
  await expect(page).not.toHaveURL(/cursor=/u);
  await page.getByLabel('Search comparisons').fill('');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(3);
  await page.getByLabel('Period', { exact: true }).selectOption('30');
  await expect(page).toHaveURL(/days=30/u);
  await page.goBack();
  await expect(page.getByLabel('Period', { exact: true })).toHaveValue('14');
  expect(writes.filter((path) => /runs|analyses|page-checks|scans/u.test(path))).toEqual([]);
});

test('comparison loading, unavailable responses, empty answers and missing analysis stay distinct', async ({
  page,
}) => {
  const { writes } = await workspace(page);
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v2/geo/observations?**', async (route) => {
    await pending;
    await route.fulfill({ json: { data: null } });
  });
  await page.goto('/app/competitors');
  await expect(page.getByRole('status')).toHaveText('Loading competitor comparisons…');
  await expect(page.getByText('loaded captures analyzed', { exact: false })).toHaveCount(0);
  release?.();
  await expect(page.getByRole('alert')).toContainText('Comparisons are unavailable', {
    ignoreCase: true,
  });
  await expect(page.getByText('0 shown', { exact: false })).toHaveCount(0);
  await page.unroute('**/api/v2/geo/observations?**');
  await page.route('**/api/v2/geo/observations?**', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Unavailable' } } }),
  );
  await page.getByRole('button', { name: 'Refresh saved comparisons', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.unroute('**/api/v2/geo/observations?**');
  await page.route('**/api/v2/geo/observations?**', (route) =>
    route.fulfill({ json: { data: { observations: [], nextCursor: null } } }),
  );
  await page.getByRole('button', { name: 'Refresh saved comparisons', exact: true }).click();
  await expect(
    page.getByText('No saved answers in this period and scope.', { exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/v2/geo/observations?**');
  await page.route('**/api/v2/geo/analyses', (route) => route.fulfill({ json: { data: [] } }));
  await page.getByRole('button', { name: 'Refresh saved comparisons', exact: true }).click();
  await expect(
    page.getByText('Visibility is unknown until eligible evidence is available.', { exact: false }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});

test('competitor tables, long names and filter popovers fit desktop and mobile', async ({
  page,
}, testInfo) => {
  const { observations, writes } = await workspace(page);
  const answer = observations[0];
  if (!answer) throw new Error('Expected a saved answer');
  const competitor = answer.context.competitors[0];
  if (!competitor) throw new Error('Expected a saved competitor');
  competitor.name = 'CompetitorNameWithoutBreaks'.repeat(5);
  for (const width of [1280, 1440, 768, 320, 390]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/app/competitors');
    await expect(page.getByRole('table')).toBeVisible();
    if (width >= 1280) expect((await page.getByRole('table').boundingBox())?.y).toBeLessThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => {
      scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.screenshot({
      path: testInfo.outputPath(`competitors-${String(width)}.png`),
      fullPage: true,
    });
    if (width < 768) {
      const filters = page.getByRole('button', { name: 'Filters', exact: true });
      await filters.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Competitor filters' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.keyboard.press('Escape');
      await expect(filters).toBeFocused();
    }
  }
  expect(writes).toEqual([]);
});
