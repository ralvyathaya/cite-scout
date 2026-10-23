import { expect, test, type Page } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import { legacyPlan, publicPlans } from '../../src/shared/plans';
import type { V2ProjectPayload } from '../../src/shared/v2';

async function billingWorkspace(page: Page, status: Record<string, unknown>) {
  const fixture = new GeoFixtureWorkspace();
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/billing/status') {
      await route.fulfill({
        json: {
          data: {
            subscription: null,
            plan: null,
            plansEnabled: false,
            checkoutOptions: [],
            allowance: null,
            checkoutAvailable: false,
            portalAvailable: false,
            availabilityMessage: null,
            ...status,
          },
        },
      });
      return;
    }
    if (url.pathname.startsWith('/api/v2/')) {
      const data = await fixture.request(`${url.pathname.slice('/api/v2'.length)}${url.search}`);
      await route.fulfill({ json: { data } });
      return;
    }
    await route.fulfill({
      status: 503,
      json: { error: { message: 'Test checkout unavailable.' } },
    });
  });
}

for (const interval of ['month', 'year'] as const) {
  for (const plan of publicPlans) {
    test(`billing sends explicit ${plan.id} ${interval} selection only after checkout click`, async ({
      page,
    }) => {
      await billingWorkspace(page, {
        plansEnabled: true,
        checkoutOptions: publicPlans.flatMap((item) =>
          (['month', 'year'] as const).map((cadence) => ({
            planId: item.id,
            interval: cadence,
            available: true,
          })),
        ),
      });
      const mutations: string[] = [];
      page.on('request', (request) => {
        if (request.method() !== 'GET' && request.url().includes('/api/'))
          mutations.push(request.url());
      });
      await page.goto(`/app/billing?planId=${plan.id}&interval=${interval}`);
      await expect(page.getByRole('article', { name: `${plan.name} plan` })).toBeVisible();
      expect(mutations).toEqual([]);
      const request = page.waitForRequest('**/api/billing/checkout');
      await page.getByRole('button', { name: `Choose ${plan.name}`, exact: true }).click();
      expect((await request).postDataJSON()).toEqual({ planId: plan.id, interval });
      await expect(page.getByRole('alert')).toContainText('Test checkout unavailable.');
      expect(mutations).toHaveLength(1);
    });
  }
}

test('billing shows a verified legacy subscription without advertising it to new buyers', async ({
  page,
}) => {
  await billingWorkspace(page, {
    subscription: { status: 'active', testMode: true, endsAt: null },
    plan: { ...legacyPlan, interval: 'month' },
  });
  await page.goto('/app/billing');
  await expect(
    page.getByText('Perplexity monitoring · $19 / month · 10 active prompts', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('article', { name: 'Starter plan' })).toHaveCount(0);
  await expect(page.getByText('Test-mode billing', { exact: true })).toBeVisible();
});

test('unknown plan is unavailable rather than invented and closed sales cannot checkout', async ({
  page,
}) => {
  await billingWorkspace(page, {
    subscription: { status: 'active', testMode: false, endsAt: null },
  });
  await page.goto('/app/billing');
  await expect(
    page.getByText('Plan details unavailable. Your subscription has not been changed.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/\$19|\$29/)).toHaveCount(0);
  await billingWorkspace(page, {});
  await page.goto('/app/billing');
  for (const plan of publicPlans)
    await expect(
      page.getByRole('button', { name: `Choose ${plan.name}`, exact: true }),
    ).toBeDisabled();
});

test('pricing remains readable at 320px and shows total annual charge', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/pricing');
  await page.getByRole('button', { name: 'Annual', exact: true }).click();
  await expect(
    page.getByText('Billed $1,490 annually · equivalent to $124.17/month', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pricing-320-annual.png'), fullPage: true });
});

test('a downgrade keeps prompts readable and asks which remain active', async ({ page }) => {
  await billingWorkspace(page, {});
  const fixture = new GeoFixtureWorkspace();
  const payload = (await fixture.request('/project')) as V2ProjectPayload;
  const sample = payload.project?.questions[0];
  if (!payload.project || !sample) throw new Error('Missing fixture project');
  payload.project.questions = Array.from({ length: 6 }, (_, index) => ({
    ...sample,
    id: `prompt-${String(index)}`,
    text: `Which tool fits buyer scenario ${String(index)}?`,
  }));
  payload.plan = { ...publicPlans[0], interval: 'month' };
  payload.promptLimit = 5;
  await page.route('**/api/v2/project', (route) => route.fulfill({ json: { data: payload } }));
  await page.goto('/app/questions');
  await expect(page.getByRole('alert')).toContainText(
    'Pause prompts to choose which remain active',
  );
  await expect(
    page.getByRole('rowheader', { name: 'Which tool fits buyer scenario 5?', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add prompt', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Monitor Prompts', exact: true })).toBeDisabled();
  await page
    .getByRole('button', { name: 'Manage prompt: Which tool fits buyer scenario 5?' })
    .click();
  await expect(page.getByRole('menuitem', { name: 'Pause', exact: true })).toBeEnabled();
});

test('legacy subscribers keep Perplexity monitoring with saved multi-engine settings', async ({
  page,
}) => {
  await billingWorkspace(page, {});
  const fixture = new GeoFixtureWorkspace();
  const payload = (await fixture.request('/project')) as V2ProjectPayload;
  payload.plan = { ...legacyPlan, interval: 'month' };
  payload.canScan = true;
  payload.scansEnabled = true;
  payload.usage = { ...payload.usage, today: 0, month: 0, dailyLimit: 10, monthlyLimit: 350 };
  await page.route('**/api/v2/project', (route) => route.fulfill({ json: { data: payload } }));
  await page.route('**/api/v2/scans', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Synthetic legacy check stopped.' } } }),
  );
  await page.goto('/app/questions');
  await expect(
    page.getByText('Perplexity · daily checks within your allowance.', { exact: true }),
  ).toBeVisible();
  const request = page.waitForRequest('**/api/v2/scans');
  await page.getByRole('button', { name: 'Monitor Prompts', exact: true }).click();
  expect((await request).postDataJSON()).toEqual({ mode: 'today' });
  await expect(page.getByRole('alert').first()).toContainText('Synthetic legacy check stopped.');
});
