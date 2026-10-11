import {
  compareCohortSamples,
  dailySamples,
  measurementCohort,
} from '../../domain/geo-measurement';
import { geoHash } from '../../shared/geo';
import {
  geoCompletionSchema,
  geoReopenSchema,
  geoMeasurementVersion,
  geoMetrics,
  type GeoCompletion,
  type GeoReopen,
  type GeoMetricObservation,
  type GeoDailySample,
  type GeoPinMeasurement,
  type GeoMetric,
} from '../../shared/geo-measurement';
import { readGeoAction, type GeoEvidenceFilter } from './actions';
import type { GeoActionScope } from '../../shared/geo-actions';
const DAY = 86400_000;
const sql = (env: CloudflareBindings, query: string, ...values: unknown[]) =>
  env.DB.prepare(query).bind(...values);
interface MetricFilter extends GeoEvidenceFilter {
  from?: number;
  to?: number;
  observationIds?: string[];
}
async function metricRows(
  env: CloudflareBindings,
  userId: string,
  filter: MetricFilter = {},
  at = new Date(),
): Promise<GeoMetricObservation[]> {
  const rows = await sql(
    env,
    `SELECT json_object('id',o.id,'projectId',o.project_id,
    'capturedAt',strftime('%Y-%m-%dT%H:%M:%fZ',o.captured_at/1000.0,'unixepoch'),
    'requestedAt',strftime('%Y-%m-%dT%H:%M:%fZ',r.created_at/1000.0,'unixepoch'),'context',json(o.context_json),
    'capture',json_object('model',o.model,'modelReported',json(CASE WHEN json_extract(o.capture_json,'$.modelReported')=1 THEN 'true' ELSE 'false' END),'quality',json_extract(o.capture_json,'$.quality'),'sources',json_extract(o.capture_json,'$.sources'),'inlineReferencesAvailable',json(CASE WHEN json_extract(o.capture_json,'$.inlineReferencesAvailable')=1 THEN 'true' ELSE 'false' END)),
    'analysis',CASE WHEN a.id IS NULL THEN NULL ELSE json_object('id',a.id,'model',a.model,'rubricVersion',a.rubric_version,'policyVersion',a.policy_version,'answerQuality',json_extract(a.result_json,'$.classification.answerQuality'),'scope',json_extract(a.result_json,'$.classification.scope'),'brandPresence',json_extract(a.result_json,'$.classification.brandPresence'),'brandStance',json_extract(a.result_json,'$.classification.brandStance')) END) AS row_json
    FROM geo_observations o JOIN projects p ON p.id=o.project_id JOIN scan_runs r ON r.id=o.run_id
    LEFT JOIN geo_processing_attempts a ON a.observation_id=o.id AND a.kind='analysis' AND a.state='completed'
    WHERE p.user_id=? ${filter.observationIds ? 'AND o.id IN (SELECT value FROM json_each(?))' : 'AND o.captured_at>=? AND o.captured_at<=?'}
    ${filter.engine ? 'AND o.engine=?' : ''} ${filter.promptId ? "AND json_extract(o.context_json,'$.promptId')=?" : ''}
    ORDER BY o.captured_at,o.id,a.created_at,a.id LIMIT 2001`,
    userId,
    ...(filter.observationIds
      ? [JSON.stringify(filter.observationIds)]
      : [filter.from ?? at.getTime() - (filter.days ?? 30) * DAY, filter.to ?? at.getTime()]),
    ...(filter.engine ? [filter.engine] : []),
    ...(filter.promptId ? [filter.promptId] : []),
  ).all<{ row_json: string }>();
  if (rows.results.length > 2000) throw new Error('GEO_SCOPE_TOO_LARGE');
  return rows.results.map((row) => JSON.parse(row.row_json) as GeoMetricObservation);
}
async function freezeSamples(
  env: CloudflareBindings,
  userId: string,
  samples: GeoDailySample[],
  eventId: string | null,
  at: Date,
) {
  // Set insertion keeps the number of D1 statements bounded for multi-engine samples.
  for (let offset = 0; offset < samples.length; offset += 100) {
    const batch = await Promise.all(
      samples.slice(offset, offset + 100).map(async (sample) => ({
        ...sample,
        id: await geoHash([sample.series, sample.cohort, sample.day]),
      })),
    );
    await sql(
      env,
      `INSERT OR IGNORE INTO geo_measurement_samples(id,project_id,event_id,observation_id,analysis_id,series,cohort,day,sample_json,frozen_at)
      SELECT json_extract(j.value,'$.id'),o.project_id,?,o.id,json_extract(j.value,'$.analysisId'),json_extract(j.value,'$.series'),json_extract(j.value,'$.cohort'),json_extract(j.value,'$.day'),j.value,?
      FROM json_each(?) j JOIN geo_observations o ON o.id=json_extract(j.value,'$.observationId') JOIN projects p ON p.id=o.project_id WHERE p.user_id=?
      AND (? IS NULL OR EXISTS(SELECT 1 FROM geo_action_events e WHERE e.id=? AND e.project_id=p.id AND e.kind='completed'))`,
      eventId,
      at.getTime(),
      JSON.stringify(batch),
      userId,
      eventId,
      eventId,
    ).run();
  }
}
async function savedSamples(
  env: CloudflareBindings,
  userId: string,
  series: string,
  observationIds?: string[],
): Promise<GeoDailySample[]> {
  const rows = await sql(
    env,
    `SELECT s.sample_json FROM geo_measurement_samples s JOIN projects p ON p.id=s.project_id WHERE p.user_id=? AND s.series=? ${observationIds ? 'AND s.observation_id IN (SELECT value FROM json_each(?))' : ''} ORDER BY s.day,s.cohort`,
    userId,
    series,
    ...(observationIds ? [JSON.stringify(observationIds)] : []),
  ).all<{ sample_json: string }>();
  return rows.results.map((row) => JSON.parse(row.sample_json) as GeoDailySample);
}
export async function readGeoTrends(
  env: CloudflareBindings,
  userId: string,
  filter: GeoEvidenceFilter = {},
  at = new Date(),
) {
  if (
    filter.days !== undefined &&
    (!Number.isInteger(filter.days) || filter.days < 1 || filter.days > 30)
  )
    throw new Error('INVALID_EVIDENCE_PERIOD');
  const rows = await metricRows(env, userId, filter, at);
  await freezeSamples(env, userId, await dailySamples(rows, 'trend'), null, at);
  const availableIds = new Set(rows.map((row) => row.id));
  const samples = await savedSamples(env, userId, 'trend', Array.from(availableIds));
  return {
    version: geoMeasurementVersion,
    asOf: at.toISOString(),
    samples,
    captures: availableIds.size,
    classifiedCaptures: new Set(
      rows
        .filter(
          (row) => row.analysis?.scope === 'complete' && row.analysis.answerQuality === 'usable',
        )
        .map((row) => row.id),
    ).size,
    method:
      'First eligible captured answer per prompt version, engine, material configuration, metric and UTC day; frozen when first evaluated. Later manual answers remain evidence. Unknowns are excluded. Rates are provisional pending classifier evaluation.',
  };
}
interface FrozenCohort {
  scope: GeoActionScope;
  keys: Record<GeoMetric, string | null>;
}
async function transition(
  env: CloudflareBindings,
  userId: string,
  id: string,
  input: GeoCompletion | GeoReopen,
  kind: 'completed' | 'reopened',
  at: Date,
) {
  const detail = await readGeoAction(env, userId, id),
    action = detail.action,
    bodyHash = await geoHash({ id, kind, ...input });
  const replay = await sql(
    env,
    'SELECT body_hash FROM geo_action_events WHERE project_id=? AND request_id=?',
    action.projectId,
    input.requestId,
  ).first<{ body_hash: string }>();
  if (replay) {
    if (replay.body_hash !== bodyHash) throw new Error('IDEMPOTENCY_CONFLICT');
    return action;
  }
  if (
    (kind === 'completed' && ['completed', 'dismissed'].includes(action.status)) ||
    (kind === 'reopened' && action.status !== 'completed')
  )
    throw new Error('GEO_ACTION_CHANGED');
  const baseline =
    kind === 'completed'
      ? await metricRows(
          env,
          userId,
          { observationIds: action.scopes.map((scope) => scope.observationId) },
          at,
        )
      : [];
  const cohorts: FrozenCohort[] = await Promise.all(
    action.scopes.map(async (scope) => {
      const row = baseline.find(
        (row) => row.id === scope.observationId && row.analysis?.id === scope.analysisId,
      );
      const keys = Object.fromEntries(
        await Promise.all(
          geoMetrics.map(async (metric) => [
            metric,
            row ? await measurementCohort(row, metric) : null,
          ]),
        ),
      ) as Record<GeoMetric, string | null>;
      return { scope, keys };
    }),
  );
  const eventId = crypto.randomUUID();
  await env.DB.batch([
    sql(
      env,
      `INSERT OR IGNORE INTO geo_action_events(id,project_id,action_id,request_id,body_hash,kind,details_json,scope_json,evidence_json,recorded_at)
      SELECT ?,a.project_id,a.id,?,?,?,?,?,?,? FROM geo_actions a JOIN projects p ON p.id=a.project_id WHERE a.id=? AND p.user_id=? AND a.revision=? AND a.status=?`,
      eventId,
      input.requestId,
      bodyHash,
      kind,
      JSON.stringify({ ...input, measurementVersion: geoMeasurementVersion, cohorts }),
      JSON.stringify(action.scopes),
      JSON.stringify(detail.evidence.map((proof) => proof.observationId)),
      at.getTime(),
      id,
      userId,
      input.revision,
      action.status,
    ),
    sql(
      env,
      `UPDATE geo_actions SET status=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM geo_action_events WHERE id=? AND action_id=geo_actions.id)`,
      kind === 'completed' ? 'completed' : 'in_progress',
      at.getTime(),
      id,
      input.revision,
      eventId,
    ),
  ]);
  const saved = await sql(
    env,
    'SELECT body_hash FROM geo_action_events WHERE project_id=? AND request_id=?',
    action.projectId,
    input.requestId,
  ).first<{ body_hash: string }>();
  if (!saved) throw new Error('GEO_ACTION_CHANGED');
  if (saved.body_hash !== bodyHash) throw new Error('IDEMPOTENCY_CONFLICT');
  return (await readGeoAction(env, userId, id)).action;
}
export async function completeGeoAction(
  env: CloudflareBindings,
  userId: string,
  id: string,
  body: GeoCompletion,
  at = new Date(),
) {
  const input = geoCompletionSchema.parse(body);
  if (new Date(input.implementedAt).getTime() > at.getTime())
    throw new Error('INVALID_IMPLEMENTATION_TIME');
  return transition(env, userId, id, input, 'completed', at);
}
export async function reopenGeoAction(
  env: CloudflareBindings,
  userId: string,
  id: string,
  body: GeoReopen,
  at = new Date(),
) {
  return transition(env, userId, id, geoReopenSchema.parse(body), 'reopened', at);
}
export async function readGeoMeasurements(
  env: CloudflareBindings,
  userId: string,
  actionId: string,
  at = new Date(),
): Promise<GeoPinMeasurement[]> {
  const detail = await readGeoAction(env, userId, actionId);
  const active = await sql(
    env,
    `SELECT q.id FROM prompts q JOIN projects p ON p.id=q.project_id WHERE p.user_id=? AND q.enabled=1 AND q.archived_at IS NULL`,
    userId,
  ).all<{ id: string }>();
  const settings = await sql(
    env,
    'SELECT s.engines_json FROM geo_settings s JOIN projects p ON p.id=s.project_id WHERE p.user_id=?',
    userId,
  ).first<{ engines_json: string }>();
  const engines = settings ? (JSON.parse(settings.engines_json) as string[]) : [];
  const pins: GeoPinMeasurement[] = [];
  for (const event of detail.events.filter((event) => event.kind === 'completed')) {
    const { requestId, revision, implementedAt, changeDescription, changeUrl } = event.details;
    const input = geoCompletionSchema.parse({
        requestId,
        revision,
        implementedAt,
        changeDescription,
        ...(changeUrl ? { changeUrl } : {}),
      }),
      cutoff = new Date(input.implementedAt).getTime();
    const beforeWindow = {
        from: new Date(cutoff - 7 * DAY).toISOString(),
        to: input.implementedAt,
      },
      afterWindow = { from: input.implementedAt, to: new Date(cutoff + 7 * DAY).toISOString() };
    const cohorts = event.details.cohorts as FrozenCohort[];
    const rows = await metricRows(
      env,
      userId,
      { from: cutoff - 7 * DAY, to: Math.min(at.getTime(), cutoff + 7 * DAY) },
      at,
    );
    for (const [side, window] of [
      ['before', beforeWindow],
      ['after', { ...afterWindow, requestedAfter: input.implementedAt }],
    ] as const) {
      await freezeSamples(
        env,
        userId,
        await dailySamples(rows, `${event.id}:${side}`, window),
        event.id,
        at,
      );
    }
    const before = await savedSamples(env, userId, `${event.id}:before`),
      after = await savedSamples(env, userId, `${event.id}:after`);
    const metrics = geoMetrics.map((metric) => {
      const expected = cohorts.map((cohort) => cohort.keys[metric]);
      const left = before.filter(
          (sample) => sample.metric === metric && expected.includes(sample.cohort),
        ),
        right = after.filter(
          (sample) => sample.metric === metric && expected.includes(sample.cohort),
        );
      const scopeComplete =
        cohorts.length > 0 &&
        cohorts.every(
          (cohort) =>
            active.results.some((prompt) => prompt.id === cohort.scope.context.promptId) &&
            engines.includes(cohort.scope.context.engine) &&
            cohort.keys[metric] !== null &&
            left.some((sample) => sample.cohort === cohort.keys[metric]) &&
            right.some((sample) => sample.cohort === cohort.keys[metric]),
        );
      return {
        metric,
        ...compareCohortSamples(left, right, expected, scopeComplete),
      };
    });
    pins.push({
      eventId: event.id,
      actionId,
      recordedAt: event.recordedAt,
      implementedAt: input.implementedAt,
      changeDescription: input.changeDescription,
      changeUrl: input.changeUrl ?? null,
      version: geoMeasurementVersion,
      beforeWindow,
      afterWindow,
      windowComplete: at.getTime() >= cutoff + 7 * DAY,
      cohorts,
      metrics,
      limitations: [
        'Descriptive correlation; no causal or financial ROI attribution.',
        'Seven-day windows; one sample on each side permits a limited-data comparison. Unknowns, incompatible models/configurations and missing scopes are inconclusive.',
        'After samples must come from requests started at or after implementation. Classifier results require review; provider model aliases may change underlying weights.',
        'Google/Bing comparisons use reported configuration; upstream model versions are unavailable. Inline linkage is measured only when verified capability is present.',
      ],
    });
  }
  return pins;
}
