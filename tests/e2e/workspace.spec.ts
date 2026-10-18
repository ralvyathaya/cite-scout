import { expect, test, type Page } from '@playwright/test';
import type { V2ProjectPayload, V2QuestionsPayload, V2Observation } from '../../src/shared/v2';
import type { RequestContext } from '../../src/shared/evidence';
import { analyzeEvidence, compareEvidence } from '../../src/domain/evidence';
import { legacyGeoFixture } from './geo-legacy-fixtures';
import { syntheticOnboardingSuggestion } from '../../src/shared/onboarding-fixture';

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
  internalTestAccess: false,
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
test('staging owner onboarding saves a project without launching a legacy baseline', async ({
  page,
}) => {
  let saved = false;
  const legacyScans: string[] = [];
  await workspace(page, {
    ...project,
    project: null,
    enrolled: false,
    canScan: false,
    internalTestAccess: true,
  });
  await page.route('**/api/v2/geo/runs', (route) =>
    route.fulfill({ json: { data: { runs: [], dailyOutcomes: [] } } }),
  );
  await page.route('**/api/v2/project', async (route) => {
    if (route.request().method() === 'POST') {
      saved = true;
      await route.fulfill({ status: 201, json: { data: { projectId: 'project' } } });
    } else
      await route.fulfill({
        json: {
          data: {
            ...project,
            project: saved ? project.project : null,
            enrolled: false,
            canScan: false,
            internalTestAccess: true,
          },
        },
      });
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v2/scans') legacyScans.push(request.url());
  });
  await page.goto('/app/onboarding');
  await page.getByLabel('Website to monitor', { exact: true }).fill('cedarflow.example');
  await page.getByRole('button', { name: 'Set up manually', exact: true }).click();
  await page.getByLabel('Company name', { exact: true }).fill('CedarFlow');
  await expect(page.getByLabel('Company domain', { exact: true })).toHaveValue('cedarflow.example');
  await page.getByLabel('Competitor 1 name', { exact: true }).fill('Rival');
  for (let index = 1; index <= 3; index++)
    await page
      .getByLabel(`Buyer question ${String(index)}`)
      .fill(`Which scheduling tools suit marketing team ${String(index)}?`);
  await page.getByRole('button', { name: 'Review project', exact: true }).click();
  await expect(page.getByText(/Daily monitoring stays off/)).toBeVisible();
  await page.getByRole('button', { name: 'Create staging project', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/overview$/);
  await expect(
    page.getByRole('link', { name: 'Review monitoring settings', exact: true }),
  ).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Monitoring setup' }).click();
  await expect(page.getByRole('link', { name: 'Configure engines', exact: true })).toBeVisible();
  await expect(page.getByText(/Legacy Perplexity workspace/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Monitor Prompts', exact: true })).toBeDisabled();
  await expect(
    page.getByText('Save monitoring engines and configuration in Settings.'),
  ).toBeVisible();
  expect(saved).toBe(true);
  expect(legacyScans).toEqual([]);
});

test('a new account starts with a website and saves setup without enrollment or provider calls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const initial = {
    ...project,
    project: null,
    enrolled: false,
    canScan: false,
    internalTestAccess: false,
    trial: null,
  };
  await workspace(page, initial);
  let saved = false;
  const requests: string[] = [];
  const payloads: unknown[] = [];
  await page.route('**/api/v2/project', async (route) => {
    if (route.request().method() === 'POST') {
      payloads.push(route.request().postDataJSON());
      if (payloads.length === 1) {
        await route.fulfill({
          status: 503,
          json: { error: { message: 'Could not save project. Try again.' } },
        });
        return;
      }
      saved = true;
      await route.fulfill({ status: 201, json: { data: { projectId: 'project' } } });
    } else
      await route.fulfill({
        json: { data: { ...initial, project: saved ? project.project : null } },
      });
  });
  page.on('request', (request) => {
    if (
      /\/api\/v2\/(scans|geo\/runs)$/.test(new URL(request.url()).pathname) &&
      request.method() === 'POST'
    )
      requests.push(request.url());
  });
  await page.goto('/app/onboarding');
  await expect(
    page.getByRole('heading', { name: 'Which website do you want to check?' }),
  ).toBeVisible();
  await expect(page.getByText(/founder-assisted|already checked in Perplexity/)).toHaveCount(0);
  await expect(page.getByLabel('Company name', { exact: true })).toHaveCount(0);
  const website = page.getByLabel('Website to monitor', { exact: true });
  await website.fill('not-a-website');
  await page.getByRole('button', { name: 'Set up manually', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a valid domain.');
  await website.fill('https://www.cedarflow.example/features');
  await page.getByRole('button', { name: 'Set up manually', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('Company name', { exact: true }).fill('CedarFlow');
  await page.getByLabel('Competitor 1 name', { exact: true }).fill('Rival');
  for (let index = 1; index <= 3; index++)
    await page
      .getByLabel(`Buyer question ${String(index)}`)
      .fill(`Which scheduling tools suit marketing team ${String(index)}?`);
  await page.getByRole('button', { name: 'Back to website', exact: true }).click();
  await expect(website).toHaveValue('https://www.cedarflow.example/features');
  await page.getByRole('button', { name: 'Set up manually', exact: true }).click();
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('CedarFlow');
  await page.getByRole('button', { name: 'Review project', exact: true }).click();
  await expect(page.getByText(/Save your project without starting a check/)).toBeVisible();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not save project. Try again.');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Buyer question 1')).toHaveValue(
    'Which scheduling tools suit marketing team 1?',
  );
  await page.getByRole('button', { name: 'Review project', exact: true }).click();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/overview$/);
  await expect(page.getByRole('button', { name: 'Monitor Prompts', exact: true })).toBeDisabled();
  expect(payloads).toHaveLength(2);
  expect(payloads[0]).toEqual(payloads[1]);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
test('an existing subscription requests monitoring only after the final setup confirmation', async ({
  page,
}) => {
  await workspace(page, { ...project, project: null });
  const scans: unknown[] = [];
  await page.route('**/api/v2/project', (route) =>
    route.fulfill({
      json: {
        data:
          route.request().method() === 'POST'
            ? { projectId: 'project' }
            : { ...project, project: null },
      },
    }),
  );
  await page.route('**/api/v2/scans', async (route) => {
    scans.push(route.request().postDataJSON());
    await route.fulfill({
      status: 503,
      json: { error: { message: 'Synthetic monitoring unavailable.' } },
    });
  });
  await page.goto('/app/onboarding');
  await page.getByLabel('Website to monitor', { exact: true }).fill('cedarflow.example');
  await page.getByRole('button', { name: 'Set up manually', exact: true }).click();
  await page.getByLabel('Company name', { exact: true }).fill('CedarFlow');
  await page.getByLabel('Competitor 1 name', { exact: true }).fill('Rival');
  for (let index = 1; index <= 3; index++)
    await page
      .getByLabel(`Buyer question ${String(index)}`)
      .fill(`Which scheduling tools suit marketing team ${String(index)}?`);
  await page.getByRole('button', { name: 'Review baseline', exact: true }).click();
  expect(scans).toEqual([]);
  await page.getByRole('button', { name: 'Run my baseline', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Synthetic monitoring unavailable.');
  expect(scans).toEqual([{ mode: 'today' }]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('CedarFlow');
});

test('automatic onboarding fills an editable draft and preserves edits before explicit project creation', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 720 });
  const initial = { ...project, project: null, enrolled: false, canScan: false, trial: null };
  await workspace(page, initial);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const suggestions: unknown[] = [],
    saves: { brandName: string; questions: string[]; competitors: { name: string }[] }[] = [],
    scans: string[] = [];
  let saved = false;
  await page.route('**/api/v2/onboarding/suggestions', async (route) => {
    suggestions.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({ json: { data: syntheticOnboardingSuggestion } });
  });
  await page.route('**/api/v2/project', async (route) => {
    if (route.request().method() === 'POST') {
      saves.push(route.request().postDataJSON() as (typeof saves)[number]);
      saved = true;
      await route.fulfill({ status: 201, json: { data: { projectId: 'project' } } });
    } else
      await route.fulfill({
        json: { data: { ...initial, project: saved ? project.project : null } },
      });
  });
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/api\/v2\/(scans|geo\/runs)$/.test(new URL(request.url()).pathname)
    )
      scans.push(request.url());
  });
  await page.goto('/app/onboarding');
  await page.getByLabel('Website to monitor', { exact: true }).fill('cedarflow.example');
  await page.getByRole('button', { name: 'Suggest setup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reading website and drafting…' })).toBeDisabled();
  await expect(page.getByLabel('Website to monitor', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Set up manually', exact: true })).toBeDisabled();
  expect(scans).toEqual([]);
  expect(saves).toEqual([]);
  release();
  await expect(
    page.getByText('Synthetic example — no website or AI request was made'),
  ).toBeVisible();
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('CedarFlow');
  await expect(page.getByLabel('Company domain', { exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('Competitor 1 name', { exact: true })).toHaveValue('Rival');
  await expect(page.getByLabel('Buyer question 1')).toHaveValue(
    syntheticOnboardingSuggestion.draft.questions[0]?.text ?? '',
  );
  await page.screenshot({ path: testInfo.outputPath('onboarding-suggested.png'), fullPage: true });
  await page.getByText('Why these suggestions?', { exact: true }).click();
  await expect(page.getByText(/Brand evidence from the homepage/)).toBeVisible();
  await page.getByLabel('Company name', { exact: true }).fill('Edited CedarFlow');
  await page.getByLabel('Competitor 1 name', { exact: true }).fill('Chosen Rival');
  await page
    .getByLabel('Buyer question 1')
    .fill('Which onboarding tools fit a remote marketing team?');
  await page.getByRole('button', { name: 'Back to website', exact: true }).click();
  await page.getByRole('button', { name: 'Suggest setup', exact: true }).click();
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('Edited CedarFlow');
  expect(suggestions).toHaveLength(1);
  await page.getByRole('button', { name: 'Review project', exact: true }).click();
  expect(saves).toEqual([]);
  expect(scans).toEqual([]);
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/overview$/);
  expect(saves[0]).toMatchObject({
    brandName: 'Edited CedarFlow',
    questions: [
      'Which onboarding tools fit a remote marketing team?',
      ...syntheticOnboardingSuggestion.draft.questions.slice(1).map((item) => item.text),
    ],
  });
  expect(saves[0]?.competitors[0]?.name).toBe('Chosen Rival');
  expect(scans).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('staging owner reviews onboarding from an empty draft without saving over the existing project or starting checks', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 720 });
  await workspace(page, { ...project, internalTestAccess: true });
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET')
      mutations.push(new URL(request.url()).pathname);
  });
  let suggestionInput: unknown;
  await page.route('**/api/v2/onboarding/suggestions', async (route) => {
    suggestionInput = route.request().postDataJSON();
    await route.fulfill({ json: { data: syntheticOnboardingSuggestion } });
  });
  await page.goto('/app/settings');
  await page.getByRole('link', { name: 'Review onboarding', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/onboarding\?review=1$/);
  await expect(page.getByText('Staging onboarding review', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Website to monitor', { exact: true })).toHaveValue('');
  await page.getByLabel('Website to monitor', { exact: true }).fill('cedarflow.example');
  await page.getByRole('button', { name: 'Suggest setup', exact: true }).click();
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('CedarFlow');
  expect(suggestionInput).toMatchObject({ review: true, website: 'cedarflow.example' });
  await page.getByLabel('Company name', { exact: true }).fill('Review only brand');
  await page.getByRole('button', { name: 'Review project', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('onboarding-review-ready.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Finish review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Onboarding review complete' })).toBeFocused();
  await expect(
    page.getByText('No project changes were saved and no monitoring check was started.'),
  ).toBeVisible();
  expect(mutations).toEqual(['/api/v2/onboarding/suggestions']);
  await page.getByRole('link', { name: 'Start again', exact: true }).click();
  await expect(page.getByLabel('Website to monitor', { exact: true })).toHaveValue('');
  expect(mutations).toEqual(['/api/v2/onboarding/suggestions']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.getByRole('link', { name: 'Exit review', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/overview$/);
});

test('onboarding review is unavailable without the staging owner capability', async ({ page }) => {
  await workspace(page);
  await page.goto('/app/settings');
  await expect(page.getByRole('link', { name: 'Review onboarding', exact: true })).toHaveCount(0);
  await page.goto('/app/onboarding?review=1');
  await expect(
    page.getByText(/Onboarding review is available only to the staging owner/),
  ).toBeVisible();
  await expect(page.getByLabel('Website to monitor', { exact: true })).toHaveCount(0);
});

test('unavailable automatic onboarding leaves the URL intact and offers a manual fallback', async ({
  page,
}) => {
  await workspace(page, {
    ...project,
    project: null,
    enrolled: false,
    canScan: false,
    trial: null,
  });
  let calls = 0;
  await page.route('**/api/v2/onboarding/suggestions', async (route) => {
    calls++;
    await route.fulfill({
      status: 503,
      json: { error: { message: 'Automatic suggestions are unavailable. Continue manually.' } },
    });
  });
  await page.goto('/app/onboarding');
  await page.getByLabel('Website to monitor', { exact: true }).fill('cedarflow.example');
  await page.getByRole('button', { name: 'Suggest setup', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Automatic suggestions are unavailable. Continue manually.',
  );
  await expect(page.getByLabel('Website to monitor', { exact: true })).toHaveValue(
    'cedarflow.example',
  );
  await page.getByRole('button', { name: 'Set up manually', exact: true }).click();
  await expect(page.getByLabel('Company domain', { exact: true })).toHaveValue('cedarflow.example');
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(calls).toBe(1);
});

test('changed onboarding websites receive a distinct suggestion request without stale edits', async ({
  page,
}) => {
  await workspace(page, {
    ...project,
    project: null,
    enrolled: false,
    canScan: false,
    trial: null,
  });
  const ids: string[] = [];
  await page.route('**/api/v2/onboarding/suggestions', async (route) => {
    const input = route.request().postDataJSON() as { website: string; requestId: string };
    ids.push(input.requestId);
    await route.fulfill({
      json: {
        data: {
          ...syntheticOnboardingSuggestion,
          source: {
            ...syntheticOnboardingSuggestion.source,
            domain: input.website,
            url: `https://${input.website}/`,
          },
        },
      },
    });
  });
  await page.goto('/app/onboarding');
  await page.getByLabel('Website to monitor', { exact: true }).fill('cedarflow.example');
  await page.getByRole('button', { name: 'Suggest setup', exact: true }).click();
  await page.getByLabel('Company name', { exact: true }).fill('My manual edit');
  await page.getByRole('button', { name: 'Back to website', exact: true }).click();
  await page.getByLabel('Website to monitor', { exact: true }).fill('other.example');
  await page.getByRole('button', { name: 'Suggest setup', exact: true }).click();
  await expect(page.getByLabel('Company domain', { exact: true })).toHaveValue('other.example');
  await expect(page.getByLabel('Company name', { exact: true })).toHaveValue('CedarFlow');
  expect(ids).toHaveLength(2);
  expect(ids[0]).not.toBe(ids[1]);
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
