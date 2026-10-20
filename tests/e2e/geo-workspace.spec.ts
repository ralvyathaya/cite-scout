import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoRun, GeoObservation, GeoObservationPage } from '../../src/shared/geo';
import type { GeoAnalysis } from '../../src/shared/geo-analysis';
import type { GeoCapabilities } from '../../src/client/pages/v2/GeoWorkspace';

test('saved Markdown answers and adjacent evidence segments stay readable and inert', async ({
  page,
}, testInfo) => {
  const fixture = new GeoFixtureWorkspace();
  const saved = (await fixture.request('/geo/observations?days=7')) as GeoObservationPage;
  const observation = saved.observations[0];
  if (!observation) throw new Error('Expected a saved observation');
  const prefix =
    '## Compare tools\n\n- **Peec AI** — review [documentation](https://docs.example.com/guide).\n- *Another tool* — compare options.\n\n| Tool | Fit |\n| --- | --- |\n| Peec | Small teams |\n\n```js\nconst answer = "**literal**";\n```\n\n';
  const excerpt =
    (prefix + 'Review supporting context. '.repeat(70)).slice(
      0,
      1600 - '**Founder’s sh'.length - 2,
    ) +
    '\n\n' +
    '**Founder’s shortlist:** Start with the saved evidence.\n\n<script>window.markdownExecuted = true</script>\n\n[Unsafe](javascript:alert(1))\n\n![Tracking image](https://tracking.invalid/pixel.png)';
  const omitted = '\n\nContext excluded from the supporting excerpts.\n\n';
  const separate = 'A separate **passage**.';
  const text = excerpt + omitted + separate;
  const writes: string[] = [],
    images: string[] = [];
  await page.route('https://tracking.invalid/**', async (route) => {
    images.push(route.request().url());
    await route.abort();
  });
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    if (request.method() !== 'GET') writes.push(path);
    const data = await fixture.request(path);
    if (url.pathname === `/api/v2/geo/observations/${observation.id}`)
      (data as GeoObservation).capture.answerText = text;
    if (url.pathname.endsWith('/analyses')) {
      for (const analysis of data as GeoAnalysis[]) {
        if (!analysis.classification) continue;
        analysis.classification.evidence = [0, 1600].map((start, index) => ({
          id: `segment_${String(index + 1)}`,
          start,
          end: index === 0 ? 1600 : excerpt.length,
          quote: excerpt.slice(start, index === 0 ? 1600 : excerpt.length),
          supportProbability: 0.8,
        }));
        analysis.classification.evidence.push({
          id: 'segment_3',
          start: excerpt.length + omitted.length,
          end: text.length,
          quote: separate,
          supportProbability: 0.4,
        });
      }
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto(`/app/observations/${observation.id}`);
  const answer = page.getByRole('region', { name: 'Original observation evidence' });
  const analysis = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Answer analysis', exact: true }) })
    .first();
  for (const content of [answer, analysis]) {
    await expect(
      content.locator('strong').filter({ hasText: 'Founder’s shortlist:' }),
    ).toBeVisible();
    await expect(content.locator('ul li').filter({ hasText: 'Peec AI' })).toBeVisible();
    await expect(content.getByRole('table')).toBeVisible();
    await expect(content.locator('pre code')).toContainText('"**literal**"');
    await expect(content.getByRole('link', { name: 'documentation' })).toHaveAttribute(
      'href',
      'https://docs.example.com/guide',
    );
    await expect(content.getByRole('link', { name: 'documentation' })).toHaveAttribute(
      'rel',
      /noopener/,
    );
    await expect(content.locator('script, iframe, img, a[href^="javascript:"]')).toHaveCount(0);
  }
  await expect(analysis.locator('blockquote')).toHaveCount(2);
  await expect(analysis.locator('blockquote').last()).toHaveText(/A separate passage/);
  await expect(analysis.locator('blockquote').first()).not.toContainText('Context excluded');
  await expect(analysis.getByText(/Original answer offsets 0–1600/)).toBeHidden();
  await expect(analysis.getByText(/Original answer offsets 1600–/)).toBeHidden();
  await analysis.screenshot({ path: testInfo.outputPath('markdown-analysis.png') });
  const details = analysis.locator('summary').filter({ hasText: /^Analysis details$/ });
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(analysis.getByText(/Original answer offsets 0–1600/)).toBeVisible();
  await expect(analysis.getByText(/Original answer offsets 1600–/)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(analysis.getByText(/Original answer offsets 0–1600/)).toBeHidden();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('markdown-evidence.png'), fullPage: true });
  expect(writes).toEqual([]);
  expect(images).toEqual([]);
  expect(await page.evaluate(() => Object.hasOwn(window, 'markdownExecuted'))).toBe(false);
});
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
    .getByLabel('When was the work completed?', { exact: true })
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
  await expect(page.getByRole('button', { name: 'Complete action', exact: true })).toBeVisible();
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
      ['questions', 'Prompts'],
      ['observations', 'Answers'],
      ['trends', 'Trends'],
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
  await expect(page.getByRole('heading', { name: 'Answer details', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Answer analysis', exact: true })).toBeVisible();
  await expect(page.getByText('Analysis unavailable', { exact: true })).toBeVisible();
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
  await page.getByRole('dialog').getByRole('link', { name: 'Monitoring', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Monitoring views' })
    .getByRole('link', { name: 'Answers', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Answers', exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: /Inspect original|View observation|View answer/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Answer details', exact: true })).toBeVisible();
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
  await page.getByText('Monitoring details', { exact: true }).click();
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

test('engine availability explains customer options without internal setup details', async ({
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
      if (!capabilities.engines.google_aio) throw new Error('Expected Google capability');
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
  await expect(google).toContainText('Available for monitoring');
  const openai = page
    .locator('label')
    .filter({ has: page.getByRole('checkbox', { name: 'OpenAI Web Search API', exact: true }) });
  await expect(openai).toContainText('Currently unavailable');
  await expect(openai).not.toContainText('OPENAI_API_KEY');
  await expect(openai).not.toContainText('gpt-6-luna');
  await expect(
    page.getByText('Choose another engine or contact support;', { exact: false }),
  ).toBeVisible();
});

test('billing keeps internal accounting out of customer UI while explaining blocked monitoring', async ({
  page,
}) => {
  const fixture = new GeoFixtureWorkspace();
  const mutations: string[] = [];
  await page.route(/\/api\/(?:v2\/|billing\/status)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    if (request.method() !== 'GET') mutations.push(path);
    let data = await fixture.request(path);
    if (path === '/geo/allowance')
      data = {
        ...(data as object),
        enabled: false,
        reason: 'GEO_COST_UNKNOWN',
        today: 7,
        month: 24,
      };
    await route.fulfill({ json: { data } });
  });
  await page.goto('/app/billing');
  await expect(page.getByRole('region', { name: 'Monitoring usage' })).toContainText('7');
  await expect(page.getByRole('region', { name: 'Monitoring usage' })).toContainText('24');
  await expect(page.getByRole('region', { name: 'Provider request accounting' })).toHaveCount(0);
  await expect(
    page.getByText(/Reported charges|Estimated charges|Reserved budget|Test spend cap/),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Contact support about monitoring' }),
  ).toHaveAttribute('href', /^mailto:/);
  expect(mutations).toEqual([]);
});
