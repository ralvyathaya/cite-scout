import { expect, test, type Page } from '@playwright/test';
import type { V2ProjectPayload, V2QuestionsPayload, V2Observation } from '../../src/shared/v2';
import type { RequestContext } from '../../src/shared/evidence';
import { analyzeEvidence, compareEvidence } from '../../src/domain/evidence';
import { legacyGeoFixture } from './geo-legacy-fixtures';

const date = '2026-10-08T12:00:00Z';
const question = {
  id: 'question',
  text: 'Which onboarding tools work for small B2B SaaS teams?',
  enabled: true,
  archivedAt: null,
  updatedAt: date,
  replacesQuestionId: null,
};
const context: RequestContext = {
  schemaVersion: 1,
  questionId: question.id,
  text: question.text,
  contextVersion: 1,
  brand: { id: 'project', name: 'CedarFlow', domain: 'cedarflow.example' },
  competitors: [{ id: 'rival', name: 'Rival', domain: null }],
  provider: 'perplexity',
  preset: 'fast',
  instruction: 'Neutral research',
  instructionVersion: 'neutral-research-1',
  maxOutputTokens: 700,
  matcherVersion: 'mentions-v1',
  extractorVersion: 'answer-parts-1',
  citationParserVersion: 'fast-numeric-1',
};
function observation(id: string, text = 'CedarFlow is an option. [1]'): V2Observation {
  return {
    id,
    questionId: question.id,
    questionText: question.text,
    capturedAt: date,
    evidenceVersion: 'v2',
    context,
    legacyText: null,
    legacySources: [],
    capture: analyzeEvidence(
      {
        id,
        status: 'completed',
        model: 'example-model',
        output: [
          { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
          {
            type: 'search_results',
            results: [{ id: 1, url: 'https://cedarflow.example/docs', title: 'Saved source' }],
          },
        ],
      },
      context,
    ),
  };
}
const project: V2ProjectPayload = {
  project: {
    id: 'project',
    brandName: 'CedarFlow',
    canonicalDomain: 'cedarflow.example',
    contextVersion: 1,
    competitors: [{ id: 'rival', name: 'Rival', canonicalDomain: null }],
    questions: [question],
  },
  enrolled: true,
  canScan: true,
  trial: null,
  usage: {
    today: 1,
    month: 10,
    dailyLimit: 10,
    monthlyLimit: 350,
    resetAt: date,
    monthlyResetAt: '2026-11-01T00:00:00Z',
  },
  scansEnabled: true,
  supportEmail: 'support@cite-scout.com',
};
const rows: V2QuestionsPayload = {
  questions: [
    {
      ...question,
      latest: { id: 'answer', capturedAt: date, brandMatched: true, competitors: [] },
      latestAttempt: { status: 'succeeded', failureCode: null, at: date },
      previousId: 'before',
      baselineId: 'before',
      delta: null,
      stale: false,
      contextChanged: false,
      needsAttention: false,
    },
  ],
  summary: {
    tracked: 1,
    available: 1,
    brandMatched: 1,
    comparable: 1,
    changed: 1,
    sourcesUnavailable: 0,
    from: date,
    to: date,
  },
};
const billing = {
  subscription: null,
  checkoutAvailable: true,
  portalAvailable: false,
  availabilityMessage: null,
};
async function workspace(page: Page, data = project) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = { data: {} };
    if (url.pathname.startsWith('/api/v2/geo/'))
      body = { data: legacyGeoFixture(url.pathname, 'project') };
    else if (url.pathname === '/api/v2/project') body = { data };
    else if (url.pathname === '/api/v2/questions') body = { data: rows };
    else if (url.pathname === '/api/billing/status') body = { data: billing };
    else if (url.pathname === '/api/v2/questions/question/history')
      body = {
        data: {
          question,
          entries: [
            {
              id: url.searchParams.has('cursor') ? 'older-answer' : 'answer',
              kind: 'observation',
              at: date,
              status: 'succeeded',
              evidenceVersion: 'v2',
              failureCode: null,
            },
          ],
          nextCursor: url.searchParams.has('cursor') ? null : 'cursor',
        },
      };
    else if (url.pathname.startsWith('/api/v2/observations/')) {
      const after = observation(url.pathname.split('/').at(-1) ?? 'answer');
      const before = observation('before', 'Rival is an option. [1]');
      if (!after.capture || !before.capture) throw new Error('Missing fixture capture');
      body = {
        data: {
          observation: after,
          comparison: before,
          previousId: 'before',
          baselineId: 'before',
          comparisonReason: null,
          delta: compareEvidence(
            { id: before.id, context, capture: before.capture, evidenceVersion: 'v2' },
            { id: after.id, context, capture: after.capture, evidenceVersion: 'v2' },
          ),
        },
      };
    }
    await route.fulfill({ json: body });
  });
}
test('opens exact evidence through the list and an old deep link', async ({ page }) => {
  await workspace(page);
  await page.goto('/app/overview');
  await expect(page.getByText('Brand match found', { exact: true })).toBeVisible();
  await expect(page.getByText('Displaced by Competitor', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Compare checks' }).click();
  await expect(page).toHaveURL(/questions\/question\?observation=answer/);
  await expect(
    page.getByRole('heading', { name: 'Returned sources', exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Saved source' }).first()).toBeVisible();
  await page.goto('/app/responses?observation=older-answer');
  await expect(page).toHaveURL(/questions\/question\?observation=older-answer/);
  await expect(page.getByRole('heading', { name: 'Brand match appeared' })).toBeVisible();
});
test('a failed older history request leaves the selected answer readable', async ({ page }) => {
  await workspace(page);
  await page.goto('/app/questions/question?observation=answer');
  await page.getByText('All check outcomes', { exact: true }).click();
  await page.route('**/api/v2/questions/question/history?*', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'History unavailable' } } }),
  );
  await page.getByRole('button', { name: 'Older checks' }).click();
  await expect(page.getByRole('alert')).toHaveText('History unavailable');
  await expect(page.getByRole('link', { name: 'Saved source' }).first()).toBeVisible();
});
test('clipboard rejection produces immediate retryable feedback', async ({ page }) => {
  await workspace(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('Clipboard permission denied')) },
    }),
  );
  await page.goto('/app/questions/question?observation=answer');
  await page.getByRole('button', { name: 'Copy evidence link' }).click();
  await expect(page.getByRole('alert')).toHaveText('Clipboard permission denied');
  await expect(page.getByRole('button', { name: 'Copy evidence link' })).toBeEnabled();
});
test('missing clipboard support offers an accessible error', async ({ page }) => {
  await workspace(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', { value: undefined }),
  );
  await page.goto('/app/questions/question?observation=answer');
  await page.getByRole('button', { name: 'Copy evidence link' }).click();
  await expect(page.getByRole('alert')).toHaveText('Clipboard is unavailable in this browser.');
});
test('pause remains unchanged after a delayed failure', async ({ page }) => {
  await workspace(page);
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v2/questions/question', async (route) => {
    await pending;
    await route.fulfill({
      status: 503,
      json: { error: { message: 'Could not update question.' } },
    });
  });
  await page.goto('/app/questions');
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  await pause.click();
  await expect(pause).toBeDisabled();
  release?.();
  await expect(pause).toBeEnabled();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('Could not update question.');
});
for (const status of ['completed', 'partial', 'failed', 'deferred'])
  test(`reports the durable ${status} scan outcome`, async ({ page }) => {
    await workspace(page);
    await page.route('**/api/v2/scans', (route) =>
      route.fulfill({ status: 202, json: { data: { runId: 'run', status: 'pending' } } }),
    );
    await page.route('**/api/v2/scans/run', (route) =>
      route.fulfill({
        json: {
          data: {
            status,
            terminal: status !== 'deferred',
            counts: {
              successful: status === 'completed' || status === 'partial' ? 1 : 0,
              selected: 3,
              failed: status === 'failed' ? 3 : 0,
              pending: status === 'deferred' ? 3 : 0,
              running: 0,
            },
            items: [],
            nextRetryAt: status === 'deferred' ? date : null,
          },
        },
      }),
    );
    await page.goto('/app/questions');
    await page.getByRole('button', { name: 'Check today' }).click();
    await expect(
      page.getByRole('heading', { name: new RegExp(`answers captured · ${status}`) }),
    ).toBeVisible();
    if (status === 'deferred') await expect(page.getByText(/Next eligible attempt:/)).toBeVisible();
    if (status === 'failed')
      await expect(page.getByRole('link', { name: 'Contact the founder for help' })).toBeVisible();
  });
test('archive retains question context after failure', async ({ page }) => {
  await workspace(page);
  await page.route('**/api/v2/questions/question', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Archive unavailable. Try again.' } } }),
  );
  await page.goto('/app/questions');
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Archive unavailable. Try again.');
  await expect(page.getByRole('heading', { name: question.text })).toBeVisible();
});
test('consumed trial never offers another free baseline', async ({ page }) => {
  await workspace(page, {
    ...project,
    canScan: false,
    trial: { state: 'completed', startedAt: date, expiresAt: date, followupDueAt: date },
  });
  await page.goto('/app/questions');
  await expect(page.getByRole('button', { name: 'Run my baseline' })).toHaveCount(0);
  await expect(page.getByText(/Pilot · completed/)).toBeVisible();
});
test('unpaid checkout return does not unlock monitoring', async ({ page }) => {
  await workspace(page, { ...project, canScan: false });
  await page.route('**/api/billing/status', (route) =>
    route.fulfill({
      json: {
        data: { ...billing, subscription: { status: 'unpaid', testMode: true, endsAt: null } },
      },
    }),
  );
  await page.goto('/app/settings?checkout=complete');
  await expect(page.getByText(/Subscription: unpaid/)).toBeVisible();
  if ((page.viewportSize()?.width ?? 1440) < 1024)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Prompt Sets', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check today' })).toHaveCount(0);
});
test('account deletion preserves confirmation after a verification failure', async ({ page }) => {
  await workspace(page);
  await page.route('**/api/account', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { message: 'Subscription could not be verified.' } },
    }),
  );
  await page.goto('/app/settings');
  await page.getByText('Delete account permanently', { exact: true }).click();
  await page.getByLabel('Type DELETE', { exact: true }).fill('DELETE');
  await page
    .getByRole('checkbox', {
      name: 'I forfeit any remaining access and understand my evidence will be deleted.',
    })
    .check();
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Subscription could not be verified.');
  await expect(page.getByLabel('Type DELETE', { exact: true })).toHaveValue('DELETE');
});
for (const width of [320, 390, 1440])
  test(`workspace keyboard and layout at ${String(width)}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    await workspace(page);
    await page.goto('/app/questions');
    await expect(page.getByRole('heading', { name: 'Buyer questions', exact: true })).toBeVisible();
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open navigation' }).focus();
      await page.keyboard.press('Enter');
    }
    const settings = page
      .getByRole('navigation', { name: 'Application' })
      .getByRole('link', { name: 'Settings' });
    await settings.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/app\/settings$/);
    for (const path of [
      '/app/questions',
      '/app/responses?observation=older-answer',
      '/app/billing',
      '/app/settings',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        path,
      ).toBe(true);
    }
    await page.screenshot({
      path: testInfo.outputPath(`workspace-${String(width)}.png`),
      fullPage: true,
    });
  });
