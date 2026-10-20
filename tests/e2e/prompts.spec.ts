import { expect, test, type Page } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoObservationPage } from '../../src/shared/geo';
import type { V2ProjectPayload } from '../../src/shared/v2';

async function workspace(page: Page, readOnly = false) {
  const fixture = new GeoFixtureWorkspace();
  const writes: string[] = [];
  await page.route(/\/api\/(?:v2\/|billing\/status)/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    if (request.method() !== 'GET') writes.push(`${request.method()} ${url.pathname}`);
    let data = await fixture.request(path, request.postDataJSON(), request.method());
    if (readOnly && path === '/project')
      data = { ...(data as V2ProjectPayload), canScan: false, internalTestAccess: true };
    await route.fulfill({ json: { data } });
  });
  return { fixture, writes };
}

async function selectFilter(page: Page, label: string, value: string) {
  const mobile = (page.viewportSize()?.width ?? 1440) < 768;
  if (mobile) await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const scope = mobile
    ? page.getByRole('dialog', { name: 'Prompt filters' })
    : page.locator('[aria-label="Prompt filters"]').first();
  await scope.getByLabel(label, { exact: true }).selectOption(value);
  if (mobile) await page.keyboard.press('Escape');
}

test('prompt table filters, overlapping groups and ungrouped retain unique counts and monitoring scope', async ({
  page,
}, testInfo) => {
  const { fixture, writes } = await workspace(page);
  const project = (await fixture.request('/project')) as V2ProjectPayload;
  const prompts = project.project?.questions ?? [];
  const first = prompts[0];
  if (!first) throw new Error('Expected a fixture prompt');
  await fixture.request('/geo/prompt-sets', { name: 'Pricing', promptIds: [first.id] }, 'POST');
  await page.goto('/app/questions');
  await expect(page.getByRole('heading', { name: 'Prompts', exact: true })).toBeVisible();
  const table = page.getByRole('table', {
    name: 'Prompts, groups, status and loaded engine captures',
  });
  await expect(table.getByRole('rowheader', { name: first.text, exact: true })).toHaveCount(1);
  await expect(page.getByText('2 shown', { exact: false })).toBeVisible();
  await selectFilter(page, 'Group by', 'group');
  await expect(table.getByRole('rowheader', { name: first.text, exact: true })).toHaveCount(2);
  await expect(page.getByText('2 shown', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Pricing 1' }).click();
  await expect(page.getByRole('button', { name: 'Pricing 1' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(table.getByRole('rowheader', { name: first.text, exact: true })).toBeVisible();
  await selectFilter(page, 'Group by', 'none');
  await page.getByLabel('Monitoring scope', { exact: true }).selectOption('fixture-set');
  await page.getByLabel('Search prompts').fill('pricing');
  await expect(table.getByRole('rowheader')).toHaveCount(1);
  await expect(page.getByLabel('Monitoring scope', { exact: true })).toHaveValue('fixture-set');
  await page.getByLabel('Search prompts').clear();
  await selectFilter(page, 'Prompt group', 'ungrouped');
  await expect(page.getByText('No prompts in this view.', { exact: false })).toBeVisible();
  await selectFilter(page, 'Prompt group', 'all');
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path: testInfo.outputPath('prompts-table.png'), fullPage: true });
  expect(writes).toEqual([]);
});

test('dialogs save prompts and groups, preserve inactive members, and restore keyboard focus', async ({
  page,
}) => {
  const { writes } = await workspace(page);
  await page.goto('/app/questions');
  const add = page.getByRole('button', { name: 'Add prompt', exact: true });
  await add.click();
  const promptDialog = page.getByRole('dialog', { name: 'Add prompt', exact: true });
  await promptDialog
    .getByLabel('Prompt', { exact: true })
    .fill('Which onboarding tool fits a growing product team?');
  await promptDialog.getByRole('button', { name: 'Save prompt' }).click();
  await expect(promptDialog).toBeHidden();
  await expect(add).toBeFocused();
  await expect(page.getByText('3 shown', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create group', exact: true });
  await dialog.getByLabel('Group name').fill('New buyers');
  await dialog.getByRole('checkbox').last().check();
  await dialog.getByRole('button', { name: 'Save group' }).click();
  await expect(dialog).toBeHidden();
  await page.getByText('Manage prompt groups · 2', { exact: true }).click();
  const group = page
    .locator('details > div > div')
    .filter({ has: page.getByText('New buyers', { exact: true }) });
  const edit = group.getByRole('button', { name: 'Edit group' });
  await edit.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(edit).toBeFocused();
  await page.getByRole('button', { name: /Manage prompt: Which onboarding tool fits/ }).click();
  await page.getByRole('menuitem', { name: 'Pause', exact: true }).click();
  await expect(page.getByText('2 shown', { exact: false })).toBeVisible();
  await edit.click();
  await expect(page.getByText('Inactive member:', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save group' })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove inactive member' }).click();
  await page.getByRole('dialog').getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Save group' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await group.getByRole('button', { name: 'Delete group' }).click();
  await expect(page.getByText('Manage prompt groups · 1', { exact: true })).toBeVisible();
  await selectFilter(page, 'Prompt group', 'ungrouped');
  await page.getByLabel('Prompt status').selectOption('Paused');
  await expect(page.getByText('1 shown', { exact: false })).toBeVisible();
  expect(writes.some((path) => path.endsWith('/geo/runs') || path.endsWith('/scans'))).toBe(false);
});

test('engine icons distinguish partial, no-feature, missing and paginated captures, and open the exact answer', async ({
  page,
}) => {
  const { fixture, writes } = await workspace(page);
  const saved = (await fixture.request('/geo/observations?days=30')) as GeoObservationPage;
  const firstCapture = saved.observations[0];
  if (!firstCapture) throw new Error('Expected a saved fixture answer');
  const promptId = firstCapture.context.promptId;
  const partial = saved.observations.find(
    (row) => row.context.promptId === promptId && row.engine === 'perplexity',
  );
  const noFeature = saved.observations.find(
    (row) => row.context.promptId === promptId && row.engine === 'google_aio',
  );
  if (!partial || !noFeature) throw new Error('Expected engine fixture captures');
  partial.capture.quality = 'partial';
  noFeature.capture.quality = 'no_feature';
  const older = saved.observations.find(
    (row) => row.context.promptId === promptId && row.engine === 'chatgpt_search',
  );
  if (!older) throw new Error('Expected an older fixture capture');
  const cursors: (string | null)[] = [];
  await page.route('**/api/v2/geo/observations?**', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    cursors.push(cursor);
    await route.fulfill({
      json: {
        data: {
          observations: cursor ? [older] : [partial, noFeature],
          nextCursor: cursor ? null : 'older',
        },
      },
    });
  });
  await page.goto('/app/questions');
  const table = page.getByRole('table');
  const partialLink = table.getByRole('link', { name: /Perplexity · Partial capture/ });
  await expect(partialLink).toHaveAttribute('data-capture', 'saved');
  await expect(
    table.getByRole('link', { name: /Google AI Overview · No AI answer returned/ }),
  ).toHaveAttribute('data-capture', 'saved');
  const unloaded = table
    .getByRole('link', { name: 'ChatGPT Search · No capture loaded', exact: true })
    .first();
  await expect(unloaded).toHaveAttribute('href', /promptId=.*&engine=chatgpt_search&days=30/);
  await unloaded.focus();
  await expect(page.getByRole('tooltip')).toContainText('No capture loaded');
  expect(cursors.length).toBeGreaterThan(0);
  expect(cursors.every((cursor) => cursor === null)).toBe(true);
  await page.getByRole('button', { name: 'Load more saved captures' }).click();
  await expect(
    table.getByRole('link', { name: /ChatGPT Search · Complete capture/ }),
  ).toHaveAttribute('href', `/app/observations/${older.id}`);
  await expect(page.getByRole('button', { name: 'Load more saved captures' })).toBeHidden();
  await expect(table.getByRole('link', { name: /Claude|Gemini/ })).toHaveCount(0);
  await partialLink.click();
  await expect(page).toHaveURL(new RegExp(`/app/observations/${partial.id}$`));
  await expect(page.getByRole('heading', { name: 'Answer details', exact: true })).toBeVisible();
  expect(writes.filter((path) => /geo\/runs|\/scans|\/analyses/.test(path))).toEqual([]);
});

test('capture loading, failure and refresh stay distinct from missing data', async ({ page }) => {
  await workspace(page);
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  await page.route('**/api/v2/geo/observations?**', async (route) => {
    await pending;
    await route.fulfill(
      fail
        ? {
            status: 503,
            json: { error: { message: 'Saved evidence is temporarily unavailable.' } },
          }
        : { json: { data: { observations: [], nextCursor: null } } },
    );
  });
  await page.goto('/app/questions');
  await expect(
    page
      .getByRole('table')
      .getByRole('link', { name: /Loading saved captures/ })
      .first(),
  ).toHaveAttribute('data-capture', 'loading');
  release?.();
  await expect(
    page
      .getByRole('table')
      .getByRole('link', { name: /Saved captures unavailable/ })
      .first(),
  ).toHaveAttribute('data-capture', 'unavailable');
  await expect(page.getByRole('alert')).toContainText('Saved captures unavailable');
  fail = false;
  await page.getByRole('button', { name: 'Refresh saved captures' }).click();
  await expect(
    page
      .getByRole('table')
      .getByRole('link', { name: /No capture loaded/ })
      .first(),
  ).toHaveAttribute('data-capture', 'not-loaded');
});

test('owner without editing access retains honest monitoring status and read-only answers', async ({
  page,
}) => {
  const { writes } = await workspace(page, true);
  await page.route('**/api/v2/geo/allowance', (route) =>
    route.fulfill({
      json: {
        data: {
          enabled: false,
          reason: 'GEO_QUOTA_EXCEEDED',
          today: 100,
          month: 1000,
          limits: { projectDaily: 100, projectMonthly: 1000 },
        },
      },
    }),
  );
  await page.goto('/app/questions');
  await expect(page.getByRole('button', { name: 'Monitor Prompts', exact: true })).toBeDisabled();
  await expect(page.getByText('Monitoring allowance reached.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add prompt', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create group', exact: true })).toHaveCount(0);
  await expect(
    page.getByText(/Project setup · monitoring access not active|Owner preview/),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh saved captures' }).click();
  await page.getByRole('button', { name: 'About these results', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('last 30 days');
  await page.keyboard.press('Escape');
  await page
    .getByRole('table')
    .getByRole('link', { name: 'View answers', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/observations\?promptId=.*&days=30/);
  expect(writes).toEqual([]);
});

test('prompt groups and selected engines do not show zero when reads fail', async ({ page }) => {
  await workspace(page);
  for (const path of ['settings', 'prompt-sets'])
    await page.route(`**/api/v2/geo/${path}`, (route) =>
      route.fulfill({ status: 503, json: { error: { message: 'Temporarily unavailable' } } }),
    );
  await page.goto('/app/questions');
  const summary = page.getByLabel('Prompt summary and capture legend');
  await expect(summary).toContainText('Groups unavailable');
  await expect(summary).toContainText('Engines unavailable');
  await expect(page.getByLabel('Group by', { exact: true })).toBeDisabled();
  await expect(page.getByRole('table').getByRole('rowheader')).toHaveCount(2);
});
