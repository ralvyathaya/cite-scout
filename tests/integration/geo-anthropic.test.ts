import { afterEach, expect, it, vi } from 'vitest';
import { seed, withBindings } from './fixtures';
import { deleteAccountData } from '../../src/server/account-deletion';
import { processGeoCollectors } from '../../src/server/v2/collectors';
import { geoCapabilities } from '../../src/server/v2/geo-readiness';
import {
  readGeoObservations,
  readGeoRun,
  saveGeoSettings,
  startGeoRun,
} from '../../src/server/v2/geo-store';
import { anthropicReply } from '../unit/anthropic-fixture';
import { getConfig } from '../../src/server/config';
import { captureAnthropicGeo } from '../../src/integrations/anthropic/geo';

const owners: {
  env: CloudflareBindings;
  userId: string;
  projectId: string;
  reservations: string[];
}[] = [];
async function setup() {
  const at = new Date(),
    owner = await seed(1, false, at);
  const env = withBindings({
    APP_ENV: 'test',
    DEPLOYMENT_ENV: 'staging',
    APP_URL: 'https://staging.cite-scout.com',
    GEO_INTERNAL_TEST_USER_ID: owner.userId,
    GEO_INTERNAL_TEST_EXPIRES_AT: new Date(at.getTime() + 86_400_000).toISOString(),
    GEO_CLAUDE_ENABLED: 'true',
    ANTHROPIC_API_KEY: 'synthetic-anthropic-key',
    GEO_INTERNAL_TEST_ANTHROPIC_REQUEST_CAP: '1',
    GEO_INTERNAL_TEST_ANTHROPIC_MAX_COST_USD: '0.1',
    GEO_SCANS_ENABLED: 'true',
    V2_SCANS_ENABLED: 'true',
    EXTERNAL_INTEGRATIONS_ENABLED: 'true',
    GEO_PROJECT_DAILY_CALL_CAP: '12',
    GEO_PROJECT_MONTHLY_CALL_CAP: '24',
    GEO_GLOBAL_DAILY_CALL_CAP: '12',
    GEO_INTERNAL_TEST_SPEND_CAP_USD: '5',
    // Independent Anthropic admission still works when Perplexity allowance is zero.
    GEO_INTERNAL_TEST_LIMITS: JSON.stringify({
      observations: 12,
      openai: 0,
      perplexity: 0,
      serpapi: 0,
      classifier: 0,
    }),
  });
  const tracked = { env, ...owner, reservations: [] as string[] };
  owners.push(tracked);
  await saveGeoSettings(
    env,
    owner.userId,
    {
      engines: ['claude_web_search'],
      dailyEnabled: false,
      languageCode: 'en',
      locationCode: 2840,
      device: 'desktop',
    },
    at,
  );
  const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
  tracked.reservations = run.items.map((item) => item.reservationId);
  return { env, owner, at, run };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const owner of owners) {
    await owner.env.DB.prepare('DELETE FROM geo_provider_requests WHERE project_id=?')
      .bind(owner.projectId)
      .run();
    await deleteAccountData(owner.env, owner.userId);
    for (const id of owner.reservations)
      await owner.env.DB.prepare('DELETE FROM provider_call_reservations WHERE id=?')
        .bind(id)
        .run();
  }
  owners.length = 0;
});

it('constructs the Anthropic request using redirect modes supported by Workers', async () => {
  const { run } = await setup();
  const context = run.items[0]?.context;
  if (!context) throw new Error('Missing synthetic context');
  expect(context.maxOutputTokens).toBe(4096);
  const fetcher = vi.fn<typeof fetch>().mockImplementation((url, init) => {
    const request = new Request(url, init);
    expect(request.redirect).toBe('manual');
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toMatchObject({
      max_tokens: 4096,
    });
    return Promise.resolve(Response.json(anthropicReply()));
  });
  const capture = await captureAnthropicGeo('synthetic-anthropic-key', context, fetcher);
  expect(capture.quality).toBe('complete');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([
  { GEO_CLAUDE_ENABLED: 'false' },
  { ANTHROPIC_API_KEY: '' },
  { GEO_INTERNAL_TEST_ANTHROPIC_REQUEST_CAP: '0' },
  { GEO_INTERNAL_TEST_ANTHROPIC_MAX_COST_USD: '0' },
  { GEO_INTERNAL_TEST_EXPIRES_AT: '2000-01-01T00:00:00Z' },
])('fails closed before HTTP for queued work with %j', async (overrides) => {
  const { env, owner, run, at } = await setup();
  const blocked = { ...env, ...overrides };
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Unexpected external request'));
  await processGeoCollectors(blocked, 20, at);
  expect(fetcher).not.toHaveBeenCalled();
  const count = await env.DB.prepare(
    'SELECT count(*) AS n FROM geo_provider_requests WHERE project_id=?',
  )
    .bind(owner.projectId)
    .first<{ n: number }>();
  expect(count?.n).toBe(0);
  expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.status).not.toBe('succeeded');
  await expect(
    startGeoRun(blocked, owner.userId, { requestId: crypto.randomUUID() }, at),
  ).rejects.toThrow();
});

it('accounts only in the Anthropic ledger, preserves evidence with the flag off, and never retries', async () => {
  const { env, owner, at } = await setup();
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      Response.json(
        { ...anthropicReply(), debug: { secret: env.ANTHROPIC_API_KEY } },
        { headers: { 'request-id': 'req-synthetic' } },
      ),
    );
  await processGeoCollectors(env, 20, at);
  await processGeoCollectors(env, 20, new Date(at.getTime() + 1000));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
  const rows = await env.DB.prepare(
    'SELECT collector,state,reserved_cost_usd,estimated_cost_usd,reported_cost_usd,pricing_version FROM geo_provider_requests WHERE project_id=?',
  )
    .bind(owner.projectId)
    .all();
  expect(rows.results).toEqual([
    expect.objectContaining({
      collector: 'anthropic_messages',
      state: 'completed',
      reserved_cost_usd: '0.1',
      reported_cost_usd: null,
      pricing_version: 'anthropic-sonnet-5-5-web-search-2026-10-20',
    }),
  ]);
  expect(Number(rows.results[0]?.estimated_cost_usd)).toBeCloseTo(0.0104);
  const disabled = { ...env, GEO_CLAUDE_ENABLED: 'false' };
  const page = await readGeoObservations(
    disabled,
    owner.userId,
    undefined,
    { engine: 'claude_web_search' },
    at,
  );
  expect(page.observations).toHaveLength(1);
  expect(page.observations[0]?.capture.providerRequestId).toBe('req-synthetic');
  expect(JSON.stringify(page)).not.toContain(env.ANTHROPIC_API_KEY);
  expect(page.observations[0]?.capture.sources.map((s) => s.referenceLevel)).toEqual([
    'retrieved',
    'retrieved',
    'answer',
  ]);
  expect(geoCapabilities(disabled).engines.claude_web_search).toMatchObject({
    enabled: false,
    available: false,
  });
  expect(geoCapabilities(disabled).engines.perplexity.enabled).toBe(true);
  // A second admitted intent cannot borrow the otherwise larger Perplexity allowance.
  const nextAt = new Date(at.getTime() + 360_000);
  const otherAllowance = {
    ...env,
    GEO_INTERNAL_TEST_LIMITS: JSON.stringify({
      observations: 12,
      openai: 0,
      perplexity: 6,
      serpapi: 0,
      classifier: 0,
    }),
  };
  const second = await startGeoRun(
    otherAllowance,
    owner.userId,
    { requestId: crypto.randomUUID() },
    nextAt,
  );
  owners[0]?.reservations.push(...second.items.map((item) => item.reservationId));
  await processGeoCollectors(otherAllowance, 20, nextAt);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['lost', 'missing usage', 'pause_turn'])(
  'does not retry %s or turn unknown cost into zero',
  async (kind) => {
    const { env, owner, at, run } = await setup();
    const raw = {
      ...anthropicReply(),
      ...(kind === 'missing usage' ? { usage: undefined } : {}),
      ...(kind === 'pause_turn' ? { stop_reason: 'pause_turn' } : {}),
    };
    const fetcher = vi.spyOn(globalThis, 'fetch');
    if (kind === 'lost') fetcher.mockRejectedValue(new Error('lost response'));
    else fetcher.mockResolvedValue(Response.json(raw));
    await processGeoCollectors(env, 20, at);
    await processGeoCollectors(env, 20, new Date(at.getTime() + 360_000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const ledger = await env.DB.prepare(
      'SELECT state,estimated_cost_usd FROM geo_provider_requests WHERE project_id=?',
    )
      .bind(owner.projectId)
      .first();
    if (kind !== 'pause_turn') expect(ledger?.estimated_cost_usd).toBeNull();
    if (kind === 'lost')
      expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.status).toBe(
        'submission_uncertain',
      );
    else
      expect(
        (await readGeoObservations(env, owner.userId, undefined, {}, at)).observations[0]?.capture
          .quality,
      ).toBe('partial');
  },
);

it('defaults to disabled with zero independent allowance and rejects crafted settings', async () => {
  const { env, at } = await setup();
  const unset = { ...env };
  for (const name of [
    'GEO_CLAUDE_ENABLED',
    'GEO_INTERNAL_TEST_ANTHROPIC_REQUEST_CAP',
    'GEO_INTERNAL_TEST_ANTHROPIC_MAX_COST_USD',
  ])
    Reflect.deleteProperty(unset, name);
  const config = getConfig(unset);
  expect(config.GEO_CLAUDE_ENABLED).toBe('false');
  expect(config.GEO_INTERNAL_TEST_ANTHROPIC_REQUEST_CAP).toBe(0);
  expect(config.GEO_INTERNAL_TEST_ANTHROPIC_MAX_COST_USD).toBe(0);
  const other = await seed(1, false, at);
  owners.push({ env, ...other, reservations: [] });
  await expect(
    saveGeoSettings(
      { ...env, GEO_CLAUDE_ENABLED: 'false' },
      other.userId,
      {
        engines: ['claude_web_search'],
        dailyEnabled: false,
        languageCode: 'en',
        locationCode: 2840,
        device: 'desktop',
      },
      at,
    ),
  ).rejects.toThrow('GEO_CLAUDE_DISABLED');
});
