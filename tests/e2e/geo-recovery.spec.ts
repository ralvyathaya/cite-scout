import { expect, test } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoRun, GeoObservation, GeoRunHistory } from '../../src/shared/geo';
import type { GeoAnalysis } from '../../src/shared/geo-analysis';
import type { GeoCapabilities } from '../../src/client/pages/v2/GeoWorkspace';

test('keeps saved evidence readable when a workspace endpoint returns HTML', async ({ page }) => {
  const fixture = new GeoFixtureWorkspace();
  const saved = (await fixture.request('/geo/observations')) as { observations: GeoObservation[] };
  const savedAnswer = saved.observations[0]?.capture.answerText.slice(0, 100);
  if (!savedAnswer) throw new Error('Saved answer fixture missing');
  let unavailable = true;
  let posts = 0;
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') posts++;
    if (unavailable && url.pathname.endsWith('/geo/analyses')) {
      await route.fulfill({
        status: 503,
        contentType: 'text/html',
        body: '<!DOCTYPE html>Unavailable',
      });
      return;
    }
    const data = await fixture.request(
      url.pathname.replace('/api/v2', '') + url.search,
      request.method() === 'GET' ? undefined : request.postDataJSON(),
      request.method(),
    );
    await route.fulfill({ json: { data } });
  });
  await page.goto('/app/overview');
  const message = page.getByText(
    'Workspace response unavailable. Refresh the page and sign in again if requested.',
  );
  await expect(message).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Original answer evidence' })).toBeVisible();
  await expect(page.getByText(savedAnswer, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Unexpected token/)).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Refresh saved evidence' }).click();
  await expect(message).toHaveCount(0);
  await expect(page.getByText(savedAnswer, { exact: false }).first()).toBeVisible();
  expect(posts).toBe(0);
});

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
    .filter({ hasText: 'scheduled check · 0/8 observations · partial' });
  await expect(summary).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('0 of 8 observations saved · partial')).toBeVisible();
  await expect(page.getByText('SUBMISSION_LEASE_EXPIRED').first()).toBeVisible();
  run.status = 'failed';
  run.completedAt = new Date().toISOString();
  for (const item of run.items) {
    item.status = 'failed';
    item.terminalReason = 'OPERATOR_CLOSED';
  }
  await expect(page.getByText('0 of 8 observations saved · failed')).toBeVisible({
    timeout: 12_000,
  });
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
