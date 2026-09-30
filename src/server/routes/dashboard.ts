import { and, asc, desc, eq, lt, or, sql, getTableColumns } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { z } from 'zod';
import { competitors, projects, prompts, scanResults } from '../../db/schema';
import { observationInsight } from '../../domain/insights';
import { normalizeDomain, normalizeText } from '../../domain/normalization';
import { createAuth } from '../auth';
import { buildDashboard, getEntitlementSnapshot } from '../dashboard';
import { readJson, requireSession } from '../http';
const UNAUTH = { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } } as const;
export const dashboardRoutes = new Hono<{ Bindings: CloudflareBindings }>();
dashboardRoutes.get('/overview', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);
  const parsedDays = z.coerce
    .number()
    .int()
    .min(1)
    .max(90)
    .safeParse(c.req.query('days') ?? '14');
  if (!parsedDays.success)
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Days must be 1–90.' } }, 422);
  const days = parsedDays.data;
  const snapshot = await buildDashboard(c.env.DB, session.user.id, days);
  if (!snapshot) {
    return c.json({ data: null, onboardingRequired: true, project: null, entitlement: null });
  }
  const entitlement = await getEntitlementSnapshot(c.env, session.user.id);
  return c.json({ data: { ...snapshot, ...entitlement }, onboardingRequired: false });
});
dashboardRoutes.get('/responses/:id', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);
  const db = drizzle(c.env.DB);
  const row = await db
    .select({ ...getTableColumns(scanResults), promptText: prompts.text })
    .from(scanResults)
    .innerJoin(projects, eq(projects.id, scanResults.projectId))
    .innerJoin(prompts, eq(prompts.id, scanResults.promptId))
    .where(and(eq(scanResults.id, c.req.param('id')), eq(projects.userId, session.user.id)))
    .get();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Response not found.' } }, 404);
  const tracked = await db
    .select()
    .from(competitors)
    .where(eq(competitors.projectId, row.projectId));
  return c.json({
    data: {
      ...row,
      insight: observationInsight(row, new Map(tracked.map((item) => [item.id, item.name]))),
    },
  });
});
dashboardRoutes.get('/responses', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);
  const parsedLimit = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .safeParse(c.req.query('limit') ?? '20');
  const before = c.req.query('before');
  const [millis, beforeId] = before?.split(':') ?? [];
  if (
    !parsedLimit.success ||
    (before &&
      (!/^\d+(?::[^:]+)?$/u.test(before) || !Number.isFinite(new Date(Number(millis)).getTime())))
  )
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid response pagination.' } },
      422,
    );
  const limit = parsedLimit.data;
  const db = drizzle(c.env.DB);
  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .get();
  if (!project) return c.json({ data: { items: [], hasMore: false, nextCursor: null } });
  const rows = await db
    .select({ ...getTableColumns(scanResults), promptText: prompts.text })
    .from(scanResults)
    .innerJoin(prompts, eq(prompts.id, scanResults.promptId))
    .where(
      and(
        eq(scanResults.projectId, project.id),
        before
          ? or(
              lt(scanResults.createdAt, new Date(Number(millis))),
              beforeId
                ? and(
                    eq(scanResults.createdAt, new Date(Number(millis))),
                    lt(scanResults.id, beforeId),
                  )
                : undefined,
            )
          : undefined,
      ),
    )
    .orderBy(desc(scanResults.createdAt), desc(scanResults.id))
    .limit(limit + 1);
  const tracked = await db.select().from(competitors).where(eq(competitors.projectId, project.id));
  const names = new Map(tracked.map((item) => [item.id, item.name]));
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return c.json({
    data: {
      items: page.map((row) => ({ ...row, insight: observationInsight(row, names) })),
      hasMore: rows.length > limit,
      nextCursor:
        rows.length > limit && last ? `${String(last.createdAt.getTime())}:${last.id}` : null,
    },
  });
});
export const promptRoutes = new Hono<{ Bindings: CloudflareBindings }>();
promptRoutes.get('/', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);
  const db = drizzle(c.env.DB);
  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .get();
  if (!project) return c.json({ data: [] });
  const rows = await db
    .select()
    .from(prompts)
    .where(eq(prompts.projectId, project.id))
    .orderBy(asc(prompts.createdAt));
  return c.json({ data: rows });
});
const promptInput = z.object({ text: z.string().trim().min(10).max(500) });
promptRoutes.post('/', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);
  const parsed = promptInput.safeParse(await readJson(c.req.raw));
  if (!parsed.success)
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Prompt must be 10-500 characters.' } },
      422,
    );
  const db = drizzle(c.env.DB);
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .get();
  if (!project)
    return c.json({ error: { code: 'NO_PROJECT', message: 'Create a project first.' } }, 409);
  const now = Date.now();
  const id = crypto.randomUUID();
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO prompts (id,project_id,text,normalized_text,enabled,created_at,updated_at)
      SELECT ?,?,?,?,1,?,? WHERE (SELECT count(*) FROM prompts WHERE project_id = ? AND enabled = 1) < 10 RETURNING id`,
    )
      .bind(id, project.id, parsed.data.text, normalizeText(parsed.data.text), now, now, project.id)
      .all();
    if (result.results.length === 0)
      return c.json(
        { error: { code: 'PROMPT_LIMIT', message: 'Up to 10 prompts can be enabled at once.' } },
        409,
      );
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('UNIQUE')) throw error;
    return c.json(
      { error: { code: 'DUPLICATE_PROMPT', message: 'That prompt already exists.' } },
      409,
    );
  }
  return c.json({ data: { id } }, 201);
});
promptRoutes.patch('/:id', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);
  const parsed = z
    .object({
      text: z.string().trim().min(10).max(500).optional(),
      enabled: z.boolean().optional(),
    })
    .safeParse(await readJson(c.req.raw));
  if (!parsed.success)
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid prompt update.' } }, 422);
  const db = drizzle(c.env.DB);
  const owned = await db
    .select({ id: prompts.id, projectId: prompts.projectId })
    .from(prompts)
    .innerJoin(projects, eq(projects.id, prompts.projectId))
    .where(and(eq(prompts.id, c.req.param('id')), eq(projects.userId, session.user.id)))
    .get();
  if (!owned) return c.json({ error: { code: 'NOT_FOUND', message: 'Prompt not found.' } }, 404);
  const updated = await db
    .update(prompts)
    .set({
      ...(parsed.data.text === undefined
        ? {}
        : { text: parsed.data.text, normalizedText: normalizeText(parsed.data.text) }),
      ...(parsed.data.enabled === undefined ? {} : { enabled: parsed.data.enabled }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(prompts.id, owned.id),
        parsed.data.enabled === true
          ? sql`(${prompts.enabled} = 1 OR (SELECT count(*) FROM prompts other WHERE other.project_id = ${owned.projectId} AND other.enabled = 1) < 10)`
          : undefined,
      ),
    )
    .returning({ id: prompts.id });
  if (updated.length === 0)
    return c.json(
      { error: { code: 'PROMPT_LIMIT', message: 'Up to 10 prompts can be enabled at once.' } },
      409,
    );
  return c.json({ data: { updated: true } });
});
promptRoutes.delete('/:id', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);
  const db = drizzle(c.env.DB);
  const owned = await db
    .select({ id: prompts.id })
    .from(prompts)
    .innerJoin(projects, eq(projects.id, prompts.projectId))
    .where(and(eq(prompts.id, c.req.param('id')), eq(projects.userId, session.user.id)))
    .get();
  if (!owned) return c.json({ error: { code: 'NOT_FOUND', message: 'Prompt not found.' } }, 404);
  await db.delete(prompts).where(eq(prompts.id, owned.id));
  return c.json({ data: { deleted: true } });
});
export const competitorRoutes = new Hono<{ Bindings: CloudflareBindings }>();
competitorRoutes.get('/', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);
  const db = drizzle(c.env.DB);
  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .get();
  if (!project) return c.json({ data: [] });
  const rows = await db
    .select()
    .from(competitors)
    .where(eq(competitors.projectId, project.id))
    .orderBy(asc(competitors.createdAt));
  return c.json({ data: rows });
});
competitorRoutes.post('/', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      canonicalDomain: z.string().trim().max(253).optional(),
    })
    .safeParse(await readJson(c.req.raw));
  if (!parsed.success)
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Enter a competitor name.' } },
      422,
    );
  const db = drizzle(c.env.DB);
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .get();
  if (!project)
    return c.json({ error: { code: 'NO_PROJECT', message: 'Create a project first.' } }, 409);
  const existing = await db
    .select({ id: competitors.id })
    .from(competitors)
    .where(eq(competitors.projectId, project.id));
  if (existing.length >= 3)
    return c.json(
      {
        error: {
          code: 'COMPETITOR_LIMIT',
          message: 'CiteScout currently supports up to 3 competitors per project.',
        },
      },
      409,
    );
  let domain: string | null = null;
  if (parsed.data.canonicalDomain) {
    try {
      domain = normalizeDomain(parsed.data.canonicalDomain);
    } catch {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Enter a valid competitor domain.' } },
        422,
      );
    }
  }
  const now = new Date();
  const id = crypto.randomUUID();
  try {
    await db.insert(competitors).values({
      id,
      projectId: project.id,
      name: parsed.data.name,
      normalizedName: normalizeText(parsed.data.name),
      canonicalDomain: domain,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    return c.json(
      { error: { code: 'DUPLICATE_COMPETITOR', message: 'That competitor already exists.' } },
      409,
    );
  }
  return c.json({ data: { id } }, 201);
});
competitorRoutes.delete('/:id', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);
  const db = drizzle(c.env.DB);
  const owned = await db
    .select({ id: competitors.id })
    .from(competitors)
    .innerJoin(projects, eq(projects.id, competitors.projectId))
    .where(and(eq(competitors.id, c.req.param('id')), eq(projects.userId, session.user.id)))
    .get();
  if (!owned)
    return c.json({ error: { code: 'NOT_FOUND', message: 'Competitor not found.' } }, 404);
  await db.delete(competitors).where(eq(competitors.id, owned.id));
  return c.json({ data: { deleted: true } });
});
