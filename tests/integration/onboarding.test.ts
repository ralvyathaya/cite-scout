import { env } from 'cloudflare:workers';
import { afterEach, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { seed, cookie, withBindings } from './fixtures';
import { suggestWebsiteSetup } from '../../src/server/v2/onboarding';
import { v2Routes } from '../../src/server/v2/routes';
import { syntheticOnboardingSuggestion as example } from '../../src/shared/onboarding-fixture';
import { onboardingModel, onboardingSuggestionVersion } from '../../src/shared/onboarding';
import { deleteAccountData } from '../../src/server/account-deletion';

const users: string[] = [],
  requests: string[] = [];
async function owner() {
  const value = await seed(0);
  users.push(value.userId);
  await env.DB.prepare('DELETE FROM projects WHERE id=?').bind(value.projectId).run();
  return value;
}
function input(website = 'cedarflow.example') {
  const requestId = crypto.randomUUID();
  requests.push(requestId);
  return { website, requestId };
}
function config(cap = '20', budget = '1') {
  return withBindings({
    ONBOARDING_SUGGESTIONS_DAILY_CAP: cap,
    ONBOARDING_SUGGESTIONS_TOTAL_BUDGET_USD: budget,
    OPENAI_API_KEY: 'synthetic-secret',
  });
}
function provider() {
  return {
    synthetic: true,
    readWebsiteProfile: vi.fn().mockResolvedValue(example.source),
    generateOnboardingDraft: vi.fn().mockResolvedValue({
      draft: example.draft,
      model: onboardingModel,
      inputTokens: 1200,
      outputTokens: 600,
      estimatedCostUsd: 0.00042,
    }),
  };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const id of requests.splice(0))
    await env.DB.prepare('DELETE FROM onboarding_suggestions WHERE id=?').bind(id).run();
  for (const id of users.splice(0)) {
    await env.DB.prepare('DELETE FROM subscriptions WHERE user_id=?').bind(id).run();
    await env.DB.prepare('DELETE FROM users WHERE id=?').bind(id).run();
  }
});

it('requires authentication and rejects unavailable or malformed setup requests without creating a project', async () => {
  const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes);
  const account = await owner();
  const headers = { Cookie: await cookie(account.userId), 'Content-Type': 'application/json' };
  const request = input();
  expect(
    (
      await app.request(
        '/api/v2/onboarding/suggestions',
        { method: 'POST', body: JSON.stringify(request) },
        config(),
      )
    ).status,
  ).toBe(401);
  const unavailable = await app.request(
    '/api/v2/onboarding/suggestions',
    { method: 'POST', headers, body: JSON.stringify(request) },
    config('0'),
  );
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toMatchObject({ error: { code: 'SUGGESTIONS_UNAVAILABLE' } });
  expect(
    (
      await app.request(
        '/api/v2/onboarding/suggestions',
        { method: 'POST', headers, body: '{broken' },
        config(),
      )
    ).status,
  ).toBe(422);
  expect(
    await env.DB.prepare('SELECT count(*) AS n FROM projects WHERE user_id=?')
      .bind(account.userId)
      .first('n'),
  ).toBe(0);
});
it('reserves atomically, replays one request and caches a domain without any monitoring or enrollment', async () => {
  const account = await owner(),
    request = input(),
    adapter = provider();
  const settings = config();
  const attempts = await Promise.allSettled([
    suggestWebsiteSetup(settings, account.userId, request, adapter),
    suggestWebsiteSetup(settings, account.userId, request, adapter),
  ]);
  expect(attempts.some((item) => item.status === 'fulfilled')).toBe(true);
  expect(adapter.generateOnboardingDraft).toHaveBeenCalledTimes(1);
  const replay = await suggestWebsiteSetup(settings, account.userId, request, adapter);
  expect(replay.cached).toBe(true);
  expect(replay.synthetic).toBe(true);
  const cache = await suggestWebsiteSetup(
    settings,
    account.userId,
    input('https://www.cedarflow.example/pricing?private=1'),
    adapter,
  );
  expect(cache.draft).toEqual(example.draft);
  expect(adapter.generateOnboardingDraft).toHaveBeenCalledTimes(1);
  const row = await env.DB.prepare(
    'SELECT state,input_tokens,output_tokens,estimated_cost_microusd FROM onboarding_suggestions WHERE id=?',
  )
    .bind(request.requestId)
    .first();
  expect(row).toMatchObject({
    state: 'succeeded',
    input_tokens: 1200,
    output_tokens: 600,
    estimated_cost_microusd: 420,
  });
  for (const table of ['projects', 'pilot_enrollments'])
    expect(
      await env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id=?`)
        .bind(account.userId)
        .first('n'),
    ).toBe(0);
});
it('does not share another account’s cached draft or replay a request for a changed source', async () => {
  const first = await owner(),
    second = await owner(),
    request = input(),
    adapter = provider();
  await suggestWebsiteSetup(config(), first.userId, request, adapter);
  await expect(
    suggestWebsiteSetup(config(), first.userId, { ...request, website: 'other.example' }, adapter),
  ).rejects.toThrow('SUGGESTION_REQUEST_CONFLICT');
  await suggestWebsiteSetup(config(), second.userId, input(), adapter);
  expect(adapter.generateOnboardingDraft).toHaveBeenCalledTimes(2);
});
it('reopens the owner’s saved draft on another day even when generation is disabled and the key is absent', async () => {
  const account = await owner(),
    other = await owner(),
    request = input(),
    adapter = provider();
  const yesterday = new Date(Date.now() - 86_400_000);
  await suggestWebsiteSetup(config(), account.userId, request, adapter, yesterday);
  const disabled = withBindings({ ONBOARDING_SUGGESTIONS_DAILY_CAP: '0', OPENAI_API_KEY: '' });
  const cached = await suggestWebsiteSetup(disabled, account.userId, input(), adapter);
  expect(cached.cached).toBe(true);
  expect(cached.draft).toEqual(example.draft);
  expect((await suggestWebsiteSetup(disabled, account.userId, request, adapter)).cached).toBe(true);
  await expect(suggestWebsiteSetup(disabled, other.userId, input(), adapter)).rejects.toThrow(
    'SUGGESTIONS_UNAVAILABLE',
  );
  await expect(
    suggestWebsiteSetup(disabled, account.userId, input('other.example'), adapter),
  ).rejects.toThrow('SUGGESTIONS_UNAVAILABLE');
  expect(adapter.readWebsiteProfile).toHaveBeenCalledTimes(1);
  expect(adapter.generateOnboardingDraft).toHaveBeenCalledTimes(1);
});
it('enforces global and per-account UTC quotas before paid dispatch and retains failed reservations', async () => {
  const first = await owner(),
    second = await owner(),
    adapter = provider();
  await suggestWebsiteSetup(config('1'), first.userId, input(), adapter);
  await expect(suggestWebsiteSetup(config('1'), second.userId, input(), adapter)).rejects.toThrow(
    'SUGGESTION_LIMIT_REACHED',
  );
  for (const domain of ['second.example', 'third.example'])
    await suggestWebsiteSetup(config(), first.userId, input(domain), adapter);
  await expect(
    suggestWebsiteSetup(config(), first.userId, input('fourth.example'), adapter),
  ).rejects.toThrow('SUGGESTION_LIMIT_REACHED');
  expect(adapter.generateOnboardingDraft).toHaveBeenCalledTimes(3);
});
it('reserves the total budget atomically across accounts and UTC days, including failed attempts', async () => {
  const first = await owner(),
    second = await owner(),
    adapter = provider(),
    settings = config('20', '0.01');
  adapter.generateOnboardingDraft.mockRejectedValue(new Error('Ambiguous timeout'));
  await Promise.allSettled([
    suggestWebsiteSetup(settings, first.userId, input(), adapter),
    suggestWebsiteSetup(settings, second.userId, input('other.example'), adapter),
  ]);
  expect(adapter.generateOnboardingDraft).toHaveBeenCalledTimes(1);
  await expect(
    suggestWebsiteSetup(
      settings,
      second.userId,
      input('tomorrow.example'),
      adapter,
      new Date(Date.now() + 86_400_000),
    ),
  ).rejects.toThrow('SUGGESTION_LIMIT_REACHED');
  await expect(
    suggestWebsiteSetup(config('20', '0.009'), first.userId, input('small.example'), adapter),
  ).rejects.toThrow('SUGGESTION_LIMIT_REACHED');
  await expect(
    suggestWebsiteSetup(config('20', '0'), first.userId, input('disabled.example'), adapter),
  ).rejects.toThrow('SUGGESTIONS_UNAVAILABLE');
  expect(adapter.generateOnboardingDraft).toHaveBeenCalledTimes(1);
  expect(adapter.readWebsiteProfile).toHaveBeenCalledTimes(1);
});
it('never re-dispatches a reserved request after a process restart or an ambiguous provider failure', async () => {
  const account = await owner(),
    pending = input(),
    failed = input('other.example'),
    adapter = provider();
  await env.DB.prepare(
    `INSERT INTO onboarding_suggestions(id,user_id,source_key,state,created_at,model) VALUES(?,?,?,'reserved',?,?)`,
  )
    .bind(
      pending.requestId,
      account.userId,
      `${onboardingSuggestionVersion}:cedarflow.example`,
      Date.now(),
      onboardingModel,
    )
    .run();
  await expect(suggestWebsiteSetup(config(), account.userId, pending, adapter)).rejects.toThrow(
    'SUGGESTIONS_IN_PROGRESS',
  );
  expect(adapter.readWebsiteProfile).not.toHaveBeenCalled();
  adapter.generateOnboardingDraft.mockRejectedValue(new Error('Ambiguous timeout'));
  await expect(suggestWebsiteSetup(config(), account.userId, failed, adapter)).rejects.toThrow(
    'SUGGESTION_FAILED',
  );
  await expect(suggestWebsiteSetup(config(), account.userId, failed, adapter)).rejects.toThrow(
    'SUGGESTION_PREVIOUSLY_FAILED',
  );
  expect(adapter.generateOnboardingDraft).toHaveBeenCalledTimes(1);
  expect(
    await env.DB.prepare(
      'SELECT state,reserved_cost_microusd,estimated_cost_microusd FROM onboarding_suggestions WHERE id=?',
    )
      .bind(failed.requestId)
      .first(),
  ).toMatchObject({
    state: 'failed',
    reserved_cost_microusd: 10000,
    estimated_cost_microusd: null,
  });
});
it('does not dispatch inference for unreadable websites and records a known zero inference estimate', async () => {
  const account = await owner(),
    request = input(),
    adapter = provider();
  adapter.readWebsiteProfile.mockRejectedValue(new Error('WEBSITE_UNREADABLE'));
  await expect(suggestWebsiteSetup(config(), account.userId, request, adapter)).rejects.toThrow(
    'WEBSITE_UNREADABLE',
  );
  expect(adapter.generateOnboardingDraft).not.toHaveBeenCalled();
  expect(
    await env.DB.prepare(
      'SELECT estimated_cost_microusd,provider_started_at FROM onboarding_suggestions WHERE id=?',
    )
      .bind(request.requestId)
      .first(),
  ).toMatchObject({ estimated_cost_microusd: 0, provider_started_at: null });
});
it('does not dispatch after the reservation loses its owner while the homepage is loading', async () => {
  const account = await owner(),
    request = input(),
    adapter = provider();
  adapter.readWebsiteProfile.mockImplementation(async () => {
    await deleteAccountData(config(), account.userId);
    return example.source;
  });
  await expect(suggestWebsiteSetup(config(), account.userId, request, adapter)).rejects.toThrow(
    'SUGGESTION_FAILED',
  );
  expect(adapter.generateOnboardingDraft).not.toHaveBeenCalled();
});

it('retains global accounting after account deletion and preserves existing project limits', async () => {
  const account = await owner(),
    request = input(),
    adapter = provider();
  await suggestWebsiteSetup(config(), account.userId, request, adapter);
  await deleteAccountData(config(), account.userId);
  expect(
    await env.DB.prepare(
      'SELECT user_id,state,estimated_cost_microusd,source_key,draft_json FROM onboarding_suggestions WHERE id=?',
    )
      .bind(request.requestId)
      .first(),
  ).toMatchObject({
    user_id: null,
    state: 'succeeded',
    estimated_cost_microusd: 420,
    source_key: 'REDACTED',
    draft_json: null,
  });
  const existing = await seed(0);
  users.push(existing.userId);
  await expect(suggestWebsiteSetup(config(), existing.userId, input(), adapter)).rejects.toThrow(
    'SETUP_ALREADY_COMPLETE',
  );
  expect(adapter.generateOnboardingDraft).toHaveBeenCalledTimes(1);
});

it('cannot restore a generated draft after deletion during inference', async () => {
  const account = await owner(),
    request = input(),
    adapter = provider();
  adapter.generateOnboardingDraft.mockImplementation(async () => {
    await deleteAccountData(config(), account.userId);
    return {
      draft: example.draft,
      model: onboardingModel,
      inputTokens: 1200,
      outputTokens: 600,
      estimatedCostUsd: 0.00042,
    };
  });
  await expect(suggestWebsiteSetup(config(), account.userId, request, adapter)).rejects.toThrow(
    'SUGGESTION_FAILED',
  );
  expect(adapter.generateOnboardingDraft).toHaveBeenCalledTimes(1);
  expect(
    await env.DB.prepare(
      'SELECT user_id,state,draft_json,source_key FROM onboarding_suggestions WHERE id=?',
    )
      .bind(request.requestId)
      .first(),
  ).toMatchObject({ user_id: null, state: 'failed', draft_json: null, source_key: 'REDACTED' });
});

function reviewConfig(userId: string, expires = new Date(Date.now() + 86_400_000)) {
  return withBindings({
    APP_URL: 'https://staging.cite-scout.com',
    DEPLOYMENT_ENV: 'staging',
    GEO_INTERNAL_TEST_USER_ID: userId,
    GEO_INTERNAL_TEST_EXPIRES_AT: expires.toISOString(),
    ONBOARDING_SUGGESTIONS_DAILY_CAP: '20',
    ONBOARDING_SUGGESTIONS_TOTAL_BUDGET_USD: '1',
    OPENAI_API_KEY: 'synthetic-secret',
  });
}

it('lets the staging owner review suggestions with an existing project without changing project, trial or monitoring data', async () => {
  const account = await seed(3, true);
  users.push(account.userId);
  const protectedRows = () =>
    Promise.all(
      [
        'projects',
        'prompts',
        'competitors',
        'pilot_enrollments',
        'subscriptions',
        'scan_runs',
        'scan_results',
      ].map(async (table) => (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results),
    );
  const before = await protectedRows();
  const settings = reviewConfig(account.userId),
    adapter = provider();
  await expect(suggestWebsiteSetup(settings, account.userId, input(), adapter)).rejects.toThrow(
    'SETUP_ALREADY_COMPLETE',
  );
  const request = { ...input(), review: true };
  const draft = await suggestWebsiteSetup(settings, account.userId, request, adapter);
  expect(draft.draft).toEqual(example.draft);
  expect(
    await env.DB.prepare('SELECT source_key FROM onboarding_suggestions WHERE id=?')
      .bind(request.requestId)
      .first('source_key'),
  ).toBe(`${onboardingSuggestionVersion}:review:cedarflow.example`);
  expect(
    (await suggestWebsiteSetup(settings, account.userId, { ...input(), review: true }, adapter))
      .cached,
  ).toBe(true);
  expect(adapter.generateOnboardingDraft).toHaveBeenCalledTimes(1);
  expect(await protectedRows()).toEqual(before);
});

it('rejects review mode outside the active staging owner on the authenticated endpoint before retrieval or reservation', async () => {
  const account = await seed(0),
    other = await owner();
  users.push(account.userId);
  const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes);
  const headers = { Cookie: await cookie(account.userId), 'Content-Type': 'application/json' };
  for (const settings of [
    config(),
    withBindings({ DEPLOYMENT_ENV: 'production', APP_URL: 'https://cite-scout.com' }),
    reviewConfig(other.userId),
    reviewConfig(account.userId, new Date(Date.now() - 1000)),
  ]) {
    const response = await app.request(
      '/api/v2/onboarding/suggestions',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...input(), review: true }),
      },
      settings,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'ONBOARDING_REVIEW_UNAVAILABLE' },
    });
  }
  expect(
    await env.DB.prepare('SELECT count(*) AS n FROM onboarding_suggestions WHERE user_id=?')
      .bind(account.userId)
      .first('n'),
  ).toBe(0);
});
