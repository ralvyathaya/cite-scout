import { getConfig, internalTestUserId } from '../config';
import { utcDate } from '../../domain/normalization';

interface RequestAdmission {
  operationKey: string;
  reservationId?: string;
  processingId?: string;
  collector: string;
  at?: Date;
}

// An admitted request is never released or retried: even a lost response may have been billed.
export async function reserveGeoProviderRequest(env: CloudflareBindings, input: RequestAdmission) {
  const at = input.at ?? new Date(),
    config = getConfig(env);
  const internal = config.DEPLOYMENT_ENV === 'staging';
  const ceiling =
    input.collector === 'openai_responses'
      ? config.GEO_INTERNAL_TEST_OPENAI_MAX_COST_USD
      : input.collector === 'perplexity_api'
        ? config.GEO_INTERNAL_TEST_PERPLEXITY_MAX_COST_USD
        : input.collector === 'workers_ai' || input.collector === 'typesafe'
          ? config.GEO_INTERNAL_TEST_PROCESSING_MAX_COST_USD
          : 0;
  if (
    internal &&
    (!internalTestUserId(env, at) ||
      config.GEO_INTERNAL_TEST_SPEND_CAP_USD <= 0 ||
      (input.collector !== 'serpapi' && ceiling <= 0))
  )
    throw new Error('GEO_TEST_BUDGET_REQUIRED');
  if (internal && input.collector === 'dataforseo_standard')
    throw new Error('GEO_TEST_COLLECTOR_NOT_ALLOWED');
  if (
    input.collector === 'serpapi' &&
    (config.GEO_SERPAPI_MONTHLY_REQUEST_CAP <= 0 ||
      (internal && config.GEO_SERPAPI_MONTHLY_REQUEST_CAP > 250))
  )
    throw new Error('GEO_PROVIDER_QUOTA_EXCEEDED');
  const source = input.reservationId
    ? `SELECT v.project_id FROM provider_call_reservations v JOIN geo_run_items i ON i.reservation_id=v.id JOIN projects p ON p.id=v.project_id WHERE v.id=? AND v.user_id=p.user_id AND i.status='submitting' AND i.lease_token=v.lease_token AND i.lease_until>?`
    : `SELECT a.project_id FROM geo_processing_attempts a JOIN projects p ON p.id=a.project_id WHERE a.id=? AND a.state='running' AND a.lease_until>?`;
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO geo_provider_requests
    (operation_key,reservation_id,processing_id,project_id,collector,usage_date,reserved_cost_usd,state,created_at)
    SELECT ?,?,?,s.project_id,?,?,?,'started',? FROM (${source} AND (?='' OR p.user_id=?)) s
    WHERE (?<>'serpapi' OR (SELECT count(*) FROM geo_provider_requests WHERE collector='serpapi' AND usage_date LIKE ?)< ?)
    AND (?=0 OR (
      NOT EXISTS(SELECT 1 FROM geo_provider_requests WHERE state='uncertain' OR (state='started' AND created_at<?) OR (state='completed' AND reported_cost_usd IS NULL AND estimated_cost_usd IS NULL))
      AND COALESCE((SELECT SUM(max(CAST(reserved_cost_usd AS REAL),COALESCE(CAST(reported_cost_usd AS REAL),0),COALESCE(CAST(estimated_cost_usd AS REAL),0))) FROM geo_provider_requests),0)+?<=?
      AND (SELECT count(*) FROM geo_provider_requests WHERE collector=? OR (? IN ('workers_ai','typesafe') AND collector IN ('workers_ai','typesafe')))<?))`,
  )
    .bind(
      input.operationKey,
      input.reservationId ?? null,
      input.processingId ?? null,
      input.collector,
      utcDate(at),
      String(ceiling),
      at.getTime(),
      input.reservationId ?? input.processingId ?? '',
      at.getTime(),
      config.GEO_INTERNAL_TEST_USER_ID,
      config.GEO_INTERNAL_TEST_USER_ID,
      input.collector,
      `${utcDate(at).slice(0, 7)}%`,
      config.GEO_SERPAPI_MONTHLY_REQUEST_CAP,
      internal ? 1 : 0,
      at.getTime() - 300_000,
      ceiling,
      config.GEO_INTERNAL_TEST_SPEND_CAP_USD,
      input.collector,
      input.collector,
      input.collector === 'serpapi'
        ? 18
        : input.collector === 'workers_ai' || input.collector === 'typesafe'
          ? 24
          : 6,
    )
    .run();
  if (!result.meta.changes) throw new Error('GEO_PROVIDER_BUDGET_BLOCKED');
  return input.operationKey;
}

export async function completeGeoProviderRequests(
  env: CloudflareBindings,
  reservationId: string,
  result: {
    reportedCostUsd: number | null;
    estimatedCostUsd: number | null;
    status: 'completed' | 'uncertain';
  },
) {
  // SerpApi's free allowance is an estimate, never an invoice supplied by the response.
  await env.DB.prepare(
    `UPDATE geo_provider_requests SET state=?,reported_cost_usd=?,estimated_cost_usd=CASE WHEN collector='serpapi' AND ?='completed' THEN '0' ELSE ? END,
    pricing_version=CASE WHEN collector='serpapi' THEN 'serpapi-free-250-2026-10-12' WHEN collector='openai_responses' THEN 'openai-gpt-6-luna-2026-10-12' ELSE NULL END
    WHERE reservation_id=? AND state='started'`,
  )
    .bind(
      result.status,
      result.reportedCostUsd === null ? null : String(result.reportedCostUsd),
      result.status,
      result.estimatedCostUsd === null ? null : String(result.estimatedCostUsd),
      reservationId,
    )
    .run();
}

export async function completeGeoProcessingRequest(
  env: CloudflareBindings,
  processingId: string,
  cost: number | null,
  uncertain = false,
) {
  await env.DB.prepare(
    "UPDATE geo_provider_requests SET state=?,estimated_cost_usd=?,pricing_version='clef-2026-10-11' WHERE processing_id=? AND state='started'",
  )
    .bind(uncertain ? 'uncertain' : 'completed', cost === null ? null : String(cost), processingId)
    .run();
}

export function estimateOpenAiCost(
  model: string | null,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  return model?.startsWith('gpt-6-luna') && inputTokens !== null && outputTokens !== null
    ? 0.01 + (inputTokens * 0.1 + outputTokens * 0.5) / 1_000_000
    : null;
}

export async function reconcileGeoProviderCost(
  env: CloudflareBindings,
  operationKey: string,
  reportedCostUsd: number,
) {
  const result = await env.DB.prepare(
    "UPDATE geo_provider_requests SET reported_cost_usd=?,state='completed',pricing_version='operator-invoice-reconciliation' WHERE operation_key=?",
  )
    .bind(String(reportedCostUsd), operationKey)
    .run();
  if (!result.meta.changes) throw new Error('PROVIDER_REQUEST_NOT_FOUND');
}
