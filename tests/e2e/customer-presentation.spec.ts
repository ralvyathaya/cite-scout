import { expect, test, type Page } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoAnalysis } from '../../src/shared/geo-analysis';
import type { GeoAction, GeoActionDetail } from '../../src/shared/geo-actions';

async function customerWorkspace(page: Page, owner = false, reason: string | null = null) {
  const fixture = new GeoFixtureWorkspace();
  const mutations: string[] = [];
  await page.route(/\/api\/(?:v2\/|billing\/status)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') mutations.push(url.pathname);
    const path = url.pathname.replace('/api/v2', '') + url.search;
    let data = await fixture.request(path);
    if (path === '/project') {
      data = { ...(data as object), internalTestAccess: owner, canScan: false };
    }
    if (path === '/geo/allowance' && reason) {
      data = { ...(data as object), enabled: false, reason };
    }
    await route.fulfill({ json: { data } });
  });
  return mutations;
}

test('workspace logo returns to Overview and closes mobile navigation', async ({ page }) => {
  const mutations = await customerWorkspace(page);
  await page.goto('/app/observations');
  const mobile = (page.viewportSize()?.width ?? 1440) < 1024;
  if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  const navigation = mobile
    ? page.getByRole('dialog', { name: 'Workspace navigation' })
    : page.getByRole('complementary', { name: 'Workspace sidebar' });
  const logo = navigation.getByRole('link', { name: 'CiteScout home' });
  await expect(logo).toHaveAttribute('href', '/app/overview');
  await logo.click();
  await expect(page).toHaveURL(/\/app\/overview$/);
  if (mobile) await expect(navigation).not.toBeVisible();
  expect(mutations).toEqual([]);
});

for (const owner of [false, true]) {
  test(`${owner ? 'owner' : 'customer'} reads playbook tasks and opens technical details without starting monitoring`, async ({
    page,
  }, testInfo) => {
    const mutations = await customerWorkspace(page, owner);
    const fixture = new GeoFixtureWorkspace();
    const action = ((await fixture.request('/geo/actions')) as GeoAction[]).find(
      (row) => row.category === 'owned',
    );
    if (!action) throw new Error('Expected a website task');
    await page.route(`**/api/v2/geo/actions/${action.id}`, async (route) => {
      const detail = (await fixture.request(`/geo/actions/${action.id}`)) as GeoActionDetail;
      detail.action.status = 'in_progress';
      detail.events = [
        {
          id: 'history-event',
          actionId: detail.action.id,
          kind: 'progress',
          recordedAt: detail.action.updatedAt,
          details: {
            requestId: 'internal-history-request',
            notes: 'Customer note: verify current product facts.',
          },
          scopes: detail.action.scopes,
          evidenceIds: ['evidence-1'],
        },
      ];
      await route.fulfill({ json: { data: detail } });
    });
    await page.goto('/app/playbook');
    await expect(page.getByRole('heading', { name: 'Action Playbook', exact: true })).toBeVisible();
    await expect(page.getByText('Your website', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('External sources', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText(/frozen scopes|supporting records|Missing checks:|Priority \d/),
    ).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('customer-playbook.png') });
    await page.locator(`a[href="/app/playbook/${action.id}"]`).first().click();
    await expect(page.getByRole('heading', { name: 'What to produce' })).toBeVisible();
    await expect(page.getByText('In progress', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Check public access and applicable robots/noindex/canonical signals.', {
        exact: true,
      }),
    ).toBeHidden();
    await expect(
      page.getByLabel(
        'Check the page opens publicly and whether its search settings block access or point to a different URL.',
        { exact: true },
      ),
    ).toBeVisible();
    const template = page.getByText(/^Template /);
    await expect(template).toBeHidden();
    const taskDetails = page.locator('summary').filter({ hasText: /^Task details$/ });
    await taskDetails.focus();
    await page.keyboard.press('Enter');
    await expect(template).toBeVisible();
    await expect(
      page.getByText('Check public access and applicable robots/noindex/canonical signals.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(/Missing checks:/)).toBeVisible();
    await page.keyboard.press('Space');
    await expect(template).toBeHidden();
    const history = page.getByRole('heading', { name: 'Work history', exact: true }).locator('..');
    await expect(
      history.getByText('Customer note: verify current product facts.', { exact: true }),
    ).toBeVisible();
    const rawEvent = history.locator('pre');
    await expect(rawEvent).toBeHidden();
    await history.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(rawEvent).toBeVisible();
    await expect(rawEvent).toContainText('internal-history-request');
    await page.keyboard.press('Space');
    await expect(rawEvent).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('customer-task.png') });
    const trigger = page.getByRole('button', { name: 'Plan follow-up work', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Plan follow-up work', exact: true });
    await expect(dialog.getByLabel('Page on your website', { exact: true })).toBeVisible();
    const context = dialog.getByText(/output limit/).first();
    await expect(context).toBeHidden();
    await dialog.locator('summary').first().focus();
    await page.keyboard.press('Enter');
    await expect(context).toBeVisible();
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    expect(mutations).toEqual([]);
  });

  test(`${owner ? 'owner' : 'customer'} reads analysis findings with technical details collapsed`, async ({
    page,
  }, testInfo) => {
    const mutations = await customerWorkspace(page, owner);
    await page.goto('/app/diagnoses');
    await page.getByRole('button', { name: 'Details', exact: true }).first().click();
    const card = page.locator('article').first();
    await expect(card.getByRole('heading', { name: 'Answer analysis', exact: true })).toBeVisible();
    await expect(card.getByText('Your brand:', { exact: false })).toBeVisible();
    await expect(card.getByRole('heading', { name: 'Findings to review' })).toBeVisible();
    await expect(card.getByText('Possible issue', { exact: true }).first()).toBeVisible();
    await expect(card.getByText(/Next checks: Review your website/)).toBeVisible();
    const technical = [
      card.getByText(/^buyer_intent:/),
      card.getByText(/^Original answer offsets/).first(),
      card.getByRole('heading', { name: 'Persisted diagnoses', exact: true }),
      card.getByText(/rubric geo-rubric/).first(),
    ];
    for (const label of technical) await expect(label).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('customer-analysis.png') });
    const summary = card.locator('summary').filter({ hasText: /^Analysis details$/ });
    await summary.focus();
    await page.keyboard.press('Enter');
    for (const label of technical) await expect(label).toBeVisible();
    await expect(card.locator('pre').first()).toContainText(
      'brand_and_owned_reference_not_observed',
    );
    await page.keyboard.press('Space');
    for (const label of technical) await expect(label).toBeHidden();
    if ((page.viewportSize()?.width ?? 1440) < 1024)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    expect(mutations).toEqual([]);
  });

  test(`${owner ? 'owner' : 'customer'} sees product UI without internal tools or invented subscription`, async ({
    page,
  }, testInfo) => {
    const mutations = await customerWorkspace(page, owner);
    await page.goto('/app/overview');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Owner preview', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Saved evidence access', { exact: true })).toHaveCount(0);
    await expect(page.locator('a[href*="fixture=1"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Refresh saved evidence' }).click();
    await page.screenshot({ path: testInfo.outputPath('customer-overview.png') });
    await page.goto('/app/billing');
    await expect(page.getByRole('heading', { name: 'Billing & usage' })).toBeVisible();
    await expect(page.getByText('No subscription', { exact: true })).toBeVisible();
    await expect(page.getByText('Monitoring attempts today', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('customer-billing.png') });
    await expect(
      page.getByText(
        /Reported charges|Estimated charges|Reserved budget|Test spend cap|classifier|SerpApi requests/,
      ),
    ).toHaveCount(0);
    await page.goto('/app/settings');
    await expect(page.getByRole('link', { name: 'Review onboarding', exact: true })).toHaveCount(0);
    await expect(
      page.getByText(/Classifier:|Requested model:|processing budgets|OPENAI_API_KEY/),
    ).toHaveCount(0);
    await expect(page.getByText('Perplexity subscription active', { exact: true })).toHaveCount(0);
    expect(mutations).toEqual([]);
  });
}

test('playbook distinguishes an empty task list from unavailable tasks', async ({ page }) => {
  const mutations = await customerWorkspace(page);
  let unavailable = false;
  await page.route('**/api/v2/geo/actions', async (route) => {
    await route.fulfill(
      unavailable
        ? { status: 503, json: { error: { message: 'Saved tasks unavailable.' } } }
        : { json: { data: [] } },
    );
  });
  await page.goto('/app/playbook');
  await expect(page.getByText(/No tasks in this view\./)).toBeVisible();
  unavailable = true;
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Saved tasks unavailable.');
  await expect(page.getByText(/Tasks are unavailable right now/)).toBeVisible();
  await expect(page.getByText(/No tasks in this view\.|0 tasks in this view/)).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('analysis keeps pending, failed, partial and empty findings distinct', async ({ page }) => {
  const mutations = await customerWorkspace(page);
  const fixture = new GeoFixtureWorkspace();
  const completed = ((await fixture.request('/geo/analyses')) as GeoAnalysis[]).find(
    (analysis) => analysis.state === 'completed',
  );
  if (!completed) throw new Error('Expected completed analysis');
  let state: 'queued' | 'running' | 'failed' | 'partial' | 'empty' = 'queued';
  await page.route('**/api/v2/geo/analyses', async (route) => {
    const data =
      state === 'partial' || state === 'empty'
        ? {
            ...completed,
            classification: {
              ...completed.classification,
              scope: state === 'partial' ? 'partial' : 'complete',
            },
            diagnoses: [],
          }
        : {
            ...completed,
            state,
            classification: null,
            diagnoses: [],
            failureCode: state === 'failed' ? 'classifier_unavailable' : null,
          };
    await route.fulfill({ json: { data: [data] } });
  });
  for (const nextState of ['queued', 'running', 'failed', 'partial', 'empty'] as const) {
    state = nextState;
    await page.goto('/app/diagnoses');
    await page.getByRole('button', { name: 'Details', exact: true }).first().click();
    const card = page.locator('article').first();
    await expect(card.getByRole('heading', { name: 'Answer analysis', exact: true })).toBeVisible();
    if (state === 'partial')
      await expect(card.getByText(/covers only part of the saved answer/)).toBeVisible();
    else if (state === 'empty')
      await expect(card.getByText(/No findings were established/)).toBeVisible();
    else {
      await expect(
        card.getByText(
          {
            queued: 'Waiting for analysis',
            running: 'Analyzing answer',
            failed: 'Analysis unavailable',
          }[state],
          { exact: true },
        ),
      ).toBeVisible();
      await expect(card.getByText('Your brand:', { exact: false })).toHaveCount(0);
      await expect(card.getByText(/No findings were established/)).toHaveCount(0);
    }
    if (state === 'failed') {
      await expect(card.getByText('Failure code: classifier_unavailable')).toBeHidden();
      await card
        .locator('summary')
        .filter({ hasText: /^Analysis details$/ })
        .click();
      await expect(card.getByText('Failure code: classifier_unavailable')).toBeVisible();
    }
  }
  expect(mutations).toEqual([]);
});

test('accounting block keeps checks disabled and directs the customer to support', async ({
  page,
}) => {
  const mutations = await customerWorkspace(page, true, 'GEO_COST_UNKNOWN');
  await page.goto('/app/overview');
  await expect(page.getByRole('button', { name: 'Monitor Prompts' })).toBeDisabled();
  await expect(page.locator('#geo-monitor-status')).toContainText('Contact support');
  await expect(
    page.getByRole('link', { name: 'Contact support about monitoring' }),
  ).toHaveAttribute('href', /^mailto:/);
  expect(mutations).toEqual([]);
});

test('missing production cost policy offers support without exposing internal configuration', async ({
  page,
}) => {
  const mutations = await customerWorkspace(page, false, 'GEO_PRODUCTION_COST_POLICY_REQUIRED');
  await page.goto('/app/overview');
  await expect(page.getByRole('button', { name: 'Monitor Prompts' })).toBeDisabled();
  await expect(page.locator('#geo-monitor-status')).toContainText('Contact support');
  await expect(
    page.getByRole('link', { name: 'Contact support about monitoring' }),
  ).toHaveAttribute('href', /^mailto:/);
  await expect(page.getByText('GEO_PRODUCTION_COST_POLICY_REQUIRED', { exact: true })).toHaveCount(
    0,
  );
  expect(mutations).toEqual([]);
});

test('workspace and public pages keep consistent local fonts, including portals', async ({
  page,
}) => {
  await customerWorkspace(page);
  const remoteFonts: string[] = [];
  page.on('request', (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) remoteFonts.push(request.url());
  });
  await page.goto('/app/settings');
  const heading = page.getByRole('heading', { name: 'Settings', exact: true });
  await expect(heading).toHaveCSS('font-family', /Newsreader/);
  await expect(heading).toHaveCSS('font-weight', '400');
  expect(
    await page.evaluate(async () => {
      const faces = await Promise.all([
        document.fonts.load('400 16px Switzer'),
        document.fonts.load('italic 400 16px Switzer'),
        document.fonts.load('400 32px Newsreader'),
      ]);
      return faces.every(
        (loaded) => loaded.length > 0 && loaded.every((font) => font.status === 'loaded'),
      );
    }),
  ).toBe(true);
  await page.getByRole('combobox', { name: 'Language' }).click();
  await expect(page.getByRole('listbox')).toHaveCSS('font-family', /Switzer/);
  await page.keyboard.press('Escape');
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /Switzer/);
  expect(remoteFonts).toEqual([]);
});

test('unavailable evidence is not presented as zero observations or no work', async ({ page }) => {
  await customerWorkspace(page);
  await page.route(/\/api\/v2\/geo\/(?:observations|trends|actions)(?:\?|$)/, (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Saved data unavailable.' } } }),
  );
  await page.goto('/app/overview');
  await expect(page.getByRole('alert').first()).toContainText('Saved data unavailable.');
  await expect(page.getByText('Saved observations', { exact: true }).locator('..')).toContainText(
    '—',
  );
  await expect(page.getByText('Work to review', { exact: true }).locator('..')).toContainText('—');
  await expect(page.getByText('Work is unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByText('Saved answers are unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByText('No proposed work in this scope.', { exact: false })).toHaveCount(0);
});

test('billing distinguishes a missing response from an account with no subscription', async ({
  page,
}) => {
  await customerWorkspace(page);
  await page.route('**/api/billing/status', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Payment status unavailable.' } } }),
  );
  await page.goto('/app/billing');
  await expect(page.getByText('Subscription status unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByText('No subscription', { exact: true })).toHaveCount(0);
});

test('app text and primary action colors meet minimum contrast', async ({ page }) => {
  await customerWorkspace(page);
  await page.goto('/app/overview');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const ratios = await page.evaluate(() => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const luminance = (color: string) => {
      probe.style.color = `var(${color})`;
      const channels = getComputedStyle(probe)
        .color.match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
      if (channels?.length !== 3) throw new Error('Expected RGB color');
      const [red = 0, green = 0, blue = 0] = channels.map((value) => {
        const srgb = value / 255;
        return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const pairs: [string, string][] = [
      ['--foreground', '--background'],
      ['--muted-foreground', '--background'],
      ['--muted-foreground', '--card'],
      ['--primary-foreground', '--primary'],
    ];
    const result = pairs.map(([textColor, background]) => {
      const first = luminance(textColor),
        second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    });
    probe.remove();
    return result;
  });
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
});
