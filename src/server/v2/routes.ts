import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { pilotEnrollments, prompts } from '../../db/schema';
import { normalizeDomain, normalizeText } from '../../domain/normalization';
import { createAuth } from '../auth';
import { readJson } from '../http';
import { consumeRateLimit } from '../rate-limit';
import { eventStatement } from './events';
import { cancelTrial, processDueScans, readRun, startScan } from './scans';
import { geoRoutes } from './geo-routes';
import {
  ownedProject,
  paidAccess,
  projectPayload,
  questionRows,
  questionView,
  observationPayload,
} from './read-model';

export const v2Routes = new Hono<{ Bindings: CloudflareBindings; Variables: { userId: string } }>();
const activeTrial = `EXISTS(SELECT 1 FROM pilot_enrollments e WHERE e.user_id=projects.user_id AND e.trial_state IN ('baseline','waiting','followup') AND e.expires_at>?)`;
const questionText = z.string().trim().min(10).max(500);
const domain = z
  .string()
  .trim()
  .max(253)
  .transform((value, ctx) => {
    try {
      const url = new URL(value.includes('://') ? value : `https://${value}`);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hostname === 'localhost' ||
        /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
      )
        throw new Error();
      const host = normalizeDomain(value);
      if (
        !host.split('.').every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)) ||
        /^\d+$/.test(host.split('.').at(-1) ?? '')
      )
        throw new Error();
      return host;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a public website domain.' });
      return z.NEVER;
    }
  });
const competitorInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  canonicalDomain: domain
    .nullish()
    .or(z.literal(''))
    .transform((v) => (v === '' ? null : (v ?? null))),
});
const identity = z.object({
  brandName: z.string().trim().min(1).max(80),
  canonicalDomain: domain,
  competitors: z.array(competitorInput).min(1).max(3),
});
function uniqueIdentity(value: z.infer<typeof identity>) {
  const names = [value.brandName, ...value.competitors.map((c) => c.name)].map(normalizeText);
  if (new Set(names).size !== names.length) throw new Error('DUPLICATE_INPUT');
}
function parsed<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error('VALIDATION_ERROR');
  return result.data;
}
async function hash(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))),
    ),
  )
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
const sql = (env: CloudflareBindings, query: string, ...params: unknown[]) =>
  env.DB.prepare(query).bind(...params);
const errorMessages: Record<string, string> = {
  VALIDATION_ERROR: 'Check the supplied details.',
  DUPLICATE_INPUT: 'Use distinct names and buyer questions.',
  PROJECT_NOT_FOUND: 'Project not found.',
  QUESTION_NOT_FOUND: 'Question not found.',
  PROJECT_LIMIT: 'One project is supported per account.',
  PILOT_ENROLLMENT_REQUIRED: 'The pilot is founder-assisted. Contact support to join.',
  PAID_ACCESS_REQUIRED: 'A paid subscription is required for this change.',
  TRIAL_CONTEXT_LOCKED: 'Stop the trial before changing its frozen questions or competitors.',
  CONFLICT: 'The configuration changed in another tab. Reload and try again.',
  CONFIGURATION_CHANGED:
    'The configuration changed while starting this check. Reload and try again.',
  QUESTION_LIMIT: 'You can monitor up to ten active questions.',
  QUESTION_EXISTS: 'This question already exists; resume it instead.',
  REPLACE_REQUIRED: 'This question has evidence. Create a replacement to preserve its history.',
  TRIAL_ALREADY_USED: 'This account has already started its trial.',
  PAID_STARTS_NEXT_UTC_DAY: 'Paid monitoring starts on the next UTC day.',
  INVALID_QUESTION_COUNT: 'Select three questions for a baseline or up to ten for paid monitoring.',
  INVALID_COMPETITOR_COUNT: 'Track one to three competitors.',
  USE_V2_FLOW: 'Finish project setup before scanning.',
};
v2Routes.use('*', async (c, next) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  c.set('userId', session.user.id);
  try {
    await next();
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (!errorMessages[code]) throw error;
    return c.json(
      { error: { code, message: errorMessages[code] } },
      code.endsWith('NOT_FOUND')
        ? 404
        : code === 'VALIDATION_ERROR' || code === 'DUPLICATE_INPUT'
          ? 422
          : code.includes('REQUIRED') && code !== 'REPLACE_REQUIRED'
            ? 403
            : 409,
    );
  }
});
v2Routes.route('/geo', geoRoutes);
v2Routes.get('/project', async (c) =>
  c.json({ data: await projectPayload(c.env, c.get('userId')) }),
);
v2Routes.post('/project', async (c) => {
  const userId = c.get('userId');
  const input = parsed(
    identity.extend({
      questions: z.array(questionText).length(3),
      idempotencyKey: z.string().min(8).max(100),
    }),
    await readJson(c.req.raw),
  );
  uniqueIdentity(input);
  if (new Set(input.questions.map(normalizeText)).size !== 3) throw new Error('DUPLICATE_INPUT');
  const contentHash = await hash({
    brandName: input.brandName,
    canonicalDomain: input.canonicalDomain,
    competitors: input.competitors,
    questions: input.questions,
  });
  const existing = await ownedProject(c.env, userId);
  if (existing) {
    if (existing.creationKey === input.idempotencyKey && existing.creationHash === contentHash)
      return c.json({ data: { projectId: existing.id } });
    throw new Error('PROJECT_LIMIT');
  }
  const enrollment = await drizzle(c.env.DB)
    .select()
    .from(pilotEnrollments)
    .where(eq(pilotEnrollments.userId, userId))
    .get();
  if (!enrollment && !(await paidAccess(c.env, userId)))
    throw new Error('PILOT_ENROLLMENT_REQUIRED');
  const projectId = crypto.randomUUID();
  const now = Date.now();
  const statements = [
    sql(
      c.env,
      `INSERT OR IGNORE INTO projects
    (id,user_id,name,brand_name,canonical_domain,context_version,v2_enabled_at,creation_key,creation_hash,created_at,updated_at)
    VALUES(?,?,?,?,?,1,?,?,?,?,?)`,
      projectId,
      userId,
      input.brandName,
      input.brandName,
      input.canonicalDomain,
      now,
      input.idempotencyKey,
      contentHash,
      now,
      now,
    ),
  ];
  const questionIds: string[] = [];
  for (const text of input.questions) {
    const id = crypto.randomUUID();
    questionIds.push(id);
    statements.push(
      sql(
        c.env,
        `INSERT INTO prompts
    (id,project_id,text,normalized_text,enabled,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=?)`,
        id,
        projectId,
        text,
        normalizeText(text),
        now,
        now,
        projectId,
      ),
    );
  }
  for (const item of input.competitors)
    statements.push(
      sql(
        c.env,
        `INSERT INTO competitors
    (id,project_id,name,normalized_name,canonical_domain,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=?)`,
        crypto.randomUUID(),
        projectId,
        item.name,
        normalizeText(item.name),
        item.canonicalDomain,
        now,
        now,
        projectId,
      ),
    );
  // Domain state and enrollment event share the transaction; no claim of an answer yet.
  statements.push(
    sql(
      c.env,
      `INSERT OR IGNORE INTO product_events
    (id,dedupe_key,name,user_id,project_id,received_at,occurred_at,source,properties_json)
    SELECT ?,?,'questions_committed',?,?,?,?,'server','{}' WHERE EXISTS(SELECT 1 FROM projects WHERE id=?)`,
      crypto.randomUUID(),
      `questions_committed:${userId}`,
      userId,
      projectId,
      now,
      now,
      projectId,
    ),
  );
  await c.env.DB.batch(statements);
  const saved = await ownedProject(c.env, userId);
  if (saved?.creationHash !== contentHash || saved.creationKey !== input.idempotencyKey)
    throw new Error('CONFLICT');
  return c.json({ data: { projectId: saved.id, questionIds } }, 201);
});

async function mutation(env: CloudflareBindings, userId: string) {
  const project = await ownedProject(env, userId);
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  const enrollment = await drizzle(env.DB)
    .select()
    .from(pilotEnrollments)
    .where(eq(pilotEnrollments.userId, userId))
    .get();
  if (
    enrollment &&
    ['baseline', 'waiting', 'followup'].includes(enrollment.trialState) &&
    (enrollment.expiresAt?.getTime() ?? 0) > Date.now()
  )
    throw new Error('TRIAL_CONTEXT_LOCKED');
  const key = crypto.randomUUID();
  const now = Math.max(Date.now(), project.updatedAt.getTime() + 1);
  const claim = sql(
    env,
    `UPDATE projects SET mutation_key=?,updated_at=?,v2_enabled_at=COALESCE(v2_enabled_at,?)
    WHERE id=? AND updated_at=? AND NOT ${activeTrial}`,
    key,
    now,
    now,
    project.id,
    project.updatedAt.getTime(),
    now,
  );
  const guard = `EXISTS(SELECT 1 FROM projects WHERE id='${project.id}' AND mutation_key='${key}')`;
  return { project, key, now, claim, guard };
}
async function checkedBatch(
  env: CloudflareBindings,
  claim: D1PreparedStatement,
  rest: D1PreparedStatement[],
) {
  const result = await env.DB.batch([claim, ...rest]);
  if (!result[0]?.meta.changes) throw new Error('CONFLICT');
}
v2Routes.patch('/project', async (c) => {
  const input = parsed(
    identity.extend({ expectedContextVersion: z.number().int().positive() }),
    await readJson(c.req.raw),
  );
  uniqueIdentity(input);
  const m = await mutation(c.env, c.get('userId'));
  if (input.expectedContextVersion !== m.project.contextVersion) throw new Error('CONFLICT');
  const current = await sql(
    c.env,
    'SELECT id,name,normalized_name,canonical_domain,archived_at FROM competitors WHERE project_id=?',
    m.project.id,
  ).all<{
    id: string;
    name: string;
    normalized_name: string;
    canonical_domain: string | null;
    archived_at: number | null;
  }>();
  const rows = input.competitors.map((item) => {
    const found = item.id
      ? current.results.find((r) => r.id === item.id)
      : current.results.find((r) => r.normalized_name === normalizeText(item.name));
    if (item.id && !found) throw new Error('CONFLICT');
    return { ...item, id: found?.id ?? crypto.randomUUID() };
  });
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error('DUPLICATE_INPUT');
  if (
    rows.some((row) =>
      current.results.some(
        (old) => old.id !== row.id && old.normalized_name === normalizeText(row.name),
      ),
    )
  )
    throw new Error('CONFLICT');
  const same =
    m.project.brandName === input.brandName &&
    m.project.canonicalDomain === input.canonicalDomain &&
    current.results.filter((r) => !r.archived_at).length === rows.length &&
    rows.every((r) =>
      current.results.some(
        (old) =>
          old.id === r.id &&
          old.name === r.name &&
          old.canonical_domain === r.canonicalDomain &&
          !old.archived_at,
      ),
    );
  if (same) return c.json({ data: await projectPayload(c.env, c.get('userId')) });
  const changes = [
    sql(
      c.env,
      `UPDATE projects SET brand_name=?,canonical_domain=?,context_version=context_version+1 WHERE id=? AND mutation_key=?`,
      input.brandName,
      input.canonicalDomain,
      m.project.id,
      m.key,
    ),
    sql(
      c.env,
      `UPDATE competitors SET archived_at=?,updated_at=? WHERE project_id=? AND ${m.guard}`,
      m.now,
      m.now,
      m.project.id,
    ),
  ];
  for (const item of rows)
    changes.push(
      sql(
        c.env,
        `INSERT INTO competitors(id,project_id,name,normalized_name,canonical_domain,created_at,updated_at,archived_at)
    SELECT ?,?,?,?,?,?,?,NULL WHERE ${m.guard} ON CONFLICT(id) DO UPDATE SET name=excluded.name,normalized_name=excluded.normalized_name,canonical_domain=excluded.canonical_domain,updated_at=excluded.updated_at,archived_at=NULL`,
        item.id,
        m.project.id,
        item.name,
        normalizeText(item.name),
        item.canonicalDomain,
        m.now,
        m.now,
      ),
    );
  changes.push(
    sql(
      c.env,
      `UPDATE scan_run_items SET status='cancelled',terminal_reason='configuration_changed' WHERE status='pending' AND run_id IN (SELECT id FROM scan_runs WHERE project_id=?) AND ${m.guard}`,
      m.project.id,
    ),
  );
  await checkedBatch(c.env, m.claim, changes);
  return c.json({ data: await projectPayload(c.env, c.get('userId')) });
});
v2Routes.get('/questions', async (c) =>
  c.json({ data: await questionRows(c.env, c.get('userId')) }),
);
v2Routes.post('/questions', async (c) => {
  const input = parsed(z.object({ text: questionText }), await readJson(c.req.raw));
  if (!(await paidAccess(c.env, c.get('userId')))) throw new Error('PAID_ACCESS_REQUIRED');
  const m = await mutation(c.env, c.get('userId'));
  const existing = await sql(
    c.env,
    'SELECT id FROM prompts WHERE project_id=? AND normalized_text=?',
    m.project.id,
    normalizeText(input.text),
  ).first();
  if (existing)
    return c.json(
      { error: { code: 'QUESTION_EXISTS', message: errorMessages.QUESTION_EXISTS, existing } },
      409,
    );
  const id = crypto.randomUUID();
  const outcome = await c.env.DB.batch([
    m.claim,
    sql(
      c.env,
      `INSERT INTO prompts(id,project_id,text,normalized_text,enabled,created_at,updated_at)
    SELECT ?,?,?,?,1,?,? WHERE ${m.guard} AND (SELECT count(*) FROM prompts WHERE project_id=? AND enabled=1 AND archived_at IS NULL)<10`,
      id,
      m.project.id,
      input.text,
      normalizeText(input.text),
      m.now,
      m.now,
      m.project.id,
    ),
  ]);
  if (!outcome[0]?.meta.changes) throw new Error('CONFLICT');
  if (!outcome[1]?.meta.changes) throw new Error('QUESTION_LIMIT');
  return c.json({ data: { id } }, 201);
});
v2Routes.patch('/questions/:id', async (c) => {
  const input = parsed(
    z.object({
      action: z.enum(['pause', 'resume', 'archive']).optional(),
      text: questionText.optional(),
      expectedUpdatedAt: z.iso.datetime(),
    }),
    await readJson(c.req.raw),
  );
  const m = await mutation(c.env, c.get('userId'));
  const q = await drizzle(c.env.DB)
    .select()
    .from(prompts)
    .where(and(eq(prompts.id, c.req.param('id')), eq(prompts.projectId, m.project.id)))
    .get();
  if (!q) throw new Error('QUESTION_NOT_FOUND');
  if (q.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error('CONFLICT');
  if (input.text && input.action) throw new Error('VALIDATION_ERROR');
  if (!input.text && !input.action) throw new Error('VALIDATION_ERROR');
  if (input.action === 'resume' && !(await paidAccess(c.env, c.get('userId'))))
    throw new Error('PAID_ACCESS_REQUIRED');
  if (
    input.text &&
    (await sql(
      c.env,
      'SELECT id FROM provider_call_reservations WHERE prompt_id=? LIMIT 1',
      q.id,
    ).first())
  )
    throw new Error('REPLACE_REQUIRED');
  if (
    input.text &&
    (await sql(
      c.env,
      'SELECT id FROM prompts WHERE project_id=? AND normalized_text=? AND id<>?',
      m.project.id,
      normalizeText(input.text),
      q.id,
    ).first())
  )
    throw new Error('QUESTION_EXISTS');
  const query = input.text
    ? sql(
        c.env,
        `UPDATE prompts SET text=?,normalized_text=?,updated_at=? WHERE id=? AND ${m.guard} AND NOT EXISTS(SELECT 1 FROM provider_call_reservations WHERE prompt_id=?)`,
        input.text,
        normalizeText(input.text),
        m.now,
        q.id,
        q.id,
      )
    : sql(
        c.env,
        `UPDATE prompts SET enabled=?,archived_at=?,updated_at=? WHERE id=? AND ${m.guard}
      AND (?<>1 OR (SELECT count(*) FROM prompts WHERE project_id=? AND id<>? AND enabled=1 AND archived_at IS NULL)<10)`,
        Number(input.action === 'resume'),
        input.action === 'archive' ? m.now : null,
        m.now,
        q.id,
        Number(input.action === 'resume'),
        m.project.id,
        q.id,
      );
  const result = await c.env.DB.batch([
    m.claim,
    query,
    sql(
      c.env,
      `UPDATE scan_run_items SET status='cancelled',terminal_reason='question_changed' WHERE prompt_id=? AND status='pending' AND ${m.guard} AND EXISTS(SELECT 1 FROM prompts WHERE id=? AND updated_at=?)`,
      q.id,
      q.id,
      m.now,
    ),
  ]);
  if (!result[0]?.meta.changes) throw new Error('CONFLICT');
  if (!result[1]?.meta.changes) throw new Error(input.text ? 'REPLACE_REQUIRED' : 'QUESTION_LIMIT');
  return c.json({ data: { id: q.id } });
});
v2Routes.post('/questions/:id/replacement', async (c) => {
  const input = parsed(z.object({ text: questionText }), await readJson(c.req.raw));
  if (!(await paidAccess(c.env, c.get('userId')))) throw new Error('PAID_ACCESS_REQUIRED');
  const m = await mutation(c.env, c.get('userId'));
  const q = await drizzle(c.env.DB)
    .select()
    .from(prompts)
    .where(and(eq(prompts.id, c.req.param('id')), eq(prompts.projectId, m.project.id)))
    .get();
  if (!q) throw new Error('QUESTION_NOT_FOUND');
  if (
    await sql(
      c.env,
      'SELECT id FROM prompts WHERE project_id=? AND normalized_text=?',
      m.project.id,
      normalizeText(input.text),
    ).first()
  )
    throw new Error('QUESTION_EXISTS');
  const id = crypto.randomUUID();
  // Replacing an inactive question stays inactive, so replacement cannot bypass the active limit.
  await checkedBatch(c.env, m.claim, [
    sql(
      c.env,
      `UPDATE prompts SET enabled=0,archived_at=?,updated_at=? WHERE id=? AND ${m.guard}`,
      m.now,
      m.now,
      q.id,
    ),
    sql(
      c.env,
      `INSERT INTO prompts(id,project_id,text,normalized_text,enabled,created_at,updated_at,replaces_question_id)
      SELECT ?,?,?,?,?,?,?,? WHERE ${m.guard}`,
      id,
      m.project.id,
      input.text,
      normalizeText(input.text),
      Number(q.enabled && !q.archivedAt),
      m.now,
      m.now,
      q.id,
    ),
    sql(
      c.env,
      `UPDATE scan_run_items SET status='cancelled',terminal_reason='question_replaced' WHERE prompt_id=? AND status='pending' AND ${m.guard}`,
      q.id,
    ),
  ]);
  return c.json({ data: { id, replacesQuestionId: q.id } }, 201);
});
v2Routes.get('/questions/:id/history', async (c) => {
  const project = await ownedProject(c.env, c.get('userId'));
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  const q = await drizzle(c.env.DB)
    .select()
    .from(prompts)
    .where(and(eq(prompts.id, c.req.param('id')), eq(prompts.projectId, project.id)))
    .get();
  if (!q) throw new Error('QUESTION_NOT_FOUND');
  let at = Number.MAX_SAFE_INTEGER;
  let id = '\uffff';
  const cursor = c.req.query('cursor');
  if (cursor) {
    try {
      const v = parsed(z.tuple([z.number(), z.string().max(100)]), JSON.parse(atob(cursor)));
      [at, id] = v;
    } catch {
      throw new Error('VALIDATION_ERROR');
    }
  }
  const rows = await sql(
    c.env,
    `SELECT * FROM (
    SELECT id,'observation' AS kind,created_at AS at,'succeeded' AS status,evidence_version AS evidenceVersion,NULL AS failureCode FROM scan_results WHERE project_id=? AND prompt_id=?
    UNION ALL SELECT id,'attempt' AS kind,reserved_at AS at,status,NULL AS evidenceVersion,failure_code AS failureCode FROM provider_call_reservations WHERE project_id=? AND prompt_id=? AND status<>'succeeded'
    ) WHERE at<? OR (at=? AND id<?) ORDER BY at DESC,id DESC LIMIT 21`,
    project.id,
    q.id,
    project.id,
    q.id,
    at,
    at,
    id,
  ).all<{
    id: string;
    kind: string;
    at: number;
    status: string;
    evidenceVersion: string | null;
    failureCode: string | null;
  }>();
  const selected = rows.results.slice(0, 20);
  const last = selected.at(-1);
  return c.json({
    data: {
      question: questionView(q),
      entries: selected.map((r) => ({ ...r, at: new Date(r.at).toISOString() })),
      nextCursor:
        rows.results.length > 20 && last ? btoa(JSON.stringify([last.at, last.id])) : null,
    },
  });
});
v2Routes.get('/observations/:id', async (c) => {
  const data = await observationPayload(
    c.env,
    c.get('userId'),
    c.req.param('id'),
    c.req.query('compareTo'),
  );
  return data
    ? c.json({ data })
    : c.json({ error: { code: 'NOT_FOUND', message: 'Observation not found.' } }, 404);
});
v2Routes.get('/observations/:id/raw', async (c) => {
  const data = await observationPayload(c.env, c.get('userId'), c.req.param('id'));
  if (!data?.observation.capture)
    return c.json({ error: { code: 'NOT_FOUND', message: 'Original response unavailable.' } }, 404);
  c.header('Content-Disposition', 'attachment; filename="observation.json"');
  c.header('X-Content-Type-Options', 'nosniff');
  return c.text(JSON.stringify(data.observation.capture.raw, null, 2));
});
v2Routes.post('/scans', async (c) => {
  const input = parsed(
    z.object({ mode: z.enum(['baseline', 'today']) }),
    await readJson(c.req.raw),
  );
  const runId = await startScan(c.env, c.get('userId'), input.mode);
  c.executionCtx.waitUntil(
    processDueScans(c.env, 1).catch(() => {
      console.error(JSON.stringify({ event: 'v2_background_scan_failed', runId }));
    }),
  );
  return c.json({ data: { runId, status: 'pending', statusUrl: `/api/v2/scans/${runId}` } }, 202);
});
v2Routes.get('/scans/:id', async (c) => {
  const data = await readRun(c.env, c.get('userId'), c.req.param('id'));
  return data
    ? c.json({ data })
    : c.json({ error: { code: 'NOT_FOUND', message: 'Scan not found.' } }, 404);
});
v2Routes.post('/trial/cancel', async (c) => {
  await cancelTrial(c.env, c.get('userId'));
  return c.json({ data: { cancelled: true } });
});
export const clientEvent = z.object({
  name: z.enum(['answer_inspected', 'source_opened', 'comparison_inspected']),
  observationId: z.uuid(),
  compareToId: z.uuid().optional(),
  sourceKey: z
    .string()
    .regex(/^\d+:\d+$/)
    .max(40)
    .optional(),
  occurredAt: z.iso.datetime().optional(),
});
v2Routes.post('/events', async (c) => {
  const userId = c.get('userId');
  if (!(await consumeRateLimit(c.env.DB, `v2:events:${userId}`, 60, 60)))
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Try later.' } }, 429);
  const input = parsed(
    z.object({ events: z.array(clientEvent).max(20) }),
    await readJson(c.req.raw),
  );
  const now = new Date();
  const statements: D1PreparedStatement[] = [];
  const project = await ownedProject(c.env, userId);
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  for (const event of input.events) {
    const evidence = await observationPayload(
      c.env,
      userId,
      event.observationId,
      event.compareToId,
    );
    if (!evidence?.observation.capture) continue;
    if (
      event.name === 'source_opened' &&
      !evidence.observation.capture.sources.some((s) => s.key === event.sourceKey)
    )
      continue;
    if (event.name === 'comparison_inspected' && (!event.compareToId || !evidence.delta?.eligible))
      continue;
    const date = now.toISOString().slice(0, 10);
    const dedupeKey = [
      event.name,
      userId,
      event.observationId,
      event.name === 'comparison_inspected'
        ? event.compareToId
        : event.name === 'source_opened'
          ? event.sourceKey
          : '',
      date,
    ].join(':');
    statements.push(
      eventStatement(c.env, {
        name: event.name,
        dedupeKey,
        userId,
        projectId: project.id,
        questionId: evidence.observation.questionId,
        observationId: event.observationId,
        compareToId: event.compareToId,
        source: 'client',
        now,
        occurredAt: event.occurredAt ? new Date(event.occurredAt) : now,
        properties: event.name === 'source_opened' ? { sourceKey: event.sourceKey } : {},
      }),
    );
  }
  if (statements.length) await c.env.DB.batch(statements);
  return c.json({ data: { accepted: statements.length } }, 202);
});
