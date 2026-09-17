import { and, asc, desc, eq, lt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { z } from 'zod';
import { competitors, projects, prompts, scanResults } from '../../db/schema';
import { normalizeDomain, normalizeText } from '../../domain/normalization';
import { createAuth } from '../auth';
import { buildDashboard, getEntitlementSnapshot } from '../dashboard';
import { readJson, requireSession } from '../http';

const UNAUTH = { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } } as const;

export const dashboardRoutes = new Hono<{ Bindings: CloudflareBindings }>();

dashboardRoutes.get('/overview', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);

  const days = Math.min(Math.max(Number(c.req.query('days') ?? '14'), 1), 90);
  const snapshot = await buildDashboard(c.env.DB, session.user.id, days);

  if (!snapshot) {
    return c.json({ data: null, onboardingRequired: true, project: null, entitlement: null });
  }

  const entitlement = await getEntitlementSnapshot(c.env.DB, session.user.id);
  return c.json({ data: { ...snapshot, ...entitlement }, onboardingRequired: false });
});

dashboardRoutes.get('/responses', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session) return c.json(UNAUTH, 401);

  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? '20'), 1), 50);
  const before = c.req.query('before');

  const db = drizzle(c.env.DB);
  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .get();
  if (!project) return c.json({ data: { items: [], hasMore: false } });

  const rows = await db
    .select({
      id: scanResults.id,
      promptId: scanResults.promptId,
      promptText: prompts.text,
      observationDate: scanResults.observationDate,
      brandMentioned: scanResults.brandMentioned,
      brandPosition: scanResults.brandPosition,
      competitorMentionsJson: scanResults.competitorMentionsJson,
      matchedTermsJson: scanResults.matchedTermsJson,
      contextClassification: scanResults.contextClassification,
      provider: scanResults.provider,
      providerModel: scanResults.providerModel,
      providerPreset: scanResults.providerPreset,
      providerRequestId: scanResults.providerRequestId,
      inputTokens: scanResults.inputTokens,
      outputTokens: scanResults.outputTokens,
      citationDataJson: scanResults.citationDataJson,
      rawResponseText: scanResults.rawResponseText,
      errorCode: scanResults.errorCode,
      createdAt: scanResults.createdAt,
    })
    .from(scanResults)
    .innerJoin(prompts, eq(prompts.id, scanResults.promptId))
    .where(
      and(
        // Ownership comes from the authenticated user, never from the request body.
        eq(scanResults.projectId, project.id),
        before ? lt(scanResults.createdAt, new Date(Number(before))) : undefined,
      ),
    )
    .orderBy(desc(scanResults.createdAt))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return c.json({
    data: {
      items: page,
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit && last ? String(new Date(last.createdAt).getTime()) : null,
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

  const enabled = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(and(eq(prompts.projectId, project.id), eq(prompts.enabled, true)));
  if (enabled.length >= 10)
    return c.json(
      { error: { code: 'PROMPT_LIMIT', message: 'The MVP allows up to 10 enabled prompts.' } },
      409,
    );

  const now = new Date();
  const id = crypto.randomUUID();
  try {
    await db.insert(prompts).values({
      id,
      projectId: project.id,
      text: parsed.data.text,
      normalizedText: normalizeText(parsed.data.text),
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  } catch {
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
    .select({ id: prompts.id })
    .from(prompts)
    .innerJoin(projects, eq(projects.id, prompts.projectId))
    .where(and(eq(prompts.id, c.req.param('id')), eq(projects.userId, session.user.id)))
    .get();
  if (!owned) return c.json({ error: { code: 'NOT_FOUND', message: 'Prompt not found.' } }, 404);

  await db
    .update(prompts)
    .set({
      ...(parsed.data.text === undefined
        ? {}
        : { text: parsed.data.text, normalizedText: normalizeText(parsed.data.text) }),
      ...(parsed.data.enabled === undefined ? {} : { enabled: parsed.data.enabled }),
      updatedAt: new Date(),
    })
    .where(eq(prompts.id, owned.id));
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
      { error: { code: 'COMPETITOR_LIMIT', message: 'The MVP allows up to 3 competitors.' } },
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
