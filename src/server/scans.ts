import { and, eq } from 'drizzle-orm';
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
import { monthBounds, paidProjectSql } from './scan-policy';
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
  status: 'completed' | 'partial' | 'failed' | 'deferred' | 'already_observed';
  attempted: number;
  successful: number;
  failed: number;
  deferred: number;
  skipped: number;
  reason: string | null;
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
  if (input.promptIds.length === 0 || new Set(input.promptIds).size !== input.promptIds.length)
    throw new Error('INVALID_PROMPTS');
  if (input.trigger === 'trial') {
    if (paid || input.promptIds.length > 3) throw new Error('TRIAL_INVALID');
    if (project.trialScanReservedAt) throw new Error('TRIAL_ALREADY_USED');
  } else if (!paid) throw new Error('PAID_ACCESS_REQUIRED');
  if (input.trigger === 'manual' && project.manualScanLastUsedOn === date)
    throw new Error('MANUAL_SCAN_ALREADY_USED');
  const selected = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.projectId, project.id), eq(prompts.enabled, true)));
  const allowed = selected.filter((item) => input.promptIds.includes(item.id));
  if (allowed.length !== input.promptIds.length || allowed.length > (paid ? 10 : 3))
    throw new Error('INVALID_PROMPTS');
  const runId = crypto.randomUUID();
  const [monthStart, monthEnd] = monthBounds(now);
  const run = db
    .insert(scanRuns)
    .values({
      id: runId,
      projectId: project.id,
      triggerType: input.trigger,
      provider: 'perplexity',
      status: 'running',
      observationDate: date,
      startedAt: now,
      attemptedCount: 0,
      createdAt: now,
    })
    .toSQL();
  const gate =
    input.trigger === 'trial'
      ? `NOT ${paidProjectSql} AND p.trial_scan_reserved_at IS NULL`
      : `${paidProjectSql}${input.trigger === 'manual' ? ' AND (p.manual_scan_last_used_on IS NULL OR p.manual_scan_last_used_on <> ?)' : ''}`;
  const claimStatements = allowed.map((prompt) =>
    env.DB.prepare(
      `
    INSERT INTO provider_call_reservations
      (id,idempotency_key,user_id,project_id,prompt_id,scan_run_id,provider,usage_date,status,reserved_at)
    SELECT ?,?,p.user_id,p.id,?,?,'perplexity',?,'reserved',? FROM projects p
    WHERE p.id = ? AND p.user_id = ? AND ${gate}
      AND EXISTS (SELECT 1 FROM prompts WHERE id = ? AND project_id = p.id AND enabled = 1)
      AND (SELECT count(*) FROM provider_call_reservations WHERE provider = 'perplexity' AND usage_date = ?) < ?
      AND (SELECT count(*) FROM provider_call_reservations WHERE user_id = p.user_id AND usage_date >= ? AND usage_date < ?) < ?
      AND (SELECT count(*) FROM provider_call_reservations WHERE project_id = p.id AND usage_date = ?) < 10
    ON CONFLICT(idempotency_key) DO NOTHING RETURNING id, prompt_id
  `,
    ).bind(
      crypto.randomUUID(),
      `perplexity:${project.id}:${prompt.id}:${date}`,
      prompt.id,
      runId,
      date,
      now.getTime(),
      project.id,
      input.userId,
      now.getTime(),
      ...(input.trigger === 'manual' ? [date] : []),
      prompt.id,
      date,
      Number(env.GLOBAL_DAILY_PROVIDER_CALL_CAP),
      monthStart,
      monthEnd,
      Number(env.PER_USER_MONTHLY_PROVIDER_CALL_CAP),
      date,
    ),
  );
  const gateUpdate =
    input.trigger === 'scheduled'
      ? []
      : [
          env.DB.prepare(
            `
    UPDATE projects SET ${input.trigger === 'trial' ? 'trial_scan_reserved_at' : 'manual_scan_last_used_on'} = ?
    WHERE id = ? AND EXISTS (SELECT 1 FROM provider_call_reservations WHERE scan_run_id = ?)
  `,
          ).bind(input.trigger === 'trial' ? now.getTime() : date, project.id, runId),
        ];
  const reserved = await env.DB.batch<{ id: string; prompt_id: string }>([
    env.DB.prepare(run.sql).bind(...run.params),
    ...claimStatements,
    ...gateUpdate,
  ]);
  const claims = reserved.slice(1, allowed.length + 1).flatMap((result) => result.results);
  const existing = await db
    .select({
      promptId: providerCallReservations.promptId,
      status: providerCallReservations.status,
    })
    .from(providerCallReservations)
    .where(
      and(
        eq(providerCallReservations.projectId, project.id),
        eq(providerCallReservations.usageDate, date),
      ),
    );
  const claimedIds = new Set(claims.map((claim) => claim.prompt_id));
  const skipped = allowed.filter(
    (prompt) => !claimedIds.has(prompt.id) && existing.some((item) => item.promptId === prompt.id),
  ).length;
  const deferred = allowed.length - claims.length - skipped;
  await db.update(scanRuns).set({ attemptedCount: claims.length }).where(eq(scanRuns.id, runId));
  const trackedCompetitors = await db
    .select()
    .from(competitors)
    .where(eq(competitors.projectId, project.id));
  let successful = 0;
  let failed = 0;
  const provider = input.provider ?? new PerplexityProvider(env.PERPLEXITY_API_KEY);
  for (const claim of claims) {
    const prompt = allowed.find((item) => item.id === claim.prompt_id);
    if (!prompt) throw new Error('RESERVATION_PROMPT_MISMATCH');
    const reservationId = claim.id;
    try {
      const observation = await provider.runObservation({
        prompt: prompt.text,
        neutralInstruction: neutralResearchInstruction,
        maxOutputTokens: 700,
      });
      if (!observation.text.trim()) throw new Error('EMPTY_PROVIDER_ANSWER');
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
    } catch (error) {
      // Failures must stay debuggable: record the error name plus a short,
      // printable-ASCII-only message. Never log prompts, raw answers, tokens,
      // or provider internals here.
      const rawName = error instanceof Error ? error.name : 'UNKNOWN';
      const rawMessage = error instanceof Error ? error.message : String(error);
      const printable = (value: string): string =>
        Array.from(value, (char) => {
          const code = char.codePointAt(0) ?? 0;
          return code >= 32 && code < 127 ? char : '';
        }).join('');
      console.error(
        JSON.stringify({
          event: 'scan_prompt_failed',
          scanRunId: runId,
          trigger: input.trigger,
          errorName: printable(rawName).slice(0, 40),
          errorMessage: printable(rawMessage).slice(0, 160),
        }),
      );
      await db
        .update(providerCallReservations)
        .set({ status: 'failed', completedAt: new Date() })
        .where(eq(providerCallReservations.id, reservationId));
      failed += 1;
    }
  }
  const status =
    successful > 0 && successful === claims.length && deferred === 0
      ? 'completed'
      : successful > 0
        ? 'partial'
        : failed > 0
          ? 'failed'
          : allowed.every((prompt) =>
                existing.some((item) => item.promptId === prompt.id && item.status === 'succeeded'),
              )
            ? 'already_observed'
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
  return {
    scanRunId: runId,
    status,
    attempted: claims.length,
    successful,
    failed,
    deferred,
    skipped,
    reason:
      deferred > 0
        ? 'Scanning is deferred by the usage limit or scan eligibility. No unreserved calls were made.'
        : claims.length === 0
          ? 'These prompts have already been reserved today. They will not be replayed.'
          : null,
  };
}
