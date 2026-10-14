import { buildGeoEvaluation, projectGeoClassification } from '../../domain/geo-classification';
import { diagnoseGeo } from '../../domain/geo-diagnosis';
import { evaluateDecision } from '../../integrations/decision/client';
import { checkOwnedPage } from '../../integrations/page-check';
import { geoHash } from '../../shared/geo';
import {
  geoVersions,
  geoAnalysisSchema,
  type DecisionModel,
  type GeoAnalysis,
  type GeoEvaluation,
  type GeoPageCheck,
} from '../../shared/geo-analysis';
import { getConfig, internalTestUserId } from '../config';
import { utcDate } from '../../domain/normalization';
import { readGeoObservation } from './geo-store';
import { syncGeoActions } from './actions';
import { reserveGeoProviderRequest, completeGeoProcessingRequest } from './geo-provider-budget';

const sql = (env: CloudflareBindings, query: string, ...values: unknown[]) =>
  env.DB.prepare(query).bind(...values);
interface ProcessingRow {
  id: string;
  project_id: string;
  observation_id: string | null;
  request_id: string;
  kind: 'analysis' | 'page' | 'search';
  provider: string;
  model: DecisionModel;
  rubric_version: string;
  policy_version: string;
  input_hash: string;
  input_json: string;
  state: GeoAnalysis['state'];
  result_json: string | null;
  failure_code: string | null;
  created_at: number;
  usage_date: string;
  completed_at: number | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: string | null;
  lease_token: string | null;
  lease_until: number | null;
  user_id?: string;
}
function analysisView(row: ProcessingRow): GeoAnalysis {
  const result = row.result_json
    ? (JSON.parse(row.result_json) as Pick<GeoAnalysis, 'classification' | 'diagnoses'>)
    : null;
  return geoAnalysisSchema.parse({
    id: row.id,
    observationId: row.observation_id ?? '',
    state: row.state,
    model: row.model,
    rubricVersion: row.rubric_version,
    policyVersion: row.policy_version,
    inputHash: row.input_hash,
    classification: result?.classification ?? null,
    diagnoses: result?.diagnoses ?? [],
    failureCode: row.failure_code,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at === null ? null : new Date(row.completed_at).toISOString(),
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    estimatedCostUsd: row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
  });
}
async function reserveProcessing(
  env: CloudflareBindings,
  userId: string,
  observationId: string,
  requestId: string,
  kind: 'analysis' | 'page',
  provider: string,
  model: DecisionModel,
  input: unknown,
  at: Date,
): Promise<ProcessingRow> {
  const observation = await readGeoObservation(env, userId, observationId),
    config = getConfig(env),
    inputHash = await geoHash({
      observationId,
      kind,
      model,
      input,
      rubric: geoVersions.rubric,
      policy: geoVersions.policy,
    });
  if (config.DEPLOYMENT_ENV === 'staging' && internalTestUserId(env, at) !== userId)
    throw new Error('PAID_ACCESS_REQUIRED');
  const replay = await sql(
    env,
    'SELECT * FROM geo_processing_attempts WHERE project_id=? AND request_id=?',
    observation.projectId,
    requestId,
  ).first<ProcessingRow>();
  if (replay) {
    if (replay.input_hash !== inputHash) throw new Error('IDEMPOTENCY_CONFLICT');
    return replay;
  }
  const cached = await sql(
    env,
    "SELECT * FROM geo_processing_attempts WHERE project_id=? AND kind=? AND input_hash=? AND state IN ('queued','running','completed') AND (kind<>'page' OR created_at>?) ORDER BY created_at DESC,id DESC LIMIT 1",
    observation.projectId,
    kind,
    inputHash,
    at.getTime() - 3600_000,
  ).first<ProcessingRow>();
  if (cached) return cached;
  if (
    config.EXTERNAL_INTEGRATIONS_ENABLED !== 'true' ||
    (kind === 'analysis'
      ? config.GEO_ANALYSIS_ENABLED !== 'true'
      : config.GEO_PAGE_CHECKS_ENABLED !== 'true')
  )
    throw new Error('GEO_PROCESSING_DISABLED');
  if (config.GEO_PROCESSING_PROJECT_DAILY_CAP <= 0 || config.GEO_PROCESSING_GLOBAL_DAILY_CAP <= 0)
    throw new Error('GEO_PROCESSING_BUDGET_REQUIRED');
  const date = utcDate(at),
    id = crypto.randomUUID();
  await sql(
    env,
    `INSERT OR IGNORE INTO geo_processing_attempts(id,project_id,observation_id,request_id,kind,provider,model,rubric_version,policy_version,input_hash,input_json,state,created_at,due_at,usage_date)
    SELECT ?,p.id,?,?,?,?,?,?,?,?,?,'queued',?,?,? FROM projects p WHERE p.id=? AND p.user_id=?
    AND EXISTS(SELECT 1 FROM geo_observations WHERE id=? AND project_id=p.id)
    AND (SELECT count(*) FROM geo_processing_attempts WHERE project_id=p.id AND usage_date=?)<?
    AND (SELECT count(*) FROM geo_processing_attempts WHERE usage_date=?)<?
    AND NOT EXISTS(SELECT 1 FROM geo_processing_attempts WHERE project_id=p.id AND kind=? AND input_hash=? AND state IN ('queued','running','completed') AND (kind<>'page' OR created_at>?))`,
    id,
    observationId,
    requestId,
    kind,
    provider,
    model,
    geoVersions.rubric,
    geoVersions.policy,
    inputHash,
    JSON.stringify(input),
    at.getTime(),
    at.getTime(),
    date,
    observation.projectId,
    userId,
    observationId,
    date,
    config.GEO_PROCESSING_PROJECT_DAILY_CAP,
    date,
    config.GEO_PROCESSING_GLOBAL_DAILY_CAP,
    kind,
    inputHash,
    at.getTime() - 3600_000,
  ).run();
  const saved = await sql(
    env,
    "SELECT * FROM geo_processing_attempts WHERE project_id=? AND kind=? AND input_hash=? AND (id=? OR (state IN ('queued','running','completed') AND (kind<>'page' OR created_at>?))) ORDER BY created_at DESC,id DESC LIMIT 1",
    observation.projectId,
    kind,
    inputHash,
    id,
    at.getTime() - 3600_000,
  ).first<ProcessingRow>();
  if (!saved) throw new Error('GEO_PROCESSING_QUOTA_EXCEEDED');
  return saved;
}
export async function readGeoPageChecks(
  env: CloudflareBindings,
  userId: string,
  observationId: string,
): Promise<GeoPageCheck[]> {
  const observation = await readGeoObservation(env, userId, observationId);
  const rows = await sql(
    env,
    "SELECT result_json FROM geo_processing_attempts WHERE project_id=? AND observation_id=? AND kind='page' AND state='completed' ORDER BY created_at DESC,id DESC LIMIT 10",
    observation.projectId,
    observationId,
  ).all<{ result_json: string }>();
  return rows.results.map((row) => JSON.parse(row.result_json) as GeoPageCheck);
}
export async function queueGeoAnalysis(
  env: CloudflareBindings,
  userId: string,
  observationId: string,
  requestId: string,
  at = new Date(),
): Promise<GeoAnalysis> {
  const observation = await readGeoObservation(env, userId, observationId),
    checks = await readGeoPageChecks(env, userId, observationId),
    model = getConfig(env).GEO_CLASSIFIER_MODEL;
  const evaluation = buildGeoEvaluation(observation, checks);
  return analysisView(
    await reserveProcessing(
      env,
      userId,
      observationId,
      requestId,
      'analysis',
      model === 'jev-1.13.0' ? 'typesafe' : 'workers_ai',
      model,
      evaluation,
      at,
    ),
  );
}
export async function readGeoAnalyses(
  env: CloudflareBindings,
  userId: string,
  observationId?: string,
): Promise<GeoAnalysis[]> {
  if (observationId) await readGeoObservation(env, userId, observationId);
  const rows = await sql(
    env,
    `SELECT a.* FROM geo_processing_attempts a JOIN projects p ON p.id=a.project_id WHERE p.user_id=? AND a.kind='analysis' ${observationId ? 'AND a.observation_id=?' : ''} ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,
    userId,
    ...(observationId ? [observationId] : []),
  ).all<ProcessingRow>();
  return rows.results.map(analysisView);
}
export async function queueGeoPageCheck(
  env: CloudflareBindings,
  userId: string,
  observationId: string,
  target: string,
  requestId: string,
  at = new Date(),
) {
  const observation = await readGeoObservation(env, userId, observationId);
  // Only an observed source or the configured brand home is a known target; model output cannot pick URLs.
  const known =
    observation.capture.sources.some((source) => source.canonicalUrl === target) ||
    target === `https://${observation.context.brand.domain ?? ''}/`;
  if (!known || !observation.context.brand.domain) throw new Error('UNKNOWN_PAGE_TARGET');
  const row = await reserveProcessing(
    env,
    userId,
    observationId,
    requestId,
    'page',
    'owned_page',
    'clef-flash',
    { target, domain: observation.context.brand.domain },
    at,
  );
  return {
    id: row.id,
    state: row.state,
    check: row.result_json ? (JSON.parse(row.result_json) as GeoPageCheck) : null,
    failureCode: row.failure_code,
  };
}
export async function processGeoAnalysis(env: CloudflareBindings, limit = 5, at = new Date()) {
  const config = getConfig(env),
    started = Date.now(),
    clock = () => at.getTime() + Date.now() - started;
  if (
    config.GEO_ANALYSIS_ENABLED === 'true' &&
    config.EXTERNAL_INTEGRATIONS_ENABLED === 'true' &&
    config.GEO_PROCESSING_PROJECT_DAILY_CAP > 0 &&
    config.GEO_PROCESSING_GLOBAL_DAILY_CAP > 0
  ) {
    const captures = await sql(
      env,
      `SELECT o.id,p.user_id FROM geo_observations o JOIN projects p ON p.id=o.project_id
      WHERE NOT EXISTS(SELECT 1 FROM geo_processing_attempts a WHERE a.observation_id=o.id AND a.kind='analysis')
      AND (SELECT count(*) FROM geo_processing_attempts a WHERE a.project_id=p.id AND a.usage_date=?)<?
      ORDER BY o.captured_at,o.id LIMIT ?`,
      utcDate(new Date(clock())),
      config.GEO_PROCESSING_PROJECT_DAILY_CAP,
      Math.max(0, Math.min(5, limit)),
    ).all<{ id: string; user_id: string }>();
    for (const capture of captures.results) {
      try {
        await queueGeoAnalysis(
          env,
          capture.user_id,
          capture.id,
          crypto.randomUUID(),
          new Date(clock()),
        );
      } catch (error) {
        if (
          !(error instanceof Error) ||
          ![
            'GEO_PROCESSING_QUOTA_EXCEEDED',
            'GEO_OBSERVATION_NOT_FOUND',
            'GEO_PROCESSING_DISABLED',
            'GEO_PROCESSING_BUDGET_REQUIRED',
            'PAID_ACCESS_REQUIRED',
          ].includes(error.message)
        )
          throw error;
      }
    }
  }
  await sql(
    env,
    "UPDATE geo_processing_attempts SET state='failed',failure_code='PROCESSING_INTERRUPTED',completed_at=?,lease_token=NULL,lease_until=NULL WHERE state='running' AND lease_until<=?",
    clock(),
    clock(),
  ).run();
  const rows = await sql(
    env,
    `SELECT a.*,p.user_id FROM geo_processing_attempts a JOIN projects p ON p.id=a.project_id WHERE a.state='queued' AND a.due_at<=? ORDER BY a.created_at,a.id LIMIT ?`,
    clock(),
    Math.max(0, Math.min(20, Math.floor(limit))),
  ).all<ProcessingRow>();
  for (const row of rows.results) {
    if (
      !row.user_id ||
      !row.observation_id ||
      config.EXTERNAL_INTEGRATIONS_ENABLED !== 'true' ||
      (row.kind === 'analysis'
        ? config.GEO_ANALYSIS_ENABLED !== 'true'
        : config.GEO_PAGE_CHECKS_ENABLED !== 'true')
    )
      continue;
    const callDate = utcDate(new Date(clock())),
      token = crypto.randomUUID(),
      claim = await sql(
        env,
        `UPDATE geo_processing_attempts SET state='running',lease_token=?,lease_until=?,usage_date=?,failure_code=NULL WHERE id=? AND state='queued'
        AND EXISTS(SELECT 1 FROM projects p WHERE p.id=geo_processing_attempts.project_id AND p.user_id=?)
        AND (SELECT count(*) FROM geo_processing_attempts WHERE project_id=? AND usage_date=? AND id<>?)<?
        AND (SELECT count(*) FROM geo_processing_attempts WHERE usage_date=? AND id<>?)<?`,
        token,
        clock() + 300_000,
        callDate,
        row.id,
        row.user_id,
        row.project_id,
        callDate,
        row.id,
        config.GEO_PROCESSING_PROJECT_DAILY_CAP,
        callDate,
        row.id,
        config.GEO_PROCESSING_GLOBAL_DAILY_CAP,
      ).run();
    if (!claim.meta.changes) {
      await sql(
        env,
        "UPDATE geo_processing_attempts SET failure_code='GEO_PROCESSING_QUOTA_EXCEEDED',due_at=? WHERE id=? AND state='queued'",
        new Date(callDate).getTime() + 86400_000,
        row.id,
      ).run();
      continue;
    }
    const callStarted = Date.now();
    try {
      const observation = await readGeoObservation(env, row.user_id, row.observation_id);
      if (
        config.DEPLOYMENT_ENV === 'staging' &&
        internalTestUserId(env, new Date(clock())) !== row.user_id
      )
        throw new Error('PAID_ACCESS_REQUIRED');
      let result: unknown,
        inputTokens: number | null = null,
        outputTokens: number | null = null,
        cost: number | null = null;
      if (row.kind === 'page') {
        const input = JSON.parse(row.input_json) as { target: string; domain: string };
        result = await checkOwnedPage(input.target, input.domain);
      } else {
        await reserveGeoProviderRequest(env, {
          operationKey: `processing:${row.id}`,
          processingId: row.id,
          collector: row.provider,
          at: new Date(clock()),
        });
        const evaluation = JSON.parse(row.input_json) as GeoEvaluation;
        const native = await evaluateDecision(
          {
            AI: env.AI
              ? {
                  run: (model, input) => {
                    const ai = env.AI;
                    if (!ai) throw new Error('CLASSIFIER_UNAVAILABLE');
                    return ai.run(model, input);
                  },
                }
              : undefined,
            TYPESAFE_API_KEY: env.TYPESAFE_API_KEY,
          },
          evaluation,
          row.model,
        );
        const classification = projectGeoClassification(observation, evaluation, native),
          checks = evaluation.state.pageChecks as GeoPageCheck[];
        result = { classification, diagnoses: diagnoseGeo(observation, classification, checks) };
        inputTokens = native.usage.input_tokens;
        outputTokens = native.usage.output_tokens;
        // Estimate uses documented 2026-10-11 rates; it is not an invoice or an automatically proven free call.
        cost =
          row.model === 'clef-flash'
            ? (inputTokens * 0.038) / 1_000_000
            : row.model === 'clef'
              ? (inputTokens * 0.24) / 1_000_000
              : null;
      }
      await completeGeoProcessingRequest(env, row.id, cost);
      await sql(
        env,
        `UPDATE geo_processing_attempts SET state='completed',result_json=?,input_tokens=?,output_tokens=?,estimated_cost_usd=?,latency_ms=?,completed_at=?,lease_token=NULL,lease_until=NULL,playbook_sync_pending=CASE WHEN kind='analysis' THEN 1 ELSE 0 END WHERE id=? AND state='running' AND lease_token=? AND lease_until>? AND EXISTS(SELECT 1 FROM projects WHERE id=geo_processing_attempts.project_id AND user_id=?)`,
        JSON.stringify(result),
        inputTokens,
        outputTokens,
        cost === null ? null : String(cost),
        Date.now() - callStarted,
        clock(),
        row.id,
        token,
        clock(),
        row.user_id,
      ).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const code = /^[A-Z_0-9]+$/u.test(message) ? message : 'CLASSIFIER_OUTPUT_INVALID';
      if (
        [
          'GEO_PROVIDER_BUDGET_BLOCKED',
          'GEO_TEST_BUDGET_REQUIRED',
          'GEO_PROVIDER_QUOTA_EXCEEDED',
          'PAID_ACCESS_REQUIRED',
        ].includes(code)
      ) {
        const paused = await sql(
          env,
          `UPDATE geo_processing_attempts SET state='queued',failure_code=?,due_at=?,lease_token=NULL,lease_until=NULL
          WHERE id=? AND state='running' AND lease_token=? AND lease_until>?
          AND NOT EXISTS(SELECT 1 FROM geo_provider_requests WHERE processing_id=geo_processing_attempts.id)`,
          code,
          clock() + 300_000,
          row.id,
          token,
          clock(),
        ).run();
        if (paused.meta.changes) continue;
      }
      await completeGeoProcessingRequest(env, row.id, null, true);
      await sql(
        env,
        "UPDATE geo_processing_attempts SET state='failed',failure_code=?,latency_ms=?,completed_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND state='running' AND lease_token=? AND lease_until>? AND EXISTS(SELECT 1 FROM projects WHERE id=geo_processing_attempts.project_id AND user_id=?)",
        code,
        Date.now() - callStarted,
        clock(),
        row.id,
        token,
        clock(),
        row.user_id,
      ).run();
    }
  }
  // Local reconciliation stays available when paid providers are paused.
  const projects = await sql(
    env,
    `SELECT p.id,p.user_id FROM projects p JOIN geo_processing_attempts a ON a.project_id=p.id
    WHERE a.kind='analysis' AND a.state='completed' AND a.playbook_sync_pending=1
    GROUP BY p.id ORDER BY min(a.completed_at),p.id LIMIT ?`,
    Math.max(0, Math.min(5, Math.floor(limit))),
  ).all<{ id: string; user_id: string }>();
  for (const project of projects.results) {
    try {
      const pending = await sql(
        env,
        "SELECT id FROM geo_processing_attempts WHERE project_id=? AND kind='analysis' AND state='completed' AND playbook_sync_pending=1 ORDER BY completed_at,id LIMIT 20",
        project.id,
      ).all<{ id: string }>();
      await syncGeoActions(env, project.user_id, new Date(clock()));
      await sql(
        env,
        `UPDATE geo_processing_attempts SET playbook_sync_pending=0 WHERE project_id=? AND state='completed'
        AND id IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM projects WHERE id=geo_processing_attempts.project_id AND user_id=?)`,
        project.id,
        JSON.stringify(pending.results.map((attempt) => attempt.id)),
        project.user_id,
      ).run();
    } catch {
      console.error(JSON.stringify({ event: 'geo_playbook_deferred' }));
    }
  }
}
