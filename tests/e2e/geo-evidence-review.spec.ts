import { expect, test } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoObservation, GeoObservationPage } from '../../src/shared/geo';
import type { GeoAction } from '../../src/shared/geo-actions';

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
