import { actionCandidates, sourceOpportunities } from '../../domain/geo-playbooks';
import { geoHash, type GeoEngine } from '../../shared/geo';
import { belongsToDomain } from '../../domain/geo-classification';
import { canonicalSourceUrl } from '../../domain/evidence';
import { measurementCohort } from '../../domain/geo-measurement';
import { geoVersions } from '../../shared/geo-analysis';
import type { GeoMetricObservation } from '../../shared/geo-measurement';
import { getConfig } from '../config';
import { readCurrentGeoContexts } from './geo-store';
import {
  geoActionPatchSchema,
  geoFollowUpSchema,
  type GeoFollowUpInput,
  type GeoAction,
  type GeoActionCandidate,
  type GeoActionDetail,
  type GeoActionEvent,
  type GeoActionPatch,
  type GeoActionScope,
  type GeoAnalyzedObservation,
} from '../../shared/geo-actions';

const sql = (env: CloudflareBindings, query: string, ...values: unknown[]) =>
  env.DB.prepare(query).bind(...values);
export interface GeoEvidenceFilter {
  days?: number;
  engine?: GeoEngine;
  promptId?: string;
}
export async function readAnalyzedGeoEvidence(
  env: CloudflareBindings,
  userId: string,
  filter: GeoEvidenceFilter = {},
  at = new Date(),
): Promise<GeoAnalyzedObservation[]> {
  const days = filter.days ?? 30;
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error('INVALID_EVIDENCE_PERIOD');
  const rows = await sql(
    env,
    `SELECT json_object('id',o.id,'projectId',o.project_id,'runId',o.run_id,'itemId',o.item_id,'promptVersionId',o.prompt_version_id,'engine',o.engine,
    'capturedAt',strftime('%Y-%m-%dT%H:%M:%fZ',o.captured_at/1000.0,'unixepoch'),'context',json(o.context_json),
    'capture',json(json_set(o.capture_json,'$.raw',NULL,'$.answerText',substr(o.answer_text,1,1600),'$.textParts',json('[]')))) AS observation_json,
    json_object('id',a.id,'state',a.state,'createdAt',strftime('%Y-%m-%dT%H:%M:%fZ',a.created_at/1000.0,'unixepoch'),
    'classification',json_object('answerQuality',json_extract(a.result_json,'$.classification.answerQuality'),'scope',json_extract(a.result_json,'$.classification.scope'),'competitors',json_extract(a.result_json,'$.classification.competitors')),
    'diagnoses',json_extract(a.result_json,'$.diagnoses')) AS analysis_json
    FROM geo_observations o JOIN projects p ON p.id=o.project_id JOIN geo_processing_attempts a ON a.observation_id=o.id
    WHERE p.user_id=? AND a.kind='analysis' AND a.state='completed' AND o.captured_at>=? AND o.captured_at<=?
    ${filter.engine ? 'AND o.engine=?' : ''} ${filter.promptId ? "AND json_extract(o.context_json,'$.promptId')=?" : ''}
    ORDER BY o.captured_at,a.created_at,a.id LIMIT 2001`,
    userId,
    at.getTime() - days * 86400_000,
    at.getTime(),
    ...(filter.engine ? [filter.engine] : []),
    ...(filter.promptId ? [filter.promptId] : []),
  ).all<{ observation_json: string; analysis_json: string }>();
  if (rows.results.length > 2000) throw new Error('GEO_SCOPE_TOO_LARGE');
  return rows.results.map((row) => ({
    observation: JSON.parse(row.observation_json) as GeoAnalyzedObservation['observation'],
    analysis: JSON.parse(row.analysis_json) as GeoAnalyzedObservation['analysis'],
  }));
}
export async function readGeoSources(
  env: CloudflareBindings,
  userId: string,
  filter: GeoEvidenceFilter = {},
  at = new Date(),
) {
  return sourceOpportunities(await readAnalyzedGeoEvidence(env, userId, filter, at));
}
interface ActionRow {
  id: string;
  project_id: string;
  dedupe_key: string;
  candidate_json: string;
  status: GeoAction['status'];
  revision: number;
  checked_ids_json: string;
  notes: string;
  created_at: number;
  updated_at: number;
}
interface EvidenceRow {
  id: string;
  action_id: string;
  observation_id: string;
  analysis_id: string;
  scope_json: string;
  evidence_ids_json: string;
  created_at: number;
}
interface EventRow {
  id: string;
  action_id: string;
  kind: GeoActionEvent['kind'];
  details_json: string;
  scope_json: string;
  evidence_json: string;
  recorded_at: number;
  body_hash: string;
}
interface ActionProofSummary {
  action_id: string;
  evidence_count: number;
  scopes_json: string;
}
async function proofSummaries(env: CloudflareBindings, ids: string[]) {
  return sql(
    env,
    `WITH ranked AS (
      SELECT action_id,scope_json,created_at,id,count(*) OVER(PARTITION BY action_id) AS evidence_count,
      row_number() OVER(PARTITION BY action_id,json_extract(scope_json,'$.context.promptId'),json_extract(scope_json,'$.context.engine') ORDER BY created_at DESC,id DESC) AS rank
      FROM geo_action_evidence WHERE action_id IN (SELECT value FROM json_each(?))
    ) SELECT action_id,max(evidence_count) AS evidence_count,json_group_array(json(scope_json)) AS scopes_json
    FROM (SELECT * FROM ranked WHERE rank=1 ORDER BY created_at DESC,id DESC) GROUP BY action_id`,
    JSON.stringify(ids),
  ).all<ActionProofSummary>();
}
function actionView(row: ActionRow, proof?: ActionProofSummary): GeoAction {
  const candidate = JSON.parse(row.candidate_json) as GeoActionCandidate;
  return {
    ...candidate,
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    revision: row.revision,
    checkedIds: JSON.parse(row.checked_ids_json) as string[],
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    evidenceCount: proof?.evidence_count ?? 0,
    scopes: proof ? (JSON.parse(proof.scopes_json) as GeoActionScope[]) : [],
  };
}
async function ownedAction(env: CloudflareBindings, userId: string, id: string) {
  const row = await sql(
    env,
    'SELECT a.* FROM geo_actions a JOIN projects p ON p.id=a.project_id WHERE a.id=? AND p.user_id=?',
    id,
    userId,
  ).first<ActionRow>();
  if (!row) throw new Error('GEO_ACTION_NOT_FOUND');
  return row;
}
export async function syncGeoActions(env: CloudflareBindings, userId: string, at = new Date()) {
  const candidates = actionCandidates(await readAnalyzedGeoEvidence(env, userId, {}, at));
  for (const candidate of candidates) {
    const projectId = candidate.evidence[0]?.scope.context.projectId;
    if (!projectId) continue;
    const id = await geoHash(candidate.dedupeKey),
      { evidence, ...brief } = candidate;
    const savedProof = await sql(
      env,
      'SELECT analysis_id FROM geo_action_evidence WHERE action_id=?',
      id,
    ).all<{ analysis_id: string }>();
    const existingIds = new Set(savedProof.results.map((proof) => proof.analysis_id));
    const statements = [
      sql(
        env,
        `INSERT INTO geo_actions(id,project_id,dedupe_key,candidate_json,created_at,updated_at)
      SELECT ?,p.id,?,?,?,? FROM projects p WHERE p.id=? AND p.user_id=?
      ON CONFLICT(project_id,dedupe_key) DO UPDATE SET candidate_json=excluded.candidate_json
      WHERE geo_actions.status IN ('proposed','accepted','in_progress')`,
        id,
        candidate.dedupeKey,
        JSON.stringify(brief),
        at.getTime(),
        at.getTime(),
        projectId,
        userId,
      ),
    ];
    for (const proof of evidence.filter((proof) => !existingIds.has(proof.analysisId)))
      statements.push(
        sql(
          env,
          `INSERT OR IGNORE INTO geo_action_evidence(id,action_id,observation_id,analysis_id,scope_json,evidence_ids_json,created_at)
      SELECT ?,a.id,?,?,?,?,? FROM geo_actions a JOIN projects p ON p.id=a.project_id
      WHERE a.id=? AND p.user_id=? AND EXISTS(SELECT 1 FROM geo_observations o JOIN geo_processing_attempts r ON r.observation_id=o.id WHERE o.id=? AND r.id=? AND o.project_id=p.id AND r.state='completed')`,
          await geoHash([id, proof.analysisId]),
          proof.observationId,
          proof.analysisId,
          JSON.stringify(proof.scope),
          JSON.stringify(proof.evidenceIds),
          new Date(proof.scope.capturedAt).getTime(),
          id,
          userId,
          proof.observationId,
          proof.analysisId,
        ),
      );
    await env.DB.batch(statements);
  }
}
export async function readGeoActions(
  env: CloudflareBindings,
  userId: string,
): Promise<GeoAction[]> {
  const rows = await sql(
    env,
    "SELECT a.* FROM geo_actions a JOIN projects p ON p.id=a.project_id WHERE p.user_id=? ORDER BY CASE WHEN a.status IN ('completed','dismissed') THEN 1 ELSE 0 END,CAST(json_extract(a.candidate_json,'$.priority') AS INTEGER),a.updated_at DESC,a.id LIMIT 100",
    userId,
  ).all<ActionRow>();
  if (!rows.results.length) return [];
  const proofs = await proofSummaries(
      env,
      rows.results.map((row) => row.id),
    ),
    byAction = new Map(proofs.results.map((proof) => [proof.action_id, proof]));
  return rows.results
    .map((row) => actionView(row, byAction.get(row.id)))
    .sort((a, b) => a.priority - b.priority || b.updatedAt.localeCompare(a.updatedAt));
}
export async function readGeoAction(
  env: CloudflareBindings,
  userId: string,
  id: string,
  cursor?: string,
): Promise<GeoActionDetail> {
  const row = await ownedAction(env, userId, id);
  if (cursor && !/^\d{1,16}\.[a-f0-9]{64}$/u.test(cursor)) throw new Error('INVALID_CURSOR');
  const [time, proofId] = cursor?.split('.') ?? [];
  const page = await sql(
    env,
    `SELECT * FROM geo_action_evidence WHERE action_id=?
    ${cursor ? 'AND (created_at<? OR (created_at=? AND id<?))' : ''}
    ORDER BY created_at DESC,id DESC LIMIT 51`,
    id,
    ...(cursor ? [Number(time), Number(time), proofId] : []),
  ).all<EvidenceRow>();
  const summary = await proofSummaries(env, [id]),
    proof = page.results.slice(0, 50),
    last = proof.at(-1);
  const events = await sql(
    env,
    'SELECT * FROM geo_action_events WHERE action_id=? ORDER BY recorded_at DESC,id DESC',
    id,
  ).all<EventRow>();
  return {
    action: actionView(row, summary.results[0]),
    evidence: proof.map((item) => ({
      observationId: item.observation_id,
      analysisId: item.analysis_id,
      scope: JSON.parse(item.scope_json) as GeoActionScope,
      evidenceIds: JSON.parse(item.evidence_ids_json) as string[],
    })),
    events: events.results.map((event) => ({
      id: event.id,
      actionId: event.action_id,
      kind: event.kind,
      recordedAt: new Date(event.recorded_at).toISOString(),
      details: JSON.parse(event.details_json) as Record<string, unknown>,
      scopes: JSON.parse(event.scope_json) as GeoActionScope[],
      evidenceIds: JSON.parse(event.evidence_json) as string[],
    })),
    nextEvidenceCursor:
      page.results.length > 50 && last ? `${String(last.created_at)}.${last.id}` : null,
  };
}
export async function createGeoFollowUp(
  env: CloudflareBindings,
  userId: string,
  sourceId: string,
  body: GeoFollowUpInput,
  at = new Date(),
): Promise<GeoActionDetail> {
  const input = geoFollowUpSchema.parse(body),
    source = await ownedAction(env, userId, sourceId),
    candidate = JSON.parse(source.candidate_json) as Omit<GeoActionCandidate, 'evidence'>,
    bodyHash = await geoHash({ sourceId, ...input });
  const replay = await sql(
    env,
    'SELECT action_id,body_hash FROM geo_action_events WHERE project_id=? AND request_id=?',
    source.project_id,
    input.requestId,
  ).first<{ action_id: string; body_hash: string }>();
  if (replay) {
    if (replay.body_hash !== bodyHash) throw new Error('IDEMPOTENCY_CONFLICT');
    return readGeoAction(env, userId, replay.action_id);
  }
  if (source.revision !== input.revision) throw new Error('GEO_ACTION_CHANGED');
  if (candidate.category !== 'owned') throw new Error('INVALID_FOLLOW_UP_TARGET');
  const sourceProofs = await sql(
    env,
    'SELECT observation_id,analysis_id FROM geo_action_evidence WHERE action_id=? ORDER BY created_at DESC,id DESC LIMIT 2001',
    sourceId,
  ).all<{ observation_id: string; analysis_id: string }>();
  if (sourceProofs.results.length > 2000) throw new Error('GEO_SCOPE_TOO_LARGE');
  const proofs = await sql(
    env,
    `SELECT e.*,o.context_json,json_remove(o.capture_json,'$.raw','$.answerText','$.textParts') AS capture_json,
    o.captured_at,a.model,a.rubric_version,a.policy_version,
    json_object('classification',json_object('answerQuality',json_extract(a.result_json,'$.classification.answerQuality'),
      'scope',json_extract(a.result_json,'$.classification.scope'),'brandPresence',json_extract(a.result_json,'$.classification.brandPresence'),
      'brandStance',json_extract(a.result_json,'$.classification.brandStance'))) AS result_json
    FROM geo_action_evidence e JOIN geo_observations o ON o.id=e.observation_id
    JOIN geo_processing_attempts a ON a.id=e.analysis_id AND a.observation_id=o.id
    WHERE e.action_id=? AND o.project_id=? AND a.project_id=o.project_id AND a.kind='analysis' AND a.state='completed'
    AND EXISTS(SELECT 1 FROM json_each(?) j WHERE e.observation_id=json_extract(j.value,'$.observationId') AND e.analysis_id=json_extract(j.value,'$.analysisId'))
    ORDER BY e.created_at DESC,e.id DESC LIMIT 20`,
    sourceId,
    source.project_id,
    JSON.stringify(input.proofs),
  ).all<
    EvidenceRow & {
      context_json: string;
      capture_json: string;
      captured_at: number;
      model: string;
      rubric_version: string;
      policy_version: string;
      result_json: string;
    }
  >();
  const selected = input.proofs.map((proof) => {
    const row = proofs.results.find(
      (row) => row.observation_id === proof.observationId && row.analysis_id === proof.analysisId,
    );
    if (!row) throw new Error('INVALID_FOLLOW_UP_PROOF');
    return row;
  });
  if (new Set(input.proofs.map((proof) => proof.analysisId)).size !== input.proofs.length)
    throw new Error('INVALID_FOLLOW_UP_PROOF');
  const config = getConfig(env),
    scopes: GeoActionScope[] = [],
    pairs = new Set<string>();
  const contexts = selected.map(
    (proof) => JSON.parse(proof.context_json) as GeoActionScope['context'],
  );
  let currentContexts;
  try {
    currentContexts = await readCurrentGeoContexts(env, userId, contexts);
  } catch (error) {
    if (
      error instanceof Error &&
      [
        'PROJECT_NOT_FOUND',
        'GEO_CONFIGURATION_REQUIRED',
        'ENGINE_NOT_SELECTED',
        'INVALID_PROMPT_SELECTION',
      ].includes(error.message)
    )
      throw new Error('FOLLOW_UP_CONTEXT_CHANGED', { cause: error });
    throw error;
  }
  for (const [index, proof] of selected.entries()) {
    const context = contexts[index],
      current = currentContexts[index],
      capture = JSON.parse(proof.capture_json) as GeoMetricObservation['capture'],
      result = JSON.parse(proof.result_json) as {
        classification: NonNullable<GeoMetricObservation['analysis']>;
      };
    if (!context || !current) throw new Error('FOLLOW_UP_CONTEXT_CHANGED');
    const analysis = {
      ...result.classification,
      id: proof.analysis_id,
      model: proof.model,
      rubricVersion: proof.rubric_version,
      policyVersion: proof.policy_version,
    };
    if (
      capture.quality !== 'complete' ||
      analysis.answerQuality !== 'usable' ||
      analysis.scope !== 'complete'
    )
      throw new Error('INVALID_FOLLOW_UP_PROOF');
    const pair = `${context.promptId}:${context.engine}`;
    if (pairs.has(pair)) throw new Error('INVALID_FOLLOW_UP_PROOF');
    pairs.add(pair);
    const row = {
      id: proof.observation_id,
      projectId: source.project_id,
      capturedAt: new Date(proof.captured_at).toISOString(),
      requestedAt: new Date(proof.captured_at).toISOString(),
      context,
      capture,
      analysis,
    };
    const actual = await measurementCohort(row, 'mention'),
      expected = await measurementCohort(
        {
          ...row,
          context: current,
          analysis: {
            ...analysis,
            model: config.GEO_CLASSIFIER_MODEL,
            rubricVersion: geoVersions.rubric,
            policyVersion: geoVersions.policy,
          },
        },
        'mention',
      );
    if (!actual || actual !== expected) throw new Error('FOLLOW_UP_CONTEXT_CHANGED');
    if (
      !canonicalSourceUrl(input.targetUrl) ||
      !belongsToDomain(input.targetUrl, current.brand.domain)
    )
      throw new Error('INVALID_FOLLOW_UP_TARGET');
    scopes.push({
      observationId: proof.observation_id,
      analysisId: proof.analysis_id,
      context,
      capturedAt: row.capturedAt,
    });
  }
  const dedupeKey = JSON.stringify(['follow-up', source.project_id, sourceId, input.requestId]),
    id = await geoHash(dedupeKey),
    eventId = await geoHash([id, 'accepted']),
    brief = {
      ...candidate,
      dedupeKey,
      targetUrl: input.targetUrl,
      reason: input.changeDescription,
    },
    details = {
      sourceActionId: sourceId,
      sourceRevision: input.revision,
      selectedProofs: input.proofs,
      excludedProofs: sourceProofs.results
        .filter(
          (proof) => !input.proofs.some((selected) => selected.analysisId === proof.analysis_id),
        )
        .map((proof) => ({ observationId: proof.observation_id, analysisId: proof.analysis_id })),
      targetUrl: input.targetUrl,
      changeDescription: input.changeDescription,
    };
  const proofIds = await Promise.all(selected.map((proof) => geoHash([id, proof.analysis_id])));
  await env.DB.batch([
    sql(
      env,
      `INSERT OR IGNORE INTO geo_actions(id,project_id,dedupe_key,candidate_json,status,created_at,updated_at)
      SELECT ?,s.project_id,?,?,'accepted',?,? FROM geo_actions s JOIN projects p ON p.id=s.project_id
      WHERE s.id=? AND p.user_id=? AND s.revision=?
      AND NOT EXISTS(SELECT 1 FROM geo_action_events e WHERE e.project_id=p.id AND e.request_id=?)
      AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(
        SELECT 1 FROM geo_action_evidence e JOIN geo_observations o ON o.id=e.observation_id
        JOIN geo_processing_attempts r ON r.id=e.analysis_id AND r.observation_id=o.id
        WHERE e.action_id=s.id AND e.observation_id=json_extract(j.value,'$.observationId')
        AND e.analysis_id=json_extract(j.value,'$.analysisId') AND o.project_id=p.id AND r.project_id=p.id
        AND r.kind='analysis' AND r.state='completed' AND json_extract(o.capture_json,'$.quality')='complete'
        AND json_extract(r.result_json,'$.classification.answerQuality')='usable' AND json_extract(r.result_json,'$.classification.scope')='complete'))
      AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE NOT EXISTS(
        SELECT 1 FROM prompts q JOIN geo_settings g ON g.project_id=q.project_id
        WHERE q.id=json_extract(j.value,'$.promptId') AND q.project_id=p.id AND q.enabled=1 AND q.archived_at IS NULL
        AND q.text=json_extract(j.value,'$.promptText') AND p.context_version=json_extract(j.value,'$.contextVersion')
        AND g.revision=json_extract(j.value,'$.settingsRevision')))`,
      id,
      dedupeKey,
      JSON.stringify(brief),
      at.getTime(),
      at.getTime(),
      sourceId,
      userId,
      input.revision,
      input.requestId,
      JSON.stringify(input.proofs),
      JSON.stringify(currentContexts),
    ),
    sql(
      env,
      `INSERT OR IGNORE INTO geo_action_events(id,project_id,action_id,request_id,body_hash,kind,details_json,scope_json,evidence_json,recorded_at)
      SELECT ?,a.project_id,a.id,?,?,'accepted',?,?,?,? FROM geo_actions a WHERE a.id=? AND a.dedupe_key=?`,
      eventId,
      input.requestId,
      bodyHash,
      JSON.stringify(details),
      JSON.stringify(scopes),
      JSON.stringify(input.proofs.map((proof) => proof.observationId)),
      at.getTime(),
      id,
      dedupeKey,
    ),
    ...selected.map((proof, index) => {
      return sql(
        env,
        `INSERT OR IGNORE INTO geo_action_evidence(id,action_id,observation_id,analysis_id,scope_json,evidence_ids_json,created_at)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM geo_action_events WHERE id=? AND body_hash=?)`,
        proofIds[index],
        id,
        proof.observation_id,
        proof.analysis_id,
        JSON.stringify(scopes[index]),
        proof.evidence_ids_json,
        proof.captured_at,
        eventId,
        bodyHash,
      );
    }),
  ]);
  const saved = await sql(
    env,
    'SELECT action_id,body_hash FROM geo_action_events WHERE project_id=? AND request_id=?',
    source.project_id,
    input.requestId,
  ).first<{ action_id: string; body_hash: string }>();
  if (!saved) throw new Error('GEO_ACTION_CHANGED');
  if (saved.body_hash !== bodyHash) throw new Error('IDEMPOTENCY_CONFLICT');
  return readGeoAction(env, userId, saved.action_id);
}
export async function patchGeoAction(
  env: CloudflareBindings,
  userId: string,
  id: string,
  input: GeoActionPatch,
  at = new Date(),
): Promise<GeoAction> {
  const patch = geoActionPatchSchema.parse(input),
    row = await ownedAction(env, userId, id),
    bodyHash = await geoHash({ id, ...patch });
  const replay = await sql(
    env,
    'SELECT body_hash FROM geo_action_events WHERE project_id=? AND request_id=?',
    row.project_id,
    patch.requestId,
  ).first<{ body_hash: string }>();
  if (replay) {
    if (replay.body_hash !== bodyHash) throw new Error('IDEMPOTENCY_CONFLICT');
    return (await readGeoAction(env, userId, id)).action;
  }
  if (row.status === 'completed') throw new Error('GEO_ACTION_REOPEN_REQUIRED');
  const candidate = JSON.parse(row.candidate_json) as GeoActionCandidate;
  if (
    patch.checkedIds &&
    (new Set(patch.checkedIds).size !== patch.checkedIds.length ||
      patch.checkedIds.some((step) => !candidate.checklist.some((item) => item.id === step)))
  )
    throw new Error('INVALID_CHECKLIST');
  const eventId = crypto.randomUUID(),
    kind =
      patch.status === 'accepted'
        ? 'accepted'
        : patch.status === 'dismissed'
          ? 'dismissed'
          : 'progress';
  await env.DB.batch([
    sql(
      env,
      `INSERT OR IGNORE INTO geo_action_events(id,project_id,action_id,request_id,body_hash,kind,details_json,scope_json,evidence_json,recorded_at)
      SELECT ?,a.project_id,a.id,?,?,?,?, '[]','[]',? FROM geo_actions a JOIN projects p ON p.id=a.project_id WHERE a.id=? AND p.user_id=? AND a.revision=? AND a.status<>'completed'`,
      eventId,
      patch.requestId,
      bodyHash,
      kind,
      JSON.stringify(patch),
      at.getTime(),
      id,
      userId,
      patch.revision,
    ),
    sql(
      env,
      `UPDATE geo_actions SET status=?,checked_ids_json=?,notes=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?
      AND EXISTS(SELECT 1 FROM geo_action_events WHERE id=? AND action_id=geo_actions.id) AND EXISTS(SELECT 1 FROM projects WHERE id=geo_actions.project_id AND user_id=?)`,
      patch.status ?? row.status,
      patch.checkedIds ? JSON.stringify(patch.checkedIds) : row.checked_ids_json,
      patch.notes ?? row.notes,
      at.getTime(),
      id,
      patch.revision,
      eventId,
      userId,
    ),
  ]);
  const saved = await sql(
    env,
    'SELECT body_hash FROM geo_action_events WHERE project_id=? AND request_id=?',
    row.project_id,
    patch.requestId,
  ).first<{ body_hash: string }>();
  if (!saved) throw new Error('GEO_ACTION_CHANGED');
  if (saved.body_hash !== bodyHash) throw new Error('IDEMPOTENCY_CONFLICT');
  return (await readGeoAction(env, userId, id)).action;
}
