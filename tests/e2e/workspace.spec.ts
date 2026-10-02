import { expect, test, type Page } from '@playwright/test';
import type { DashboardPayload } from '../../src/shared/dashboard';

const date = '2026-09-28';
const labels = [
  'Best scheduling tool for independent consultants',
  'Simple client booking software',
  'Alternatives to Calendly for growing teams with complex intake and scheduling requirements',
  'Tools for collecting client details',
];
const statuses = ['recommended', 'mentioned', 'displaced', 'absent'] as const;
const dashboard: DashboardPayload = {
  projectId: 'project',
  brandName: 'OrbitCal',
  canonicalDomain: 'orbitcal.test',
  observationDate: '2026-09-29',
  latestObservationDate: date,
  windowDays: 14,
  current: {
    visibilityScore: 62.5,
    mentionRate: 0.75,
    shareOfVoice: 0.6,
    averageMentionPosition: 1.3,
    coverage: 0.8,
    successful: 4,
    attempted: 5,
  },
  delta: { visibilityScore: -7.5, mentionRate: -0.1, shareOfVoice: -0.05 },
  shareOfVoiceByEntity: [
    { key: 'brand', label: 'OrbitCal', share: 0.6, mentions: 3 },
    { key: 'cal', label: 'Calendly', share: 0.4, mentions: 2 },
  ],
  series: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-09-${String(16 + i)}`,
    visibilityScore: i === 5 || i === 13 ? null : 50 + i,
    mentionRate: 0.75,
    shareOfVoice: 0.6,
    averageMentionPosition: 1.3,
    coverage: 0.8,
    successful: i === 5 || i === 13 ? 0 : 4,
    attempted: 5,
  })),
  prompts: statuses.map((status, i) => ({
    promptId: `prompt-${String(i)}`,
    text: labels[i] ?? '',
    enabled: true,
    classified: status === 'displaced' ? 'mentioned' : status,
    brandPosition: status === 'absent' ? null : status === 'displaced' ? 2 : 1,
    observationId: `answer-${String(i)}`,
    observationDate: date,
    attemptStatus: 'succeeded',
    insight: {
      status,
      context: status === 'displaced' ? 'mentioned' : status,
      displacedCompetitors: status === 'displaced' ? [{ id: 'cal', name: 'Calendly' }] : [],
      explanation:
        status === 'displaced' ? 'Calendly appeared before your brand in this answer.' : null,
    },
  })),
  citationOpportunities: [
    {
      domain: 'reddit.com',
      count: 1,
      sourceUrl: 'https://reddit.com/r/tools',
      action: 'Read the discussion and contribute useful, transparent expertise.',
      observations: [{ id: 'answer-2', prompt: labels[2] ?? '', date }],
    },
  ],
  scanRuns: [],
  lastSuccessfulAt: `${date}T12:00:00Z`,
  provider: { name: 'perplexity', model: 'observed-model', preset: 'fast' },
  entitlement: { canScan: true, hasPaidFeatures: true, warning: null },
  totalObservations: 28,
  scanAvailability: {
    trialAvailable: false,
    manualAvailable: true,
    eligiblePromptIds: ['prompt-0'],
    reason: null,
  },
};
function answer(id: string, index = 2) {
  const prompt = dashboard.prompts[index] ?? dashboard.prompts[0];
  return {
    id,
    promptId: prompt?.promptId,
    promptText: prompt?.text,
    observationDate: date,
    brandPosition: prompt?.brandPosition,
    contextClassification: 'mentioned',
    insight: prompt?.insight,
    provider: 'perplexity',
    providerModel: 'observed-model',
    providerPreset: 'fast',
    providerRequestId: 'request-test',
    inputTokens: 120,
    outputTokens: 90,
    rawResponseText: 'Calendly is a strong choice. OrbitCal exists.',
    citationDataJson: JSON.stringify([
      { id: 1, url: 'https://reddit.com/r/tools', title: 'Scheduling discussion' },
    ]),
    matchedTermsJson: '["Calendly","OrbitCal"]',
    errorCode: null,
  };
}
const billing = {
  subscription: null,
  entitlement: { canScan: false, hasPaidFeatures: false, warning: null },
  checkoutAvailable: true,
  portalAvailable: false,
  availabilityMessage: null,
};
async function workspace(page: Page, data = dashboard) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = { error: { message: 'Unexpected test request' } };
    if (url.pathname === '/api/dashboard/overview') body = { data, onboardingRequired: false };
    else if (url.pathname === '/api/prompts')
      body = {
        data: data.prompts.map((prompt) => ({
          id: prompt.promptId,
          text: prompt.text,
          enabled: prompt.enabled,
        })),
      };
    else if (url.pathname === '/api/billing/status') body = { data: billing };
    else if (url.pathname.startsWith('/api/dashboard/responses/'))
      body = { data: answer(decodeURIComponent(url.pathname.split('/').at(-1) ?? '')) };
    else if (url.pathname === '/api/dashboard/responses')
      body = {
        data: {
          items: [answer(url.searchParams.has('before') ? 'older-answer' : 'first-answer')],
          hasMore: !url.searchParams.has('before'),
          nextCursor: '123:cursor',
        },
      };
    await route.fulfill({ json: body });
  });
}

test('shows four states and opens the exact evidence, including an answer outside the first page', async ({
  page,
}) => {
  await workspace(page);
  await page.goto('/app/overview');
  for (const label of ['Recommended', 'Mentioned', 'Displaced by Competitor', 'Absent'])
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(
    page.getByText('Calendly appeared before your brand in this answer.').first(),
  ).toBeVisible();
  await expect(page.getByText('Strong AI Recommendation Leadership')).toHaveCount(0);
  await page.getByRole('link', { name: 'View evidence', exact: true }).first().click();
  await expect(page).toHaveURL(/observation=answer-2/);
  await expect(page.locator('#answer-answer-2')).toBeFocused();
  await expect(page.getByText('Scheduling discussion')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Returned sources', exact: true })).toBeVisible();
});

test('pagination retains the first page and a failed older-page request retains existing evidence', async ({
  page,
}) => {
  await workspace(page);
  await page.goto('/app/responses');
  await expect(page.locator('#answer-first-answer')).toBeVisible();
  await page.route('**/api/dashboard/responses?*', async (route) => {
    await route.fulfill({ status: 503, json: { error: { message: 'Archive unavailable' } } });
  });
  await page.getByRole('button', { name: 'Load older responses' }).click();
  await expect(page.locator('#answer-first-answer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load older responses' })).toBeEnabled();
  await page.unroute('**/api/dashboard/responses?*');
  await page.getByRole('button', { name: 'Load older responses' }).click();
  await expect(page.locator('#answer-first-answer')).toBeVisible();
  await expect(page.locator('#answer-older-answer')).toBeVisible();
});

test('clipboard rejection produces immediate, retryable feedback', async ({ page }) => {
  await workspace(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('Clipboard permission denied')) },
    });
  });
  await page.goto('/app/overview');
  await page.getByRole('button', { name: 'Copy report' }).click();
  await expect(page.getByText('Clipboard permission denied')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy report' })).toBeEnabled();
});

test('missing clipboard support offers an accessible error', async ({ page }) => {
  await workspace(page);
  await page.addInitScript(() => {
    const prototype: unknown = Object.getPrototypeOf(navigator);
    if (prototype && typeof prototype === 'object') Reflect.deleteProperty(prototype, 'clipboard');
  });
  await page.goto('/app/overview');
  await page.getByRole('button', { name: 'Copy report' }).click();
  await expect(page.getByText('Clipboard is unavailable in this browser.')).toBeVisible();
});

test('prompt toggles remain unchanged after a delayed failure', async ({ page }) => {
  await workspace(page);
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/prompts/prompt-0', async (route) => {
    await promise;
    await route.fulfill({ status: 503, json: { error: { message: 'Could not update prompt.' } } });
  });
  await page.goto('/app/prompts');
  const toggle = page.getByRole('switch', { name: `Disable ${labels[0] ?? ''}` });
  await toggle.click();
  await expect(toggle).toBeDisabled();
  release?.();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeChecked();
  await expect(page.getByText('Could not update prompt.', { exact: true })).toBeVisible();
});

for (const [status, title] of [
  ['completed', 'Scan complete'],
  ['partial', 'Scan partially complete'],
  ['failed', 'Scan failed'],
  ['already_observed', 'Already observed today'],
]) {
  test(`reports the ${status ?? ''} scan outcome`, async ({ page }) => {
    await workspace(page);
    await page.route('**/api/scans/today', async (route) => {
      await route.fulfill({
        status: 202,
        json: {
          data: {
            status,
            successful: status === 'failed' ? 0 : 1,
            failed: status === 'failed' ? 1 : 0,
            deferred: status === 'partial' ? 1 : 0,
            skipped: 0,
            reason: null,
          },
        },
      });
    });
    await page.goto('/app/overview');
    await page.getByRole('button', { name: "Run today's scan" }).click();
    await expect(page.getByText(title ?? '', { exact: true })).toBeVisible();
  });
}

test('prompt deletion stays open while pending and retains context after failure', async ({
  page,
}) => {
  await workspace(page);
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/api/prompts/prompt-0', async (route) => {
    requests += 1;
    await pending;
    await route.fulfill({
      status: 503,
      json: { error: { message: 'Deletion unavailable. Try again.' } },
    });
  });
  await page.goto('/app/prompts');
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Delete prompt' }).click();
  await expect(dialog.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  release?.();
  await expect(dialog.getByRole('alert')).toHaveText('Deletion unavailable. Try again.');
  await expect(dialog.getByRole('button', { name: 'Delete prompt' })).toBeEnabled();
  expect(requests).toBe(1);
});

test('scan outcomes distinguish a deferred scan from success', async ({ page }) => {
  await workspace(page);
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/scans/today', async (route) => {
    await pending;
    await route.fulfill({
      status: 202,
      json: {
        data: {
          status: 'deferred',
          successful: 0,
          failed: 0,
          attempted: 0,
          deferred: 1,
          skipped: 0,
          reason: 'Daily allowance reached.',
        },
      },
    });
  });
  await page.goto('/app/overview');
  await page.getByRole('button', { name: "Run today's scan" }).click();
  await expect(page.getByRole('button', { name: 'Scanning…', exact: true })).toBeDisabled();
  release?.();
  await expect(page.getByText('No new observations', { exact: true })).toBeVisible();
  await expect(page.getByText('Daily allowance reached.', { exact: true })).toBeVisible();
});

test('failed consumed trials and paid empty accounts never offer another free trial', async ({
  page,
}) => {
  const data = structuredClone(dashboard);
  data.totalObservations = 0;
  data.entitlement.canScan = false;
  data.scanAvailability = {
    trialAvailable: false,
    manualAvailable: false,
    eligiblePromptIds: [],
    reason: 'Your trial has been consumed without results.',
  };
  await workspace(page, data);
  await page.goto('/app/prompts');
  await expect(page.getByRole('button', { name: /trial scan/i })).toHaveCount(0);
  await expect(page.getByText('Your trial has been consumed without results.')).toBeVisible();
});

test('unpaid checkout return stays pending until verified scan entitlement', async ({ page }) => {
  await workspace(page);
  let polls = 0;
  await page.route('**/api/billing/status', async (route) => {
    polls += 1;
    await route.fulfill({
      json: {
        data: {
          ...billing,
          subscription: {
            status: 'unpaid',
            cancelled: false,
            endsAt: null,
            renewsAt: null,
            testMode: true,
            cardBrand: null,
            cardLastFour: null,
          },
          portalAvailable: true,
          checkoutAvailable: false,
          entitlement: { canScan: false, hasPaidFeatures: true, warning: 'payment' },
        },
      },
    });
  });
  await page.goto('/app/billing?checkout=complete');
  await expect.poll(() => polls).toBeGreaterThan(1);
  await expect(page).toHaveURL(/checkout=complete/);
  await expect(page.getByText('Confirming your subscription…', { exact: true })).toBeVisible();
  await page.route('**/api/billing/status', async (route) => {
    await route.fulfill({
      json: {
        data: { ...billing, entitlement: { canScan: true, hasPaidFeatures: true, warning: null } },
      },
    });
  });
  await expect(page).not.toHaveURL(/checkout=complete/);
});

test('unavailable billing disables checkout and failed account deletion retains confirmation', async ({
  page,
}) => {
  await workspace(page);
  await page.route('**/api/billing/status', async (route) => {
    await route.fulfill({
      json: {
        data: {
          ...billing,
          checkoutAvailable: false,
          availabilityMessage: 'Billing is not available yet.',
        },
      },
    });
  });
  await page.goto('/app/billing');
  await expect(page.getByRole('button', { name: 'Open secure checkout' })).toBeDisabled();
  await expect(page.getByText('Billing is not available yet.', { exact: true })).toBeVisible();
  await page.route('**/api/account', async (route) => {
    await route.fulfill({
      status: 503,
      json: { error: { message: 'Cancellation could not be verified.' } },
    });
  });
  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('forfeits any remaining paid access');
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Cancellation could not be verified.');
  await expect(dialog.getByLabel('Type DELETE to confirm')).toHaveValue('DELETE');
});

for (const width of [320, 390, 1440]) {
  test(`workspace visual and keyboard review at ${String(width)}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await workspace(page);
    await page.goto('/app/overview');
    await expect(page.getByRole('heading', { name: 'Citation opportunities' })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`overview-${String(width)}.png`),
      fullPage: true,
    });
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter(
          (element) =>
            element.getBoundingClientRect().right > window.innerWidth + 1 &&
            getComputedStyle(element).position !== 'absolute',
        )
        .map((element) => ({
          tag: element.tagName,
          class: element.className,
          width: element.getBoundingClientRect().width,
        })),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      JSON.stringify(overflow),
    ).toBe(true);
    const shadow = await page
      .locator('[data-slot="card"]')
      .first()
      .evaluate((element) => getComputedStyle(element).boxShadow);
    // Tailwind's shadow-none retains transparent, zero-size ring layers.
    expect(
      shadow === 'none' ||
        shadow.replaceAll('rgba(0, 0, 0, 0) 0px 0px 0px 0px', '').replaceAll(', ', '') === '',
    ).toBe(true);
    await page.evaluate(() => {
      window.scrollTo({ top: 800, behavior: 'instant' });
    });
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
    const header = page.getByRole('banner', { name: 'Workspace header' });
    await expect.poll(async () => (await header.boundingBox())?.y).toBe(0);
    if (width >= 1024) {
      const sidebar = page.getByRole('complementary', { name: 'Workspace sidebar' });
      await expect.poll(async () => (await sidebar.boundingBox())?.y).toBe(0);
      await expect(sidebar.getByRole('link', { name: 'Overview', exact: true })).toBeInViewport();
      await expect(sidebar.getByRole('button', { name: 'Sign out' })).toBeInViewport();
    }
    if (width < 1024) {
      const trigger = page.getByRole('button', { name: 'Open navigation' });
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true,
        );
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    for (const path of [
      '/app/prompts',
      '/app/responses?observation=answer-2',
      '/app/billing',
      '/app/settings',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        path,
      ).toBe(true);
    }
  });
}

test('section shortcuts keep navigation visible and changing pages starts at the top', async ({
  page,
}) => {
  await workspace(page);
  await page.goto('/app/overview');
  await page
    .getByRole('navigation', { name: 'Overview sections' })
    .getByRole('link', { name: 'Sources' })
    .click();
  await expect(page.getByRole('heading', { name: 'Citation opportunities' })).toBeInViewport();
  await expect(page.getByRole('banner', { name: 'Workspace header' })).toBeInViewport();
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  if (await trigger.isVisible()) await trigger.click();
  await page
    .getByRole('navigation', { name: 'Application' })
    .getByRole('link', { name: 'Prompts', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Monitored prompts' })).toBeInViewport();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByLabel('Buyer-style question')).toBeVisible();
});
