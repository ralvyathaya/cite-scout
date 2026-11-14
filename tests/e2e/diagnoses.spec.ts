import { expect, test, type Page } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoAnalysis } from '../../src/shared/geo-analysis';

async function workspace(page: Page) {
  const fixture = new GeoFixtureWorkspace();
  const saved = (await fixture.request('/geo/analyses')) as GeoAnalysis[];
  const completed = saved.find((analysis) => analysis.state === 'completed');
  if (!completed) throw new Error('Expected saved analysis');
  const results: GeoAnalysis[] = Array.from({ length: 26 }, (_, index) => ({
    ...completed,
    id: `diagnosis-${String(index)}`,
    classification: { ...completed.classification, scope: index === 0 ? 'partial' : 'complete' },
    diagnoses: [
      {
        type:
          index % 3 === 0
            ? 'retrieval_problem'
            : index % 3 === 1
              ? 'evidence_problem'
              : 'recommendation_fit_problem',
        status:
          index % 4 === 0
            ? 'suspected'
            : index % 4 === 1
              ? 'supported'
              : index % 4 === 2
                ? 'ruled_out'
                : 'unknown',
        reasonCode: 'brand_and_owned_reference_not_observed',
        evidenceIds: ['segment_1'],
        missingChecks: ['inspect_owned_page'],
        templateIds: ['inspect_owned_page'],
        needsReview: true,
      },
    ],
  }));
  for (const state of ['queued', 'running', 'failed'] as const)
    results.push({
      ...completed,
      id: `diagnosis-${state}`,
      state,
      classification: null,
      diagnoses: [],
      failureCode: state === 'failed' ? 'internal_failure_code' : null,
    });
  results.push({ ...completed, id: 'diagnosis-empty', diagnoses: [] });
  const reads: string[] = [],
    writes: string[] = [];
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    if (request.method() !== 'GET') writes.push(path);
    if (url.pathname === '/api/v2/geo/analyses') reads.push(path);
    if (path.includes('/geo/observations/')) reads.push(path);
    const data =
      url.pathname === '/api/v2/geo/analyses'
        ? results
        : await fixture.request(path, request.postDataJSON(), request.method());
    await route.fulfill({ json: { data } });
  });
  return { reads, writes, results };
}

async function choose(page: Page, name: string, value: string) {
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const filters = page.getByRole('dialog', { name: 'Diagnosis filters', exact: true });
  await filters
    .getByRole('group', { name, exact: true })
    .locator(`input[value="${value}"]`)
    .check();
  await filters.getByRole('button', { name: 'Apply filters', exact: true }).click();
}

test('diagnoses keep a compact table, filters and pagination without loading every original answer', async ({
  page,
}) => {
  const { reads, writes } = await workspace(page);
  await page.goto('/app/diagnoses?status=invalid&type=invalid');
  const table = page.getByRole('table', {
    name: 'Findings and analysis statuses in loaded saved analyses',
  });
  await expect(table.getByRole('row')).toHaveCount(26);
  await expect(page.getByText('1–25 of 30 results', { exact: false })).toBeVisible();
  await expect(table.getByText('Partial analysis', { exact: true })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  await expect(
    page.getByText(/rubric geo-rubric|support probability|buyer_intent|internal_failure_code/u),
  ).toHaveCount(0);
  expect(reads.filter((path) => path.includes('/observations/'))).toEqual([]);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page).toHaveURL(/page=2/u);
  await expect(table.getByRole('row')).toHaveCount(6);
  await choose(page, 'Finding status', 'suspected');
  await expect(page).not.toHaveURL(/page=2/u);
  await expect(table.getByRole('row')).toHaveCount(8);
  await choose(page, 'Finding type', 'retrieval_problem');
  await expect(table.getByRole('row')).toHaveCount(4);
  await page.getByLabel('Search diagnoses').fill('Review your website');
  await expect(table.getByRole('row')).toHaveCount(4);
  const count = reads.length;
  await page.getByRole('button', { name: 'Refresh saved diagnoses', exact: true }).click();
  await expect.poll(() => reads.length).toBeGreaterThan(count);
  await expect(
    page.getByRole('link', { name: 'Action Playbook', exact: true }).last(),
  ).toHaveAttribute('href', '/app/playbook');
  expect(writes).toEqual([]);
});

test('finding details keep technical data folded and answer navigation restores the diagnosis scope', async ({
  page,
}) => {
  const { reads, writes } = await workspace(page);
  await page.goto('/app/diagnoses?status=suspected&type=retrieval_problem&q=website');
  const origin = new URL(page.url()).pathname + new URL(page.url()).search;
  const row = page.getByRole('table').getByRole('row').nth(1);
  const details = row.getByRole('button', { name: 'Details', exact: true });
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Finding details', exact: true })).toBeVisible();
  const card = page.locator('article');
  await expect(card.getByRole('heading', { name: 'Answer analysis', exact: true })).toBeVisible();
  const technical = card.getByText(/^Original answer offsets/u).first();
  await expect(technical).toBeHidden();
  await card
    .locator('summary')
    .filter({ hasText: /^Analysis details$/u })
    .click();
  await expect(technical).toBeVisible();
  expect(reads.filter((path) => path.includes('/observations/'))).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(details).toBeFocused();
  await row.getByRole('link', { name: 'View answer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Answer details', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Diagnoses', exact: true })).toHaveAttribute(
    'href',
    origin,
  );
  await page.getByRole('link', { name: 'Back to Diagnoses', exact: true }).click();
  await expect(page).toHaveURL(origin);
  await expect(page.getByLabel('Search diagnoses')).toHaveValue('website');
  await choose(page, 'Finding status', 'supported');
  await expect(page).toHaveURL(/status=supported/u);
  await page.goBack();
  await expect(page).toHaveURL(origin);
  expect(writes.filter((path) => /analyses|page-checks|runs|scans/u.test(path))).toEqual([]);
});

test('pending, failed, ruled out, unknown and empty findings remain distinct', async ({ page }) => {
  const { writes } = await workspace(page);
  await page.goto('/app/diagnoses');
  for (const [value, label] of [
    ['queued', 'Waiting for analysis'],
    ['running', 'Analyzing answer'],
    ['failed', 'Analysis unavailable'],
    ['ruled_out', 'Ruled out'],
    ['unknown', 'Not determined'],
    ['completed', 'No findings established'],
  ] as const) {
    await choose(page, 'Finding status', value);
    const table = page.getByRole('table');
    await expect(table.locator('[data-label="Status"]').first()).toHaveText(label);
    await expect(page.getByText('internal_failure_code', { exact: false })).toHaveCount(0);
    if (value === 'failed') {
      await table.getByRole('button', { name: 'Details', exact: true }).click();
      const card = page.locator('article');
      await expect(
        card.getByText('The analysis could not be completed.', { exact: false }),
      ).toBeVisible();
      await card
        .locator('summary')
        .filter({ hasText: /^Analysis details$/u })
        .click();
      await expect(
        card.getByText('Failure code: internal_failure_code', { exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
    }
  }
  expect(writes).toEqual([]);
});

test('loading, failed reads, missing responses, empty records and unmatched filters stay separate', async ({
  page,
}) => {
  await workspace(page);
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v2/geo/analyses', async (route) => {
    await pending;
    await route.fulfill({ json: { data: null } });
  });
  await page.goto('/app/diagnoses');
  await expect(page.getByRole('status')).toHaveText('Loading saved diagnoses…');
  await expect(page.getByText('results ·', { exact: false })).toHaveCount(0);
  release?.();
  await expect(page.getByRole('alert')).toContainText('Saved diagnoses are unavailable.');
  await expect(page.getByText('0 results', { exact: false })).toHaveCount(0);
  await page.unroute('**/api/v2/geo/analyses');
  await page.route('**/api/v2/geo/analyses', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Internal classification failure' } } }),
  );
  await page.getByRole('button', { name: 'Refresh saved diagnoses', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('Internal classification failure', { exact: false })).toHaveCount(0);
  await page.unroute('**/api/v2/geo/analyses');
  await page.route('**/api/v2/geo/analyses', (route) => route.fulfill({ json: { data: [] } }));
  await page.getByRole('button', { name: 'Refresh saved diagnoses', exact: true }).click();
  await expect(page.getByText('No analysis recorded yet.', { exact: false })).toBeVisible();
  await page.unroute('**/api/v2/geo/analyses');
  await page.getByRole('button', { name: 'Refresh saved diagnoses', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByLabel('Search diagnoses').fill('No matching finding here');
  await expect(page.getByText('No diagnoses match these filters.', { exact: true })).toBeVisible();
});

test('diagnoses keep long text, details and keyboard filters usable at desktop and mobile widths', async ({
  page,
}, testInfo) => {
  const { writes, results } = await workspace(page);
  const result = results[0];
  if (result?.state !== 'completed') throw new Error('Expected completed analysis');
  const finding = result.diagnoses[0];
  const excerpt = result.classification.evidence[0];
  if (!finding || !excerpt) throw new Error('Expected finding and evidence');
  finding.targetUrl = `https://example.com/${'long-path-'.repeat(40)}`;
  result.classification.evidence = [
    { ...excerpt, quote: '| Tool | Fit |\n| --- | --- |\n| Sample | Small teams |\n\n' },
  ];
  for (const width of [1280, 1440, 768, 320, 390]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/app/diagnoses');
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    if (width >= 1280) expect((await table.boundingBox())?.y).toBeLessThan(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => {
      scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.screenshot({ path: testInfo.outputPath(`diagnoses-${String(width)}.png`) });
    const details = table.getByRole('button', { name: 'Details', exact: true }).first();
    await details.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Finding details', exact: true })).toBeVisible();
    const savedTable = page.locator('article').getByRole('table');
    await expect(savedTable.locator('thead')).toHaveCSS('position', 'static');
    await expect(savedTable.locator('tbody > tr')).toHaveCSS('display', 'table-row');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Finding details', exact: true })).toBeHidden();
    await expect(details).toBeFocused();
    if (width < 768) {
      const row = table.getByRole('row').nth(1);
      const status = await row.locator('[data-label="Status"]').boundingBox();
      const requested = await row.locator('[data-label="Requested"]').boundingBox();
      expect(status?.y).toBe(requested?.y);
      const filters = page.getByRole('button', { name: 'Filters', exact: true });
      await filters.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'Diagnosis filters' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(filters).toBeFocused();
    }
  }
  expect(writes).toEqual([]);
});
