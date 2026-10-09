import { and, desc, eq, isNull, getTableColumns, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
  competitors,
  pilotEnrollments,
  projects,
  prompts,
  providerCallReservations,
  scanResults,
  subscriptions,
} from '../../db/schema';
import { getEntitlement } from '../../domain/entitlements';
import { canonicalSourceUrl, compareEvidence } from '../../domain/evidence';
import type { EvidenceCapture, RequestContext, ComparableObservation } from '../../shared/evidence';
import type {
  V2Observation,
  V2ObservationPayload,
  V2ProjectPayload,
  V2Question,
  V2QuestionRow,
  V2QuestionsPayload,
} from '../../shared/v2';

export const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;
export const nextDay = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
export const questionView = (q: typeof prompts.$inferSelect): V2Question => ({
  id: q.id,
  text: q.text,
  enabled: q.enabled,
  archivedAt: iso(q.archivedAt),
  updatedAt: q.updatedAt.toISOString(),
  replacesQuestionId: q.replacesQuestionId,
});
export async function ownedProject(env: CloudflareBindings, userId: string) {
  return drizzle(env.DB).select().from(projects).where(eq(projects.userId, userId)).get();
}
export async function paidAccess(env: CloudflareBindings, userId: string) {
  const sub = await drizzle(env.DB)
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .get();
  return getEntitlement(sub ?? null, new Date()).canScan;
}
export async function projectPayload(
  env: CloudflareBindings,
  userId: string,
): Promise<V2ProjectPayload> {
  const db = drizzle(env.DB);
  const [project, enrollment, paid] = await Promise.all([
    ownedProject(env, userId),
    db.select().from(pilotEnrollments).where(eq(pilotEnrollments.userId, userId)).get(),
    paidAccess(env, userId),
  ]);
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  const counts = await env.DB.prepare(
    `SELECT sum(CASE WHEN usage_date = ? THEN 1 ELSE 0 END) AS today,
    count(*) AS month FROM provider_call_reservations WHERE user_id = ? AND usage_date LIKE ?`,
  )
    .bind(date, userId, `${month}%`)
    .first<{ today: number; month: number }>();
  const activeCompetitors = project
    ? await db
        .select()
        .from(competitors)
        .where(and(eq(competitors.projectId, project.id), isNull(competitors.archivedAt)))
    : [];
  const questions = project
    ? await db.select().from(prompts).where(eq(prompts.projectId, project.id))
    : [];
  return {
    project: project
      ? {
          id: project.id,
          brandName: project.brandName,
          canonicalDomain: project.canonicalDomain,
          contextVersion: project.contextVersion,
          competitors: activeCompetitors.map(({ id, name, canonicalDomain }) => ({
            id,
            name,
            canonicalDomain,
          })),
          questions: questions.map(questionView),
        }
      : null,
    enrolled: Boolean(enrollment),
    canScan: paid,
    trial: enrollment
      ? {
          state: enrollment.trialState,
          startedAt: iso(enrollment.trialStartedAt),
          expiresAt: iso(enrollment.expiresAt),
          followupDueAt: iso(enrollment.followupDueAt),
        }
      : null,
    usage: {
      today: counts?.today ?? 0,
      month: counts?.month ?? 0,
      dailyLimit: 10,
      monthlyLimit: Math.min(350,Number(env.PER_USER_MONTHLY_PROVIDER_CALL_CAP)),
      resetAt: nextDay(now).toISOString(),
      monthlyResetAt: new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString(),
    },
    scansEnabled: env.EXTERNAL_INTEGRATIONS_ENABLED === 'true' && env.V2_SCANS_ENABLED === 'true',
    supportEmail: 'support@cite-scout.com',
  };
}

type Result = typeof scanResults.$inferSelect;
export function observationView(result: Result, currentQuestionText: string): V2Observation {
  const context = result.requestContextJson
    ? (JSON.parse(result.requestContextJson) as RequestContext)
    : null;
  const capture = result.captureJson ? (JSON.parse(result.captureJson) as EvidenceCapture) : null;
  return {
    id: result.id,
    questionId: result.promptId,
    questionText: context?.text ?? currentQuestionText,
    capturedAt: (result.receivedAt ?? result.createdAt).toISOString(),
    evidenceVersion: result.evidenceVersion,
    context,
    capture,
    legacyText: capture ? null : result.rawResponseText,
    legacySources: capture ? [] : legacySources(result.citationDataJson),
  };
}
function legacySources(json: string | null): V2Observation['legacySources'] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((s: unknown) => {
      if (!s || typeof s !== 'object' || !('url' in s) || typeof s.url !== 'string') return [];
      const url = canonicalSourceUrl(s.url);
      return url
        ? [{ url, title: 'title' in s && typeof s.title === 'string' ? s.title : null }]
        : [];
    });
  } catch {
    return [];
  }
}
export function comparable(observation: V2Observation): ComparableObservation | null {
  return observation.capture
    ? {
        id: observation.id,
        evidenceVersion: observation.evidenceVersion,
        context: observation.context,
        capture: observation.capture,
      }
    : null;
}
export function pairDelta(before: V2Observation | null, after: V2Observation) {
  const a = before ? comparable(before) : null;
  const b = comparable(after);
  return a && b ? compareEvidence(a, b) : null;
}
export function comparisonIds(history: V2Observation[], index = 0) {
  const selected = history[index];
  const previous = history[index + 1];
  if (!selected || !previous || !pairDelta(previous, selected)?.eligible)
    return { previousId: null, baselineId: null };
  let baseline = previous;
  for (let i = index + 2; i < history.length; i++) {
    const older = history[i];
    if (!older || !pairDelta(older, baseline)?.eligible) break;
    baseline = older;
  }
  return { previousId: previous.id, baselineId: baseline.id };
}
export async function observationsForQuestion(
  env: CloudflareBindings,
  projectId: string,
  questionId: string,
) {
  return drizzle(env.DB)
    .select({
      ...getTableColumns(scanResults),
      rawResponseText: sql<string>`''`,
      captureJson: sql<
        string | null
      >`CASE WHEN ${scanResults.captureJson} IS NULL THEN NULL ELSE json_set(${scanResults.captureJson},'$.raw',NULL,'$.textParts',json('[]'),'$.text','') END`,
    })
    .from(scanResults)
    .where(and(eq(scanResults.projectId, projectId), eq(scanResults.promptId, questionId)))
    .orderBy(desc(scanResults.createdAt), desc(scanResults.id));
}
export async function questionRows(
  env: CloudflareBindings,
  userId: string,
): Promise<V2QuestionsPayload> {
  const payload = await projectPayload(env, userId);
  if (!payload.project)
    return {
      questions: [],
      summary: {
        tracked: 0,
        available: 0,
        brandMatched: 0,
        comparable: 0,
        changed: 0,
        sourcesUnavailable: 0,
        from: null,
        to: null,
      },
    };
  const project = payload.project;
  const db = drizzle(env.DB);
  const now = Date.now();
  const questions: V2QuestionRow[] = [];
  for (const q of project.questions) {
    const history = (await observationsForQuestion(env, project.id, q.id)).map((r) =>
      observationView(r, q.text),
    );
    const latest = history[0];
    const ids = comparisonIds(history);
    const attempt = await db
      .select()
      .from(providerCallReservations)
      .where(
        and(
          eq(providerCallReservations.projectId, project.id),
          eq(providerCallReservations.promptId, q.id),
        ),
      )
      .orderBy(desc(providerCallReservations.reservedAt))
      .get();
    const delta = latest ? pairDelta(history[1] ?? null, latest) : null;
    const contextChanged = Boolean(
      latest && (latest.context?.contextVersion !== project.contextVersion || !latest.capture),
    );
    const stale = Boolean(
      latest &&
      (payload.canScan
        ? now - Date.parse(latest.capturedAt) > 48 * 3600000
        : payload.trial?.followupDueAt &&
          now > Date.parse(payload.trial.followupDueAt) + 86400000 &&
          Date.parse(latest.capturedAt) < Date.parse(payload.trial.followupDueAt)),
    );
    questions.push({
      ...q,
      latest: latest
        ? {
            id: latest.id,
            capturedAt: latest.capturedAt,
            brandMatched:
              latest.capture?.entities.find((e) => e.kind === 'brand')?.matched ?? false,
            competitors:
              latest.capture?.entities
                .filter((e) => e.kind === 'competitor' && e.matched)
                .map((e) => e.name) ?? [],
          }
        : null,
      latestAttempt: attempt
        ? {
            status: attempt.status,
            failureCode: attempt.failureCode,
            at: attempt.reservedAt.toISOString(),
          }
        : null,
      ...ids,
      delta: contextChanged ? null : delta,
      contextChanged,
      stale,
      needsAttention:
        !latest ||
        contextChanged ||
        stale ||
        attempt?.status === 'failed' ||
        attempt?.status === 'reserved',
    });
  }
  const priority = (q: V2QuestionRow) =>
    q.needsAttention
      ? 0
      : q.delta?.brand?.change
        ? 1
        : q.delta?.competitors.length
          ? 2
          : q.delta?.changed
            ? 3
            : !q.previousId
              ? 4
              : 5;
  questions.sort(
    (a, b) =>
      priority(a) - priority(b) ||
      (b.latest?.capturedAt ?? '').localeCompare(a.latest?.capturedAt ?? '') ||
      a.id.localeCompare(b.id),
  );
  const active = questions.filter((q) => q.enabled && !q.archivedAt);
  const available = active.filter((q) => q.latest && !q.stale && !q.contextChanged);
  const eligible = available.filter((q) => q.delta?.eligible);
  const times = available.flatMap((q) => (q.latest ? [q.latest.capturedAt] : [])).sort();
  return {
    questions,
    summary: {
      tracked: active.length,
      available: available.length,
      brandMatched: available.filter((q) => q.latest?.brandMatched).length,
      comparable: eligible.length,
      changed: eligible.filter((q) => q.delta?.changed).length,
      sourcesUnavailable: eligible.filter(
        (q) => !q.delta || !q.delta.returnedSources.available || !q.delta.citedSources.available,
      ).length,
      from: times[0] ?? null,
      to: times.at(-1) ?? null,
    },
  };
}
export async function observationPayload(
  env: CloudflareBindings,
  userId: string,
  id: string,
  compareTo?: string,
): Promise<V2ObservationPayload | null> {
  const project = await ownedProject(env, userId);
  if (!project) return null;
  const db = drizzle(env.DB);
  const result = await db
    .select()
    .from(scanResults)
    .where(and(eq(scanResults.id, id), eq(scanResults.projectId, project.id)))
    .get();
  if (!result) return null;
  const question = await db.select().from(prompts).where(eq(prompts.id, result.promptId)).get();
  if (!question) return null;
  const history = (await observationsForQuestion(env, project.id, question.id)).map((r) =>
    observationView(r, question.text),
  );
  const index = history.findIndex((o) => o.id === id);
  const observation = observationView(result, question.text);
  if (index < 0) return null;
  const ids = comparisonIds(history, index);
  const target = compareTo ?? ids.previousId;
  const comparisonRow = target
    ? await db
        .select()
        .from(scanResults)
        .where(
          and(
            eq(scanResults.id, target),
            eq(scanResults.projectId, project.id),
            eq(scanResults.promptId, question.id),
          ),
        )
        .get()
    : null;
  const comparison = comparisonRow ? observationView(comparisonRow, question.text) : null;
  if (compareTo && !comparison) return null;
  const supported = Boolean(target && (target === ids.previousId || target === ids.baselineId));
  return {
    observation,
    comparison,
    ...ids,
    delta: supported ? pairDelta(comparison, observation) : null,
    comparisonReason: !observation.capture
      ? 'legacy_provenance'
      : target && !supported
        ? 'unsupported_comparator'
        : !target
          ? 'new_baseline'
          : null,
  };
}
