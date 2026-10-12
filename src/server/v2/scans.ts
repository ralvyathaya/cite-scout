import { captureEvidence } from '../../integrations/perplexity/evidence';
import { neutralResearchInstruction } from '../../integrations/perplexity/provider';
import { CaptureError, type EvidenceCapture, type RequestContext } from '../../shared/evidence';
import { monthBounds, paidProjectSql as paidSql } from '../scan-policy';
import { globalCollectorCallCap } from '../config';

const DAY = 86_400_000;
const LEASE = 300_000;
const dateOf = (now: Date) => now.toISOString().slice(0, 10);
const nextDay = (now: Date) => Date.parse(`${dateOf(now)}T00:00:00Z`) + DAY;
const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());
const statement = (env: CloudflareBindings, sql: string, ...args: unknown[]) =>
  env.DB.prepare(sql).bind(...args);

interface Project {
  id: string;
  user_id: string;
  brand_name: string;
  canonical_domain: string;
  context_version: number;
  v2_enabled_at: number | null;
  updated_at: number;
}
interface FrozenContext {
  schemaVersion: 1;
  contextVersion: number;
  brand: RequestContext['brand'];
  competitors: RequestContext['competitors'];
  questions: { id: string; text: string }[];
}
interface Enrollment {
  user_id: string;
  trial_state: string;
  frozen_context_json: string | null;
  trial_started_at: number | null;
  expires_at: number | null;
  baseline_closed_at: number | null;
  followup_due_at: number | null;
  paid_starts_at: number | null;
}
interface DueItem {
  id: string;
  run_id: string;
  prompt_id: string;
  phase: 'baseline' | 'followup' | 'paid';
  attempts_used: number;
  project_id: string;
  user_id: string;
  context_version: number;
  text: string;
  updated_at: number;
  due_at: number;
}

async function freeze(env: CloudflareBindings, project: Project): Promise<FrozenContext> {
  const [questions, competitors] = await Promise.all([
    statement(
      env,
      'SELECT id,text FROM prompts WHERE project_id=? AND enabled=1 AND archived_at IS NULL ORDER BY created_at,id',
      project.id,
    ).all<{ id: string; text: string }>(),
    statement(
      env,
      'SELECT id,name,canonical_domain AS domain FROM competitors WHERE project_id=? AND archived_at IS NULL ORDER BY id',
      project.id,
    ).all<RequestContext['competitors'][number]>(),
  ]);
  return {
    schemaVersion: 1,
    contextVersion: project.context_version,
    brand: { id: project.id, name: project.brand_name, domain: project.canonical_domain },
    competitors: competitors.results,
    questions: questions.results,
  };
}

function requestContext(
  context: FrozenContext,
  question: { id: string; text: string },
): RequestContext {
  return {
    schemaVersion: 1,
    questionId: question.id,
    text: question.text,
    contextVersion: context.contextVersion,
    brand: context.brand,
    competitors: context.competitors,
    provider: 'perplexity',
    preset: 'fast',
    instruction: neutralResearchInstruction,
    instructionVersion: 'neutral-research-1',
    maxOutputTokens: 700,
    matcherVersion: 'mentions-v1',
    extractorVersion: 'answer-parts-1',
    citationParserVersion: 'fast-numeric-1',
  };
}

function runEvent(
  env: CloudflareBindings,
  runId: string,
  name: 'scan_requested' | 'scan_finished',
  now: Date,
) {
  return statement(
    env,
    `INSERT OR IGNORE INTO product_events
    (id,dedupe_key,schema_version,name,user_id,project_id,received_at,occurred_at,source,properties_json)
    SELECT ?,?,1,?,p.user_id,p.id,?,?,'server',json_object('outcome',r.status)
    FROM scan_runs r JOIN projects p ON p.id=r.project_id WHERE r.id=?
    ${name === 'scan_finished' ? 'AND r.completed_at IS NOT NULL' : ''}`,
    crypto.randomUUID(),
    `${name}:${runId}`,
    name,
    now.getTime(),
    now.getTime(),
    runId,
  );
}

export async function startScan(
  env: CloudflareBindings,
  userId: string,
  mode: 'baseline' | 'today',
  now = new Date(),
): Promise<string> {
  const project = await statement(
    env,
    'SELECT * FROM projects WHERE user_id=?',
    userId,
  ).first<Project>();
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  if (!project.v2_enabled_at) throw new Error('USE_V2_FLOW');
  const intent =
    mode === 'baseline' ? `trial:${userId}:baseline` : `paid:${project.id}:${dateOf(now)}`;
  const existing = await statement(
    env,
    'SELECT id FROM scan_runs WHERE intent_key=?',
    intent,
  ).first<{ id: string }>();
  if (existing) return existing.id;
  await reconcileEligibility(env, now);
  const paid = await statement(
    env,
    `SELECT p.id FROM projects p WHERE p.id=? AND ${paidSql}`,
    project.id,
    now.getTime(),
  ).first();
  const enrollment = await statement(
    env,
    'SELECT * FROM pilot_enrollments WHERE user_id=?',
    userId,
  ).first<Enrollment>();
  if (mode === 'today' && !paid) throw new Error('PAID_ACCESS_REQUIRED');
  if (mode === 'today' && enrollment?.paid_starts_at && enrollment.paid_starts_at > now.getTime())
    throw new Error('PAID_STARTS_NEXT_UTC_DAY');
  if (mode === 'baseline' && (paid || enrollment?.trial_state !== 'eligible'))
    throw new Error(enrollment ? 'TRIAL_ALREADY_USED' : 'PILOT_ENROLLMENT_REQUIRED');
  const context = await freeze(env, project);
  if (
    context.questions.length === 0 ||
    context.questions.length > 10 ||
    (mode === 'baseline' && context.questions.length !== 3)
  )
    throw new Error('INVALID_QUESTION_COUNT');
  if (context.competitors.length < 1 || context.competitors.length > 3)
    throw new Error('INVALID_COMPETITOR_COUNT');
  const runId = crypto.randomUUID();
  const phase = mode === 'baseline' ? 'baseline' : 'paid';
  const batch: D1PreparedStatement[] = [];
  if (mode === 'baseline')
    batch.push(
      statement(
        env,
        `UPDATE pilot_enrollments SET trial_state='baseline',
    trial_started_at=?,expires_at=?,frozen_question_ids_json=?,frozen_context_json=?
    WHERE user_id=? AND trial_state='eligible' AND trial_started_at IS NULL AND policy_version='pilot-v2-1'
    AND authority_confirmed=1 AND example_verified=1
    AND EXISTS(SELECT 1 FROM projects p WHERE p.id=? AND p.context_version=? AND p.updated_at=? AND NOT ${paidSql})`,
        now.getTime(),
        now.getTime() + 14 * DAY,
        JSON.stringify(context.questions.map((q) => q.id)),
        JSON.stringify(context),
        userId,
        project.id,
        project.context_version,
        project.updated_at,
        now.getTime(),
      ),
    );
  batch.push(
    statement(
      env,
      `INSERT OR IGNORE INTO scan_runs
    (id,project_id,trigger_type,provider,status,observation_date,intent_key,phase,context_version,due_at,created_at)
    SELECT ?,p.id,?,'perplexity','pending',?,?,?,?,?,? FROM projects p WHERE p.id=? AND p.context_version=?
    AND ${
      mode === 'baseline'
        ? `EXISTS(SELECT 1 FROM pilot_enrollments e WHERE e.user_id=p.user_id AND e.trial_state='baseline'
      AND e.trial_started_at=? AND e.frozen_context_json=?)`
        : `${paidSql} AND NOT EXISTS(SELECT 1 FROM pilot_enrollments e WHERE e.user_id=p.user_id AND e.paid_starts_at>?)`
    }`,
      runId,
      mode === 'baseline' ? 'trial' : 'manual',
      dateOf(now),
      intent,
      phase,
      project.context_version,
      now.getTime(),
      now.getTime(),
      project.id,
      project.context_version,
      ...(mode === 'baseline'
        ? [now.getTime(), JSON.stringify(context)]
        : [now.getTime(), now.getTime()]),
    ),
  );
  for (const question of context.questions)
    batch.push(
      statement(
        env,
        `INSERT OR IGNORE INTO scan_run_items
    (id,run_id,prompt_id,phase,status,attempts_used,due_at)
    SELECT ?,?,?,?,'pending',0,? WHERE EXISTS(SELECT 1 FROM scan_runs WHERE id=?)
    AND EXISTS(SELECT 1 FROM prompts WHERE id=? AND enabled=1 AND archived_at IS NULL)`,
        crypto.randomUUID(),
        runId,
        question.id,
        phase,
        now.getTime(),
        runId,
        question.id,
      ),
    );
  batch.push(runEvent(env, runId, 'scan_requested', now));
  await env.DB.batch(batch);
  const created = await statement(
    env,
    'SELECT id FROM scan_runs WHERE intent_key=?',
    intent,
  ).first<{ id: string }>();
  if (!created) throw new Error('CONFIGURATION_CHANGED');
  return created.id;
}

async function reconcileEligibility(env: CloudflareBindings, now: Date) {
  await env.DB.batch([
    statement(
      env,
      `UPDATE scan_run_items SET status='cancelled',terminal_reason='geo_schedule_active'
      WHERE phase='paid' AND status='pending'
      AND run_id IN(SELECT r.id FROM scan_runs r JOIN geo_settings g ON g.project_id=r.project_id)`,
    ),
    statement(
      env,
      `UPDATE pilot_enrollments SET paid_starts_at=?,trial_state='cancelled'
      WHERE paid_starts_at IS NULL AND EXISTS(SELECT 1 FROM projects p WHERE p.user_id=pilot_enrollments.user_id AND ${paidSql})`,
      nextDay(now),
      now.getTime(),
    ),
    statement(
      env,
      `UPDATE pilot_enrollments SET trial_state='expired' WHERE expires_at<=?
      AND trial_state IN ('baseline','waiting','followup')`,
      now.getTime(),
    ),
    statement(
      env,
      `UPDATE scan_run_items SET status='cancelled',terminal_reason='missed_window'
      WHERE status='pending' AND phase='paid' AND run_id IN(SELECT id FROM scan_runs WHERE observation_date<?)`,
      dateOf(now),
    ),
    statement(
      env,
      `UPDATE scan_run_items SET status='cancelled',terminal_reason='configuration_changed'
      WHERE status='pending' AND run_id IN(SELECT r.id FROM scan_runs r JOIN projects p ON p.id=r.project_id WHERE r.context_version<>p.context_version)`,
    ),
    statement(
      env,
      `UPDATE scan_run_items SET status='cancelled',terminal_reason='question_inactive'
      WHERE status='pending' AND prompt_id IN(SELECT id FROM prompts WHERE enabled=0 OR archived_at IS NOT NULL)`,
    ),
    statement(
      env,
      `UPDATE scan_run_items SET status='cancelled',terminal_reason='entitlement_ended'
      WHERE status='pending' AND phase='paid' AND run_id IN(SELECT r.id FROM scan_runs r JOIN projects p ON p.id=r.project_id WHERE NOT ${paidSql})`,
      now.getTime(),
    ),
    statement(
      env,
      `UPDATE scan_run_items SET status='cancelled',terminal_reason='trial_ended'
      WHERE status='pending' AND phase IN ('baseline','followup') AND run_id IN(
      SELECT r.id FROM scan_runs r JOIN projects p ON p.id=r.project_id JOIN pilot_enrollments e ON e.user_id=p.user_id
      WHERE e.trial_state IN('expired','cancelled','completed'))`,
    ),
  ]);
}

export async function cancelTrial(env: CloudflareBindings, userId: string): Promise<void> {
  await env.DB.batch([
    statement(
      env,
      `UPDATE pilot_enrollments SET trial_state='cancelled' WHERE user_id=?
      AND trial_state IN('eligible','baseline','waiting','followup')`,
      userId,
    ),
    statement(
      env,
      `UPDATE scan_run_items SET status='cancelled',terminal_reason='trial_cancelled'
      WHERE status='pending' AND phase IN('baseline','followup') AND run_id IN(
      SELECT r.id FROM scan_runs r JOIN projects p ON p.id=r.project_id WHERE p.user_id=?)`,
      userId,
    ),
  ]);
  await finishRuns(env, new Date());
}

async function recoverLeases(env: CloudflareBindings, now: Date) {
  const stale = await statement(
    env,
    `SELECT id,item_id FROM provider_call_reservations
    WHERE item_id IS NOT NULL AND status='reserved' AND lease_until<=?
    AND EXISTS(SELECT 1 FROM scan_run_items WHERE id=provider_call_reservations.item_id)`,
    now.getTime(),
  ).all<{ id: string; item_id: string }>();
  for (const claim of stale.results)
    await env.DB.batch([
      statement(
        env,
        `UPDATE scan_run_items SET status=CASE WHEN phase<>'paid' AND attempts_used<2 THEN 'pending' ELSE 'exhausted' END,
      due_at=?,terminal_reason='interrupted' WHERE id=? AND status='running'
      AND EXISTS(SELECT 1 FROM provider_call_reservations WHERE id=? AND status='reserved' AND lease_until<=?)`,
        nextDay(now),
        claim.item_id,
        claim.id,
        now.getTime(),
      ),
      statement(
        env,
        `UPDATE provider_call_reservations SET status='failed',failure_code='INTERRUPTED',completed_at=?
      WHERE id=? AND status='reserved' AND lease_until<=?`,
        now.getTime(),
        claim.id,
        now.getTime(),
      ),
    ]);
}

async function finishRuns(env: CloudflareBindings, now: Date) {
  const active = await statement(
    env,
    `SELECT id FROM scan_runs WHERE phase IS NOT NULL AND completed_at IS NULL`,
  ).all<{ id: string }>();
  for (const run of active.results)
    await env.DB.batch([
      statement(
        env,
        `UPDATE scan_runs SET
      attempted_count=(SELECT count(*) FROM provider_call_reservations WHERE scan_run_id=scan_runs.id),
      successful_count=(SELECT count(*) FROM scan_run_items WHERE run_id=scan_runs.id AND status='succeeded'),
      failed_count=(SELECT count(*) FROM provider_call_reservations WHERE scan_run_id=scan_runs.id AND status='failed'),
      status=CASE
        WHEN EXISTS(SELECT 1 FROM scan_run_items WHERE run_id=scan_runs.id AND status='running') THEN 'running'
        WHEN EXISTS(SELECT 1 FROM scan_run_items WHERE run_id=scan_runs.id AND status='pending')
          THEN CASE WHEN status='deferred' THEN 'deferred' ELSE 'pending' END
        WHEN NOT EXISTS(SELECT 1 FROM scan_run_items WHERE run_id=scan_runs.id AND status<>'succeeded') THEN 'completed'
        WHEN EXISTS(SELECT 1 FROM scan_run_items WHERE run_id=scan_runs.id AND status='succeeded') THEN 'partial'
        WHEN EXISTS(SELECT 1 FROM provider_call_reservations WHERE scan_run_id=scan_runs.id) THEN 'failed'
        ELSE 'cancelled' END,
      completed_at=CASE WHEN NOT EXISTS(SELECT 1 FROM scan_run_items WHERE run_id=scan_runs.id AND status IN('pending','running')) THEN ? ELSE NULL END
      WHERE id=? AND completed_at IS NULL`,
        now.getTime(),
        run.id,
      ),
      runEvent(env, run.id, 'scan_finished', now),
    ]);
  await env.DB.batch([
    statement(
      env,
      `UPDATE pilot_enrollments SET baseline_closed_at=(SELECT r.completed_at FROM scan_runs r
      WHERE r.intent_key='trial:'||pilot_enrollments.user_id||':baseline'),
      followup_due_at=CASE WHEN EXISTS(SELECT 1 FROM scan_runs r JOIN scan_run_items i ON i.run_id=r.id
        WHERE r.intent_key='trial:'||pilot_enrollments.user_id||':baseline' AND i.status='succeeded')
        THEN (SELECT r.completed_at+? FROM scan_runs r WHERE r.intent_key='trial:'||pilot_enrollments.user_id||':baseline') ELSE NULL END,
      trial_state=CASE WHEN EXISTS(SELECT 1 FROM scan_runs r JOIN scan_run_items i ON i.run_id=r.id
        WHERE r.intent_key='trial:'||pilot_enrollments.user_id||':baseline' AND i.status='succeeded') THEN 'waiting' ELSE 'completed' END
      WHERE trial_state='baseline' AND EXISTS(SELECT 1 FROM scan_runs r
        WHERE r.intent_key='trial:'||pilot_enrollments.user_id||':baseline' AND r.completed_at IS NOT NULL)`,
      3 * DAY,
    ),
    statement(
      env,
      `UPDATE pilot_enrollments SET trial_state='completed' WHERE trial_state='followup'
      AND EXISTS(SELECT 1 FROM scan_runs r WHERE r.intent_key='trial:'||pilot_enrollments.user_id||':followup' AND r.completed_at IS NOT NULL)`,
    ),
  ]);
}

async function createDueRuns(env: CloudflareBindings, now: Date) {
  const followups = await statement(
    env,
    `SELECT e.user_id,p.id AS project_id,e.followup_due_at,p.context_version
    FROM pilot_enrollments e JOIN projects p ON p.user_id=e.user_id WHERE e.trial_state='waiting' AND e.followup_due_at<=? AND e.expires_at>?`,
    now.getTime(),
    now.getTime(),
  ).all<{
    user_id: string;
    project_id: string;
    followup_due_at: number;
    context_version: number;
  }>();
  for (const entry of followups.results) {
    const runId = crypto.randomUUID();
    await env.DB.batch([
      statement(
        env,
        `INSERT OR IGNORE INTO scan_runs
        (id,project_id,trigger_type,provider,status,observation_date,intent_key,phase,context_version,due_at,created_at)
        SELECT ?,?,'trial','perplexity','pending',?,?,'followup',?,?,? FROM pilot_enrollments
        WHERE user_id=? AND trial_state='waiting' AND expires_at>?`,
        runId,
        entry.project_id,
        dateOf(now),
        `trial:${entry.user_id}:followup`,
        entry.context_version,
        entry.followup_due_at,
        now.getTime(),
        entry.user_id,
        now.getTime(),
      ),
      statement(
        env,
        `INSERT OR IGNORE INTO scan_run_items(id,run_id,prompt_id,phase,status,attempts_used,due_at)
        SELECT lower(hex(randomblob(16))),?,i.prompt_id,'followup','pending',0,? FROM scan_run_items i JOIN scan_runs r ON r.id=i.run_id
        WHERE r.intent_key=? AND i.status='succeeded' AND EXISTS(SELECT 1 FROM scan_runs WHERE id=?)`,
        runId,
        entry.followup_due_at,
        `trial:${entry.user_id}:baseline`,
        runId,
      ),
      statement(
        env,
        `UPDATE pilot_enrollments SET trial_state='followup' WHERE user_id=? AND trial_state='waiting'
        AND EXISTS(SELECT 1 FROM scan_runs WHERE intent_key=?)`,
        entry.user_id,
        `trial:${entry.user_id}:followup`,
      ),
      runEvent(env, runId, 'scan_requested', now),
    ]);
  }
  const paid = await statement(
    env,
    `SELECT p.user_id FROM projects p WHERE p.v2_enabled_at IS NOT NULL AND ${paidSql}
    AND NOT EXISTS(SELECT 1 FROM geo_settings g WHERE g.project_id=p.id)
    AND NOT EXISTS(SELECT 1 FROM pilot_enrollments e WHERE e.user_id=p.user_id AND e.paid_starts_at>?)`,
    now.getTime(),
    now.getTime(),
  ).all<{ user_id: string }>();
  for (const project of paid.results) {
    try {
      await startScan(env, project.user_id, 'today', now);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        ![
          'INVALID_QUESTION_COUNT',
          'INVALID_COMPETITOR_COUNT',
          'PAID_ACCESS_REQUIRED',
          'PAID_STARTS_NEXT_UTC_DAY',
          'CONFIGURATION_CHANGED',
          'PROJECT_NOT_FOUND',
        ].includes(error.message)
      )
        throw error;
    }
  }
}

async function claimItem(env: CloudflareBindings, item: DueItem, now: Date) {
  const project = await statement(
    env,
    'SELECT * FROM projects WHERE id=?',
    item.project_id,
  ).first<Project>();
  if (!project) return null;
  let frozen: FrozenContext;
  if (item.phase === 'paid') frozen = await freeze(env, project);
  else {
    const enrollment = await statement(
      env,
      'SELECT frozen_context_json FROM pilot_enrollments WHERE user_id=?',
      item.user_id,
    ).first<{ frozen_context_json: string | null }>();
    if (!enrollment?.frozen_context_json) return null;
    frozen = JSON.parse(enrollment.frozen_context_json) as FrozenContext;
  }
  const question = frozen.questions.find((q) => q.id === item.prompt_id);
  if (!question) return null;
  const context = requestContext(frozen, question);
  const reservationId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const [monthStart, monthEnd] = monthBounds(now);
  const date = dateOf(now);
  const gate =
    item.phase === 'paid'
      ? `${paidSql} AND r.observation_date=?
    AND NOT EXISTS(SELECT 1 FROM pilot_enrollments e WHERE e.user_id=p.user_id AND e.paid_starts_at>?)`
      : `EXISTS(SELECT 1 FROM pilot_enrollments e WHERE e.user_id=p.user_id AND e.trial_state=? AND e.expires_at>?)`;
  const result = await env.DB.batch([
    statement(
      env,
      `INSERT OR IGNORE INTO provider_call_reservations
      (id,idempotency_key,user_id,project_id,prompt_id,scan_run_id,provider,usage_date,status,reserved_at,item_id,request_context_json,lease_token,lease_until)
      SELECT ?,?,p.user_id,p.id,q.id,r.id,'perplexity',?,'reserved',?,i.id,?,?,?
      FROM scan_run_items i JOIN scan_runs r ON r.id=i.run_id JOIN projects p ON p.id=r.project_id JOIN prompts q ON q.id=i.prompt_id
      WHERE i.id=? AND i.status='pending' AND i.due_at<=? AND i.attempts_used<? AND q.enabled=1 AND q.archived_at IS NULL
      AND q.text=? AND q.updated_at=? AND p.context_version=? AND r.context_version=p.context_version
      AND ${gate}
      AND (SELECT count(*) FROM provider_call_reservations WHERE usage_date=?)<?
      AND (SELECT count(*) FROM provider_call_reservations WHERE user_id=p.user_id AND usage_date>=? AND usage_date<?)<?
      AND (SELECT count(*) FROM provider_call_reservations WHERE project_id=p.id AND usage_date=?)<10
      RETURNING id`,
      reservationId,
      `perplexity:${item.project_id}:${item.prompt_id}:${date}`,
      date,
      now.getTime(),
      JSON.stringify(context),
      token,
      now.getTime() + LEASE,
      item.id,
      now.getTime(),
      item.phase === 'paid' ? 1 : 2,
      question.text,
      item.updated_at,
      frozen.contextVersion,
      ...(item.phase === 'paid'
        ? [now.getTime(), date, now.getTime()]
        : [item.phase, now.getTime()]),
      date,
      Math.min(150, globalCollectorCallCap(env)),
      monthStart,
      monthEnd,
      Math.min(350, Number(env.PER_USER_MONTHLY_PROVIDER_CALL_CAP)),
      date,
    ),
    statement(
      env,
      `UPDATE scan_run_items SET status='running',attempts_used=attempts_used+1,terminal_reason=NULL
      WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM provider_call_reservations WHERE id=?)`,
      item.id,
      reservationId,
    ),
    statement(
      env,
      `UPDATE scan_runs SET status='running',started_at=COALESCE(started_at,?)
      WHERE id=? AND EXISTS(SELECT 1 FROM provider_call_reservations WHERE id=?)`,
      now.getTime(),
      item.run_id,
      reservationId,
    ),
  ]);
  return result[0]?.results.length ? { reservationId, token, context, date } : null;
}

async function deferItem(env: CloudflareBindings, item: DueItem, now: Date) {
  const [monthStart, monthEnd] = monthBounds(now);
  const monthly = await statement(
    env,
    `SELECT count(*) AS count FROM provider_call_reservations WHERE user_id=? AND usage_date>=? AND usage_date<?`,
    item.user_id,
    monthStart,
    monthEnd,
  ).first<{ count: number }>();
  const due =
    (monthly?.count ?? 0) >= Math.min(350, Number(env.PER_USER_MONTHLY_PROVIDER_CALL_CAP))
      ? Date.parse(`${monthEnd}T00:00:00Z`)
      : nextDay(now);
  await env.DB.batch([
    statement(
      env,
      `UPDATE scan_run_items SET due_at=?,terminal_reason='usage_limit_or_daily_reservation'
      WHERE id=? AND status='pending'`,
      due,
      item.id,
    ),
    statement(
      env,
      `UPDATE scan_runs SET status='deferred' WHERE id=? AND completed_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM scan_run_items WHERE run_id=? AND status='running')`,
      item.run_id,
      item.run_id,
    ),
  ]);
}

async function completeCapture(
  env: CloudflareBindings,
  item: DueItem,
  claim: NonNullable<Awaited<ReturnType<typeof claimItem>>>,
  capture: EvidenceCapture,
  now: Date,
) {
  const id = crypto.randomUUID();
  const brand = capture.entities.find((entity) => entity.kind === 'brand');
  const competitors = capture.entities
    .filter((entity) => entity.kind === 'competitor' && entity.matched)
    .map((entity) => entity.id);
  await env.DB.batch([
    statement(
      env,
      `INSERT INTO scan_results
      (id,scan_run_id,project_id,prompt_id,provider,provider_model,provider_preset,observation_date,raw_response_text,evidence_version,
       request_context_json,evidence_json,received_at,reported_cost,citation_data_json,brand_mentioned,competitor_mentions_json,
       matched_terms_json,context_classification,provider_request_id,input_tokens,output_tokens,created_at)
      SELECT ?,?,?,?,'perplexity',?,'fast',?,?,'v2',?,?,?,?,?,?,?,?,?,?,?,?,?
      WHERE EXISTS(SELECT 1 FROM provider_call_reservations WHERE id=? AND lease_token=? AND status='reserved' AND lease_until>?)`,
      id,
      item.run_id,
      item.project_id,
      item.prompt_id,
      capture.model,
      claim.date,
      capture.text,
      JSON.stringify(claim.context),
      JSON.stringify(capture),
      now.getTime(),
      capture.reportedCost === null ? null : JSON.stringify(capture.reportedCost),
      JSON.stringify(capture.sources),
      brand?.matched ? 1 : 0,
      JSON.stringify(competitors),
      JSON.stringify(capture.entities.flatMap((entity) => entity.matchedTerms)),
      brand?.matched ? 'mentioned' : 'absent',
      capture.responseId,
      capture.inputTokens,
      capture.outputTokens,
      now.getTime(),
      claim.reservationId,
      claim.token,
      now.getTime(),
    ),
    statement(
      env,
      `UPDATE provider_call_reservations SET status='succeeded',provider_status=?,provider_request_id=?,input_tokens=?,output_tokens=?,reported_cost=?,completed_at=?
      WHERE id=? AND lease_token=? AND status='reserved' AND EXISTS(SELECT 1 FROM scan_results WHERE id=?)`,
      capture.providerStatus,
      capture.responseId,
      capture.inputTokens,
      capture.outputTokens,
      capture.reportedCost === null ? null : JSON.stringify(capture.reportedCost),
      now.getTime(),
      claim.reservationId,
      claim.token,
      id,
    ),
    statement(
      env,
      `UPDATE scan_run_items SET status='succeeded',terminal_reason=NULL WHERE id=? AND status='running'
      AND EXISTS(SELECT 1 FROM scan_results WHERE id=?)`,
      item.id,
      id,
    ),
    statement(
      env,
      `INSERT OR IGNORE INTO product_events
      (id,dedupe_key,schema_version,name,user_id,project_id,question_id,observation_id,received_at,occurred_at,source,properties_json)
      SELECT ?,?,1,'observation_captured',?,?,?,?,?,?,'server',? WHERE EXISTS(SELECT 1 FROM scan_results WHERE id=?)`,
      crypto.randomUUID(),
      `observation_captured:${id}`,
      item.user_id,
      item.project_id,
      item.prompt_id,
      id,
      now.getTime(),
      now.getTime(),
      JSON.stringify({ entityCount: capture.entities.length, sourceCount: capture.sources.length }),
      id,
    ),
  ]);
}

async function failCapture(
  env: CloudflareBindings,
  item: DueItem,
  claim: NonNullable<Awaited<ReturnType<typeof claimItem>>>,
  error: unknown,
  now: Date,
) {
  const failure = error instanceof CaptureError ? error : new CaptureError('CAPTURE_FAILED');
  await env.DB.batch([
    statement(
      env,
      `UPDATE scan_run_items SET status=CASE WHEN phase<>'paid' AND attempts_used<2 THEN 'pending' ELSE 'exhausted' END,
      due_at=?,terminal_reason=? WHERE id=? AND status='running'
      AND EXISTS(SELECT 1 FROM provider_call_reservations WHERE id=? AND lease_token=? AND status='reserved' AND lease_until>?)`,
      nextDay(now),
      failure.message,
      item.id,
      claim.reservationId,
      claim.token,
      now.getTime(),
    ),
    statement(
      env,
      `UPDATE provider_call_reservations SET status='failed',failure_code=?,provider_status=?,provider_response_json=?,completed_at=?
      WHERE id=? AND lease_token=? AND status='reserved' AND lease_until>?`,
      failure.message,
      failure.providerStatus,
      failure.raw === null
        ? failure.diagnostic === null
          ? null
          : JSON.stringify({ diagnostic: failure.diagnostic })
        : JSON.stringify(failure.raw),
      now.getTime(),
      claim.reservationId,
      claim.token,
      now.getTime(),
    ),
  ]);
}

export async function processDueScans(
  env: CloudflareBindings,
  limit = 20,
  now = new Date(),
): Promise<void> {
  const beganAt = Date.now();
  const clock = () => new Date(now.getTime() + Date.now() - beganAt);
  await recoverLeases(env, now);
  await reconcileEligibility(env, now);
  await finishRuns(env, now);
  await createDueRuns(env, now);
  const enabled = env.EXTERNAL_INTEGRATIONS_ENABLED === 'true' && env.V2_SCANS_ENABLED === 'true';
  if (!enabled) {
    await statement(
      env,
      `UPDATE scan_runs SET status='deferred' WHERE completed_at IS NULL AND phase IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM scan_run_items WHERE run_id=scan_runs.id AND status='running')`,
    ).run();
    return;
  }
  let remaining = Math.max(0, Math.min(20, Math.floor(limit)));
  while (remaining > 0) {
    const current = clock();
    const candidates = await statement(
      env,
      `SELECT i.*,r.project_id,r.context_version,p.user_id,q.text,q.updated_at
      FROM scan_run_items i JOIN scan_runs r ON r.id=i.run_id JOIN projects p ON p.id=r.project_id JOIN prompts q ON q.id=i.prompt_id
      WHERE i.status='pending' AND i.due_at<=? AND r.completed_at IS NULL
      ORDER BY i.due_at,(SELECT max(reserved_at) FROM provider_call_reservations a WHERE a.project_id=p.id),p.id,q.id`,
      current.getTime(),
    ).all<DueItem>();
    if (!candidates.results.length) break;
    const projects = new Set<string>();
    for (const item of candidates.results) {
      if (projects.has(item.project_id)) continue;
      projects.add(item.project_id);
      const claim = await claimItem(env, item, clock());
      if (!claim) {
        await deferItem(env, item, clock());
        continue;
      }
      remaining--;
      try {
        await completeCapture(
          env,
          item,
          claim,
          await captureEvidence(env.PERPLEXITY_API_KEY, claim.context),
          clock(),
        );
      } catch (error) {
        await failCapture(env, item, claim, error, clock());
      }
      if (remaining === 0) break;
    }
  }
  const finishedAt = clock();
  await reconcileEligibility(env, finishedAt);
  await finishRuns(env, finishedAt);
}

export async function readRun(env: CloudflareBindings, userId: string, runId: string) {
  const run = await statement(
    env,
    `SELECT r.* FROM scan_runs r JOIN projects p ON p.id=r.project_id WHERE r.id=? AND p.user_id=?`,
    runId,
    userId,
  ).first<{
    id: string;
    status: string;
    phase: string;
    observation_date: string;
    created_at: number;
    completed_at: number | null;
  }>();
  if (!run) return null;
  const items = await statement(
    env,
    `SELECT i.*,q.text,s.id AS observation_id,
    (SELECT failure_code FROM provider_call_reservations WHERE item_id=i.id ORDER BY reserved_at DESC LIMIT 1) AS failure_code
    FROM scan_run_items i JOIN prompts q ON q.id=i.prompt_id LEFT JOIN scan_results s ON s.scan_run_id=i.run_id AND s.prompt_id=i.prompt_id
    WHERE i.run_id=? ORDER BY q.created_at,q.id`,
    runId,
  ).all<{
    id: string;
    prompt_id: string;
    text: string;
    status: string;
    attempts_used: number;
    due_at: number;
    terminal_reason: string | null;
    failure_code: string | null;
    observation_id: string | null;
  }>();
  const count = (status: string) => items.results.filter((item) => item.status === status).length;
  const retries = items.results
    .filter((item) => item.status === 'pending')
    .map((item) => item.due_at);
  return {
    runId: run.id,
    status: run.status,
    phase: run.phase,
    observationDate: run.observation_date,
    createdAt: iso(run.created_at),
    completedAt: iso(run.completed_at),
    terminal: run.completed_at !== null,
    counts: {
      selected: items.results.length,
      pending: count('pending'),
      running: count('running'),
      successful: count('succeeded'),
      failed: count('exhausted'),
      cancelled: count('cancelled'),
      attempted: items.results.reduce((n, item) => n + item.attempts_used, 0),
    },
    nextRetryAt: retries.length ? iso(Math.min(...retries)) : null,
    items: items.results.map((item) => ({
      questionId: item.prompt_id,
      text: item.text,
      status: item.status,
      attemptsUsed: item.attempts_used,
      dueAt: iso(item.due_at),
      reason: item.terminal_reason,
      failureCode: item.failure_code,
      observationId: item.observation_id,
    })),
  };
}
