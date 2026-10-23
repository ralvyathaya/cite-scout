import { afterEach, assert, describe, expect, it, vi } from 'vitest';
import { seed, withBindings } from './fixtures';
import {
  claimGeoItem,
  saveGeoSettings,
  startGeoRun,
  geoAllowance,
} from '../../src/server/v2/geo-store';
import {
  reserveGeoProviderRequest,
  completeGeoProviderRequests,
} from '../../src/server/v2/geo-provider-budget';
import { processGeoCollectors } from '../../src/server/v2/collectors';
import { seedGeoEvidence } from './geo-fixtures';
import { queueGeoAnalysis, processGeoAnalysis } from '../../src/server/v2/analysis';

const at = new Date('2026-10-23T12:00:00Z');
const policy = {
  version: 'synthetic-policy-v1',
  globalMonthlyUsd: 1,
  projectMonthlyUsd: 0.2,
  globalMonthlyRequests: 10,
  projectMonthlyRequests: 4,
  requestCeilingsUsd: {
    perplexity_api: 0.1,
    openai_responses: 0.1,
    serpapi: 0.01,
    workers_ai: 0.001,
    typesafe: 0.001,
  },
};
const projects: { env: CloudflareBindings; id: string }[] = [];
async function ready(engine: 'perplexity' | 'google_aio' = 'perplexity') {
  const owner = await seed(1, true, at);
  const env = withBindings({
    DEPLOYMENT_ENV: 'production',
    LEMON_SQUEEZY_TEST_MODE: 'false',
    LEMON_SQUEEZY_STORE_ID: '1',
    LEMON_SQUEEZY_PRODUCT_ID: '2',
    LEMON_SQUEEZY_VARIANT_ID: '3',
    BILLING_PLAN_VARIANTS: JSON.stringify({ live: { starter: { month: '11', year: '12' } } }),
    GEO_SCANS_ENABLED: 'true',
    V2_SCANS_ENABLED: 'true',
    EXTERNAL_INTEGRATIONS_ENABLED: 'true',
    GEO_PROJECT_DAILY_CALL_CAP: '10',
    GEO_PROJECT_MONTHLY_CALL_CAP: '100',
    GEO_GLOBAL_DAILY_CALL_CAP: '100',
    GLOBAL_DAILY_PROVIDER_CALL_CAP: '100',
    GEO_SERPAPI_MONTHLY_REQUEST_CAP: '100',
    GEO_PRODUCTION_COST_POLICY: JSON.stringify(policy),
  });
  projects.push({ env, id: owner.projectId });
  await env.DB.prepare(
    "UPDATE subscriptions SET lemon_squeezy_store_id='1',lemon_squeezy_product_id='2',lemon_squeezy_variant_id='11',test_mode=0 WHERE user_id=?",
  )
    .bind(owner.userId)
    .run();
  await saveGeoSettings(
    env,
    owner.userId,
    {
      engines: [engine],
      dailyEnabled: false,
      languageCode: 'en',
      locationCode: 2840,
      device: 'desktop',
    },
    at,
  );
  const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
  const item = run.items[0];
  assert(item);
  assert(await claimGeoItem(env, item.id, at));
  return { env, owner, item };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const { env, id } of projects.splice(0))
    await env.DB.prepare('DELETE FROM geo_provider_requests WHERE project_id=?').bind(id).run();
});
describe('production dollar admission', () => {
  it('rejects fresh analysis admission without policy instead of writing a queued job', async () => {
    const { env, owner } = await ready();
    Reflect.set(env, 'GEO_ANALYSIS_ENABLED', 'true');
    Reflect.set(env, 'GEO_PROCESSING_PROJECT_DAILY_CAP', '10');
    Reflect.set(env, 'GEO_PROCESSING_GLOBAL_DAILY_CAP', '100');
    const proof = await seedGeoEvidence(env, owner, 'perplexity', at);
    const before = await env.DB.prepare(
      'SELECT count(*) AS n FROM geo_processing_attempts WHERE project_id=?',
    )
      .bind(owner.projectId)
      .first('n');
    Reflect.set(env, 'GEO_PRODUCTION_COST_POLICY', '');
    await expect(
      queueGeoAnalysis(env, owner.userId, proof.observation.id, crypto.randomUUID(), at),
    ).rejects.toThrow('GEO_PRODUCTION_COST_POLICY_REQUIRED');
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM geo_processing_attempts WHERE project_id=?')
        .bind(owner.projectId)
        .first('n'),
    ).toBe(before);
  });
  it('keeps fresh processing queued when policy is removed before dispatch', async () => {
    const { env, owner } = await ready();
    Reflect.set(env, 'GEO_ANALYSIS_ENABLED', 'true');
    Reflect.set(env, 'GEO_PROCESSING_PROJECT_DAILY_CAP', '10');
    Reflect.set(env, 'GEO_PROCESSING_GLOBAL_DAILY_CAP', '100');
    const proof = await seedGeoEvidence(env, owner, 'perplexity', at);
    const attempt = await queueGeoAnalysis(
      env,
      owner.userId,
      proof.observation.id,
      crypto.randomUUID(),
      at,
    );
    Reflect.set(env, 'GEO_PRODUCTION_COST_POLICY', '');
    const outbound = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('UNEXPECTED_NETWORK'));
    await processGeoAnalysis({ ...env, AI: undefined }, 20, at);
    expect(outbound).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare('SELECT state,failure_code FROM geo_processing_attempts WHERE id=?')
        .bind(attempt.id)
        .first(),
    ).toEqual({ state: 'queued', failure_code: 'GEO_PRODUCTION_COST_POLICY_REQUIRED' });
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM geo_provider_requests WHERE processing_id=?')
        .bind(attempt.id)
        .first('n'),
    ).toBe(0);
  });
  it('makes zero outbound calls when policy is removed after a run was queued', async () => {
    const { env, owner, item } = await ready();
    await env.DB.prepare(
      "UPDATE geo_run_items SET status='pending',lease_token=NULL,lease_until=NULL WHERE id=?",
    )
      .bind(item.id)
      .run();
    Reflect.set(env, 'GEO_PRODUCTION_COST_POLICY', '');
    Reflect.set(env, 'PERPLEXITY_API_KEY', 'synthetic-only');
    const outbound = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('UNEXPECTED_NETWORK'));
    await processGeoCollectors(env, 1, at);
    expect(outbound).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM geo_provider_requests WHERE project_id=?')
        .bind(owner.projectId)
        .first('n'),
    ).toBe(0);
  });
  it('denies missing policy before HTTP even with positive request quotas', async () => {
    const { env, item, owner } = await ready();
    Reflect.set(env, 'GEO_PRODUCTION_COST_POLICY', '');
    const outbound = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('UNEXPECTED_NETWORK'));
    await expect(
      reserveGeoProviderRequest(env, {
        operationKey: crypto.randomUUID(),
        reservationId: item.reservationId,
        collector: 'perplexity_api',
        at,
      }),
    ).rejects.toThrow('GEO_PRODUCTION_COST_POLICY_REQUIRED');
    expect(outbound).not.toHaveBeenCalled();
    expect((await geoAllowance(env, owner.userId, at)).reason).toBe(
      'GEO_PRODUCTION_COST_POLICY_REQUIRED',
    );
  });
  it('reserves atomically at the USD boundary without double-admitting concurrency or replay', async () => {
    const { env, item } = await ready();
    Reflect.set(
      env,
      'GEO_PRODUCTION_COST_POLICY',
      JSON.stringify({ ...policy, globalMonthlyUsd: 0.1 }),
    );
    const input = { reservationId: item.reservationId, collector: 'perplexity_api', at };
    const keys = [crypto.randomUUID(), crypto.randomUUID()];
    const results = await Promise.allSettled(
      keys.map((operationKey) => reserveGeoProviderRequest(env, { ...input, operationKey })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const index = results.findIndex((r) => r.status === 'fulfilled');
    await expect(
      reserveGeoProviderRequest(env, { ...input, operationKey: keys[index] ?? '' }),
    ).rejects.toThrow('GEO_PROVIDER_BUDGET_BLOCKED');
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM geo_provider_requests WHERE reservation_id=?')
        .bind(item.reservationId)
        .first('n'),
    ).toBe(1);
  });
  it('applies project request caps separately while also enforcing the shared global request cap', async () => {
    const first = await ready(),
      second = await ready();
    const value = JSON.stringify({
      ...policy,
      projectMonthlyRequests: 1,
      globalMonthlyRequests: 2,
    });
    Reflect.set(first.env, 'GEO_PRODUCTION_COST_POLICY', value);
    Reflect.set(second.env, 'GEO_PRODUCTION_COST_POLICY', value);
    const reserve = (env: CloudflareBindings, id: string) =>
      reserveGeoProviderRequest(env, {
        operationKey: crypto.randomUUID(),
        reservationId: id,
        collector: 'perplexity_api',
        at,
      });
    await reserve(first.env, first.item.reservationId);
    await expect(reserve(first.env, first.item.reservationId)).rejects.toThrow(
      'GEO_PROVIDER_BUDGET_BLOCKED',
    );
    await reserve(second.env, second.item.reservationId);
    Reflect.set(
      first.env,
      'GEO_PRODUCTION_COST_POLICY',
      JSON.stringify({ ...policy, projectMonthlyRequests: 10, globalMonthlyRequests: 2 }),
    );
    await expect(reserve(first.env, first.item.reservationId)).rejects.toThrow(
      'GEO_PROVIDER_BUDGET_BLOCKED',
    );
  });
  it('counts both Google HTTP requests and freezes the explicit search estimate at admission', async () => {
    const { env, item } = await ready('google_aio');
    Reflect.set(
      env,
      'GEO_PRODUCTION_COST_POLICY',
      JSON.stringify({ ...policy, serpapiEstimatedCostUsd: 0.007 }),
    );
    for (const key of ['first', 'second'])
      await reserveGeoProviderRequest(env, {
        operationKey: `${item.id}:${key}`,
        reservationId: item.reservationId,
        collector: 'serpapi',
        at,
      });
    Reflect.set(env, 'GEO_PRODUCTION_COST_POLICY', '');
    await completeGeoProviderRequests(env, item.reservationId, {
      status: 'completed',
      reportedCostUsd: 0.5,
      estimatedCostUsd: 0.5,
    });
    const rows = await env.DB.prepare(
      'SELECT estimated_cost_usd,reported_cost_usd,pricing_version FROM geo_provider_requests WHERE reservation_id=?',
    )
      .bind(item.reservationId)
      .all();
    expect(rows.results).toHaveLength(2);
    expect(
      rows.results.every(
        (r) =>
          r.estimated_cost_usd === '0.007' &&
          r.reported_cost_usd === null &&
          r.pricing_version === policy.version,
      ),
    ).toBe(true);
  });
  it('uses actual reported overage rather than the smaller reserved or estimated amount', async () => {
    const { env, item } = await ready();
    await reserveGeoProviderRequest(env, {
      operationKey: crypto.randomUUID(),
      reservationId: item.reservationId,
      collector: 'perplexity_api',
      at,
    });
    await completeGeoProviderRequests(env, item.reservationId, {
      status: 'completed',
      reportedCostUsd: 0.15,
      estimatedCostUsd: 0.04,
    });
    await expect(
      reserveGeoProviderRequest(env, {
        operationKey: crypto.randomUUID(),
        reservationId: item.reservationId,
        collector: 'perplexity_api',
        at,
      }),
    ).rejects.toThrow('GEO_PROVIDER_BUDGET_BLOCKED');
  });
  it.each(['unknown', 'uncertain', 'stale'] as const)(
    'blocks %s costs across month boundaries without resetting the ledger',
    async (state) => {
      const { env, item } = await ready();
      await reserveGeoProviderRequest(env, {
        operationKey: crypto.randomUUID(),
        reservationId: item.reservationId,
        collector: 'perplexity_api',
        at,
      });
      if (state !== 'stale')
        await completeGeoProviderRequests(env, item.reservationId, {
          status: state === 'unknown' ? 'completed' : 'uncertain',
          reportedCostUsd: null,
          estimatedCostUsd: null,
        });
      const later = new Date('2026-11-01T12:00:00Z');
      await env.DB.prepare('UPDATE geo_run_items SET lease_until=? WHERE id=?')
        .bind(later.getTime() + 300000, item.id)
        .run();
      await expect(
        reserveGeoProviderRequest(env, {
          operationKey: crypto.randomUUID(),
          reservationId: item.reservationId,
          collector: 'perplexity_api',
          at: later,
        }),
      ).rejects.toThrow('GEO_PROVIDER_BUDGET_BLOCKED');
      expect(
        await env.DB.prepare(
          'SELECT count(*) AS n FROM geo_provider_requests WHERE reservation_id=?',
        )
          .bind(item.reservationId)
          .first('n'),
      ).toBe(1);
    },
  );
  it('starts a new monthly window for known costs and preserves all old rows', async () => {
    const { env, item } = await ready();
    Reflect.set(
      env,
      'GEO_PRODUCTION_COST_POLICY',
      JSON.stringify({ ...policy, projectMonthlyUsd: 0.1 }),
    );
    await reserveGeoProviderRequest(env, {
      operationKey: crypto.randomUUID(),
      reservationId: item.reservationId,
      collector: 'perplexity_api',
      at,
    });
    await completeGeoProviderRequests(env, item.reservationId, {
      status: 'completed',
      reportedCostUsd: 0.08,
      estimatedCostUsd: null,
    });
    const later = new Date('2026-11-01T12:00:00Z');
    await env.DB.prepare('UPDATE geo_run_items SET lease_until=? WHERE id=?')
      .bind(later.getTime() + 300000, item.id)
      .run();
    await reserveGeoProviderRequest(env, {
      operationKey: crypto.randomUUID(),
      reservationId: item.reservationId,
      collector: 'perplexity_api',
      at: later,
    });
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM geo_provider_requests WHERE reservation_id=?')
        .bind(item.reservationId)
        .first('n'),
    ).toBe(2);
  });
  it('retains global spend exposure when the owning project is deleted', async () => {
    const first = await ready();
    const key = crypto.randomUUID();
    await reserveGeoProviderRequest(first.env, {
      operationKey: key,
      reservationId: first.item.reservationId,
      collector: 'perplexity_api',
      at,
    });
    await completeGeoProviderRequests(first.env, first.item.reservationId, {
      status: 'completed',
      reportedCostUsd: 0.08,
      estimatedCostUsd: null,
    });
    await first.env.DB.prepare('DELETE FROM projects WHERE id=?').bind(first.owner.projectId).run();
    try {
      expect(
        await first.env.DB.prepare(
          'SELECT project_id FROM geo_provider_requests WHERE operation_key=?',
        )
          .bind(key)
          .first('project_id'),
      ).toBeNull();
      const second = await ready();
      Reflect.set(
        second.env,
        'GEO_PRODUCTION_COST_POLICY',
        JSON.stringify({ ...policy, globalMonthlyUsd: 0.1 }),
      );
      await expect(
        reserveGeoProviderRequest(second.env, {
          operationKey: crypto.randomUUID(),
          reservationId: second.item.reservationId,
          collector: 'perplexity_api',
          at,
        }),
      ).rejects.toThrow('GEO_PROVIDER_BUDGET_BLOCKED');
    } finally {
      await first.env.DB.prepare('DELETE FROM geo_provider_requests WHERE operation_key=?')
        .bind(key)
        .run();
    }
  });
});
