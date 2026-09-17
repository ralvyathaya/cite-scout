import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { competitors, projects, prompts, scanResults, scanRuns, subscriptions } from '../db/schema';
import { getEntitlement } from '../domain/entitlements';
import { calculateMetrics, metricDelta, type MetricObservation } from '../domain/metrics';
import { utcDate } from '../domain/normalization';

export interface DailyPoint {
  date: string;
  visibilityScore: number | null;
  mentionRate: number | null;
  shareOfVoice: number | null;
  coverage: number | null;
  successful: number;
  attempted: number;
}

export interface DashboardSnapshot {
  projectId: string;
  brandName: string;
  canonicalDomain: string;
  observationDate: string;
  current: {
    visibilityScore: number | null;
    mentionRate: number | null;
    shareOfVoice: number | null;
    averageMentionPosition: number | null;
    coverage: number | null;
  };
  delta: {
    visibilityScore: number | null;
    mentionRate: number | null;
    shareOfVoice: number | null;
  };
  entityKeys: string[];
  shareOfVoiceByEntity: { key: string; label: string; share: number | null; mentions: number }[];
  series: DailyPoint[];
  prompts: {
    promptId: string;
    text: string;
    classified: string | null;
    brandPosition: number | null;
    observationDate: string | null;
  }[];
  scanRuns: {
    id: string;
    triggerType: string;
    status: string;
    observationDate: string;
    successfulCount: number;
    failedCount: number;
    attemptedCount: number;
  }[];
  lastSuccessfulAt: string | null;
  provider: { name: string; model: string | null; preset: string | null } | null;
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Builds the whole dashboard payload from persisted scan results only.
 * Every number here is derived from `scan_results`; nothing is hard-coded.
 */
export async function buildDashboard(
  binding: D1Database,
  userId: string,
  days = 14,
): Promise<DashboardSnapshot | null> {
  const db = drizzle(binding);
  const project = await db.select().from(projects).where(eq(projects.userId, userId)).get();
  if (!project) return null;

  const today = utcDate();
  const from = utcDate(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));

  const [projectCompetitors, projectPrompts] = await Promise.all([
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
  ]);

  const rows = await db
    .select()
    .from(scanResults)
    .where(
      and(
        eq(scanResults.projectId, project.id),
        gte(scanResults.observationDate, from),
        eq(scanResults.provider, 'perplexity'),
      ),
    )
    .orderBy(asc(scanResults.observationDate));

  const runs = await db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.projectId, project.id))
    .orderBy(desc(scanRuns.createdAt))
    .limit(10);

  const brandKey = 'brand';
  const labelFor = (key: string): string =>
    key === brandKey
      ? project.brandName
      : (projectCompetitors.find((competitor) => competitor.id === key)?.name ?? 'Unknown');

  const byDate = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = byDate.get(row.observationDate);
    if (bucket) bucket.push(row);
    else byDate.set(row.observationDate, [row]);
  }

  const attemptedByDate = new Map<string, number>();
  for (const run of runs) {
    const current = attemptedByDate.get(run.observationDate) ?? 0;
    attemptedByDate.set(run.observationDate, Math.max(current, run.attemptedCount));
  }

  const series: DailyPoint[] = [];
  for (const [date, dayRows] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const observations: MetricObservation[] = dayRows.map((row) => ({
      success: row.errorCode === null && row.rawResponseText !== null,
      brandPosition: row.brandPosition,
      mentionedEntities: [brandKey, ...parseKeys(row.competitorMentionsJson)],
    }));
    const metrics = calculateMetrics(observations, brandKey);
    const attempted = attemptedByDate.get(date) ?? dayRows.length;
    const succeeded = observations.filter((observation) => observation.success).length;
    series.push({
      date,
      visibilityScore: metrics.visibilityScore,
      mentionRate: metrics.mentionRate,
      shareOfVoice: metrics.shareOfVoice,
      coverage: attempted === 0 ? null : succeeded / attempted,
      successful: succeeded,
      attempted,
    });
  }

  const latest = series.at(-1) ?? null;
  const previous = series.at(-2) ?? null;

  const entityKeys = [brandKey, ...projectCompetitors.map((competitor) => competitor.id)];
  const shareOfVoiceByEntity = entityKeys.map((key) => {
    let mentioned = 0;
    let total = 0;
    for (const row of rows) {
      if (row.errorCode !== null) continue;
      const present = new Set([brandKey, ...parseKeys(row.competitorMentionsJson)]);
      total += present.size;
      if (present.has(key)) mentioned += 1;
    }
    return {
      key,
      label: labelFor(key),
      mentions: mentioned,
      share: total === 0 ? null : mentioned / total,
    };
  });

  const latestPerPrompt = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = latestPerPrompt.get(row.promptId);
    if (!existing || row.observationDate > existing.observationDate)
      latestPerPrompt.set(row.promptId, row);
  }

  const providerRow = [...rows].reverse().find((row) => row.providerModel);
  const lastSuccess = [...rows].reverse().find((row) => row.errorCode === null && row.createdAt);

  return {
    projectId: project.id,
    brandName: project.brandName,
    canonicalDomain: project.canonicalDomain,
    observationDate: today,
    current: {
      visibilityScore: latest?.visibilityScore ?? null,
      mentionRate: latest?.mentionRate ?? null,
      shareOfVoice: latest?.shareOfVoice ?? null,
      averageMentionPosition: average(
        rows.flatMap((row) => (row.brandPosition === null ? [] : [row.brandPosition])),
      ),
      coverage: latest?.coverage ?? null,
    },
    delta: {
      visibilityScore: metricDelta(
        latest?.visibilityScore ?? null,
        previous?.visibilityScore ?? null,
      ),
      mentionRate: metricDelta(latest?.mentionRate ?? null, previous?.mentionRate ?? null),
      shareOfVoice: metricDelta(latest?.shareOfVoice ?? null, previous?.shareOfVoice ?? null),
    },
    entityKeys,
    shareOfVoiceByEntity,
    series,
    prompts: projectPrompts.map((prompt) => {
      const row = latestPerPrompt.get(prompt.id);
      return {
        promptId: prompt.id,
        text: prompt.text,
        classified: row?.contextClassification ?? null,
        brandPosition: row?.brandPosition ?? null,
        observationDate: row?.observationDate ?? null,
      };
    }),
    scanRuns: runs.map((run) => ({
      id: run.id,
      triggerType: run.triggerType,
      status: run.status,
      observationDate: run.observationDate,
      successfulCount: run.successfulCount,
      failedCount: run.failedCount,
      attemptedCount: run.attemptedCount,
    })),
    lastSuccessfulAt: lastSuccess?.createdAt ? new Date(lastSuccess.createdAt).toISOString() : null,
    provider: providerRow
      ? {
          name: providerRow.provider,
          model: providerRow.providerModel,
          preset: providerRow.providerPreset,
        }
      : null,
  };
}

export async function getEntitlementSnapshot(
  binding: D1Database,
  userId: string,
  now = new Date(),
) {
  const db = drizzle(binding);
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
  };
}

function parseKeys(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
