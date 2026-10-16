import { expect, test } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoObservation, GeoObservationPage } from '../../src/shared/geo';
import type { GeoAction, GeoActionDetail } from '../../src/shared/geo-actions';

test('a closed pagination request cannot overwrite a reopened follow-up review', async ({
  page,
}) => {
  const fixture = new GeoFixtureWorkspace();
  const source = ((await fixture.request('/geo/actions')) as GeoAction[]).find(
    (action) => action.category === 'owned',
  );
  if (!source) throw new Error('Expected owned action');
  const detail = (await fixture.request(`/geo/actions/${source.id}`)) as GeoActionDetail;
  const first = detail.evidence[0],
    latest = detail.evidence[1];
  if (!first || !latest) throw new Error('Expected multiple proofs');
  let releaseOld: (() => void) | undefined;
  const oldResponse = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  let pageRequests = 0;
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '');
    if (path === `/geo/actions/${source.id}`) {
      if (!url.search) {
        await route.fulfill({
          json: { data: { ...detail, evidence: [first], nextEvidenceCursor: 'next' } },
        });
      } else if (++pageRequests === 1) {
        await oldResponse;
        await route.fulfill({
          headers: { 'X-Fixture-Generation': 'old' },
          json: { data: { ...detail, evidence: [], nextEvidenceCursor: null } },
        });
      } else {
        await route.fulfill({
          json: { data: { ...detail, evidence: [latest], nextEvidenceCursor: null } },
        });
      }
      return;
    }
    await route.fulfill({ json: { data: await fixture.request(path + url.search) } });
  });
  await page.goto(`/app/playbook/${source.id}`);
  const trigger = page.getByRole('button', { name: 'Plan follow-up work', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Plan follow-up work', exact: true });
  await trigger.click();
  await expect.poll(() => pageRequests).toBe(1);
  await page.keyboard.press('Escape');
  await trigger.click();
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  const oldFinished = page.waitForResponse(
    (response) => response.headers()['x-fixture-generation'] === 'old',
  );
  releaseOld?.();
  await (await oldFinished).finished();
  await dialog
    .getByLabel('Owned page for new work', { exact: true })
    .fill('https://cedarflow.example/comparison');
  await dialog
    .getByLabel('Planned change', { exact: true })
    .fill('Keep the reopened review scope.');
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await dialog.getByRole('checkbox').last().check();
  await expect(
    dialog.getByRole('button', { name: 'Create follow-up action', exact: true }),
  ).toBeEnabled();
});

test('review and create a synthetic follow-up with an explicit baseline', async ({ page }) => {
  const fixture = new GeoFixtureWorkspace();
  const action = ((await fixture.request('/geo/actions')) as GeoAction[]).find(
    (action) => action.category === 'owned',
  );
  if (!action) throw new Error('Expected owned fixture action');
  await page.goto(`/app/playbook/${action.id}?fixture=1`);
  const trigger = page.getByRole('button', { name: 'Plan follow-up work', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Plan follow-up work', exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Create follow-up action', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('checkbox').first().check();
  await dialog
    .getByLabel('Owned page for new work', { exact: true })
    .fill('https://cedarflow.example/comparison');
  await dialog
    .getByLabel('Planned change', { exact: true })
    .fill('Synthetic comparison update with verified feature details.');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await expect(dialog.getByLabel('Planned change', { exact: true })).toHaveValue(
    'Synthetic comparison update with verified feature details.',
  );
  await expect(dialog.getByText(/Included: 1/)).toBeVisible();
  await expect(dialog.getByText(/Excluded:/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Create follow-up action', exact: true }).click();
  await dialog.getByRole('link', { name: 'Open follow-up action', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Action brief', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Source action history', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Fixture workspace — synthetic data · no provider calls', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Included baseline records: 1', { exact: true })).toBeVisible();
});

test('a failed follow-up save retains the draft and retries with the same request identity', async ({
  page,
}) => {
  const fixture = new GeoFixtureWorkspace();
  const action = ((await fixture.request('/geo/actions')) as GeoAction[]).find(
    (action) => action.category === 'owned',
  );
  if (!action) throw new Error('Expected an owned fixture');
  const requests: { requestId: string }[] = [];
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    const body: unknown =
      request.method() === 'GET' ? undefined : JSON.parse(request.postData() ?? '{}');
    if (path.endsWith('/follow-ups')) {
      requests.push(body as { requestId: string });
      if (requests.length === 1) {
        await route.fulfill({
          status: 503,
          json: {
            error: { code: 'UNAVAILABLE', message: 'Save unavailable. Your draft is retained.' },
          },
        });
        return;
      }
    }
    await route.fulfill({ json: { data: await fixture.request(path, body, request.method()) } });
  });
  await page.goto(`/app/playbook/${action.id}`);
  await page.getByRole('button', { name: 'Plan follow-up work', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Plan follow-up work', exact: true });
  await dialog.getByRole('checkbox').first().check();
  await dialog
    .getByLabel('Owned page for new work', { exact: true })
    .fill('https://cedarflow.example/comparison');
  await dialog
    .getByLabel('Planned change', { exact: true })
    .fill('Keep this planned change when the save fails.');
  const submit = dialog.getByRole('button', { name: 'Create follow-up action', exact: true });
  await submit.click();
  await expect(dialog.getByRole('alert')).toHaveText('Save unavailable. Your draft is retained.');
  await expect(dialog.getByLabel('Planned change', { exact: true })).toHaveValue(
    'Keep this planned change when the save fails.',
  );
  await expect(dialog.getByRole('checkbox').first()).toBeChecked();
  await submit.click();
  await expect(
    dialog.getByRole('link', { name: 'Open follow-up action', exact: true }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]?.requestId).toBe(requests[1]?.requestId);
});

test('opening a filtered observation and returning keeps the evidence scope', async ({ page }) => {
  await page.goto('/app/observations?fixture=1&engine=perplexity&days=30');
  await page.getByRole('link').filter({ hasText: 'View full answer & raw JSON →' }).first().click();
  await expect(
    page.getByRole('heading', { name: 'Original observation', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Observation sections' })).toBeVisible();
  await page.getByRole('link', { name: 'All observations', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Engine', exact: true })).toHaveText(
    'Perplexity',
  );
  await expect(page.getByRole('combobox', { name: 'Period', exact: true })).toHaveText(
    'Last 30 days',
  );
  await expect(page).toHaveURL(/engine=perplexity/);
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Original observation', exact: true }),
  ).toBeVisible();
});

test('an observation links directly to the work supported by its evidence', async ({ page }) => {
  await page.goto('/app/observations?fixture=1');
  await page.getByRole('link').filter({ hasText: 'View full answer & raw JSON →' }).first().click();
  const work = page.getByRole('region', { name: 'Related work' });
  await expect(work.getByRole('heading', { name: 'Related work', exact: true })).toBeVisible();
  await work.locator('a[href^="/app/playbook/"]').first().click();
  await expect(page.getByRole('heading', { name: 'Action brief', exact: true })).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole('heading', { name: 'Original observation', exact: true }),
  ).toBeVisible();
});

test('refresh related work reads new tasks and excludes unrelated observation scopes', async ({
  page,
}) => {
  const fixture = new GeoFixtureWorkspace();
  const saved = (await fixture.request('/geo/observations?days=7')) as GeoObservationPage;
  const observationId = saved.observations[0]?.id;
  if (!observationId) throw new Error('The fixture needs a saved observation');
  let ready = false;
  const writes: string[] = [];
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    if (request.method() !== 'GET') writes.push(path);
    let data = await fixture.request(path);
    if (path === '/geo/actions') {
      const actions = data as GeoAction[];
      const first = actions[0];
      if (!first) throw new Error('The fixture needs an action');
      data = ready
        ? [
            ...actions,
            {
              ...first,
              id: 'unrelated-action',
              title: 'Unrelated task',
              scopes: first.scopes.map((scope) => ({
                ...scope,
                observationId: 'different-observation',
              })),
            },
          ]
        : [];
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto(`/app/observations/${observationId}`);
  const work = page.getByRole('region', { name: 'Related work' });
  await expect(work.getByText(/No .*task.*linked|No linked task/)).toBeVisible();
  ready = true;
  await work.getByRole('button', { name: 'Refresh related work', exact: true }).click();
  await expect(work.locator('a[href^="/app/playbook/"]')).toHaveCount(2);
  await expect(work.getByText('Unrelated task', { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('the subscription shortcut reveals its controls after client navigation', async ({ page }) => {
  await page.goto('/app/billing?fixture=1');
  await page.getByRole('link', { name: 'Manage subscription', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Monitoring and billing', exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole('button', { name: 'Refresh payment status', exact: true }),
  ).toBeInViewport();
});

for (const quality of ['partial', 'no_feature'] as const) {
  test(`${quality} evidence stays distinct from absence and missing diagnosis`, async ({
    page,
  }) => {
    const fixture = new GeoFixtureWorkspace();
    const saved = (await fixture.request('/geo/observations?days=7')) as GeoObservationPage;
    const observationId = saved.observations[0]?.id;
    if (!observationId) throw new Error('The fixture needs a saved observation');
    const posts: string[] = [];
    await page.route('**/api/v2/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname.replace('/api/v2', '') + url.search;
      if (request.method() !== 'GET') posts.push(path);
      let data = await fixture.request(path);
      if (/\/geo\/observations\/[^/]+$/.test(url.pathname)) {
        const observation = data as GeoObservation;
        observation.capture.quality = quality;
        if (quality === 'no_feature') {
          observation.capture.answerText = '';
          observation.capture.sources = [];
        }
      }
      if (url.pathname.endsWith('/analyses')) data = [];
      await route.fulfill({ json: { data } });
    });
    await page.goto(`/app/observations/${observationId}`);
    const proof = page.getByRole('region', { name: 'Original observation evidence' });
    await expect(
      proof.getByText(quality === 'partial' ? 'Partial' : 'No AI feature', { exact: true }),
    ).toBeVisible();
    await expect(proof).toContainText(
      quality === 'partial'
        ? 'incomplete evidence is not counted as brand absence'
        : 'This is not evidence of brand absence',
    );
    await expect(
      page.getByText('Classification pending or unavailable.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Download original response JSON' }),
    ).toBeEnabled();
    await page.goto('/app/competitors');
    await expect(
      page.getByText('Visibility is unknown until eligible evidence is available.', {
        exact: false,
      }),
    ).toBeVisible();
    expect(posts).toEqual([]);
  });
}
