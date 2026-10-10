import {
  geoHash,
  geoPayloadHash,
  geoRunRequestSchema,
  geoSettingsSchema,
  geoPromptSetSchema,
  geoSurfaces,
  type GeoAllowance,
  type GeoCapture,
  type GeoEngine,
  type GeoItemStatus,
  type GeoObservation,
  type GeoObservationPage,
  type GeoPromptSet,
  type GeoPromptSetInput,
  type GeoRequestContext,
  type GeoRun,
  type GeoRunItem,
  type GeoRunRequest,
  type GeoSettings,
  type GeoSettingsInput,
} from '../../shared/geo';
import { getConfig, globalCollectorCallCap } from '../config';
import { paidProjectSql } from '../scan-policy';

const COOLDOWN = 300_000;
const paidGate = `${paidProjectSql} AND NOT EXISTS(SELECT 1 FROM pilot_enrollments e WHERE e.user_id=p.user_id AND e.paid_starts_at>?)`;
const sql = (env: CloudflareBindings, query: string, ...params: unknown[]) =>
  env.DB.prepare(query).bind(...params);
const dateOf = (at: Date) => at.toISOString().slice(0, 10);
const iso = (at: number | null) => (at === null ? null : new Date(at).toISOString());

interface ProjectRow {
  id: string;
  user_id: string;
  brand_name: string;
  canonical_domain: string;
  context_version: number;
  updated_at: number;
}
interface PromptRow {
  id: string;
  text: string;
  updated_at: number;
}
interface SettingsRow {
  project_id: string;
  engines_json: string;
  daily_enabled: number;
  language_code: string;
  location_code: number;
  device: 'desktop' | 'mobile';
  revision: number;
}
export interface GeoItemRow {
  id: string;
  run_id: string;
  project_id: string;
  prompt_id: string;
  prompt_version_id: string;
  engine: GeoEngine;
  status: GeoItemStatus;
  context_json: string;
  reservation_id: string;
  provider_task_id: string | null;
  attempts_used: number;
  due_at: number;
  lease_token: string | null;
  lease_until: number | null;
  submitted_at: number | null;
  terminal_reason: string | null;
  created_at: number;
}

async function projectFor(env: CloudflareBindings, userId: string): Promise<ProjectRow> {
  const project = await sql(
    env,
    'SELECT * FROM projects WHERE user_id=?',
    userId,
  ).first<ProjectRow>();
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  return project;
}
async function hasPaidAccess(env: CloudflareBindings, userId: string, at: Date) {
  return Boolean(
    await sql(
      env,
      `SELECT p.id FROM projects p WHERE p.user_id=? AND ${paidProjectSql}`,
      userId,
      at.getTime(),
    ).first(),
  );
}
async function paidStartPending(env: CloudflareBindings, userId: string, at: Date) {
  return Boolean(
    await sql(
      env,
      'SELECT user_id FROM pilot_enrollments WHERE user_id=? AND paid_starts_at>?',
      userId,
      at.getTime(),
    ).first(),
  );
}

export async function readGeoSettings(
  env: CloudflareBindings,
  userId: string,
): Promise<GeoSettings> {
  const project = await projectFor(env, userId);
  const row = await sql(
    env,
    'SELECT * FROM geo_settings WHERE project_id=?',
    project.id,
  ).first<SettingsRow>();
  if (!row)
    return {
      projectId: project.id,
      engines: ['perplexity'],
      dailyEnabled: false,
      languageCode: 'en',
      locationCode: 2840,
      device: 'desktop',
      revision: 0,
      configured: false,
    };
  return {
    projectId: project.id,
    engines: geoSettingsSchema.shape.engines.parse(JSON.parse(row.engines_json)),
    dailyEnabled: row.daily_enabled === 1,
    languageCode: row.language_code,
    locationCode: row.location_code,
    device: row.device,
    revision: row.revision,
    configured: true,
  };
}

export async function saveGeoSettings(
  env: CloudflareBindings,
  userId: string,
  value: GeoSettingsInput,
  at = new Date(),
) {
  const input = geoSettingsSchema.parse(value),
    project = await projectFor(env, userId);
  if (input.dailyEnabled && !(await hasPaidAccess(env, userId, at)))
    throw new Error('PAID_ACCESS_REQUIRED');
  await sql(
    env,
    `INSERT INTO geo_settings
    (project_id,engines_json,daily_enabled,language_code,location_code,device,revision,updated_at)
    SELECT ?,?,?,?,?,?,1,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND user_id=?)
    ON CONFLICT(project_id) DO UPDATE SET engines_json=excluded.engines_json,
    daily_enabled=excluded.daily_enabled,language_code=excluded.language_code,
    location_code=excluded.location_code,device=excluded.device,
    revision=geo_settings.revision+1,updated_at=excluded.updated_at
    WHERE geo_settings.engines_json<>excluded.engines_json OR geo_settings.daily_enabled<>excluded.daily_enabled
    OR geo_settings.language_code<>excluded.language_code OR geo_settings.location_code<>excluded.location_code
    OR geo_settings.device<>excluded.device`,
    project.id,
    JSON.stringify([...input.engines].sort()),
    input.dailyEnabled ? 1 : 0,
    input.languageCode,
    input.locationCode,
    input.device,
    at.getTime(),
    project.id,
    userId,
  ).run();
  await reconcileGeoItems(env, at);
  return readGeoSettings(env, userId);
}

export async function readGeoPromptSets(
  env: CloudflareBindings,
  userId: string,
): Promise<GeoPromptSet[]> {
  const project = await projectFor(env, userId);
  const rows = await sql(
    env,
    'SELECT * FROM geo_prompt_sets WHERE project_id=? ORDER BY name,id',
    project.id,
  ).all<{ id: string; name: string; prompt_ids_json: string; updated_at: number }>();
  return rows.results.map((row) => ({
    id: row.id,
    name: row.name,
    promptIds: JSON.parse(row.prompt_ids_json) as string[],
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

async function selectedPrompts(env: CloudflareBindings, projectId: string, promptIds?: string[]) {
  const rows = await sql(
    env,
    `SELECT id,text,updated_at FROM prompts
    WHERE project_id=? AND enabled=1 AND archived_at IS NULL ORDER BY id`,
    projectId,
  ).all<PromptRow>();
  const selected = promptIds
    ? rows.results.filter((row) => promptIds.includes(row.id))
    : rows.results;
  if (
    !selected.length ||
    selected.length > 10 ||
    (promptIds && selected.length !== promptIds.length)
  )
    throw new Error('INVALID_PROMPT_SELECTION');
  return selected;
}
const promptVersionId = (prompt: PromptRow) => geoHash([prompt.id, prompt.text]);
const versionStatement = (
  env: CloudflareBindings,
  projectId: string,
  prompt: PromptRow,
  id: string,
  at: Date,
) =>
  sql(
    env,
    `INSERT OR IGNORE INTO geo_prompt_versions(id,project_id,prompt_id,text,created_at)
    SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM prompts WHERE id=? AND project_id=?)`,
    id,
    projectId,
    prompt.id,
    prompt.text,
    at.getTime(),
    prompt.id,
    projectId,
  );

export async function saveGeoPromptSet(
  env: CloudflareBindings,
  userId: string,
  value: GeoPromptSetInput,
  at = new Date(),
) {
  const input = geoPromptSetSchema.parse(value),
    project = await projectFor(env, userId);
  const prompts = await selectedPrompts(env, project.id, input.promptIds);
  const versioned = await Promise.all(
    prompts.map(async (prompt) => ({ prompt, versionId: await promptVersionId(prompt) })),
  );
  if (
    input.id &&
    !(await sql(
      env,
      'SELECT id FROM geo_prompt_sets WHERE id=? AND project_id=?',
      input.id,
      project.id,
    ).first())
  )
    throw new Error('PROMPT_SET_NOT_FOUND');
  const id = input.id ?? crypto.randomUUID();
  await env.DB.batch([
    ...versioned.map(({ prompt, versionId }) =>
      versionStatement(env, project.id, prompt, versionId, at),
    ),
    sql(
      env,
      `INSERT INTO geo_prompt_sets(id,project_id,name,prompt_ids_json,prompt_version_ids_json,updated_at)
      SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND user_id=?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,prompt_ids_json=excluded.prompt_ids_json,
      prompt_version_ids_json=excluded.prompt_version_ids_json,updated_at=excluded.updated_at
      WHERE geo_prompt_sets.project_id=excluded.project_id`,
      id,
      project.id,
      input.name,
      JSON.stringify(prompts.map((prompt) => prompt.id)),
      JSON.stringify(versioned.map(({ versionId }) => versionId)),
      at.getTime(),
      project.id,
      userId,
    ),
  ]);
  const saved = (await readGeoPromptSets(env, userId)).find((set) => set.id === id);
  if (!saved) throw new Error('PROMPT_SET_NOT_FOUND');
  return saved;
}

export async function deleteGeoPromptSet(env: CloudflareBindings, userId: string, id: string) {
  const project = await projectFor(env, userId);
  const result = await sql(
    env,
    'DELETE FROM geo_prompt_sets WHERE id=? AND project_id=?',
    id,
    project.id,
  ).run();
  if (!result.meta.changes) throw new Error('PROMPT_SET_NOT_FOUND');
}

export async function geoAllowance(
  env: CloudflareBindings,
  userId: string,
  at = new Date(),
): Promise<GeoAllowance> {
  const project = await projectFor(env, userId),
    config = getConfig(env);
  const date = dateOf(at),
    month = `${date.slice(0, 7)}%`;
  const counts = await sql(
    env,
    `SELECT
    (SELECT count(*) FROM provider_call_reservations WHERE project_id=? AND usage_date=?) AS today,
    (SELECT count(*) FROM provider_call_reservations WHERE project_id=? AND usage_date LIKE ?) AS month,
    (SELECT count(*) FROM provider_call_reservations WHERE usage_date=?) AS globalToday`,
    project.id,
    date,
    project.id,
    month,
    date,
  ).first<{ today: number; month: number; globalToday: number }>();
  const limits = {
    projectDaily: config.GEO_PROJECT_DAILY_CALL_CAP,
    projectMonthly: config.GEO_PROJECT_MONTHLY_CALL_CAP,
    globalDaily: globalCollectorCallCap(env),
  };
  const count = counts ?? { today: 0, month: 0, globalToday: 0 };
  const reason =
    config.GEO_SCANS_ENABLED !== 'true' ||
    config.EXTERNAL_INTEGRATIONS_ENABLED !== 'true' ||
    config.V2_SCANS_ENABLED !== 'true'
      ? 'GEO_SCANS_DISABLED'
      : !(await hasPaidAccess(env, userId, at))
        ? 'PAID_ACCESS_REQUIRED'
        : (await paidStartPending(env, userId, at))
          ? 'PAID_STARTS_NEXT_UTC_DAY'
          : Object.values(limits).some((limit) => limit <= 0)
            ? 'GEO_BUDGET_REQUIRED'
            : count.today >= limits.projectDaily ||
                count.month >= limits.projectMonthly ||
                count.globalToday >= limits.globalDaily
              ? 'GEO_QUOTA_EXCEEDED'
              : null;
  return { ...count, limits, enabled: reason === null, reason, cooldownSeconds: 300 };
}

function itemView(row: GeoItemRow): GeoRunItem {
  return {
    id: row.id,
    runId: row.run_id,
    promptId: row.prompt_id,
    engine: row.engine,
    status: row.status,
    context: JSON.parse(row.context_json) as GeoRequestContext,
    reservationId: row.reservation_id,
    providerTaskId: row.provider_task_id,
    attemptsUsed: row.attempts_used,
    dueAt: new Date(row.due_at).toISOString(),
    terminalReason: row.terminal_reason,
  };
}
export async function readGeoRun(
  env: CloudflareBindings,
  userId: string,
  runId: string,
): Promise<GeoRun> {
  const run = await sql(
    env,
    `SELECT r.* FROM scan_runs r JOIN projects p ON p.id=r.project_id
    JOIN geo_run_snapshots g ON g.run_id=r.id WHERE r.id=? AND p.user_id=?`,
    runId,
    userId,
  ).first<{
    id: string;
    trigger_type: 'manual' | 'scheduled';
    status: string;
    created_at: number;
    completed_at: number | null;
  }>();
  if (!run) throw new Error('GEO_RUN_NOT_FOUND');
  const items = await sql(
    env,
    'SELECT * FROM geo_run_items WHERE run_id=? ORDER BY prompt_id,engine',
    runId,
  ).all<GeoItemRow>();
  return {
    id: run.id,
    trigger: run.trigger_type,
    status: run.status,
    createdAt: new Date(run.created_at).toISOString(),
    completedAt: iso(run.completed_at),
    items: items.results.map(itemView),
  };
}

export async function startGeoRun(
  env: CloudflareBindings,
  userId: string,
  value: GeoRunRequest,
  at = new Date(),
  trigger: 'manual' | 'scheduled' = 'manual',
): Promise<GeoRun> {
  const input = geoRunRequestSchema.parse(value),
    project = await projectFor(env, userId);
  const payloadHash = await geoPayloadHash(input);
  const existing = await sql(
    env,
    'SELECT run_id,payload_hash FROM geo_run_snapshots WHERE project_id=? AND request_id=?',
    project.id,
    input.requestId,
  ).first<{ run_id: string; payload_hash: string }>();
  if (existing) {
    if (existing.payload_hash !== payloadHash) throw new Error('IDEMPOTENCY_CONFLICT');
    return readGeoRun(env, userId, existing.run_id);
  }
  const allowance = await geoAllowance(env, userId, at);
  if (allowance.reason) throw new Error(allowance.reason);
  const settings = await readGeoSettings(env, userId);
  if (!settings.configured) throw new Error('GEO_CONFIGURATION_REQUIRED');
  if (trigger === 'scheduled' && !settings.dailyEnabled) throw new Error('GEO_DAILY_DISABLED');
  const prompts = await selectedPrompts(env, project.id, input.promptIds);
  const engines = [...(input.engines ?? settings.engines)].sort();
  if (engines.some((engine) => !settings.engines.includes(engine)))
    throw new Error('ENGINE_NOT_SELECTED');
  const competitors = (
    await sql(
      env,
      'SELECT id,name,canonical_domain AS domain FROM competitors WHERE project_id=? AND archived_at IS NULL ORDER BY id',
      project.id,
    ).all<GeoRequestContext['competitors'][number]>()
  ).results;
  const versioned = await Promise.all(
    prompts.map(async (prompt) => ({ prompt, versionId: await promptVersionId(prompt) })),
  );
  const contexts: GeoRequestContext[] = versioned.flatMap(({ prompt, versionId }) =>
    engines.map((engine) => ({
      schemaVersion: 'geo-context-1',
      projectId: project.id,
      contextVersion: project.context_version,
      settingsRevision: settings.revision,
      promptId: prompt.id,
      promptVersionId: versionId,
      promptText: prompt.text,
      engine,
      surface: geoSurfaces[engine].surface,
      collector: geoSurfaces[engine].collector,
      collectorVersion: 'geo-collector-1',
      languageCode: settings.languageCode,
      locationCode: settings.locationCode,
      device: settings.device,
      forceWebSearch: engine === 'chatgpt_search',
      brand: { id: project.id, name: project.brand_name, domain: project.canonical_domain },
      competitors,
      instructionVersion: 'neutral-research-1',
      maxOutputTokens: 700,
    })),
  );
  const snapshotHash = await geoHash(contexts);
  const intent =
    trigger === 'scheduled'
      ? `geo:daily:${project.id}:${dateOf(at)}:${snapshotHash}`
      : `geo:manual:${project.id}:${input.requestId}`;
  if (trigger === 'scheduled') {
    const daily = await sql(env, 'SELECT id FROM scan_runs WHERE intent_key=?', intent).first<{
      id: string;
    }>();
    if (daily) return readGeoRun(env, userId, daily.id);
  }
  const runId = crypto.randomUUID(),
    date = dateOf(at),
    month = `${date.slice(0, 7)}%`,
    now = at.getTime();
  const params: unknown[] = [
    runId,
    project.id,
    trigger,
    date,
    intent,
    project.context_version,
    now,
    now,
    project.id,
    userId,
    project.context_version,
    project.updated_at,
    now,
    now,
    settings.revision,
    JSON.stringify(prompts),
    project.id,
    project.id,
    date,
    contexts.length,
    allowance.limits.projectDaily,
    project.id,
    month,
    contexts.length,
    allowance.limits.projectMonthly,
    date,
    contexts.length,
    allowance.limits.globalDaily,
    JSON.stringify(contexts),
    JSON.stringify(contexts),
    now - COOLDOWN,
    now,
  ];
  const claim = sql(
    env,
    `INSERT OR IGNORE INTO scan_runs
    (id,project_id,trigger_type,provider,status,observation_date,intent_key,context_version,due_at,created_at)
    SELECT ?,?,?,'geo','pending',?,?,?, ?,? FROM projects p
    WHERE p.id=? AND p.user_id=? AND p.context_version=? AND p.updated_at=? AND ${paidGate}
    AND EXISTS(SELECT 1 FROM geo_settings WHERE project_id=p.id AND revision=?)
    AND NOT EXISTS(SELECT 1 FROM json_each(?) selected WHERE NOT EXISTS(SELECT 1 FROM prompts q
      WHERE q.project_id=? AND q.id=json_extract(selected.value,'$.id') AND q.text=json_extract(selected.value,'$.text')
      AND q.updated_at=json_extract(selected.value,'$.updated_at') AND q.enabled=1 AND q.archived_at IS NULL))
    AND (SELECT count(*) FROM provider_call_reservations WHERE project_id=? AND usage_date=?) + ? <= ?
    AND (SELECT count(*) FROM provider_call_reservations WHERE project_id=? AND usage_date LIKE ?) + ? <= ?
    AND (SELECT count(*) FROM provider_call_reservations WHERE usage_date=?) + ? <= ?
    AND NOT EXISTS(SELECT 1 FROM json_each(?) selected JOIN geo_run_items i
      ON i.project_id=p.id AND i.prompt_id=json_extract(selected.value,'$.promptId') AND i.engine=json_extract(selected.value,'$.engine')
      WHERE i.status IN ('pending','submitting','submitted','submission_uncertain'))
    AND NOT EXISTS(SELECT 1 FROM json_each(?) selected JOIN provider_call_reservations v
      ON v.project_id=p.id AND v.prompt_id=json_extract(selected.value,'$.promptId') AND v.provider=json_extract(selected.value,'$.engine')
      WHERE v.reserved_at>? OR (v.status='reserved' AND v.lease_until>?))`,
    ...params,
  );
  const statements = [
    claim,
    sql(
      env,
      `INSERT OR IGNORE INTO geo_run_snapshots(run_id,project_id,request_id,payload_hash,snapshot_hash,context_json,settings_revision)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM scan_runs WHERE id=?)`,
      runId,
      project.id,
      input.requestId,
      payloadHash,
      snapshotHash,
      JSON.stringify(contexts),
      settings.revision,
      runId,
    ),
    ...versioned.map(({ prompt, versionId }) =>
      sql(
        env,
        `INSERT OR IGNORE INTO geo_prompt_versions(id,project_id,prompt_id,text,created_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM scan_runs WHERE id=?)`,
        versionId,
        project.id,
        prompt.id,
        prompt.text,
        now,
        runId,
      ),
    ),
  ];
  for (const context of contexts) {
    const itemId = crypto.randomUUID(),
      reservationId = crypto.randomUUID();
    statements.push(
      sql(
        env,
        `INSERT INTO provider_call_reservations
      (id,idempotency_key,user_id,project_id,prompt_id,scan_run_id,provider,usage_date,status,reserved_at,item_id,request_context_json)
      SELECT ?,?,?,?,?,?,?,?,'reserved',?,?,? WHERE EXISTS(SELECT 1 FROM scan_runs WHERE id=?)`,
        reservationId,
        `geo:${itemId}:1`,
        userId,
        project.id,
        context.promptId,
        runId,
        context.engine,
        date,
        now,
        itemId,
        JSON.stringify(context),
        runId,
      ),
    );
    statements.push(
      sql(
        env,
        `INSERT INTO geo_run_items
      (id,run_id,project_id,prompt_id,prompt_version_id,engine,status,context_json,reservation_id,due_at,created_at)
      SELECT ?,?,?,?,?,?,'pending',?,?,?,? WHERE EXISTS(SELECT 1 FROM scan_runs WHERE id=?)`,
        itemId,
        runId,
        project.id,
        context.promptId,
        context.promptVersionId,
        context.engine,
        JSON.stringify(context),
        reservationId,
        now,
        now,
        runId,
      ),
    );
  }
  await env.DB.batch(statements);
  const saved = await sql(
    env,
    'SELECT g.run_id,g.payload_hash FROM geo_run_snapshots g JOIN scan_runs r ON r.id=g.run_id WHERE g.project_id=? AND (g.request_id=? OR r.intent_key=?)',
    project.id,
    input.requestId,
    intent,
  ).first<{ run_id: string; payload_hash: string }>();
  if (saved) {
    if (saved.payload_hash !== payloadHash) throw new Error('IDEMPOTENCY_CONFLICT');
    return readGeoRun(env, userId, saved.run_id);
  }
  const current = await projectFor(env, userId);
  if (
    current.context_version !== project.context_version ||
    current.updated_at !== project.updated_at ||
    (await readGeoSettings(env, userId)).revision !== settings.revision
  )
    throw new Error('CONFIGURATION_CHANGED');
  const quota = await geoAllowance(env, userId, at);
  if (
    quota.today + contexts.length > quota.limits.projectDaily ||
    quota.month + contexts.length > quota.limits.projectMonthly ||
    quota.globalToday + contexts.length > quota.limits.globalDaily
  )
    throw new Error('GEO_QUOTA_EXCEEDED');
  if (!(await hasPaidAccess(env, userId, at))) throw new Error('PAID_ACCESS_REQUIRED');
  if (await paidStartPending(env, userId, at)) throw new Error('PAID_STARTS_NEXT_UTC_DAY');
  throw new Error('GEO_COOLDOWN_OR_IN_FLIGHT');
}

export async function createDailyGeoRuns(env: CloudflareBindings, at = new Date()) {
  const config = getConfig(env);
  if (
    config.GEO_SCANS_ENABLED !== 'true' ||
    config.EXTERNAL_INTEGRATIONS_ENABLED !== 'true' ||
    config.V2_SCANS_ENABLED !== 'true'
  )
    return;
  const projects = await sql(
    env,
    `SELECT p.user_id FROM projects p JOIN geo_settings g ON g.project_id=p.id
    WHERE g.daily_enabled=1 AND ${paidGate} ORDER BY p.id`,
    at.getTime(),
    at.getTime(),
  ).all<{ user_id: string }>();
  for (const project of projects.results) {
    try {
      await startGeoRun(env, project.user_id, { requestId: crypto.randomUUID() }, at, 'scheduled');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (
        ![
          'GEO_QUOTA_EXCEEDED',
          'GEO_COOLDOWN_OR_IN_FLIGHT',
          'GEO_CONFIGURATION_REQUIRED',
          'INVALID_PROMPT_SELECTION',
          'PAID_ACCESS_REQUIRED',
          'PAID_STARTS_NEXT_UTC_DAY',
          'CONFIGURATION_CHANGED',
          'PROJECT_NOT_FOUND',
          'GEO_DAILY_DISABLED',
        ].includes(code)
      )
        throw error;
    }
  }
}

export async function reconcileGeoItems(env: CloudflareBindings, at = new Date()) {
  const now = at.getTime();
  await env.DB.batch([
    sql(
      env,
      `UPDATE geo_run_items SET status='cancelled',terminal_reason=CASE
      WHEN NOT EXISTS(SELECT 1 FROM prompts q WHERE q.id=geo_run_items.prompt_id AND q.enabled=1 AND q.archived_at IS NULL) THEN 'prompt_inactive'
      WHEN NOT EXISTS(SELECT 1 FROM projects p WHERE p.id=geo_run_items.project_id AND ${paidProjectSql}) THEN 'paid_access_ended'
      ELSE 'configuration_changed' END
      WHERE status='pending' AND (
      NOT EXISTS(SELECT 1 FROM projects p WHERE p.id=geo_run_items.project_id AND p.context_version=json_extract(geo_run_items.context_json,'$.contextVersion') AND ${paidProjectSql})
      OR NOT EXISTS(SELECT 1 FROM geo_settings g WHERE g.project_id=geo_run_items.project_id AND g.revision=json_extract(geo_run_items.context_json,'$.settingsRevision'))
      OR NOT EXISTS(SELECT 1 FROM prompts q WHERE q.id=geo_run_items.prompt_id AND q.text=json_extract(geo_run_items.context_json,'$.promptText') AND q.enabled=1 AND q.archived_at IS NULL)
      )`,
      now,
      now,
    ),
    sql(
      env,
      `UPDATE provider_call_reservations SET status='deferred',failure_code='cancelled_before_submission',completed_at=?
      WHERE status='reserved' AND EXISTS(SELECT 1 FROM geo_run_items i WHERE i.reservation_id=provider_call_reservations.id AND i.status='cancelled')`,
      now,
    ),
    // A POST may already have reached the provider: an expired submission lease is never reposted.
    sql(
      env,
      `UPDATE geo_run_items SET status='submission_uncertain',terminal_reason='submission_lease_expired',lease_token=NULL,lease_until=NULL
      WHERE status='submitting' AND lease_until<?`,
      now,
    ),
  ]);
}

export async function claimGeoItem(
  env: CloudflareBindings,
  itemId: string,
  at = new Date(),
): Promise<GeoItemRow | null> {
  const config = getConfig(env),
    now = at.getTime(),
    token = crypto.randomUUID();
  const pendingAllowed =
    config.GEO_SCANS_ENABLED === 'true' &&
    config.EXTERNAL_INTEGRATIONS_ENABLED === 'true' &&
    config.V2_SCANS_ENABLED === 'true';
  // Saved provider task ids are recoverable even when new paid submissions are paused.
  await sql(
    env,
    `UPDATE geo_run_items SET lease_token=?,lease_until=?,status=CASE WHEN status='pending' THEN 'submitting' ELSE status END
    WHERE id=? AND due_at<=? AND (lease_until IS NULL OR lease_until<=?)
    AND (status='submitted' OR (status='pending' AND ?=1
      AND EXISTS(SELECT 1 FROM projects p JOIN geo_settings g ON g.project_id=p.id JOIN prompts q ON q.project_id=p.id
        WHERE p.id=geo_run_items.project_id AND p.context_version=json_extract(geo_run_items.context_json,'$.contextVersion')
        AND g.revision=json_extract(geo_run_items.context_json,'$.settingsRevision')
        AND q.id=geo_run_items.prompt_id AND q.text=json_extract(geo_run_items.context_json,'$.promptText')
        AND q.enabled=1 AND q.archived_at IS NULL AND ${paidGate})))
    AND EXISTS(SELECT 1 FROM projects WHERE id=geo_run_items.project_id)`,
    token,
    now + COOLDOWN,
    itemId,
    now,
    now,
    pendingAllowed ? 1 : 0,
    now,
    now,
  ).run();
  return sql(
    env,
    'SELECT * FROM geo_run_items WHERE id=? AND lease_token=?',
    itemId,
    token,
  ).first<GeoItemRow>();
}

interface ObservationRow {
  id: string;
  project_id: string;
  run_id: string;
  item_id: string;
  prompt_version_id: string;
  engine: GeoEngine;
  context_json: string;
  capture_json: string;
  captured_at: number;
}
const observationView = (row: ObservationRow): GeoObservation => ({
  id: row.id,
  projectId: row.project_id,
  runId: row.run_id,
  itemId: row.item_id,
  promptVersionId: row.prompt_version_id,
  engine: row.engine,
  capturedAt: new Date(row.captured_at).toISOString(),
  context: JSON.parse(row.context_json) as GeoRequestContext,
  capture: JSON.parse(row.capture_json) as GeoCapture,
});
export async function readGeoObservations(
  env: CloudflareBindings,
  userId: string,
  cursor?: string,
): Promise<GeoObservationPage> {
  const project = await projectFor(env, userId);
  if (cursor && !/^\d{1,16}\.[a-zA-Z0-9_-]{1,100}$/.test(cursor)) throw new Error('INVALID_CURSOR');
  const [time, id] = cursor?.split('.') ?? [];
  const rows = await sql(
    env,
    `SELECT id,project_id,run_id,item_id,prompt_version_id,engine,context_json,captured_at,
    json_set(capture_json,'$.raw',NULL,'$.answerText',substr(answer_text,1,1600),'$.textParts',json('[]')) AS capture_json
    FROM geo_observations WHERE project_id=? ${cursor ? 'AND (captured_at<? OR (captured_at=? AND id<?))' : ''}
    ORDER BY captured_at DESC,id DESC LIMIT 21`,
    project.id,
    ...(cursor ? [Number(time), Number(time), id] : []),
  ).all<ObservationRow>();
  const page = rows.results.slice(0, 20),
    last = page.at(-1);
  return {
    observations: page.map(observationView),
    nextCursor: rows.results.length > 20 && last ? `${String(last.captured_at)}.${last.id}` : null,
  };
}
export async function readGeoObservation(
  env: CloudflareBindings,
  userId: string,
  observationId: string,
): Promise<GeoObservation> {
  const row = await sql(
    env,
    `SELECT o.* FROM geo_observations o JOIN projects p ON p.id=o.project_id WHERE o.id=? AND p.user_id=?`,
    observationId,
    userId,
  ).first<ObservationRow>();
  if (!row) throw new Error('GEO_OBSERVATION_NOT_FOUND');
  return observationView(row);
}
