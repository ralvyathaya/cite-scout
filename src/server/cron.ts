import { utcDate } from '../domain/normalization';
import type { ObservationProvider } from '../integrations/perplexity/provider';
import { monthBounds, paidProjectSql } from './scan-policy';
import { runScan } from './scans';

export async function runScheduledScans(
  env: CloudflareBindings,
  scheduledTime: number,
  provider?: ObservationProvider,
): Promise<void> {
  const now = new Date(scheduledTime);
  const date = utcDate(now);
  const [start, end] = monthBounds(now);
  const candidates = await env.DB.prepare(
    `
    SELECT p.id AS projectId, p.user_id AS userId, pr.id AS promptId
    FROM projects p JOIN prompts pr ON pr.project_id = p.id AND pr.enabled = 1
    WHERE ${paidProjectSql}
      AND NOT EXISTS (SELECT 1 FROM provider_call_reservations r
        WHERE r.idempotency_key = 'perplexity:' || p.id || ':' || pr.id || ':' || ?)
      AND (SELECT count(*) FROM provider_call_reservations WHERE provider = 'perplexity' AND usage_date = ?) < ?
      AND (SELECT count(*) FROM provider_call_reservations WHERE user_id = p.user_id AND usage_date >= ? AND usage_date < ?) < ?
      AND (SELECT count(*) FROM provider_call_reservations WHERE project_id = p.id AND usage_date = ?) < 10
    ORDER BY p.created_at, p.id, pr.created_at, pr.id LIMIT ?
  `,
  )
    .bind(
      now.getTime(),
      date,
      date,
      Number(env.GLOBAL_DAILY_PROVIDER_CALL_CAP),
      start,
      end,
      Number(env.PER_USER_MONTHLY_PROVIDER_CALL_CAP),
      date,
      Number(env.MAX_PROVIDER_CALLS_PER_CRON_INVOCATION),
    )
    .all<{ projectId: string; userId: string; promptId: string }>();
  const byProject = new Map<string, { userId: string; promptIds: string[] }>();
  for (const candidate of candidates.results) {
    const work = byProject.get(candidate.projectId) ?? { userId: candidate.userId, promptIds: [] };
    work.promptIds.push(candidate.promptId);
    byProject.set(candidate.projectId, work);
  }
  for (const [projectId, work] of byProject) {
    try {
      await runScan(env, {
        userId: work.userId,
        projectId,
        promptIds: work.promptIds.slice(0, 10),
        trigger: 'scheduled',
        now,
        provider,
      });
    } catch {
      // A subscription or prompt may change after candidate selection; other customers still run.
      console.error(JSON.stringify({ event: 'scheduled_project_failed', projectId }));
    }
  }
  console.log(
    JSON.stringify({
      event: 'cron_completed',
      observation_date: date,
      selected_calls: candidates.results.length,
      entitled_projects: byProject.size,
    }),
  );
}
