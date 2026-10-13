import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookie, seed, withBindings } from './fixtures';
import { deleteAccountData } from '../../src/server/account-deletion';
import { getConfig } from '../../src/server/config';
import { runScan } from '../../src/server/scans';
import { processDueScans } from '../../src/server/v2/scans';
import { seedGeoEvidence } from './geo-fixtures';
import { processGeoCollectors } from '../../src/server/v2/collectors';
import { processGeoAnalysis, queueGeoAnalysis } from '../../src/server/v2/analysis';
import { geoUsage } from '../../src/server/v2/geo-readiness';
import type { GeoEvaluation } from '../../src/shared/geo-analysis';
import { Hono } from 'hono';
import { operatorRoutes } from '../../src/server/routes/operator';
import { v2Routes } from '../../src/server/v2/routes';
import { projectPayload } from '../../src/server/v2/read-model';
import {
  claimGeoItem,
  geoAllowance,
  readGeoRun,
  saveGeoSettings,
  startGeoRun,
} from '../../src/server/v2/geo-store';
import {
  completeGeoProviderRequests,
  reconcileGeoProviderCost,
  reserveGeoProviderRequest,
} from '../../src/server/v2/geo-provider-budget';
import type { GeoEngine } from '../../src/shared/geo';

// All provider responses and credentials here are synthetic and confined to isolated test D1.
const owners: {
  env: CloudflareBindings;
  userId: string;
  projectId: string;
  reservationIds?: string[];
}[] = [];
const retainedLedgerKeys: string[] = [];
const settings = {
  dailyEnabled: false,
  languageCode: 'en',
  locationCode: 2840,
  device: 'desktop' as const,
};
function bindings(userId: string, at: Date) {
  return withBindings({
    APP_ENV: 'test',
    DEPLOYMENT_ENV: 'staging',
    APP_URL: 'https://staging.cite-scout.com',
    GEO_INTERNAL_TEST_USER_ID: userId,
    GEO_INTERNAL_TEST_EXPIRES_AT: new Date(at.getTime() + 2 * 86_400_000).toISOString(),
    GEO_SCANS_ENABLED: 'true',
    V2_SCANS_ENABLED: 'true',
    EXTERNAL_INTEGRATIONS_ENABLED: 'true',
    GEO_SERP_COLLECTOR: 'serpapi',
    GEO_OPENAI_MODEL: 'gpt-6-luna',
    GEO_PROJECT_DAILY_CALL_CAP: '12',
    GEO_PROJECT_MONTHLY_CALL_CAP: '24',
    GEO_GLOBAL_DAILY_CALL_CAP: '12',
    GLOBAL_DAILY_PROVIDER_CALL_CAP: '150',
    GEO_SERPAPI_MONTHLY_REQUEST_CAP: '18',
    GEO_INTERNAL_TEST_SPEND_CAP_USD: '5',
    GEO_INTERNAL_TEST_OPENAI_MAX_COST_USD: '0.1',
    GEO_INTERNAL_TEST_PERPLEXITY_MAX_COST_USD: '0.1',
    GEO_INTERNAL_TEST_PROCESSING_MAX_COST_USD: '0.01',
    OPENAI_API_KEY: 'synthetic-openai-secret',
    SERPAPI_API_KEY: 'synthetic-serpapi-secret',
    PERPLEXITY_API_KEY: 'synthetic-perplexity-secret',
    DATAFORSEO_LOGIN: 'synthetic-login',
    DATAFORSEO_PASSWORD: 'synthetic-password',
  });
}
async function accepted(engines: GeoEngine[], collector = 'serpapi', paid = false) {
  const at = new Date(),
    owner = await seed(1, paid, at);
  const env = {
    ...bindings(owner.userId, at),
    GEO_SERP_COLLECTOR: collector,
  };
  const trackedOwner = { env, ...owner, reservationIds: [] as string[] };
  owners.push(trackedOwner);
  await saveGeoSettings(env, owner.userId, { ...settings, engines }, at);
  const requestId = crypto.randomUUID();
  const run = await startGeoRun(env, owner.userId, { requestId }, at);
  trackedOwner.reservationIds = run.items.map((item) => item.reservationId);
  return { env, owner, run, at, requestId };
}
const openAiReply = () =>
  Response.json({
    id: 'synthetic-openai-response',
    model: 'gpt-6-luna',
    status: 'completed',
    usage: { input_tokens: 30, output_tokens: 20 },
    debug: { api_key: 'synthetic-openai-secret' },
    output: [
      {
        type: 'web_search_call',
        status: 'completed',
        action: { type: 'search', sources: [{ url: 'https://proof.example/', title: 'Proof' }] },
      },
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: 'OrbitCal helps teams.',
            annotations: [
              {
                type: 'url_citation',
                start_index: 0,
                end_index: 8,
                url: 'https://proof.example/',
                title: 'Proof',
              },
            ],
          },
        ],
      },
    ],
  });
const serpReply = (feature: Record<string, unknown>, id = 'synthetic-serp-search') =>
  Response.json({
    search_metadata: { id, status: 'Success' },
    search_parameters: { api_key: 'synthetic-serpapi-secret' },
    ...feature,
  });
const googleAnswer = {
  text_blocks: [{ type: 'paragraph', snippet: 'OrbitCal is an option.', reference_indexes: [0] }],
  references: [{ index: 0, title: 'Evidence', link: 'https://proof.example/' }],
};
const requestUrl = (input: RequestInfo | URL) =>
  new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
const dfsReply = (status: number, result: unknown = null) =>
  Response.json({
    status_code: 20000,
    cost: status === 20100 ? 0.01 : 0,
    tasks: [
      { id: 'historical-dfs-task', status_code: status, cost: status === 20100 ? 0.01 : 0, result },
    ],
  });

afterEach(async () => {
  vi.restoreAllMocks();
  for (const owner of owners) {
    const reservations = await owner.env.DB.prepare(
      'SELECT id FROM provider_call_reservations WHERE project_id=?',
    )
      .bind(owner.projectId)
      .all<{ id: string }>();
    await owner.env.DB.prepare('DELETE FROM geo_provider_requests WHERE project_id=?')
      .bind(owner.projectId)
      .run();
    await owner.env.DB.prepare('DELETE FROM subscriptions WHERE user_id=?')
      .bind(owner.userId)
      .run();
    await deleteAccountData(owner.env, owner.userId);
    // Isolate synthetic cases; the deletion test verifies retained anonymous spend before cleanup.
    for (const id of new Set([
      ...(owner.reservationIds ?? []),
      ...reservations.results.map((row) => row.id),
    ]))
      await owner.env.DB.prepare('DELETE FROM provider_call_reservations WHERE id=?')
        .bind(id)
        .run();
  }
  for (const key of retainedLedgerKeys)
    await owners[0]?.env.DB.prepare('DELETE FROM geo_provider_requests WHERE operation_key=?')
      .bind(key)
      .run();
  retainedLedgerKeys.length = 0;
  owners.length = 0;
});

describe('four-engine staging observation loop', () => {
  it('lets only the active staging owner create a project without enrollment or legacy scans', async () => {
    const at = new Date(),
      owner = await seed(0, false, at);
    const env = bindings(owner.userId, at);
    const tracked: (typeof owners)[number] = { env, ...owner };
    owners.push(tracked);
    await env.DB.prepare('DELETE FROM projects WHERE id=?').bind(owner.projectId).run();
    const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes);
    const headers = { Cookie: await cookie(owner.userId), 'Content-Type': 'application/json' };
    const body = JSON.stringify({
      brandName: 'OrbitCal',
      canonicalDomain: 'orbitcal.test',
      competitors: [{ name: 'Other', canonicalDomain: null }],
      questions: [
        'Which scheduling tools suit founders?',
        'Which calendar tools suit marketing teams?',
        'How do scheduling tools compare for small teams?',
      ],
      idempotencyKey: crypto.randomUUID(),
    });
    expect((await projectPayload(env, owner.userId)).internalTestAccess).toBe(true);
    expect((await app.request('/api/v2/project', { method: 'POST', body }, env)).status).toBe(401);
    expect((await projectPayload(env, owner.userId)).project).toBeNull();
    const expired = {
      ...env,
      GEO_INTERNAL_TEST_EXPIRES_AT: new Date(at.getTime() - 1000).toISOString(),
    };
    expect((await projectPayload(expired, owner.userId)).internalTestAccess).toBe(false);
    expect(
      (await app.request('/api/v2/project', { method: 'POST', headers, body }, expired)).status,
    ).toBe(403);
    const foreign = { ...env, GEO_INTERNAL_TEST_USER_ID: crypto.randomUUID() };
    expect(
      (await app.request('/api/v2/project', { method: 'POST', headers, body }, foreign)).status,
    ).toBe(403);
    const created = await app.request('/api/v2/project', { method: 'POST', headers, body }, env);
    expect(created.status).toBe(201);
    const saved = await projectPayload(env, owner.userId);
    if (!saved.project) throw new Error('Staging project was not created');
    tracked.projectId = saved.project.id;
    expect(saved.canScan).toBe(false);
    expect(saved.enrolled).toBe(false);
    expect(saved.trial).toBeNull();
    expect(saved.project.questions).toHaveLength(3);
    expect(
      (await app.request('/api/v2/project', { method: 'POST', headers, body }, env)).status,
    ).toBe(200);
    expect(
      await env.DB.prepare('SELECT count(*) AS count FROM scan_runs WHERE project_id=?')
        .bind(tracked.projectId)
        .first('count'),
    ).toBe(0);
    expect(
      await env.DB.prepare('SELECT count(*) AS count FROM geo_provider_requests WHERE project_id=?')
        .bind(tracked.projectId)
        .first('count'),
    ).toBe(0);
  });

  it('denies even a paid account when the staging grant is absent or expired', async () => {
    const { env, run, at } = await accepted(['openai_web_search']);
    const other = await seed(1, true, at);
    owners.push({ env, ...other });
    expect((await geoAllowance(env, other.userId, at)).reason).toBe('PAID_ACCESS_REQUIRED');
    const revoked = { ...env, GEO_INTERNAL_TEST_USER_ID: '', GEO_INTERNAL_TEST_EXPIRES_AT: '' };
    expect((await geoAllowance(revoked, other.userId, at)).reason).toBe('PAID_ACCESS_REQUIRED');
    const item = run.items[0];
    if (!item) throw new Error('Expected observation');
    await claimGeoItem(env, item.id, at);
    await expect(
      reserveGeoProviderRequest(revoked, {
        operationKey: `synthetic-revoked-${crypto.randomUUID()}`,
        reservationId: item.reservationId,
        collector: 'openai_responses',
        at,
      }),
    ).rejects.toThrow('GEO_TEST_BUDGET_REQUIRED');
  });

  it('counts SerpApi quota in the current UTC month while retaining cumulative spending', async () => {
    const { env, owner, at } = await accepted(['openai_web_search']);
    const other = await seed(1, false, at);
    owners.push({ env, ...other });
    const previousMonth = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 0));
    for (const date of [previousMonth, at])
      await env.DB.prepare(
        `INSERT INTO geo_provider_requests
        (operation_key,project_id,collector,usage_date,reserved_cost_usd,estimated_cost_usd,state,created_at)
        VALUES(?,?,'serpapi',?,'0','0','completed',?)`,
      )
        .bind(crypto.randomUUID(), owner.projectId, date.toISOString().slice(0, 10), date.getTime())
        .run();
    for (let index = 0; index < 2; index++)
      await env.DB.prepare(
        `INSERT INTO geo_provider_requests
        (operation_key,project_id,collector,usage_date,reserved_cost_usd,estimated_cost_usd,state,created_at)
        VALUES(?,?,'serpapi',?,'0','0','completed',?)`,
      )
        .bind(crypto.randomUUID(), other.projectId, at.toISOString().slice(0, 10), at.getTime())
        .run();
    expect((await geoUsage(env, owner.userId, at)).providerRequests).toMatchObject({
      total: 2,
      serpapi: 3,
    });
  });

  it('requires operator authorization and a verified cost body before reconciliation', async () => {
    const { env, owner, at } = await accepted(['openai_web_search']);
    const operatorEnv = { ...env, OPERATOR_SECRET: 'synthetic-operator-secret' };
    const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/operator', operatorRoutes);
    const request = (body: unknown, authorization = 'Bearer synthetic-operator-secret') =>
      app.request(
        '/api/operator/geo/cost',
        {
          method: 'POST',
          headers: { Authorization: authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        operatorEnv,
      );
    const operationKey = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO geo_provider_requests
      (operation_key,project_id,collector,usage_date,reserved_cost_usd,state,created_at)
      VALUES(?,?,'perplexity_api',?,'0.1','uncertain',?)`,
    )
      .bind(operationKey, owner.projectId, at.toISOString().slice(0, 10), at.getTime())
      .run();
    const body = { operationKey, reportedCostUsd: 0.01 };
    expect((await request(body, 'Bearer invalid')).status).toBe(401);
    for (const invalid of [
      { operationKey, reportedCostUsd: -1 },
      { ...body, extra: true },
      { ...body, reportedCostUsd: '0.01' },
    ])
      expect((await request(invalid)).status).toBe(422);
    expect((await request({ ...body, operationKey: crypto.randomUUID() })).status).toBe(404);
    expect(
      await env.DB.prepare('SELECT state FROM geo_provider_requests WHERE operation_key=?')
        .bind(operationKey)
        .first('state'),
    ).toBe('uncertain');
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected provider call'));
    expect((await request(body)).status).toBe(200);
    expect(
      await env.DB.prepare(
        'SELECT state,reported_cost_usd FROM geo_provider_requests WHERE operation_key=?',
      )
        .bind(operationKey)
        .first(),
    ).toEqual({ state: 'completed', reported_cost_usd: '0.01' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not reset the 24-observation test ceiling at a month boundary or after deletion', async () => {
    const { env, owner, run, at } = await accepted(['openai_web_search']);
    const previousMonth = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 0))
      .toISOString()
      .slice(0, 10);
    for (let index = 0; index < 23; index++) {
      const id = `synthetic-retained-observation-${crypto.randomUUID()}`;
      owners[0]?.reservationIds?.push(id);
      await env.DB.prepare(
        `INSERT INTO provider_call_reservations
        (id,idempotency_key,provider,usage_date,status,reserved_at)
        VALUES(?,?,'google_aio',?,'failed',0)`,
      )
        .bind(id, id, previousMonth)
        .run();
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE geo_run_items SET status='cancelled' WHERE run_id=?").bind(run.id),
      env.DB.prepare("UPDATE scan_runs SET status='cancelled' WHERE id=?").bind(run.id),
      env.DB.prepare(
        "UPDATE provider_call_reservations SET status='failed',lease_until=NULL WHERE scan_run_id=?",
      ).bind(run.id),
    ]);
    const next = new Date(at.getTime() + 301_000);
    expect((await geoAllowance(env, owner.userId, next)).reason).toBe('GEO_QUOTA_EXCEEDED');
    await expect(
      startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, next),
    ).rejects.toThrow('GEO_QUOTA_EXCEEDED');
    expect(
      await env.DB.prepare('SELECT count(*) FROM provider_call_reservations').first('count(*)'),
    ).toBe(24);
  });

  it('shares one classification ceiling across Clef and optional Jev', async () => {
    const { env, owner, run, at } = await accepted(['openai_web_search']);
    await env.DB.batch([
      env.DB.prepare("UPDATE geo_run_items SET status='cancelled' WHERE run_id=?").bind(run.id),
      env.DB.prepare("UPDATE scan_runs SET status='cancelled' WHERE id=?").bind(run.id),
      env.DB.prepare(
        "UPDATE provider_call_reservations SET status='failed',lease_until=NULL WHERE scan_run_id=?",
      ).bind(run.id),
    ]);
    const later = new Date(at.getTime() + 301_000);
    const evidence = await seedGeoEvidence(env, owner, 'openai_web_search', later);
    await env.DB.prepare(
      "UPDATE geo_processing_attempts SET state='running',lease_token='synthetic-lease',lease_until=? WHERE id=?",
    )
      .bind(later.getTime() + 300_000, evidence.analysisId)
      .run();
    for (let index = 0; index < 23; index++)
      await env.DB.prepare(
        `INSERT INTO geo_provider_requests
        (operation_key,project_id,collector,usage_date,reserved_cost_usd,estimated_cost_usd,state,created_at)
        VALUES(?,?,'workers_ai',?,'0.01','0','completed',?)`,
      )
        .bind(crypto.randomUUID(), owner.projectId, at.toISOString().slice(0, 10), at.getTime())
        .run();
    await reserveGeoProviderRequest(env, {
      operationKey: crypto.randomUUID(),
      processingId: evidence.analysisId,
      collector: 'typesafe',
      at: later,
    });
    await expect(
      reserveGeoProviderRequest(env, {
        operationKey: crypto.randomUUID(),
        processingId: evidence.analysisId,
        collector: 'workers_ai',
        at: later,
      }),
    ).rejects.toThrow('GEO_PROVIDER_BUDGET_BLOCKED');
  });

  it('keeps unpaid classifier work queued and resumes the same attempt once after cost review', async () => {
    const { env, owner, at } = await accepted(['openai_web_search']);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openAiReply()));
    await processGeoCollectors(env, 1, at);
    const observationId = await env.DB.prepare('SELECT id FROM geo_observations WHERE project_id=?')
      .bind(owner.projectId)
      .first<string>('id');
    if (!observationId) throw new Error('Expected observation');
    const classifierEnv = {
      ...env,
      GEO_ANALYSIS_ENABLED: 'true',
      GEO_PROCESSING_PROJECT_DAILY_CAP: '12',
      GEO_PROCESSING_GLOBAL_DAILY_CAP: '12',
      GEO_CLASSIFIER_MODEL: 'clef-flash',
    };
    const attempt = await queueGeoAnalysis(
      classifierEnv,
      owner.userId,
      observationId,
      crypto.randomUUID(),
      at,
    );
    const stored = await env.DB.prepare('SELECT input_json FROM geo_processing_attempts WHERE id=?')
      .bind(attempt.id)
      .first<string>('input_json');
    const evaluation = JSON.parse(stored ?? '{}') as GeoEvaluation;
    const infer = vi.fn().mockResolvedValue({
      model: 'clef-flash',
      usage: { input_tokens: 100, output_tokens: 0 },
      answers: Object.fromEntries(
        Object.entries(evaluation.questions).map(([name, question]) => {
          if (question.type === 'noul') return [name, { type: 'noul', noul: 0.9 }];
          const selected = Object.keys(question.criteria)[0];
          return [
            name,
            {
              type: 'choice',
              choice: selected,
              confidence: 0.9,
              probabilities: Object.fromEntries(
                Object.keys(question.criteria).map((option) => [
                  option,
                  option === selected ? 1 : 0,
                ]),
              ),
            },
          ];
        }),
      ) as Record<string, unknown>,
    });
    const inferenceEnv = { ...classifierEnv, AI: { run: infer } as unknown as Ai };
    const unknown = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO geo_provider_requests
      (operation_key,project_id,collector,usage_date,reserved_cost_usd,state,created_at)
      VALUES(?,?,'perplexity_api',?,'0.1','completed',?)`,
    )
      .bind(unknown, owner.projectId, at.toISOString().slice(0, 10), at.getTime())
      .run();
    await processGeoAnalysis(inferenceEnv, 1, at);
    expect(infer).not.toHaveBeenCalled();
    const blocked = await env.DB.prepare(
      'SELECT state,due_at FROM geo_processing_attempts WHERE id=?',
    )
      .bind(attempt.id)
      .first<{ state: string; due_at: number }>();
    expect(blocked?.state).toBe('queued');
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE processing_id=?')
        .bind(attempt.id)
        .first('count(*)'),
    ).toBe(0);
    await reconcileGeoProviderCost(env, unknown, 0.01);
    const resumedAt = new Date((blocked?.due_at ?? at.getTime()) + 1);
    await processGeoAnalysis(
      { ...inferenceEnv, GEO_INTERNAL_TEST_USER_ID: '', GEO_INTERNAL_TEST_EXPIRES_AT: '' },
      1,
      resumedAt,
    );
    expect(infer).not.toHaveBeenCalled();
    await processGeoAnalysis(inferenceEnv, 1, new Date(resumedAt.getTime() + 301_000));
    await processGeoAnalysis(inferenceEnv, 1, new Date(resumedAt.getTime() + 602_000));
    expect(infer).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare('SELECT state FROM geo_processing_attempts WHERE id=?')
        .bind(attempt.id)
        .first('state'),
    ).toBe('completed');
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE processing_id=?')
        .bind(attempt.id)
        .first('count(*)'),
    ).toBe(1);
    expect(
      await env.DB.prepare(
        'SELECT state,estimated_cost_usd FROM geo_provider_requests WHERE processing_id=?',
      )
        .bind(attempt.id)
        .first(),
    ).toEqual({ state: 'completed', estimated_cost_usd: String((100 * 0.038) / 1_000_000) });
  });

  it('grants only the named trial owner, expires access, and rejects production grant configuration', async () => {
    const { env, owner, at } = await accepted(['openai_web_search']);
    const other = await seed(1, false, at);
    owners.push({ env, ...other });
    expect((await geoAllowance(env, owner.userId, at)).enabled).toBe(true);
    expect((await geoAllowance(env, other.userId, at)).reason).toBe('PAID_ACCESS_REQUIRED');
    await expect(
      startGeoRun(env, other.userId, { requestId: crypto.randomUUID() }, at),
    ).rejects.toThrow('PAID_ACCESS_REQUIRED');
    expect(
      (await geoAllowance(env, owner.userId, new Date(at.getTime() + 3 * 86_400_000))).reason,
    ).toBe('PAID_ACCESS_REQUIRED');
    await expect(
      geoAllowance({ ...env, DEPLOYMENT_ENV: 'production' }, owner.userId, at),
    ).rejects.toThrow('INTERNAL_TEST_STAGING_ONLY');
  });

  it('persists actual OpenAI API capture once across concurrent workers and run replay, with redacted raw', async () => {
    const { env, owner, run, at, requestId } = await accepted(['openai_web_search']);
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(openAiReply()));
    await Promise.all([processGeoCollectors(env, 4, at), processGeoCollectors(env, 4, at)]);
    const replay = await startGeoRun(env, owner.userId, { requestId }, at);
    await processGeoCollectors(env, 4, new Date(at.getTime() + 600_000));
    expect(replay.id).toBe(run.id);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const outgoing = fetcher.mock.calls[0];
    expect(outgoing?.[0]).toBe('https://api.openai.com/v1/responses');
    expect(
      JSON.parse(typeof outgoing?.[1]?.body === 'string' ? outgoing[1].body : '{}'),
    ).toMatchObject({
      model: 'gpt-6-luna',
      store: false,
      max_tool_calls: 1,
      tool_choice: 'required',
    });
    const saved = await env.DB.prepare(
      'SELECT engine,context_json,capture_json,answer_text FROM geo_observations WHERE run_id=?',
    )
      .bind(run.id)
      .all<{ engine: string; context_json: string; capture_json: string; answer_text: string }>();
    expect(saved.results).toHaveLength(1);
    expect(saved.results[0]?.engine).toBe('openai_web_search');
    expect(saved.results[0]?.answer_text).toBe('OrbitCal helps teams.');
    expect(JSON.parse(saved.results[0]?.context_json ?? '{}')).toMatchObject({
      collector: 'openai_responses',
    });
    expect(saved.results[0]?.capture_json).not.toContain('synthetic-openai-secret');
    expect(JSON.parse(saved.results[0]?.capture_json ?? '{}')).toMatchObject({
      quality: 'complete',
      model: 'gpt-6-luna',
      reportedCost: null,
    });
    expect((await readGeoRun(env, owner.userId, run.id)).status).toBe('completed');
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE reservation_id=?')
        .bind(run.items[0]?.reservationId)
        .first('count(*)'),
    ).toBe(1);
    const raw = await env.DB.prepare(
      'SELECT provider_response_json FROM provider_call_reservations WHERE scan_run_id=?',
    )
      .bind(run.id)
      .first<string>('provider_response_json');
    expect(raw).not.toContain('synthetic-openai-secret');
  });

  it('counts Google follow-up and Bing GET individually while persisting two observations', async () => {
    const { env, owner, run, at } = await accepted(['google_aio', 'bing_copilot']);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input),
        engine = url.searchParams.get('engine');
      expect(url.origin + url.pathname).toBe('https://serpapi.com/search.json');
      expect(url.searchParams.get('no_cache')).toBe('true');
      if (engine === 'google')
        return Promise.resolve(
          serpReply({
            ai_overview: { page_token: 'temporary-token', serpapi_link: 'https://evil.example/' },
          }),
        );
      if (engine === 'google_ai_overview')
        return Promise.resolve(serpReply({ ai_overview: googleAnswer }, 'synthetic-follow-up'));
      if (engine === 'bing')
        return Promise.resolve(
          serpReply({
            copilot_answer: {
              overview: {
                snippet: 'OrbitCal works for teams.',
                references: [{ title: 'Proof', link: 'https://proof.example/' }],
              },
              organic_result: { snippet: 'Organic snippets must not become the answer.' },
            },
          }),
        );
      return Promise.reject(new Error('Unexpected synthetic request'));
    });
    await processGeoCollectors(env, 4, at);
    await processGeoCollectors(env, 4, new Date(at.getTime() + 600_000));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect((await readGeoRun(env, owner.userId, run.id)).status).toBe('completed');
    const ledger = await env.DB.prepare(
      'SELECT count(*) AS requests FROM geo_provider_requests WHERE reservation_id IN (SELECT reservation_id FROM geo_run_items WHERE run_id=?)',
    )
      .bind(run.id)
      .first<number>('requests');
    expect(ledger).toBe(3);
    const captures = await env.DB.prepare(
      'SELECT answer_text,capture_json FROM geo_observations WHERE run_id=?',
    )
      .bind(run.id)
      .all<{ answer_text: string; capture_json: string }>();
    expect(captures.results).toHaveLength(2);
    for (const capture of captures.results) {
      expect(capture.answer_text).not.toContain('Organic snippets');
      expect(capture.capture_json).not.toContain('synthetic-serpapi-secret');
      expect(capture.capture_json).not.toContain('temporary-token');
    }
    expect((await geoAllowance(env, owner.userId, at)).today).toBe(2);
  });

  it('keeps a successful sibling when a provider becomes unavailable after run admission', async () => {
    const { env, owner, run, at } = await accepted(['openai_web_search', 'google_aio']);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      expect(requestUrl(input).hostname).toBe('api.openai.com');
      return Promise.resolve(openAiReply());
    });
    await processGeoCollectors({ ...env, SERPAPI_API_KEY: '' }, 4, at);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const completed = await readGeoRun(env, owner.userId, run.id);
    expect(completed.status).toBe('partial');
    expect(completed.items.find((item) => item.engine === 'openai_web_search')?.status).toBe(
      'succeeded',
    );
    expect(completed.items.find((item) => item.engine === 'google_aio')?.status).toBe('failed');
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_observations WHERE run_id=?')
        .bind(run.id)
        .first('count(*)'),
    ).toBe(1);
  });

  it('honors frozen historical DataForSEO collector after the current default changes to SerpApi', async () => {
    const { env, owner, run, at } = await accepted(['google_aio'], 'dataforseo_standard', true);
    expect(run.items[0]?.context.collector).toBe('dataforseo_standard');
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(dfsReply(20100))
      .mockResolvedValueOnce(
        dfsReply(20000, [
          {
            items: [
              { type: 'ai_overview', markdown: 'Historical collector answer.', references: [] },
            ],
          },
        ]),
      );
    const changed = {
      ...env,
      GEO_SERP_COLLECTOR: 'serpapi',
      DEPLOYMENT_ENV: 'production',
      GEO_INTERNAL_TEST_USER_ID: '',
      GEO_INTERNAL_TEST_EXPIRES_AT: '',
    };
    await processGeoCollectors(changed, 1, at);
    await processGeoCollectors(changed, 1, new Date(at.getTime() + 301_000));
    expect(fetcher.mock.calls.map(([input]) => requestUrl(input).hostname)).toEqual([
      'api.dataforseo.com',
      'api.dataforseo.com',
    ]);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['POST', 'GET']);
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.context.collector).toBe(
      'dataforseo_standard',
    );
    expect(
      await env.DB.prepare('SELECT answer_text FROM geo_observations WHERE run_id=?')
        .bind(run.id)
        .first('answer_text'),
    ).toBe('Historical collector answer.');
  });

  it('never repeats an ambiguous OpenAI paid submission and retains durable uncertainty', async () => {
    const { env, owner, run, at } = await accepted(['openai_web_search']);
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Synthetic connection lost'));
    await processGeoCollectors(env, 4, at);
    await processGeoCollectors(env, 4, new Date(at.getTime() + 600_000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.status).toBe(
      'submission_uncertain',
    );
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE reservation_id=?')
        .bind(run.items[0]?.reservationId)
        .first('count(*)'),
    ).toBe(1);
  });

  it('admits only one concurrent durable reservation for a provider operation', async () => {
    const { env, run, at } = await accepted(['openai_web_search']);
    const reservationId = run.items[0]?.reservationId;
    if (!reservationId) throw new Error('Expected admitted observation reservation');
    expect(await claimGeoItem(env, run.items[0]?.id ?? '', at)).not.toBeNull();
    const input = {
      operationKey: `synthetic-${crypto.randomUUID()}`,
      reservationId,
      collector: 'openai_responses' as const,
      at,
    };
    const attempted = await Promise.allSettled([
      reserveGeoProviderRequest(env, input),
      reserveGeoProviderRequest(env, input),
    ]);
    expect(attempted.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE reservation_id=?')
        .bind(reservationId)
        .first('count(*)'),
    ).toBe(1);
  });

  it('blocks the second Google request before fetch when the SerpApi request quota is exhausted', async () => {
    const { env, owner, run, at } = await accepted(['google_aio']);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        serpReply({
          ai_overview: { page_token: 'temporary-token' },
        }),
      ),
    );
    await processGeoCollectors({ ...env, GEO_SERPAPI_MONTHLY_REQUEST_CAP: '1' }, 4, at);
    await processGeoCollectors(
      { ...env, GEO_SERPAPI_MONTHLY_REQUEST_CAP: '1' },
      4,
      new Date(at.getTime() + 600_000),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.status).toBe('failed');
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE reservation_id=?')
        .bind(run.items[0]?.reservationId)
        .first('count(*)'),
    ).toBe(1);
  });

  it('blocks more paid requests after a completed call has neither reported nor estimated cost', async () => {
    const { env, run, at } = await accepted(['openai_web_search']);
    const reservationId = run.items[0]?.reservationId;
    if (!reservationId) throw new Error('Expected admitted observation reservation');
    expect(await claimGeoItem(env, run.items[0]?.id ?? '', at)).not.toBeNull();
    await reserveGeoProviderRequest(env, {
      operationKey: `synthetic-${crypto.randomUUID()}`,
      reservationId,
      collector: 'openai_responses',
      at,
    });
    await completeGeoProviderRequests(env, reservationId, {
      reportedCostUsd: null,
      estimatedCostUsd: null,
      status: 'completed',
    });
    await expect(
      reserveGeoProviderRequest(env, {
        operationKey: `synthetic-${crypto.randomUUID()}`,
        reservationId,
        collector: 'openai_responses',
        at,
      }),
    ).rejects.toThrow();
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE reservation_id=?')
        .bind(reservationId)
        .first('count(*)'),
    ).toBe(1);
  });

  it('admits a request exactly at the $5 ceiling and rejects the next reservation', async () => {
    const { env, run, owner, at } = await accepted(['openai_web_search']);
    const item = run.items[0];
    if (!item) throw new Error('Expected admitted observation');
    expect(await claimGeoItem(env, item.id, at)).not.toBeNull();
    await env.DB.prepare(
      `INSERT INTO geo_provider_requests
      (operation_key,reservation_id,project_id,collector,usage_date,reserved_cost_usd,state,estimated_cost_usd,created_at)
      VALUES(?,?,?,'perplexity_api',?,'4.90','completed','4.90',?)`,
    )
      .bind(
        `synthetic-previous-${crypto.randomUUID()}`,
        item.reservationId,
        owner.projectId,
        at.toISOString().slice(0, 10),
        at.getTime(),
      )
      .run();
    await reserveGeoProviderRequest(env, {
      operationKey: `synthetic-boundary-${crypto.randomUUID()}`,
      reservationId: item.reservationId,
      collector: 'openai_responses',
      at,
    });
    expect(
      await env.DB.prepare(
        'SELECT sum(CAST(reserved_cost_usd AS REAL)) FROM geo_provider_requests WHERE project_id=?',
      )
        .bind(owner.projectId)
        .first('sum(CAST(reserved_cost_usd AS REAL))'),
    ).toBe(5);
    await expect(
      reserveGeoProviderRequest(env, {
        operationKey: `synthetic-over-${crypto.randomUUID()}`,
        reservationId: item.reservationId,
        collector: 'openai_responses',
        at,
      }),
    ).rejects.toThrow('GEO_PROVIDER_BUDGET_BLOCKED');
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE project_id=?')
        .bind(owner.projectId)
        .first('count(*)'),
    ).toBe(2);
    expect(() => getConfig({ ...env, GEO_INTERNAL_TEST_SPEND_CAP_USD: '5.01' })).toThrow();
  });

  it.each([
    ['openai_responses', 6],
    ['perplexity_api', 6],
    ['serpapi', 18],
    ['workers_ai', 24],
    ['typesafe', 24],
  ] as const)('enforces the internal %s maximum of %i requests', async (collector, maximum) => {
    const { env, run, owner, at } = await accepted(['openai_web_search']);
    const admissionEnv = { ...env, GEO_SERPAPI_MONTHLY_REQUEST_CAP: '250' };
    let reservationId: string | undefined, processingId: string | undefined;
    if (collector === 'workers_ai' || collector === 'typesafe') {
      await env.DB.batch([
        env.DB.prepare("UPDATE geo_run_items SET status='cancelled' WHERE run_id=?").bind(run.id),
        env.DB.prepare("UPDATE scan_runs SET status='cancelled',completed_at=? WHERE id=?").bind(
          at.getTime(),
          run.id,
        ),
        env.DB.prepare(
          "UPDATE provider_call_reservations SET status='failed',completed_at=? WHERE scan_run_id=?",
        ).bind(at.getTime(), run.id),
      ]);
      const evidence = await seedGeoEvidence(
        env,
        owner,
        'openai_web_search',
        new Date(at.getTime() + 301_000),
      );
      processingId = evidence.analysisId;
      await env.DB.prepare(
        "UPDATE geo_processing_attempts SET state='running',lease_token='synthetic-lease',lease_until=? WHERE id=?",
      )
        .bind(at.getTime() + 600_000, processingId)
        .run();
    } else {
      const item = run.items[0];
      if (!item) throw new Error('Expected admitted observation');
      expect(await claimGeoItem(env, item.id, at)).not.toBeNull();
      reservationId = item.reservationId;
    }
    for (let index = 0; index < maximum; index++)
      await reserveGeoProviderRequest(admissionEnv, {
        operationKey: `synthetic-${crypto.randomUUID()}`,
        reservationId,
        processingId,
        collector,
        at,
      });
    await expect(
      reserveGeoProviderRequest(admissionEnv, {
        operationKey: `synthetic-excess-${crypto.randomUUID()}`,
        reservationId,
        processingId,
        collector,
        at,
      }),
    ).rejects.toThrow('GEO_PROVIDER_BUDGET_BLOCKED');
    expect(
      await env.DB.prepare(
        'SELECT count(*) FROM geo_provider_requests WHERE project_id=? AND collector=?',
      )
        .bind(owner.projectId, collector)
        .first('count(*)'),
    ).toBe(maximum);
  });

  it('cannot admit a request for another paid project under the owner-only staging grant', async () => {
    const grant = await accepted(['openai_web_search']);
    const other = await accepted(['openai_web_search'], 'serpapi', true);
    const item = other.run.items[0];
    if (!item) throw new Error('Expected paid project observation');
    expect(await claimGeoItem(other.env, item.id, other.at)).not.toBeNull();
    await expect(
      reserveGeoProviderRequest(grant.env, {
        operationKey: `synthetic-other-${crypto.randomUUID()}`,
        reservationId: item.reservationId,
        collector: 'openai_responses',
        at: other.at,
      }),
    ).rejects.toThrow('GEO_PROVIDER_BUDGET_BLOCKED');
    expect(
      await grant.env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE project_id=?')
        .bind(other.owner.projectId)
        .first('count(*)'),
    ).toBe(0);
  });

  it('accepts at most 14 days and rejects invalid grant identifiers before monitoring', async () => {
    const { env, at } = await accepted(['openai_web_search']);
    vi.spyOn(Date, 'now').mockReturnValue(at.getTime());
    expect(
      getConfig({
        ...env,
        GEO_INTERNAL_TEST_EXPIRES_AT: new Date(at.getTime() + 14 * 86_400_000).toISOString(),
      }).GEO_INTERNAL_TEST_USER_ID,
    ).toBe(env.GEO_INTERNAL_TEST_USER_ID);
    expect(() =>
      getConfig({
        ...env,
        GEO_INTERNAL_TEST_EXPIRES_AT: new Date(at.getTime() + 14 * 86_400_000 + 1).toISOString(),
      }),
    ).toThrow('INVALID_INTERNAL_TEST_ACCESS');
    for (const identifier of ["x' OR 1=1 --", 'owner with spaces', 'x'.repeat(101)])
      expect(() => getConfig({ ...env, GEO_INTERNAL_TEST_USER_ID: identifier })).toThrow();
    expect(() =>
      getConfig({
        ...env,
        GEO_INTERNAL_TEST_USER_ID: '',
        GEO_INTERNAL_TEST_EXPIRES_AT: at.toISOString(),
      }),
    ).toThrow('INVALID_INTERNAL_TEST_ACCESS');
  });

  it('blocks legacy manual and due-scan paths from spending outside the staging GEO ledger', async () => {
    const { env, owner, at } = await accepted(['openai_web_search'], 'serpapi', true);
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected unbudgeted provider request'));
    await expect(
      runScan(env, {
        userId: owner.userId,
        projectId: owner.projectId,
        promptIds: owner.promptIds,
        trigger: 'manual',
        now: at,
      }),
    ).rejects.toThrow('LEGACY_STAGING_SCANS_DISABLED');
    await env.DB.prepare('DELETE FROM geo_settings WHERE project_id=?').bind(owner.projectId).run();
    const legacyRunId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO scan_runs
      (id,project_id,trigger_type,provider,status,observation_date,phase,context_version,due_at,created_at)
      VALUES(?,?,'manual','perplexity','pending',?,'paid',1,?,?)`,
    )
      .bind(legacyRunId, owner.projectId, at.toISOString().slice(0, 10), at.getTime(), at.getTime())
      .run();
    await env.DB.prepare(
      `INSERT INTO scan_run_items(id,run_id,prompt_id,phase,status,attempts_used,due_at)
      VALUES(?,?,?,'paid','pending',0,?)`,
    )
      .bind(crypto.randomUUID(), legacyRunId, owner.promptIds[0], at.getTime())
      .run();
    await processDueScans(env, 4, at);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare('SELECT status FROM scan_runs WHERE id=?')
        .bind(legacyRunId)
        .first('status'),
    ).toBe('deferred');
    expect(
      await env.DB.prepare('SELECT count(*) FROM provider_call_reservations WHERE scan_run_id=?')
        .bind(legacyRunId)
        .first('count(*)'),
    ).toBe(0);
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE project_id=?')
        .bind(owner.projectId)
        .first('count(*)'),
    ).toBe(0);
  });

  it('retains anonymous provider spend after account deletion and revokes admission', async () => {
    const { env, run, owner, at } = await accepted(['openai_web_search']);
    const item = run.items[0];
    if (!item) throw new Error('Expected admitted observation');
    expect(await claimGeoItem(env, item.id, at)).not.toBeNull();
    const operationKey = `synthetic-retained-${crypto.randomUUID()}`;
    retainedLedgerKeys.push(operationKey);
    await reserveGeoProviderRequest(env, {
      operationKey,
      reservationId: item.reservationId,
      collector: 'openai_responses',
      at,
    });
    await completeGeoProviderRequests(env, item.reservationId, {
      reportedCostUsd: null,
      estimatedCostUsd: 0.011,
      status: 'completed',
    });
    expect(await deleteAccountData(env, owner.userId)).toBe(true);
    expect(
      await env.DB.prepare(
        'SELECT project_id,reserved_cost_usd,estimated_cost_usd,state FROM geo_provider_requests WHERE operation_key=?',
      )
        .bind(operationKey)
        .first(),
    ).toEqual({
      project_id: null,
      reserved_cost_usd: '0.1',
      estimated_cost_usd: '0.011',
      state: 'completed',
    });
    expect(
      await env.DB.prepare(
        'SELECT user_id,project_id,request_context_json,provider_response_json FROM provider_call_reservations WHERE id=?',
      )
        .bind(item.reservationId)
        .first(),
    ).toEqual({
      user_id: null,
      project_id: null,
      request_context_json: null,
      provider_response_json: null,
    });
    await expect(
      reserveGeoProviderRequest(env, {
        operationKey: `synthetic-after-delete-${crypto.randomUUID()}`,
        reservationId: item.reservationId,
        collector: 'openai_responses',
        at,
      }),
    ).rejects.toThrow('GEO_PROVIDER_BUDGET_BLOCKED');
  });

  it('keeps an unpaid blocked item pending in the same run and resumes once after cost review', async () => {
    const { env, run, owner, at } = await accepted(['openai_web_search']);
    const item = run.items[0];
    if (!item) throw new Error('Expected admitted observation');
    const previousOperation = `synthetic-unreviewed-${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT INTO geo_provider_requests
      (operation_key,project_id,collector,usage_date,reserved_cost_usd,state,created_at)
      VALUES(?,?,'openai_responses',?,'0.1','completed',?)`,
    )
      .bind(previousOperation, owner.projectId, at.toISOString().slice(0, 10), at.getTime())
      .run();
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(openAiReply()));
    await processGeoCollectors(env, 4, at);
    const blocked = await readGeoRun(env, owner.userId, run.id);
    expect(blocked.items[0]?.status).toBe('pending');
    expect(blocked.items[0]?.reservationId).toBe(item.reservationId);
    expect(Date.parse(blocked.items[0]?.dueAt ?? '')).toBeGreaterThanOrEqual(
      at.getTime() + 300_000,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE reservation_id=?')
        .bind(item.reservationId)
        .first('count(*)'),
    ).toBe(0);
    expect(
      await env.DB.prepare('SELECT count(*) FROM provider_call_reservations WHERE scan_run_id=?')
        .bind(run.id)
        .first('count(*)'),
    ).toBe(1);
    await reconcileGeoProviderCost(env, previousOperation, 0.01);
    const resumedAt = new Date(Date.parse(blocked.items[0]?.dueAt ?? '') + 1);
    await processGeoCollectors(env, 4, resumedAt);
    await processGeoCollectors(env, 4, new Date(resumedAt.getTime() + 600_000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await readGeoRun(env, owner.userId, run.id)).status).toBe('completed');
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_provider_requests WHERE reservation_id=?')
        .bind(item.reservationId)
        .first('count(*)'),
    ).toBe(1);
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_observations WHERE run_id=?')
        .bind(run.id)
        .first('count(*)'),
    ).toBe(1);
  });
});
