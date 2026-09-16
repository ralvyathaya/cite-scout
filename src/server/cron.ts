import { and, asc, eq, notExists } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { projects, prompts, scanResults, subscriptions } from '../db/schema';
import { getEntitlement } from '../domain/entitlements';
import { utcDate } from '../domain/normalization';
import { runScan } from './scans';

export async function runScheduledScans(
  env: CloudflareBindings,
  scheduledTime: number,
): Promise<void> {
  const now = new Date(scheduledTime);
  const date = utcDate(now);
  const db = drizzle(env.DB);
  const candidates = await db
    .select({ projectId: projects.id, userId: projects.userId, promptId: prompts.id })
    .from(projects)
    .innerJoin(prompts, and(eq(prompts.projectId, projects.id), eq(prompts.enabled, true)))
    .where(
      notExists(
        db
          .select({ id: scanResults.id })
          .from(scanResults)
          .where(
            and(
              eq(scanResults.projectId, projects.id),
              eq(scanResults.promptId, prompts.id),
              eq(scanResults.provider, 'perplexity'),
              eq(scanResults.observationDate, date),
            ),
          ),
      ),
    )
    .orderBy(asc(projects.createdAt), asc(prompts.createdAt))
    .limit(Number(env.MAX_PROVIDER_CALLS_PER_CRON_INVOCATION));
  const byProject = new Map<string, { userId: string; promptIds: string[] }>();
  for (const candidate of candidates) {
    const subscription = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, candidate.userId))
      .get();
    if (
      !getEntitlement(
        subscription ? { status: subscription.status, endsAt: subscription.endsAt } : null,
        now,
      ).canScan
    )
      continue;
    const existing = byProject.get(candidate.projectId);
    if (existing) existing.promptIds.push(candidate.promptId);
    else
      byProject.set(candidate.projectId, {
        userId: candidate.userId,
        promptIds: [candidate.promptId],
      });
  }
  for (const [projectId, work] of byProject)
    await runScan(env, {
      userId: work.userId,
      projectId,
      promptIds: work.promptIds,
      trigger: 'scheduled',
      now,
    });
  console.log(
    JSON.stringify({
      event: 'cron_completed',
      observation_date: date,
      selected_calls: candidates.length,
      entitled_projects: byProject.size,
    }),
  );
}
