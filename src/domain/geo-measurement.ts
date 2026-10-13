import { belongsToDomain } from './geo-classification';
import { geoHash, geoSurfaces } from '../shared/geo';
import { utcDate } from './normalization';
import {
  geoMeasurementVersion,
  geoMetrics,
  type GeoDailySample,
  type GeoMetric,
  type GeoMetricObservation,
  type GeoOutcome,
} from '../shared/geo-measurement';

export function metricValues(row: GeoMetricObservation): Record<GeoMetric, 0 | 1 | null> {
  const result: Record<GeoMetric, 0 | 1 | null> = {
    mention: null,
    recommendation: null,
    owned_answer_reference: null,
    owned_inline_reference: null,
    overview_occurrence: null,
  };
  const overview = row.context.engine === 'google_aio' || row.context.engine === 'bing_copilot';
  if (overview && (row.capture.quality === 'complete' || row.capture.quality === 'no_feature'))
    result.overview_occurrence = row.capture.quality === 'no_feature' ? 0 : 1;
  const analysis = row.analysis;
  if (
    row.capture.quality !== 'complete' ||
    analysis?.scope !== 'complete' ||
    analysis.answerQuality !== 'usable'
  )
    return result;
  if (analysis.brandPresence === 'present' || analysis.brandPresence === 'absent') {
    result.mention = analysis.brandPresence === 'present' ? 1 : 0;
    if (
      analysis.brandPresence === 'absent' &&
      ['not_applicable', 'unknown'].includes(analysis.brandStance)
    )
      result.recommendation = 0;
    else if (
      analysis.brandPresence === 'present' &&
      analysis.brandStance !== 'unknown' &&
      analysis.brandStance !== 'not_applicable'
    )
      result.recommendation = ['recommended', 'conditional_recommendation'].includes(
        analysis.brandStance,
      )
        ? 1
        : 0;
  }
  if (row.context.brand.domain) {
    const owned = row.capture.sources.filter((source) =>
      belongsToDomain(source.canonicalUrl, row.context.brand.domain),
    );
    result.owned_answer_reference = owned.some((source) => source.referenceLevel !== 'retrieved')
      ? 1
      : 0;
    if (row.capture.inlineReferencesAvailable === true)
      result.owned_inline_reference = owned.some(
        (source) => source.referenceLevel === 'inline_verified',
      )
        ? 1
        : 0;
  }
  return result;
}
export async function measurementCohort(
  row: GeoMetricObservation,
  metric: GeoMetric,
): Promise<string | null> {
  const c = row.context,
    surface = geoSurfaces[c.engine];
  if (surface.reportsModel && (!row.capture.modelReported || !row.capture.model)) return null;
  if (metric !== 'overview_occurrence' && !row.analysis) return null;
  return geoHash({
    version: geoMeasurementVersion,
    metric,
    promptVersionId: c.promptVersionId,
    promptText: c.promptText,
    engine: c.engine,
    surface: c.surface,
    collector: c.collector,
    collectorVersion: c.collectorVersion,
    ...(c.requestedModel ? { requestedModel: c.requestedModel } : {}),
    brand: c.brand,
    competitors: [...c.competitors].sort((a, b) => a.id.localeCompare(b.id)),
    instructionVersion: c.instructionVersion,
    maxOutputTokens: c.maxOutputTokens,
    forceWebSearch: c.forceWebSearch,
    locale: surface.supportsLocale ? [c.languageCode, c.locationCode] : null,
    device: surface.supportsDevice ? c.device : null,
    captureModel: row.capture.modelReported ? row.capture.model : null,
    classifier:
      metric === 'overview_occurrence'
        ? null
        : [row.analysis?.model, row.analysis?.rubricVersion, row.analysis?.policyVersion],
  });
}
export async function dailySamples(
  rows: GeoMetricObservation[],
  series: string,
  window?: { from: string; to: string; requestedAfter?: string },
  retained: GeoDailySample[] = [],
): Promise<GeoDailySample[]> {
  const samples = new Map<string, GeoDailySample>();
  const frozenDays = new Set(retained.map((sample) => `${sample.cohort}:${sample.day}`)),
    frozenMetrics = new Set(
      retained.map(
        (sample) => `${sample.observationId}:${sample.metric}:${sample.analysisId ?? ''}`,
      ),
    );
  const eligible = rows.filter((row) => {
    const time = Date.parse(row.capturedAt);
    return (
      !window ||
      (time >= Date.parse(window.from) &&
        time < Date.parse(window.to) &&
        (!window.requestedAfter ||
          (time > Date.parse(window.from) &&
            Date.parse(row.requestedAt) >= Date.parse(window.requestedAfter))))
    );
  });
  eligible.sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt) || a.id.localeCompare(b.id),
  );
  for (const row of eligible) {
    const values = metricValues(row);
    for (const metric of geoMetrics) {
      const value = values[metric];
      if (value === null) continue;
      const analysisId = metric === 'overview_occurrence' ? null : (row.analysis?.id ?? null);
      if (frozenMetrics.has(`${row.id}:${metric}:${analysisId ?? ''}`)) continue;
      const cohort = await measurementCohort(row, metric);
      if (!cohort) continue;
      const day = utcDate(new Date(row.capturedAt)),
        key = `${cohort}:${day}`;
      if (!frozenDays.has(key) && !samples.has(key))
        samples.set(key, {
          series,
          cohort,
          metric,
          day,
          value,
          observationId: row.id,
          analysisId,
          capturedAt: row.capturedAt,
        });
    }
  }
  return Array.from(samples.values());
}
export function compareSamples(before: number[], after: number[], scopeComplete: boolean) {
  const mean = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const left = mean(before),
    right = mean(after);
  let outcome: GeoOutcome = 'unchanged';
  if (!scopeComplete || left === null || right === null) outcome = 'inconclusive';
  else if (right > left) outcome = 'improved';
  else if (right < left) outcome = 'worsened';
  return {
    outcome,
    before: left,
    after: right,
    beforeSamples: before.length,
    afterSamples: after.length,
    limitedData: before.length < 7 || after.length < 7,
    scopeComplete,
  };
}
export function compareCohortSamples(
  before: GeoDailySample[],
  after: GeoDailySample[],
  expected: (string | null)[],
  scopeComplete: boolean,
) {
  const cohorts = [...new Set(expected)],
    rates = (samples: GeoDailySample[]) =>
      cohorts.flatMap((cohort) => {
        const values = samples.filter((sample) => sample.cohort === cohort);
        return values.length
          ? [values.reduce((sum, sample) => sum + sample.value, 0) / values.length]
          : [];
      }),
    left = rates(before),
    right = rates(after);
  return {
    ...compareSamples(
      left,
      right,
      scopeComplete &&
        cohorts.length > 0 &&
        !cohorts.includes(null) &&
        left.length === cohorts.length &&
        right.length === cohorts.length,
    ),
    beforeSamples: before.length,
    afterSamples: after.length,
    limitedData:
      expected.length === 0 ||
      expected.some(
        (cohort) =>
          before.filter((sample) => sample.cohort === cohort).length < 7 ||
          after.filter((sample) => sample.cohort === cohort).length < 7,
      ),
    observationIds: [...new Set([...before, ...after].map((sample) => sample.observationId))],
  };
}
