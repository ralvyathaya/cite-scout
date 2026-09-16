import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { z } from 'zod';
import { competitors, projects, prompts } from '../../db/schema';
import { normalizeDomain, normalizeText } from '../../domain/normalization';
import { createAuth } from '../auth';
import { readJsonLimited, requireSession } from '../http';

const projectInput = z.object({
  name: z.string().trim().min(1).max(80),
  brandName: z.string().trim().min(1).max(80),
  canonicalDomain: z.string().trim().max(253),
  competitors: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        canonicalDomain: z.string().trim().max(253).optional(),
      }),
    )
    .max(3)
    .default([]),
  prompts: z.array(z.string().trim().min(10).max(500)).min(3).max(10),
});
export const projectRoutes = new Hono<{ Bindings: CloudflareBindings }>();
projectRoutes.get('/', async (c) => {
  const auth = createAuth(c.env);
  const session = await requireSession(c, auth);
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  const db = drizzle(c.env.DB);
  const project = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .get();
  if (!project) return c.json({ data: null });
  const [projectCompetitors, projectPrompts] = await Promise.all([
    db.select().from(competitors).where(eq(competitors.projectId, project.id)),
    db.select().from(prompts).where(eq(prompts.projectId, project.id)),
  ]);
  return c.json({ data: { ...project, competitors: projectCompetitors, prompts: projectPrompts } });
});
projectRoutes.post('/', async (c) => {
  const auth = createAuth(c.env);
  const session = await requireSession(c, auth);
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  const parsed = projectInput.safeParse(await readJsonLimited(c.req.raw));
  if (!parsed.success)
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Check the project details.' } },
      422,
    );
  const db = drizzle(c.env.DB);
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.userId, session.user.id))
    .get();
  if (existing)
    return c.json(
      { error: { code: 'PROJECT_LIMIT', message: 'The MVP supports one project per account.' } },
      409,
    );
  const now = new Date();
  const projectId = crypto.randomUUID();
  const competitorRows = parsed.data.competitors.map((item) => ({
    id: crypto.randomUUID(),
    projectId,
    name: item.name,
    normalizedName: normalizeText(item.name),
    canonicalDomain: item.canonicalDomain ? normalizeDomain(item.canonicalDomain) : null,
    createdAt: now,
    updatedAt: now,
  }));
  const promptRows = parsed.data.prompts.map((text) => ({
    id: crypto.randomUUID(),
    projectId,
    text,
    normalizedText: normalizeText(text),
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }));
  await c.env.DB.batch(
    [
      db
        .insert(projects)
        .values({
          id: projectId,
          userId: session.user.id,
          name: parsed.data.name,
          brandName: parsed.data.brandName,
          canonicalDomain: normalizeDomain(parsed.data.canonicalDomain),
          createdAt: now,
          updatedAt: now,
        })
        .toSQL(),
      ...competitorRows.map((row) => db.insert(competitors).values(row).toSQL()),
      ...promptRows.map((row) => db.insert(prompts).values(row).toSQL()),
    ].map(({ sql, params }) => c.env.DB.prepare(sql).bind(...params)),
  );
  return c.json({ data: { id: projectId } }, 201);
});
projectRoutes.delete('/', async (c) => {
  const auth = createAuth(c.env);
  const session = await requireSession(c, auth);
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  const db = drizzle(c.env.DB);
  await db.delete(projects).where(and(eq(projects.userId, session.user.id)));
  return c.json({ data: { deleted: true } });
});
