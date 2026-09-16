import { and, eq, gte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
  competitors,
  projects,
  prompts,
  providerCallReservations,
  scanResults,
  scanRuns,
  subscriptions,
} from '../db/schema';
import { getEntitlement } from '../domain/entitlements';
import { analyzeMentions } from '../domain/mentions';
import { utcDate } from '../domain/normalization';
import {
  neutralResearchInstruction,
  PerplexityProvider,
  type ObservationProvider,
} from '../integrations/perplexity/provider';

export interface ScanRequest {
  userId: string;
  projectId: string;
  promptIds: string[];
  trigger: 'trial' | 'manual' | 'scheduled';
  now?: Date;
  provider?: ObservationProvider;
}
export interface ScanSummary {
  scanRunId: string;
  status: 'completed' | 'partial' | 'failed' | 'deferred';
  attempted: number;
  successful: number;
  failed: number;
}

export async function runScan(env: CloudflareBindings, input: ScanRequest): Promise<ScanSummary> {
  const now = input.now ?? new Date();
  const date = utcDate(now);
  const db = drizzle(env.DB);
  const project = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.userId, input.userId)))
    .get();
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  const subscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, input.userId))
    .get();
  const paid = getEntitlement(
    subscription ? { status: subscription.status, endsAt: subscription.endsAt } : null,
    now,
  ).canScan;
  if (input.trigger === 'trial') {
    if (paid || input.promptIds.length === 0 || input.promptIds.length > 3)
      throw new Error('TRIAL_INVALID');
    const reservation = await db
      .update(projects)
      .set({ trialScanReservedAt: now })
      .where(and(eq(projects.id, project.id), sql`${projects.trialScanReservedAt} is null`))
      .returning({ id: projects.id });
    if (reservation.length === 0) throw new Error('TRIAL_ALREADY_USED');
  } else if (!paid) throw new Error('PAID_ACCESS_REQUIRED');
  if (input.trigger === 'manual') {
    const manual = await db
      .update(projects)
      .set({ manualScanLastUsedOn: date })
      .where(
        and(
          eq(projects.id, project.id),
          sql`${projects.manualScanLastUsedOn} is null or ${projects.manualScanLastUsedOn} <> ${date}`,
        ),
      )
      .returning({ id: projects.id });
    if (manual.length === 0) throw new Error('MANUAL_SCAN_ALREADY_USED');
  }
  const selected = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.projectId, project.id), eq(prompts.enabled, true)));
  const allowed = selected
    .filter((item) => input.promptIds.includes(item.id))
    .slice(0, paid ? 10 : 3);
  const runId = crypto.randomUUID();
  await db.insert(scanRuns).values({
    id: runId,
    projectId: project.id,
    triggerType: input.trigger,
    provider: 'perplexity',
    status: 'running',
    observationDate: date,
    startedAt: now,
    attemptedCount: allowed.length,
    createdAt: now,
  });
  const trackedCompetitors = await db
    .select()
    .from(competitors)
    .where(eq(competitors.projectId, project.id));
  let successful = 0;
  let failed = 0;
  const provider = input.provider ?? new PerplexityProvider(env.PERPLEXITY_API_KEY);
  for (const prompt of allowed) {
    const monthStart = `${date.slice(0, 7)}-01`;
    const globalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(providerCallReservations)
      .where(
        and(
          eq(providerCallReservations.provider, 'perplexity'),
          eq(providerCallReservations.usageDate, date),
        ),
      )
      .get();
    const userCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(providerCallReservations)
      .where(
        and(
          eq(providerCallReservations.userId, input.userId),
          gte(providerCallReservations.usageDate, monthStart),
        ),
      )
      .get();
    if (
      (globalCount?.count ?? 0) >= Number(env.GLOBAL_DAILY_PROVIDER_CALL_CAP) ||
      (userCount?.count ?? 0) >= Number(env.PER_USER_MONTHLY_PROVIDER_CALL_CAP)
    ) {
      failed += 1;
      continue;
    }
    const idempotencyKey = `perplexity:${project.id}:${prompt.id}:${date}`;
    const reservationId = crypto.randomUUID();
    const claimed = await db
      .insert(providerCallReservations)
      .values({
        id: reservationId,
        idempotencyKey,
        userId: input.userId,
        projectId: project.id,
        promptId: prompt.id,
        scanRunId: runId,
        provider: 'perplexity',
        usageDate: date,
        status: 'reserved',
        reservedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: providerCallReservations.id });
    if (claimed.length === 0) continue;
    try {
      const observation = await provider.runObservation({
        prompt: prompt.text,
        neutralInstruction: neutralResearchInstruction,
        maxOutputTokens: 700,
      });
      const analysis = analyzeMentions(
        observation.text,
        { key: 'brand', name: project.brandName, domain: project.canonicalDomain },
        trackedCompetitors.map((item) => ({
          key: item.id,
          name: item.name,
          domain: item.canonicalDomain,
        })),
      );
      const insertResult = db
        .insert(scanResults)
        .values({
          id: crypto.randomUUID(),
          scanRunId: runId,
          projectId: project.id,
          promptId: prompt.id,
          provider: 'perplexity',
          providerModel: observation.model,
          providerPreset: observation.preset,
          observationDate: date,
          rawResponseText: observation.text,
          citationDataJson: JSON.stringify(observation.citations),
          brandMentioned: analysis.brandMentioned,
          brandPosition: analysis.brandPosition,
          competitorMentionsJson: JSON.stringify(analysis.competitorKeys),
          matchedTermsJson: JSON.stringify(analysis.matchedTerms),
          contextClassification: analysis.classification,
          providerRequestId: observation.providerRequestId,
          inputTokens: observation.inputTokens,
          outputTokens: observation.outputTokens,
          createdAt: new Date(),
        })
        .toSQL();
      const completeReservation = db
        .update(providerCallReservations)
        .set({
          status: 'succeeded',
          inputTokens: observation.inputTokens,
          outputTokens: observation.outputTokens,
          providerRequestId: observation.providerRequestId,
          completedAt: new Date(),
        })
        .where(eq(providerCallReservations.id, reservationId))
        .toSQL();
      await env.DB.batch([
        env.DB.prepare(insertResult.sql).bind(...insertResult.params),
        env.DB.prepare(completeReservation.sql).bind(...completeReservation.params),
      ]);
      successful += 1;
    } catch {
      await db
        .update(providerCallReservations)
        .set({ status: 'failed', completedAt: new Date() })
        .where(eq(providerCallReservations.id, reservationId));
      failed += 1;
    }
  }
  const status =
    successful === allowed.length
      ? 'completed'
      : successful > 0
        ? 'partial'
        : failed > 0
          ? 'failed'
          : 'deferred';
  await db
    .update(scanRuns)
    .set({ status, successfulCount: successful, failedCount: failed, completedAt: new Date() })
    .where(eq(scanRuns.id, runId));
  if (input.trigger === 'trial' && successful > 0)
    await db
      .update(projects)
      .set({ trialScanCompletedAt: new Date() })
      .where(eq(projects.id, project.id));
  return { scanRunId: runId, status, attempted: allowed.length, successful, failed };
}
