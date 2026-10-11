import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoRun, GeoObservation } from '../../src/shared/geo';
import type { GeoAnalysis } from '../../src/shared/geo-analysis';
test('local fixture workspace completes the evidence-action loop without any API transport', async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  await page.route('**/api/**', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 503,
      json: { error: { message: 'Unexpected API transport in fixture mode' } },
    });
  });
  await page.goto('/app/overview?fixture=1');
  await expect(
    page.getByText('Fixture workspace — synthetic data · no provider calls'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Monitor Prompts' })).toBeEnabled();
  await expect(page.getByText('Prompt sent to provider').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('geo-overview.png'), fullPage: true });
  await page.goto('/app/playbook');
  await expect(page.getByRole('heading', { name: 'Action Playbook', exact: true })).toBeVisible();
  await page.locator('a[href="/app/playbook/fixture-action-1"]').first().click();
  await expect(page.getByRole('heading', { name: 'Action brief', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Accept action', exact: true }).click();
  await page
    .getByLabel('Change description', { exact: true })
    .fill('Synthetic update: published a clearer buyer comparison with verified product facts.');
  await page
    .getByLabel('Reported implementation time', { exact: true })
    .fill(new Date(Date.now() - 3600_000).toISOString().slice(0, 16));
  await page.getByRole('button', { name: /Complete action/ }).click();
  await expect(
    page
      .getByText(
        'Synthetic update: published a clearer buyer comparison with verified product facts.',
      )
      .first(),
  ).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) < 1024)
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.recharts-reference-line-line')).toHaveCount(1);
  await page.locator('a[href="/app/playbook/fixture-action-1"]').first().click();
  await page.getByRole('button', { name: 'Monitor Prompts', exact: true }).click();
  await expect(page.getByText(/answers captured/).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('geo-action-pin.png'), fullPage: true });
  expect(requests).toEqual([]);
});
test('GEO pages retain usable layout at mobile and tablet widths', async ({ page }) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app/overview?fixture=1');
    for (const [path, title] of [
      ['overview', 'Visibility & action overview'],
      ['questions', 'Prompt Sets'],
      ['observations', 'Observations'],
      ['diagnoses', 'Diagnoses'],
      ['playbook', 'Action Playbook'],
      ['sources', 'Sources'],
      ['competitors', 'Competitors'],
      ['billing', 'Billing & usage'],
      ['settings', 'Settings'],
    ] as const) {
      await page.goto(`/app/${path}`);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        path,
      ).toBe(true);
    }
  }
});
test('GEO quota and partial run retain original evidence when classification fails', async ({
  page,
}) => {
  const fixture = new GeoFixtureWorkspace();
  let blocked = true;
  let monitoringRun: GeoRun | null = null;
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    let data: unknown;
    if (url.pathname.endsWith('/geo/allowance') && blocked) {
      data = {
        enabled: false,
        reason: 'GEO_QUOTA_EXCEEDED',
        today: 100,
        month: 100,
        globalToday: 100,
        limits: { projectDaily: 100, projectMonthly: 1000, globalDaily: 1000 },
        cooldownSeconds: 300,
      };
    } else if (path === '/geo/runs' && request.method() === 'POST') {
      monitoringRun = (await fixture.request(path, request.postDataJSON())) as GeoRun;
      monitoringRun.status = 'running';
      const [pending, failed] = monitoringRun.items;
      if (!pending || !failed) throw new Error('Fixture requires two monitoring items');
      pending.status = 'submitted';
      failed.status = 'failed';
      failed.terminalReason = 'provider_unavailable';
      data = monitoringRun;
    } else if (monitoringRun && path === `/geo/runs/${monitoringRun.id}`) data = monitoringRun;
    else {
      data = await fixture.request(
        path,
        request.method() === 'GET' ? undefined : request.postDataJSON(),
        request.method(),
      );
      if (/\/geo\/observations\/[^/]+$/.test(url.pathname))
        (data as GeoObservation).capture.quality = 'partial';
      if (url.pathname.endsWith('/analyses'))
        data = (data as GeoAnalysis[]).map((analysis) => ({
          ...analysis,
          state: 'failed',
          classification: null,
          diagnoses: [],
          failureCode: 'classifier_unavailable',
        }));
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto('/app/overview');
  await expect(page.getByRole('button', { name: 'Monitor Prompts' })).toBeDisabled();
  await expect(
    page.getByText('Monitoring allowance reached. Review Usage or wait for the UTC reset.'),
  ).toBeVisible();
  blocked = false;
  await page.reload();
  const monitor = page.getByRole('button', { name: 'Monitor Prompts' });
  await expect(monitor).toBeEnabled();
  await monitor.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('6 of 8 answers captured · running')).toBeVisible();
  await expect(page.getByText('provider_unavailable', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View full answer & provenance' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Original observation', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Failed classification' })).toBeVisible();
  await expect(page.getByText(/Parsing is partial/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download original response JSON' })).toBeEnabled();
});
test('fixture raw download retains synthetic provenance and mobile navigation works with keyboard', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/overview?fixture=1');
  const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('link', { name: 'Observations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Observations', exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: /Inspect original|View observation|View full answer/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Original observation', exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download.*raw|Download.*JSON|Raw.*JSON/i }).click();
  const download = await downloadPromise,
    path = await download.path();
  if (!path) throw new Error('download missing');
  const raw = JSON.parse(await readFile(path, 'utf8')) as {
    raw: { dataOrigin: string };
    provenance: string;
  };
  expect(raw.raw.dataOrigin).toBe('fixture');
  expect(raw.provenance).toContain('Synthetic');
  await page.screenshot({ path: testInfo.outputPath('geo-mobile-proof.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
