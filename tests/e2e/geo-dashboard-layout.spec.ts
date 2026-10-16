import { expect, test } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { V2ProjectPayload } from '../../src/shared/v2';
import type { GeoObservationPage } from '../../src/shared/geo';

test('selecting older evidence does not change the latest capture summary', async ({ page }) => {
  const fixture = new GeoFixtureWorkspace();
  const latestAt = new Date(Date.now() - 3600_000).toISOString();
  await page.route('**/api/v2/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    const data = await fixture.request(path);
    if (url.pathname.endsWith('/geo/observations')) {
      const first = (data as GeoObservationPage).observations[0];
      if (!first) throw new Error('Fixture observation missing');
      first.capturedAt = latestAt;
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto('/app/overview');
  const freshness = page.locator('time');
  await expect(freshness).toHaveAttribute('datetime', latestAt);
  await page
    .getByRole('button', { pressed: false })
    .filter({ hasText: 'complete' })
    .first()
    .click();
  await expect(freshness).toHaveAttribute('datetime', latestAt);
  await expect(freshness).toHaveAttribute('title', /\d{4}/);
});

test('dashboard keeps monitoring and all four summaries above the desktop fold', async ({
  page,
}) => {
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/app/overview?fixture=1');
    await expect(page.getByRole('button', { name: 'Monitor Prompts' })).toBeInViewport();
    for (const label of [
      'Saved observations',
      'Classification coverage',
      'Work to review',
      'Evidence freshness',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeInViewport();
    }
    await expect(page.getByText('Latest capture in the selected scope')).toBeInViewport();
    await expect(page.getByText('1. Choose answer engines')).not.toBeVisible();
  }
});

for (const state of ['new owner', 'quota reached', 'inactive prompts'] as const) {
  test(`${state} keeps the monitoring reason, next step and saved evidence accessible`, async ({
    page,
  }, testInfo) => {
    const fixture = new GeoFixtureWorkspace();
    let paidCalls = 0;
    await page.route('**/api/v2/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace('/api/v2', '') + url.search;
      if (request.method() !== 'GET') paidCalls++;
      let data = await fixture.request(path);
      if (path === '/project') {
        const project = data as V2ProjectPayload;
        project.internalTestAccess = true;
        project.canScan = false;
        if (state === 'inactive prompts' && project.project) {
          project.project.brandName = 'CedarFlow'.repeat(12);
          project.project.canonicalDomain = `${'long-domain-'.repeat(4)}.example`;
          project.project.questions = project.project.questions.map((question) => ({
            ...question,
            enabled: false,
          }));
        }
      }
      if (state === 'new owner') {
        if (path === '/geo/settings') data = { ...(data as object), configured: false };
        if (url.pathname.endsWith('/geo/observations'))
          data = { observations: [], nextCursor: null };
        if (url.pathname.endsWith('/geo/trends'))
          data = { ...(data as object), captures: 0, classifiedCaptures: 0, samples: [] };
        if (path === '/geo/actions' || path === '/geo/analyses') data = [];
        if (path === '/geo/runs') data = { runs: [], dailyOutcomes: [] };
      } else if (state === 'quota reached' && path === '/geo/allowance') {
        data = { ...(data as object), enabled: false, reason: 'GEO_QUOTA_EXCEEDED' };
      }
      await route.fulfill({ json: { data } });
    });
    await page.goto('/app/overview');
    await expect(page.getByRole('button', { name: 'Monitor Prompts' })).toBeDisabled();
    if ((page.viewportSize()?.width ?? 1440) < 1024) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      const drawer = page.getByRole('dialog', { name: 'Workspace navigation' });
      await expect(drawer.getByText('Owner preview', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
    } else {
      await expect(page.getByText('Owner preview', { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('Perplexity subscription active', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('link', {
        name:
          state === 'new owner'
            ? 'Review monitoring settings'
            : state === 'quota reached'
              ? 'Review GEO allowance'
              : 'Review prompt sets',
      }),
    ).toBeVisible();
    await expect(page.locator('#geo-monitor-status')).toContainText(
      state === 'new owner'
        ? 'Save monitoring engines'
        : state === 'quota reached'
          ? 'Monitoring allowance reached'
          : 'Add an active prompt',
    );
    await page.getByRole('button', { name: 'Refresh saved evidence' }).click();
    await expect(
      page.getByText(state === 'new owner' ? 'No saved answer' : 'Prompt sent to provider').first(),
    ).toBeVisible();
    expect(paidCalls).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${state.replaceAll(' ', '-')}.png`),
      fullPage: true,
    });
  });
}
