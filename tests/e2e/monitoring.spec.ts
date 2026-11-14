import { expect, test, type Page } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoObservationPage } from '../../src/shared/geo';
import type { GeoDailySample } from '../../src/shared/geo-measurement';

async function workspace(page: Page) {
  const fixture = new GeoFixtureWorkspace();
  const requests: string[] = [];
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v2', '') + url.search;
    requests.push(`${request.method()} ${path}`);
    await route.fulfill({ json: { data: await fixture.request(path) } });
  });
  return { fixture, requests };
}

test('monitoring tabs preserve answer scope, browser history and old links without loading hidden pages', async ({
  page,
}) => {
  const { fixture, requests } = await workspace(page);
  const saved = (await fixture.request('/geo/observations?days=30')) as GeoObservationPage;
  const capture = saved.observations[0];
  if (!capture) throw new Error('Expected fixture capture');
  const query = `days=14&engine=${capture.engine}&promptId=${capture.context.promptId}`;
  await page.goto(`/app/observations?${query}&cursor=20`);
  const tabs = page.getByRole('navigation', { name: 'Monitoring views' });
  await expect(tabs.getByRole('link', { name: 'Answers', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { name: 'Answers', exact: true })).toBeVisible();
  expect(requests.some((path) => path.includes('/geo/trends'))).toBe(false);
  expect(requests.some((path) => path.includes('/geo/prompt-sets'))).toBe(false);
  await tabs.getByRole('link', { name: 'Trends', exact: true }).click();
  await expect(page).toHaveURL(`/app/trends?${query}`);
  await expect(tabs.getByRole('link', { name: 'Trends', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    page
      .getByRole('group', { name: 'Period', exact: true })
      .getByRole('button', { name: '14 days', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page).toHaveURL(`/app/observations?${query}&cursor=20`);
  await tabs.getByRole('link', { name: 'Prompts', exact: true }).click();
  await expect(page).toHaveURL('/app/questions');
  await page.goto('/app/responses');
  await expect(page).toHaveURL('/app/questions');
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = page.getByRole('dialog', { name: 'Workspace navigation' });
    await expect(drawer.getByRole('link', { name: 'Monitoring', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await drawer.getByRole('link', { name: 'Monitoring', exact: true }).click();
    await expect(drawer).toBeHidden();
  } else {
    const app = page.getByRole('navigation', { name: 'Application', exact: true });
    await expect(app.getByRole('link', { name: 'Monitoring', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(app.getByRole('link', { name: /^(Prompts|Answers|Observations)$/ })).toHaveCount(
      0,
    );
  }
  expect(requests.filter((path) => !path.startsWith('GET '))).toEqual([]);
});

test('empty groups hide optional controls, keep a dense table and load native local logos', async ({
  page,
}, testInfo) => {
  await workspace(page);
  await page.route('**/api/v2/geo/prompt-sets', (route) => route.fulfill({ json: { data: [] } }));
  for (const width of [1280, 1440, 320, 390]) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto('/app/questions');
    const table = page.getByRole('table');
    await expect(page.getByLabel('Prompt summary and capture legend')).toContainText('0 groups');
    await expect(table.getByRole('columnheader', { name: 'Groups', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Prompt group', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create group', exact: true })).toBeVisible();
    await expect(page.getByLabel('Search prompts')).toBeVisible();
    await expect(page.getByLabel('Prompt status')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose monitoring scope' })).toBeVisible();
    await expect(table.locator('img').first()).toBeVisible();
    await expect
      .poll(() =>
        table
          .locator('img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                image instanceof HTMLImageElement &&
                image.complete &&
                image.naturalWidth > 0 &&
                image.getAttribute('src')?.startsWith('/engines/'),
            ),
          ),
      )
      .toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width >= 1280) {
      expect((await table.boundingBox())?.y).toBeLessThan(400);
      const firstRow = table.getByRole('row').nth(1);
      expect((await firstRow.boundingBox())?.height).toBeLessThanOrEqual(72);
    }
    await page.evaluate(() => {
      scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.screenshot({
      path: testInfo.outputPath(`monitoring-${String(width)}.png`),
      fullPage: true,
    });
  }
});

test('answers keep page counts, capture quality, safe previews and cursor scopes', async ({
  page,
}, testInfo) => {
  const { fixture, requests } = await workspace(page);
  const saved = (await fixture.request('/geo/observations?days=30')) as GeoObservationPage;
  const [first, second, third] = saved.observations;
  if (!first || !second || !third) throw new Error('Expected three fixture captures');
  const captures = [first, second, third];
  first.capture.answerText =
    '**Readable preview** with [documentation](https://docs.example.com) and [unsafe](javascript:alert(1)).';
  second.capture.quality = 'partial';
  third.capture.quality = 'no_feature';
  third.capture.answerText = '';
  await page.route('**/api/v2/geo/observations?**', async (route) => {
    const older = new URL(route.request().url()).searchParams.has('cursor');
    await route.fulfill({
      json: {
        data: {
          observations: older ? [captures[2]] : captures.slice(0, 2),
          nextCursor: older ? null : 'older',
        },
      },
    });
  });
  await page.goto('/app/observations?days=30');
  const table = page.getByRole('table', { name: 'Saved answers in the selected scope' });
  await expect(table.locator('strong')).toHaveText('Readable preview');
  await expect(table.locator('.answer-preview a')).toHaveCount(0);
  await expect(table.getByText('Partial', { exact: true })).toBeVisible();
  await expect(page.getByText('2 answers on this page')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('answers-table.png'), fullPage: true });
  await page.getByRole('button', { name: 'Older answers', exact: true }).click();
  await expect(page).toHaveURL('/app/observations?days=30&cursor=older');
  await expect(table.getByText('No AI answer was returned.', { exact: true })).toBeVisible();
  await expect(page.getByText('1 answer on this page')).toBeVisible();
  await table.getByRole('link', { name: 'View answer' }).click();
  await expect(page).toHaveURL(`/app/observations/${third.id}?days=30&cursor=older`);
  expect(requests.filter((path) => !path.startsWith('GET '))).toEqual([]);
});

for (const count of [0, 1, 3]) {
  test(`trends show ${String(count)} daily samples without joining missing days or different contexts`, async ({
    page,
  }, testInfo) => {
    const { fixture, requests } = await workspace(page);
    const saved = (await fixture.request('/geo/observations?days=30')) as GeoObservationPage;
    const capture = saved.observations[0];
    if (!capture) throw new Error('Expected fixture capture');
    const sample: GeoDailySample = {
      series: 'trend',
      cohort: 'same-context',
      metric: 'mention',
      day: '2026-10-18',
      value: 1,
      observationId: capture.id,
      analysisId: null,
      capturedAt: '2026-10-18T09:00:00Z',
    };
    const samples = count === 0 ? [] : [sample];
    if (count === 3)
      samples.push({ ...sample, day: '2026-10-16', value: 0 }, { ...sample, day: '2026-10-15' });
    samples.push({ ...sample, cohort: 'different-model', day: '2026-10-17', value: 0 });
    if (count === 0) samples.length = 0;
    await page.route('**/api/v2/geo/trends?**', (route) =>
      route.fulfill({
        json: {
          data: {
            version: 'geo-measurement-1',
            asOf: '2026-10-19T10:00:00Z',
            method: 'First eligible sample per cohort and UTC day.',
            captures: count,
            classifiedCaptures: count,
            samples,
          },
        },
      }),
    );
    await page.route('**/api/v2/geo/actions', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/app/trends');
    await expect(
      page
        .getByRole('group', { name: 'Period', exact: true })
        .getByRole('button', { name: '7 days', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    if (count === 0) {
      await expect(
        page.getByText('No eligible daily samples for this metric.', { exact: false }),
      ).toBeVisible();
      await expect(page.locator('.recharts-line-dot')).toHaveCount(0);
    } else {
      await expect(
        page.getByRole('img', {
          name: `Brand mentioned for selected comparable series. ${String(count === 1 ? 1 : 2)} of ${String(count)} eligible daily samples.`,
        }),
      ).toBeVisible();
      await expect(page.locator('.recharts-line-dot')).toHaveCount(count);
      await expect(page.getByText('One daily result is available.', { exact: false })).toHaveCount(
        count === 1 ? 1 : 0,
      );
      if (count === 3) {
        const path = await page.locator('.recharts-line-curve').getAttribute('d');
        expect(path?.match(/L/g)?.length).toBe(1);
        expect(path?.match(/M/g)?.length).toBe(2);
      }
      await page.getByRole('button', { name: /Metric & series/ }).click();
      await page.getByRole('radio', { name: /^Series 2/ }).check();
      await page.keyboard.press('Escape');
      await expect(page.locator('.recharts-line-dot')).toHaveCount(1);
      await expect(page.getByRole('img', { name: /0 of 1 eligible daily samples/ })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Measurement details', exact: true }).click();
    await expect(page.getByText('Different prompt versions,', { exact: false })).toBeVisible();
    expect(requests.filter((path) => !path.startsWith('GET '))).toEqual([]);
    await page.evaluate(() => {
      scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.screenshot({
      path: testInfo.outputPath(`trends-${String(count)}.png`),
      fullPage: true,
    });
  });
}
