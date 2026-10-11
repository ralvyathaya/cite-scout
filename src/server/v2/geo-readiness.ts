import { getConfig } from '../config';
import { geoSurfaces, type GeoEngine } from '../../shared/geo';
import { utcDate } from '../../domain/normalization';
const secretReady = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
export function geoCapabilities(env: CloudflareBindings) {
  const config = getConfig(env);
  const paused =
    config.GEO_SCANS_ENABLED !== 'true' ||
    config.V2_SCANS_ENABLED !== 'true' ||
    config.EXTERNAL_INTEGRATIONS_ENABLED !== 'true';
  const noBudget =
    config.GEO_GLOBAL_DAILY_CALL_CAP <= 0 ||
    config.GEO_PROJECT_DAILY_CALL_CAP <= 0 ||
    config.GEO_PROJECT_MONTHLY_CALL_CAP <= 0;
  const engines = Object.fromEntries(
    (Object.keys(geoSurfaces) as GeoEngine[]).map((engine) => {
      const credentialReady =
        engine === 'perplexity'
          ? secretReady(env.PERPLEXITY_API_KEY)
          : secretReady(env.DATAFORSEO_LOGIN) && secretReady(env.DATAFORSEO_PASSWORD);
      const reason = paused
        ? 'Monitoring is paused by the operator.'
        : noBudget
          ? 'A positive monitoring budget is required.'
          : !credentialReady
            ? 'This collector is not configured. Stored answers remain available.'
            : null;
      return [engine, { available: reason === null, reason }];
    }),
  ) as Record<GeoEngine, { available: boolean; reason: string | null }>;
  const classifierReady =
    config.GEO_CLASSIFIER_MODEL === 'jev-1.13.0'
      ? secretReady(env.TYPESAFE_API_KEY)
      : Boolean(env.AI);
  const processingEnabled =
    config.EXTERNAL_INTEGRATIONS_ENABLED === 'true' &&
    config.GEO_PROCESSING_PROJECT_DAILY_CAP > 0 &&
    config.GEO_PROCESSING_GLOBAL_DAILY_CAP > 0;
  const classifierAvailable =
    processingEnabled && config.GEO_ANALYSIS_ENABLED === 'true' && classifierReady;
  const pageAvailable = processingEnabled && config.GEO_PAGE_CHECKS_ENABLED === 'true';
  return {
    engines,
    classifier: {
      available: classifierAvailable,
      model: config.GEO_CLASSIFIER_MODEL,
      needsReview: true as const,
      reason: classifierAvailable
        ? null
        : 'Classification is unavailable or paused. Original answers remain readable.',
    },
    pageChecks: {
      available: pageAvailable,
      reason: pageAvailable ? null : 'Owned page checks are paused or have no processing budget.',
    },
  };
}
export async function geoUsage(env: CloudflareBindings, userId: string, at = new Date()) {
  const date = utcDate(at),
    config = getConfig(env);
  const project = await env.DB.prepare('SELECT id FROM projects WHERE user_id=?')
    .bind(userId)
    .first<{ id: string }>();
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  const [collector, processing] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS attempts,COALESCE(SUM(CASE WHEN usage_date=? THEN 1 ELSE 0 END),0) AS today,COUNT(*) AS month,COALESCE(SUM(CAST(reported_cost AS REAL)),0) AS reportedCostUsd,COALESCE(SUM(CASE WHEN reported_cost IS NULL THEN 1 ELSE 0 END),0) AS unknownCostAttempts FROM provider_call_reservations WHERE project_id=? AND usage_date LIKE ?`,
    )
      .bind(date, project.id, `${date.slice(0, 7)}%`)
      .first<{
        today: number;
        month: number;
        reportedCostUsd: number;
        unknownCostAttempts: number;
        attempts: number;
      }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS attempts,COALESCE(SUM(CASE WHEN usage_date=? THEN 1 ELSE 0 END),0) AS today,COALESCE(SUM(CAST(estimated_cost_usd AS REAL)),0) AS estimatedCostUsd,COALESCE(SUM(CASE WHEN estimated_cost_usd IS NULL THEN 1 ELSE 0 END),0) AS unknownCostAttempts FROM geo_processing_attempts WHERE project_id=? AND usage_date LIKE ?`,
    )
      .bind(date, project.id, `${date.slice(0, 7)}%`)
      .first<{
        today: number;
        estimatedCostUsd: number;
        unknownCostAttempts: number;
        attempts: number;
      }>(),
  ]);
  return {
    collectors: collector ?? {
      today: 0,
      month: 0,
      reportedCostUsd: 0,
      unknownCostAttempts: 0,
      attempts: 0,
    },
    processing: processing ?? {
      today: 0,
      estimatedCostUsd: 0,
      unknownCostAttempts: 0,
      attempts: 0,
    },
    limits: {
      collectorDaily: config.GEO_PROJECT_DAILY_CALL_CAP,
      collectorMonthly: config.GEO_PROJECT_MONTHLY_CALL_CAP,
      processingDaily: config.GEO_PROCESSING_PROJECT_DAILY_CAP,
    },
    classifierModel: config.GEO_CLASSIFIER_MODEL,
  };
}
