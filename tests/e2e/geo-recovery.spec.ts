import { expect, test } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoRun, GeoObservation, GeoRunHistory } from '../../src/shared/geo';
import type { GeoAnalysis } from '../../src/shared/geo-analysis';
import type { GeoCapabilities } from '../../src/client/pages/v2/GeoWorkspace';

test('discovers scheduled uncertainty and follows operator settlement without paid POST', async ({
  page,
}) => {
  const fixture = new GeoFixtureWorkspace();
  const history = (await fixture.request('/geo/runs')) as GeoRunHistory;
  const seedRun = history.runs[0];
  if (!seedRun) throw new Error('Fixture run missing');
  const run = structuredClone(await fixture.request(`/geo/runs/${seedRun.id}`)) as GeoRun;
  run.id = crypto.randomUUID();
  run.createdAt = new Date().toISOString();
  for (const item of run.items) {
    item.id = crypto.randomUUID();
    item.runId = run.id;
  }
  run.trigger = 'scheduled';
  run.status = 'partial';
  run.completedAt = null;
  for (const item of run.items) {
    item.status = 'submission_uncertain';
    item.terminalReason = 'SUBMISSION_LEASE_EXPIRED';
  }
  let posts = 0,
    reads = 0;
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    let data: unknown;
    if (request.method() === 'POST') posts++;
    if (url.pathname.endsWith('/geo/runs')) {
      data = {
        runs: [
          {
            id: run.id,
            trigger: run.trigger,
            status: run.status,
            createdAt: run.createdAt,
            completedAt: run.completedAt,
            successfulCount: 0,
            totalCount: run.items.length,
          },
        ],
        dailyOutcomes: [
          {
            date: run.createdAt.slice(0, 10),
            status: 'admitted',
            reason: null,
            runId: run.id,
            firstAttemptAt: run.createdAt,
            lastAttemptAt: run.createdAt,
          },
        ],
      } satisfies GeoRunHistory;
    } else if (url.pathname.endsWith(`/geo/runs/${run.id}`)) {
      reads++;
      data = run;
    } else
      data = await fixture.request(
        path,
        request.method() === 'GET' ? undefined : request.postDataJSON(),
        request.method(),
      );
    await route.fulfill({ json: { data } });
  });
  await page.goto('/app/overview');
  const summary = page
    .locator('summary')
    .filter({ hasText: 'scheduled check · 0/8 answers · partial' });
  await expect(summary).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('0 of 8 answers captured · partial')).toBeVisible();
  await expect(page.getByText('SUBMISSION_LEASE_EXPIRED').first()).toBeVisible();
  run.status = 'failed';
  run.completedAt = new Date().toISOString();
  for (const item of run.items) {
    item.status = 'failed';
    item.terminalReason = 'OPERATOR_CLOSED';
  }
  await expect(page.getByText('0 of 8 answers captured · failed')).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText('OPERATOR_CLOSED').first()).toBeVisible();
  expect(reads).toBeGreaterThan(1);
  expect(posts).toBe(0);
});

test('owned-page picker submits the canonical observed target', async ({ page }) => {
  const fixture = new GeoFixtureWorkspace();
  const observations = (await fixture.request('/geo/observations')) as {
    observations: GeoObservation[];
  };
  const observation = observations.observations[0];
  if (!observation) throw new Error('Observation fixture missing');
  const source = {
    id: 'owned-fragment',
    url: 'https://cedarflow.example/buyer#pricing',
    canonicalUrl: 'https://cedarflow.example/buyer',
    title: 'Buyer evidence',
    referenceLevel: 'answer' as const,
  };
  let submitted = '';
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    let data: unknown;
    if (path === `/geo/observations/${observation.id}/page-checks` && request.method() === 'POST') {
      submitted = (request.postDataJSON() as { target: string }).target;
      data = { state: 'queued' };
    } else {
      data = await fixture.request(
        path,
        request.method() === 'GET' ? undefined : request.postDataJSON(),
        request.method(),
      );
      if (path === '/geo/capabilities')
        (data as GeoCapabilities).pageChecks = { available: true, reason: null };
      if (path === `/geo/observations/${observation.id}`)
        (data as GeoObservation).capture.sources.push(source);
      if (path === `/geo/observations/${observation.id}/analyses`)
        for (const analysis of data as GeoAnalysis[])
          analysis.classification?.sources.push({
            ...source,
            role: 'owned',
            type: 'official_product',
          });
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto(`/app/observations/${observation.id}`);
  await expect(
    page.getByRole('heading', { name: 'Original observation', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Check owned page', exact: true }).click();
  await expect.poll(() => submitted).toBe(source.canonicalUrl);
});
