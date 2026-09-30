import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
  competitors,
  projects,
  prompts,
  scanResults,
  scanRuns,
  subscriptions,
  providerCallReservations,
} from '../db/schema';
import { getEntitlement } from '../domain/entitlements';
import { calculateMetrics, metricDelta } from '../domain/metrics';
import {
  citationOpportunities,
  observationInsight,
  stringArray,
  successfulObservation,
} from '../domain/insights';
import { utcDate } from '../domain/normalization';
import type { DashboardSnapshot, DailyPoint } from '../shared/dashboard';
import { monthBounds, type ScanAvailability } from './scan-policy';

export async function buildDashboard(
  binding: D1Database,
  userId: string,
  days = 14,
  now = new Date(),
): Promise<DashboardSnapshot | null> {
  const db = drizzle(binding);
  const project = await db.select().from(projects).where(eq(projects.userId, userId)).get();
  if (!project) return null;
  const today = utcDate(now);
  const from = utcDate(new Date(now.getTime() - (days - 1) * 86_400_000));
  const [projectCompetitors, projectPrompts, rows, reservations, runs] = await Promise.all([
    db
      .select()
      .from(competitors)
      .where(eq(competitors.projectId, project.id))
      .orderBy(asc(competitors.createdAt)),
    db
      .select()
      .from(prompts)
      .where(eq(prompts.projectId, project.id))
      .orderBy(asc(prompts.createdAt)),
    db
      .select()
      .from(scanResults)
      .where(
        and(
          eq(scanResults.projectId, project.id),
          gte(scanResults.observationDate, from),
          eq(scanResults.provider, 'perplexity'),
        ),
      )
      .orderBy(asc(scanResults.observationDate), asc(scanResults.createdAt)),
    db
      .select()
      .from(providerCallReservations)
      .where(
        and(
          eq(providerCallReservations.projectId, project.id),
          gte(providerCallReservations.usageDate, from),
        ),
      )
      .orderBy(asc(providerCallReservations.reservedAt)),
    db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.projectId, project.id))
      .orderBy(desc(scanRuns.createdAt))
      .limit(10),
  ]);
  const names = new Map(projectCompetitors.map((item) => [item.id, item.name]));
  const promptNames = new Map(projectPrompts.map((item) => [item.id, item.text]));
  const present = (row: (typeof rows)[number]) => [
    ...(row.brandMentioned ? ['brand'] : []),
    ...stringArray(row.competitorMentionsJson),
  ];
  const series: DailyPoint[] = Array.from({ length: days }, (_, index) => {
    const date = utcDate(new Date(now.getTime() - (days - 1 - index) * 86_400_000));
    const dayRows = rows.filter(
      (row) => row.observationDate === date && successfulObservation(row),
    );
    const metrics = calculateMetrics(
      dayRows.map((row) => ({
        success: true,
        brandPosition: row.brandMentioned ? row.brandPosition : null,
        mentionedEntities: present(row),
      })),
      'brand',
    );
    const attempted = reservations.filter((item) => item.usageDate === date).length;
    return {
      date,
      visibilityScore: metrics.visibilityScore,
      mentionRate: metrics.mentionRate,
      shareOfVoice: metrics.shareOfVoice,
      averageMentionPosition: metrics.averageMentionPosition,
      coverage: attempted === 0 ? null : dayRows.length / attempted,
      successful: dayRows.length,
      attempted,
    };
  });
  const observed = series.filter((point) => point.successful > 0);
  const latest = observed.at(-1);
  const previous = observed.at(-2);
  const currentRows = rows.filter(
    (row) => row.observationDate === latest?.date && successfulObservation(row),
  );
  const entityKeys = [
    ...new Set([
      'brand',
      ...names.keys(),
      ...currentRows.flatMap((row) => stringArray(row.competitorMentionsJson)),
    ]),
  ];
  const totalMentions = currentRows.reduce((sum, row) => sum + new Set(present(row)).size, 0);
  const lastSuccess = rows.filter(successfulObservation).at(-1);
  return {
    projectId: project.id,
    brandName: project.brandName,
    canonicalDomain: project.canonicalDomain,
    observationDate: today,
    latestObservationDate: latest?.date ?? null,
    windowDays: days,
    current: latest ??
      series.filter((point) => point.attempted > 0).at(-1) ?? {
        visibilityScore: null,
        mentionRate: null,
        shareOfVoice: null,
        averageMentionPosition: null,
        coverage: null,
        successful: 0,
        attempted: 0,
      },
    delta: {
      visibilityScore: metricDelta(
        latest?.visibilityScore ?? null,
        previous?.visibilityScore ?? null,
      ),
      mentionRate: metricDelta(latest?.mentionRate ?? null, previous?.mentionRate ?? null),
      shareOfVoice: metricDelta(latest?.shareOfVoice ?? null, previous?.shareOfVoice ?? null),
    },
    shareOfVoiceByEntity: entityKeys.map((key) => {
      const mentions = currentRows.filter((row) => present(row).includes(key)).length;
      return {
        key,
        label: key === 'brand' ? project.brandName : (names.get(key) ?? 'Unknown competitor'),
        mentions,
        share: totalMentions === 0 ? null : mentions / totalMentions,
      };
    }),
    series,
    prompts: projectPrompts.map((prompt) => {
      const row = rows.filter((item) => item.promptId === prompt.id).at(-1);
      const attempt = reservations.filter((item) => item.promptId === prompt.id).at(-1);
      return {
        promptId: prompt.id,
        text: prompt.text,
        enabled: prompt.enabled,
        classified: row?.contextClassification ?? null,
        brandPosition: row?.brandPosition ?? null,
        observationId: row?.id ?? null,
        observationDate: row?.observationDate ?? null,
        insight: row
          ? observationInsight(row, names)
          : {
              status: 'unknown' as const,
              context: 'unknown' as const,
              displacedCompetitors: [],
              explanation: null,
            },
        attemptStatus: attempt?.status ?? null,
      };
    }),
    citationOpportunities: citationOpportunities(
      rows.map((row) => ({
        ...row,
        promptText: promptNames.get(row.promptId) ?? 'Deleted prompt',
      })),
      names,
    ),
    scanRuns: runs.map((run) => ({
      id: run.id,
      triggerType: run.triggerType,
      status: run.status,
      observationDate: run.observationDate,
      successfulCount: run.successfulCount,
      failedCount: run.failedCount,
      attemptedCount: run.attemptedCount,
    })),
    lastSuccessfulAt: lastSuccess?.createdAt.toISOString() ?? null,
    provider: lastSuccess
      ? {
          name: lastSuccess.provider,
          model: lastSuccess.providerModel,
          preset: lastSuccess.providerPreset,
        }
      : null,
  };
}

export async function getEntitlementSnapshot(
  env: CloudflareBindings,
  userId: string,
  now = new Date(),
) {
  const db = drizzle(env.DB);
  const subscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .get();
  const countRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(scanResults)
    .innerJoin(projects, eq(projects.id, scanResults.projectId))
    .where(eq(projects.userId, userId))
    .get();

  const project = await db.select().from(projects).where(eq(projects.userId, userId)).get();
  const entitlement = getEntitlement(
    subscription ? { status: subscription.status, endsAt: subscription.endsAt } : null,
    now,
  );
  const date = utcDate(now);
  const [monthStart, monthEnd] = monthBounds(now);
  const counts = await env.DB.prepare(
    `SELECT
    (SELECT count(*) FROM provider_call_reservations WHERE provider = 'perplexity' AND usage_date = ?) AS globalCount,
    (SELECT count(*) FROM provider_call_reservations WHERE user_id = ? AND usage_date >= ? AND usage_date < ?) AS userCount,
    (SELECT count(*) FROM provider_call_reservations WHERE project_id = ? AND usage_date = ?) AS projectCount`,
  )
    .bind(date, userId, monthStart, monthEnd, project?.id ?? '', date)
    .first<{ globalCount: number; userCount: number; projectCount: number }>();
  const eligible = project
    ? await env.DB.prepare(
        `SELECT id FROM prompts WHERE project_id = ? AND enabled = 1
    AND NOT EXISTS (SELECT 1 FROM provider_call_reservations r WHERE r.idempotency_key = 'perplexity:' || prompts.project_id || ':' || prompts.id || ':' || ?)
    ORDER BY created_at, id`,
      )
        .bind(project.id, date)
        .all<{ id: string }>()
    : { results: [] };
  const budget = Boolean(
    counts &&
    counts.globalCount < Number(env.GLOBAL_DAILY_PROVIDER_CALL_CAP) &&
    counts.userCount < Number(env.PER_USER_MONTHLY_PROVIDER_CALL_CAP) &&
    counts.projectCount < 10,
  );
  const eligiblePromptIds = eligible.results.map((item) => item.id);
  const trialAvailable = Boolean(
    project &&
    !entitlement.canScan &&
    !project.trialScanReservedAt &&
    budget &&
    eligiblePromptIds.length,
  );
  const manualAvailable = Boolean(
    project &&
    entitlement.canScan &&
    project.manualScanLastUsedOn !== date &&
    budget &&
    eligiblePromptIds.length,
  );
  const scanAvailability: ScanAvailability = {
    trialAvailable,
    manualAvailable,
    eligiblePromptIds,
    reason: !project
      ? 'Complete project setup to scan.'
      : !budget
        ? 'Usage limit reached. Scanning resumes when the allowance resets.'
        : !entitlement.canScan && project.trialScanReservedAt
          ? 'Your trial has been consumed. Upgrade for daily monitoring; contact support if it returned no results.'
          : project.manualScanLastUsedOn === date && entitlement.canScan
            ? 'Your manual scan has been used today. Daily monitoring continues automatically.'
            : eligiblePromptIds.length === 0
              ? 'No enabled prompts remain available today. Reserved calls are not replayed.'
              : null,
  };
  return {
    subscription: subscription
      ? {
          status: subscription.status,
          cancelled: subscription.cancelled,
          endsAt: subscription.endsAt ? new Date(subscription.endsAt).toISOString() : null,
          renewsAt: subscription.renewsAt ? new Date(subscription.renewsAt).toISOString() : null,
          testMode: subscription.testMode,
          cardBrand: subscription.cardBrand,
          cardLastFour: subscription.cardLastFour,
        }
      : null,
    entitlement: getEntitlement(
      subscription ? { status: subscription.status, endsAt: subscription.endsAt } : null,
      now,
    ),
    totalObservations: countRow?.count ?? 0,
    scanAvailability,
  };
}
