import { assert, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { cookie, seed, withBindings } from './fixtures';
import { v2Routes } from '../../src/server/v2/routes';
import { reserveGeoProviderRequest } from '../../src/server/v2/geo-provider-budget';
import { paidAccess, projectPayload } from '../../src/server/v2/read-model';
import {
  claimGeoItem,
  geoAllowance,
  saveGeoSettings,
  startGeoRun,
} from '../../src/server/v2/geo-store';
import { seedGeoEvidence } from './geo-fixtures';
import { processGeoAnalysis, queueGeoAnalysis } from '../../src/server/v2/analysis';
import { processDueScans } from '../../src/server/v2/scans';

const at = new Date('2026-10-23T12:00:00Z');
const bindings = () =>
  withBindings({
    DEPLOYMENT_ENV: 'production',
    LEMON_SQUEEZY_TEST_MODE: 'false',
    LEMON_SQUEEZY_STORE_ID: '1',
    LEMON_SQUEEZY_PRODUCT_ID: '2',
    LEMON_SQUEEZY_VARIANT_ID: '3',
    BILLING_PLAN_VARIANTS: JSON.stringify({
      live: {
        starter: { month: '11', year: '12' },
        growth: { month: '21', year: '22' },
        pro: { month: '31', year: '32' },
      },
    }),
    GEO_SCANS_ENABLED: 'true',
    V2_SCANS_ENABLED: 'true',
    EXTERNAL_INTEGRATIONS_ENABLED: 'true',
    GEO_PROJECT_DAILY_CALL_CAP: '200',
    GEO_PROJECT_MONTHLY_CALL_CAP: '6000',
    GEO_GLOBAL_DAILY_CALL_CAP: '1000',
    GLOBAL_DAILY_PROVIDER_CALL_CAP: '1000',
  });
async function subscriber(count: number, variant = '11', test = false) {
  const owner = await seed(count, true, at),
    env = bindings();
  await env.DB.prepare(
    "UPDATE subscriptions SET lemon_squeezy_store_id='1',lemon_squeezy_product_id='2',lemon_squeezy_variant_id=?,test_mode=? WHERE user_id=?",
  )
    .bind(variant, Number(test), owner.userId)
    .run();
  return { owner, env };
}
const settings = {
  engines: ['perplexity', 'openai_web_search', 'google_aio'] as (
    'perplexity' | 'openai_web_search' | 'google_aio'
  )[],
  dailyEnabled: true,
  languageCode: 'en',
  locationCode: 2840,
  device: 'desktop' as const,
};
describe('public plan monitoring limits', () => {
  it('does not let prompt replacement bypass a downgrade and retains the old prompt', async () => {
    const { env, owner } = await subscriber(6, '21');
    await env.DB.prepare("UPDATE subscriptions SET lemon_squeezy_variant_id='11' WHERE user_id=?")
      .bind(owner.userId)
      .run();
    const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes);
    const id = owner.promptIds[0];
    assert(id);
    const headers = { Cookie: await cookie(owner.userId), 'Content-Type': 'application/json' };
    const replace = () =>
      app.request(
        `/api/v2/questions/${id}/replacement`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ text: 'Which service suits a replacement buyer question?' }),
        },
        env,
      );
    expect((await replace()).status).toBe(409);
    await env.DB.prepare('UPDATE prompts SET enabled=0 WHERE id=?').bind(id).run();
    const response = await replace();
    expect(response.status).toBe(201);
    const { data } = await response.json<{ data: { id: string } }>();
    expect(
      await env.DB.prepare('SELECT enabled FROM prompts WHERE id=?').bind(data.id).first('enabled'),
    ).toBe(0);
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS n FROM prompts WHERE project_id=? AND enabled=1 AND archived_at IS NULL',
      )
        .bind(owner.projectId)
        .first('n'),
    ).toBe(5);
    expect(
      await env.DB.prepare('SELECT archived_at FROM prompts WHERE id=?')
        .bind(id)
        .first('archived_at'),
    ).not.toBeNull();
  });
  it('schedules untouched pairs after a manual subset without consuming used pairs twice', async () => {
    const { env, owner } = await subscriber(2);
    await saveGeoSettings(env, owner.userId, settings, at);
    const manual = await startGeoRun(
      env,
      owner.userId,
      {
        requestId: crypto.randomUUID(),
        promptIds: [owner.promptIds[0] ?? 'missing'],
        engines: ['perplexity'],
      },
      at,
    );
    await env.DB.batch([
      env.DB.prepare("UPDATE geo_run_items SET status='succeeded' WHERE run_id=?").bind(manual.id),
      env.DB.prepare(
        "UPDATE provider_call_reservations SET status='succeeded' WHERE scan_run_id=?",
      ).bind(manual.id),
    ]);
    const next = new Date(at.getTime() + 3600000);
    const daily = await startGeoRun(
      env,
      owner.userId,
      { requestId: crypto.randomUUID() },
      next,
      'scheduled',
    );
    expect(daily.items).toHaveLength(5);
    expect(
      daily.items.some((i) => i.promptId === owner.promptIds[0] && i.engine === 'perplexity'),
    ).toBe(false);
    expect(
      (await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, next, 'scheduled'))
        .id,
    ).toBe(daily.id);
  });
  it('preserves legacy daily monitoring and monthly allowance despite saved GEO settings', async () => {
    const { env, owner } = await subscriber(3, '3');
    await env.DB.prepare(
      "INSERT INTO competitors(id,project_id,name,normalized_name,created_at,updated_at) VALUES(?,?,'Rival','rival',?,?)",
    )
      .bind(crypto.randomUUID(), owner.projectId, at.getTime(), at.getTime())
      .run();
    await env.DB.prepare('UPDATE projects SET v2_enabled_at=? WHERE id=?')
      .bind(at.getTime(), owner.projectId)
      .run();
    await env.DB.prepare(
      "INSERT INTO geo_settings(project_id,engines_json,daily_enabled,language_code,location_code,device,updated_at) VALUES(?, ?, 1,'en',2840,'desktop',?)",
    )
      .bind(owner.projectId, '["perplexity"]', at.getTime())
      .run();
    expect((await projectPayload(env, owner.userId)).usage.monthlyLimit).toBe(
      Math.min(350, Number(env.PER_USER_MONTHLY_PROVIDER_CALL_CAP)),
    );
    await processDueScans(env, 0, at);
    await processDueScans(env, 0, at);
    const run = await env.DB.prepare("SELECT id FROM scan_runs WHERE project_id=? AND phase='paid'")
      .bind(owner.projectId)
      .first<{ id: string }>();
    assert(run);
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM scan_run_items WHERE run_id=? AND status='pending'",
      )
        .bind(run.id)
        .first('n'),
    ).toBe(3);
    const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes);
    const response = await app.request(
      '/api/v2/scans',
      {
        method: 'POST',
        headers: { Cookie: await cookie(owner.userId), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'today' }),
      },
      { ...env, EXTERNAL_INTEGRATIONS_ENABLED: 'false' },
    );
    expect(response.status).not.toBe(409);
    expect(await response.text()).not.toContain('GEO_RUN_REQUIRED');
  });
  it.each([
    ['11', 5, 15],
    ['12', 5, 15],
    ['21', 15, 45],
    ['22', 15, 45],
    ['31', 30, 90],
    ['32', 30, 90],
  ])('maps variant %s to the same UTC allowance', async (variant, promptLimit, dailyChecks) => {
    const { env, owner } = await subscriber(promptLimit, variant);
    expect(await paidAccess(env, owner.userId)).toBe(true);
    expect(await projectPayload(env, owner.userId)).toMatchObject({
      promptLimit,
      plan: { dailyChecks, promptLimit },
    });
    expect((await geoAllowance(env, owner.userId, at)).limits.projectDaily).toBe(dailyChecks);
    await saveGeoSettings(env, owner.userId, settings, at);
    const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
    expect(run.items).toHaveLength(dailyChecks);
  });
  it('rejects test subscriptions in live mode and unknown variants', async () => {
    for (const [variant, test] of [
      ['11', true],
      ['999', false],
    ] as const) {
      const { env, owner } = await subscriber(1, variant, test);
      expect(await paidAccess(env, owner.userId)).toBe(false);
      expect((await geoAllowance(env, owner.userId, at)).reason).toBe('PAID_ACCESS_REQUIRED');
    }
  });
  it('does not grant legacy Perplexity subscriptions multi-engine GEO', async () => {
    const { env, owner } = await subscriber(1, '3');
    expect(await paidAccess(env, owner.userId)).toBe(true);
    expect((await geoAllowance(env, owner.userId, at)).reason).toBe('PAID_ACCESS_REQUIRED');
  });
  it('preserves downgrade history and blocks new work until active prompts fit the plan', async () => {
    const { env, owner } = await subscriber(6);
    await saveGeoSettings(env, owner.userId, { ...settings, dailyEnabled: false }, at);
    await expect(
      startGeoRun(
        env,
        owner.userId,
        { requestId: crypto.randomUUID(), promptIds: owner.promptIds.slice(0, 1) },
        at,
      ),
    ).rejects.toThrow('QUESTION_LIMIT');
    await env.DB.prepare('UPDATE prompts SET enabled=0 WHERE id=?').bind(owner.promptIds[5]).run();
    expect((await geoAllowance(env, owner.userId, at)).enabled).toBe(true);
    expect((await projectPayload(env, owner.userId)).project?.questions).toHaveLength(6);
  });
  it('shares each prompt/engine UTC-day slot between manual and scheduled requests', async () => {
    const { env, owner } = await subscriber(1);
    await saveGeoSettings(env, owner.userId, settings, at);
    const run = await startGeoRun(
      env,
      owner.userId,
      { requestId: crypto.randomUUID() },
      at,
      'scheduled',
    );
    await env.DB.batch([
      env.DB.prepare("UPDATE geo_run_items SET status='succeeded' WHERE run_id=?").bind(run.id),
      env.DB.prepare(
        "UPDATE provider_call_reservations SET status='succeeded' WHERE scan_run_id=?",
      ).bind(run.id),
    ]);
    await expect(
      startGeoRun(
        env,
        owner.userId,
        { requestId: crypto.randomUUID() },
        new Date(at.getTime() + 3600000),
      ),
    ).rejects.toThrow('GEO_DAILY_PAIR_LIMIT');
    expect(
      (
        await startGeoRun(
          env,
          owner.userId,
          { requestId: crypto.randomUUID() },
          new Date(at.getTime() + 86400000),
        )
      ).items,
    ).toHaveLength(3);
  });
  it('rechecks expiry, engine scope and downgrade before dispatch', async () => {
    const { env, owner } = await subscriber(1);
    await saveGeoSettings(env, owner.userId, settings, at);
    const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
    await env.DB.prepare("UPDATE subscriptions SET lemon_squeezy_variant_id='3' WHERE user_id=?")
      .bind(owner.userId)
      .run();
    const item = run.items[0];
    assert(item);
    expect(await claimGeoItem(env, item.id, at)).toBeNull();
  });
  it('atomically excludes concurrent different request ids for a pair', async () => {
    const { env, owner } = await subscriber(1);
    await saveGeoSettings(env, owner.userId, settings, at);
    const results = await Promise.allSettled([
      startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at),
      startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await geoAllowance(env, owner.userId, at)).today).toBe(3);
  });
  it('releases a proven pre-HTTP failure but retains dispatched failures', async () => {
    const { env, owner } = await subscriber(1);
    await saveGeoSettings(env, owner.userId, { ...settings, engines: ['perplexity'] }, at);
    const first = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
    await env.DB.batch([
      env.DB.prepare("UPDATE geo_run_items SET status='failed' WHERE run_id=?").bind(first.id),
      env.DB.prepare(
        "UPDATE provider_call_reservations SET status='failed' WHERE scan_run_id=?",
      ).bind(first.id),
    ]);
    expect((await geoAllowance(env, owner.userId, at)).today).toBe(0);
    const later = new Date(at.getTime() + 3600000);
    const retry = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, later);
    const item = retry.items[0];
    assert(item);
    await claimGeoItem(env, item.id, later);
    await reserveGeoProviderRequest(env, {
      operationKey: `${item.id}:1`,
      reservationId: item.reservationId,
      collector: 'perplexity_api',
      at: later,
    });
    await env.DB.batch([
      env.DB.prepare("UPDATE geo_run_items SET status='failed' WHERE id=?").bind(item.id),
      env.DB.prepare("UPDATE provider_call_reservations SET status='failed' WHERE id=?").bind(
        item.reservationId,
      ),
    ]);
    expect((await geoAllowance(env, owner.userId, at)).today).toBe(1);
    await expect(
      startGeoRun(
        env,
        owner.userId,
        { requestId: crypto.randomUUID() },
        new Date(later.getTime() + 3600000),
      ),
    ).rejects.toThrow('GEO_DAILY_PAIR_LIMIT');
  });
  it('blocks prompt creation and resuming at the cap while pause and archive remain available', async () => {
    const { env, owner } = await subscriber(5);
    const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes);
    const headers = { Cookie: await cookie(owner.userId), 'Content-Type': 'application/json' };
    const create = () =>
      app.request(
        '/api/v2/questions',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ text: 'A unique buyer question to track' }),
        },
        env,
      );
    expect((await create()).status).toBe(409);
    const id = owner.promptIds[0];
    assert(id);
    const change = async (action: 'pause' | 'resume' | 'archive') => {
      const row = await env.DB.prepare('SELECT updated_at FROM prompts WHERE id=?')
        .bind(id)
        .first<{ updated_at: number }>();
      assert(row);
      return app.request(
        `/api/v2/questions/${id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            action,
            expectedUpdatedAt: new Date(row.updated_at).toISOString(),
          }),
        },
        env,
      );
    };
    expect((await change('pause')).status).toBe(200);
    expect((await create()).status).toBe(201);
    expect((await change('resume')).status).toBe(409);
    expect((await change('archive')).status).toBe(200);
    expect((await projectPayload(env, owner.userId)).project?.questions).toHaveLength(6);
  });
  it('rebases pending annual work at a month boundary without expanding the daily allowance', async () => {
    const { env, owner } = await subscriber(1, '12');
    const before = new Date('2026-10-31T23:59:00Z'),
      after = new Date('2026-11-01T00:01:00Z');
    await saveGeoSettings(env, owner.userId, { ...settings, engines: ['perplexity'] }, before);
    const pending = await startGeoRun(
      env,
      owner.userId,
      { requestId: crypto.randomUUID() },
      before,
    );
    const item = pending.items[0];
    assert(item);
    expect((await claimGeoItem(env, item.id, after))?.status).toBe('submitting');
    expect((await geoAllowance(env, owner.userId, after)).limits.projectDaily).toBe(15);
    expect((await geoAllowance(env, owner.userId, after)).today).toBe(1);
  });
  it('keeps cached analysis readable and blocks fresh or queued processing after expiry', async () => {
    const fixture = await subscriber(1);
    const env = {
      ...fixture.env,
      GEO_ANALYSIS_ENABLED: 'true',
      GEO_PROCESSING_PROJECT_DAILY_CAP: '10',
      GEO_PROCESSING_GLOBAL_DAILY_CAP: '100',
    };
    const { owner } = fixture;
    const proof = await seedGeoEvidence(env, owner, 'perplexity', at);
    const requestId = crypto.randomUUID();
    const queued = await queueGeoAnalysis(env, owner.userId, proof.observation.id, requestId, at);
    await env.DB.prepare("UPDATE subscriptions SET status='expired' WHERE user_id=?")
      .bind(owner.userId)
      .run();
    expect(
      (await queueGeoAnalysis(env, owner.userId, proof.observation.id, requestId, at)).id,
    ).toBe(queued.id);
    const outbound = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected outbound request'));
    try {
      await processGeoAnalysis({ ...env, AI: undefined }, 20, at);
      expect(outbound).not.toHaveBeenCalled();
      expect(
        await env.DB.prepare(
          'SELECT count(*) AS n FROM geo_provider_requests WHERE processing_id=?',
        )
          .bind(queued.id)
          .first('n'),
      ).toBe(0);
    } finally {
      outbound.mockRestore();
    }
    expect(
      await env.DB.prepare('SELECT failure_code FROM geo_processing_attempts WHERE id=?')
        .bind(queued.id)
        .first('failure_code'),
    ).toBe('PAID_ACCESS_REQUIRED');
    const fresh = await seedGeoEvidence(
      env,
      owner,
      'perplexity',
      new Date(at.getTime() + 86400000),
      'A different saved answer',
    );
    await expect(
      queueGeoAnalysis(env, owner.userId, fresh.observation.id, crypto.randomUUID(), at),
    ).rejects.toThrow('PAID_ACCESS_REQUIRED');
  });
});
