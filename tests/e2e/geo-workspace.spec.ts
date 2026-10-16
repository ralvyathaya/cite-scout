import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoRun, GeoObservation } from '../../src/shared/geo';
import type { GeoAnalysis } from '../../src/shared/geo-analysis';
import type { GeoCapabilities } from '../../src/client/pages/v2/GeoWorkspace';
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
  await page.locator('a[href="/app/playbook/fixture-action-1"]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Action brief', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Accept action', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page
    .getByLabel('Change description', { exact: true })
    .fill('Synthetic update: published a clearer buyer comparison with verified product facts.');
  await page
    .getByLabel('Reported implementation time', { exact: true })
    .fill(new Date(Date.now() - 3600_000).toISOString().slice(0, 16));
  await page.getByRole('button', { name: /Complete action/ }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByText(
        'Synthetic update: published a clearer buyer comparison with verified product facts.',
      )
      .first(),
  ).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).focus();
    await page.keyboard.press('Enter');
  }
  await page.getByRole('link', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.recharts-reference-line-line')).toHaveCount(1);
  await page.getByText('Action pins & comparisons', { exact: true }).click();
  await page.locator('a[href="/app/playbook/fixture-action-1"]').first().click();
  await page.getByRole('button', { name: 'Monitor Prompts', exact: true }).click();
  await expect(page.getByText(/observations saved/).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('geo-action-pin.png'), fullPage: true });
  await page
    .getByRole('textbox', { name: 'Reason for reopening', exact: true })
    .fill('Synthetic follow-up: verify the updated comparison evidence.');
  await page.getByRole('button', { name: 'Reopen action', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Complete action & record pin', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText('Synthetic follow-up: verify the updated comparison evidence.', { exact: false })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        'Synthetic update: published a clearer buyer comparison with verified product facts.',
        { exact: false },
      )
      .first(),
  ).toBeVisible();
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
      monitoringRun.completedAt = null;
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
  await expect(page.getByText('6 of 8 observations saved · running')).toBeVisible();
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

test('monitoring setup offers five engines with at most four selected and readable market controls', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/api/**', async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 503,
      json: { error: { message: 'Unexpected fixture transport' } },
    });
  });
  await page.goto('/app/overview?fixture=1');
  await expect(page.getByRole('button', { name: 'Monitor Prompts', exact: true })).toBeEnabled();
  const setup = page.locator('summary').filter({ hasText: 'Monitoring setup' });
  await expect(setup).toBeVisible();
  await setup.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Configure engines', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Configure engines', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'OpenAI Web Search API', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText('4 of 4 engine slots selected.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'ChatGPT Search', exact: true }).uncheck();
  const openai = page.getByRole('checkbox', { name: 'OpenAI Web Search API', exact: true });
  await expect(openai).toBeEnabled();
  await openai.focus();
  await page.keyboard.press('Space');
  await expect(openai).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Market', exact: true })).toHaveText(
    'United States (US)',
  );
  await expect(page.getByRole('combobox', { name: 'Language', exact: true })).toHaveText(
    'English (en)',
  );
  await expect(page.getByRole('checkbox', { name: 'Enable daily monitoring' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Save monitoring settings', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Monitoring configuration saved.' }),
  ).toBeVisible();
  expect(requests).toEqual([]);
});

test('engine availability shows the configured collector and a concrete secret setup step', async ({
  page,
}) => {
  const fixture = new GeoFixtureWorkspace();
  await page.route('**/api/billing/status', async (route) => {
    await route.fulfill({ json: { data: await fixture.request('/api/billing/status') } });
  });
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    const data = await fixture.request(path);
    if (path === '/geo/capabilities') {
      const capabilities = data as GeoCapabilities;
      capabilities.engines.google_aio.collector = 'dataforseo_standard';
      capabilities.engines.openai_web_search = {
        available: false,
        reason: 'OPENAI_API_KEY is missing.',
        collector: 'openai_responses',
        requestedModel: 'gpt-6-luna',
        nextStep: 'Add OPENAI_API_KEY to the staging Worker environment secrets.',
      };
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto('/app/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const google = page
    .locator('label')
    .filter({ has: page.getByRole('checkbox', { name: 'Google AI Overview', exact: true }) });
  await expect(google).toContainText('Configured · DataForSEO Standard');
  const openai = page
    .locator('label')
    .filter({ has: page.getByRole('checkbox', { name: 'OpenAI Web Search API', exact: true }) });
  await expect(openai).toContainText('OPENAI_API_KEY is missing.');
  await expect(openai).toContainText(
    'Add OPENAI_API_KEY to the staging Worker environment secrets.',
  );
  await expect(openai).toContainText('Requested model: gpt-6-luna');
  await expect(
    page.getByText(
      'Availability reflects server configuration and secrets, not a validated live capture.',
      { exact: false },
    ),
  ).toBeVisible();
});

test('usage distinguishes provider requests, SerpApi quota, estimates and unknown-cost review', async ({
  page,
}) => {
  const fixture = new GeoFixtureWorkspace();
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    let data = await fixture.request(path);
    if (path === '/geo/usage')
      data = {
        ...(data as Record<string, unknown>),
        providerRequests: {
          total: 7,
          serpapi: 4,
          reportedCostUsd: 0.001,
          estimatedCostUsd: 0.03,
          unknownCostRequests: 1,
          reservedCostUsd: 0.15,
          spendCapUsd: 5,
          serpapiMonthlyCap: 250,
        },
      };
    await route.fulfill({ json: { data } });
  });
  await page.goto('/app/billing');
  const accounting = page.getByRole('region', { name: 'Provider request accounting' });
  await expect(accounting).toBeVisible();
  await expect(accounting).toContainText('7 provider requests');
  await expect(accounting).toContainText('4 / 250 SerpApi requests');
  await expect(accounting).toContainText('Reported charges: $0.001000 USD');
  await expect(accounting).toContainText('Estimated charges: $0.030000 USD');
  await expect(accounting).toContainText('Reserved budget: $0.150000 USD');
  await expect(accounting).toContainText('Test spend cap: $5.00 USD');
  await expect(accounting.getByRole('alert')).toContainText('1 request with unknown cost');
  await expect(accounting.getByRole('alert')).toContainText(
    'Review unknown costs before another paid check.',
  );
});
