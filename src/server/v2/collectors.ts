import {
  DataForSeoError,
  pollDataForSeo,
  submitDataForSeo,
} from '../../integrations/dataforseo/client';
import { capturePerplexityGeo } from '../../integrations/perplexity/geo';
import { CaptureError } from '../../shared/evidence';
import type { GeoCapture, GeoRequestContext } from '../../shared/geo';
import { claimGeoItem, createDailyGeoRuns, reconcileGeoItems, type GeoItemRow } from './geo-store';

const sql = (env: CloudflareBindings, query: string, ...values: unknown[]) =>
  env.DB.prepare(query).bind(...values);
// Both leases and ownership are required: deletion or a newer worker invalidates every late write.
const guard = `EXISTS(SELECT 1 FROM geo_run_items i JOIN projects p ON p.id=i.project_id
  JOIN provider_call_reservations v ON v.id=i.reservation_id
  WHERE i.id=? AND i.lease_token=? AND i.lease_until>? AND i.status IN ('submitting','submitted')
  AND v.lease_token=i.lease_token AND v.user_id=p.user_id AND v.project_id=p.id)`;
const guarded = (
  env: CloudflareBindings,
  query: string,
  values: unknown[],
  item: GeoItemRow,
  now: number,
) => sql(env, `${query} AND ${guard}`, ...values, item.id, item.lease_token, now);

async function finishRuns(env: CloudflareBindings, now: number) {
  await sql(
    env,
    `UPDATE scan_runs SET
    attempted_count=(SELECT count(*) FROM geo_run_items WHERE run_id=scan_runs.id),
    successful_count=(SELECT count(*) FROM geo_run_items WHERE run_id=scan_runs.id AND status='succeeded'),
    failed_count=(SELECT count(*) FROM geo_run_items WHERE run_id=scan_runs.id AND status IN ('failed','cancelled','submission_uncertain')),
    status=CASE
      WHEN EXISTS(SELECT 1 FROM geo_run_items WHERE run_id=scan_runs.id AND status IN ('pending','submitting','submitted')) THEN 'running'
      WHEN EXISTS(SELECT 1 FROM geo_run_items WHERE run_id=scan_runs.id AND status='submission_uncertain') THEN 'partial'
      WHEN NOT EXISTS(SELECT 1 FROM geo_run_items WHERE run_id=scan_runs.id AND status<>'succeeded') THEN 'completed'
      WHEN EXISTS(SELECT 1 FROM geo_run_items WHERE run_id=scan_runs.id AND status='succeeded') THEN 'partial'
      ELSE 'failed' END,
    completed_at=CASE WHEN EXISTS(SELECT 1 FROM geo_run_items WHERE run_id=scan_runs.id AND status IN ('pending','submitting','submitted','submission_uncertain')) THEN NULL ELSE ? END
    WHERE id IN (SELECT run_id FROM geo_run_snapshots) AND completed_at IS NULL`,
    now,
  ).run();
}
async function terminal(
  env: CloudflareBindings,
  item: GeoItemRow,
  status: 'failed' | 'submission_uncertain',
  code: string,
  raw: unknown,
  cost: number | null,
  now: number,
) {
  await env.DB.batch([
    guarded(
      env,
      `UPDATE provider_call_reservations SET status=?,failure_code=?,provider_response_json=?,reported_cost=coalesce(reported_cost,?),completed_at=? WHERE id=?`,
      [
        status === 'failed' ? 'failed' : 'reserved',
        code,
        JSON.stringify(raw),
        cost === null ? null : String(cost),
        status === 'failed' ? now : null,
        item.reservation_id,
      ],
      item,
      now,
    ),
    guarded(
      env,
      `UPDATE geo_run_items SET status=?,terminal_reason=?,lease_token=NULL,lease_until=NULL WHERE id=?`,
      [status, code, item.id],
      item,
      now,
    ),
  ]);
}
async function deferPoll(
  env: CloudflareBindings,
  item: GeoItemRow,
  raw: unknown,
  reason: string | null,
  seconds: number,
  now: number,
) {
  await env.DB.batch([
    guarded(
      env,
      'UPDATE provider_call_reservations SET provider_response_json=?,failure_code=? WHERE id=?',
      [JSON.stringify(raw), reason, item.reservation_id],
      item,
      now,
    ),
    guarded(
      env,
      'UPDATE geo_run_items SET due_at=?,terminal_reason=?,lease_token=NULL,lease_until=NULL WHERE id=?',
      [now + Math.max(300, Math.min(seconds, 3600)) * 1000, reason, item.id],
      item,
      now,
    ),
  ]);
}
async function saveCapture(
  env: CloudflareBindings,
  item: GeoItemRow,
  capture: GeoCapture,
  now: number,
) {
  await env.DB.batch([
    sql(
      env,
      `INSERT OR IGNORE INTO geo_observations
      (id,project_id,run_id,item_id,prompt_version_id,engine,model,status,context_json,capture_json,answer_text,captured_at)
      SELECT ?,?,?,?,?,?,?,'captured',?,?,?,? WHERE ${guard}`,
      crypto.randomUUID(),
      item.project_id,
      item.run_id,
      item.id,
      item.prompt_version_id,
      item.engine,
      capture.model,
      item.context_json,
      JSON.stringify(capture),
      capture.answerText,
      now,
      item.id,
      item.lease_token,
      now,
    ),
    guarded(
      env,
      `UPDATE provider_call_reservations SET status='succeeded',provider_status=?,provider_response_json=?,provider_request_id=?,input_tokens=?,output_tokens=?,reported_cost=coalesce(reported_cost,?),completed_at=? WHERE id=?`,
      [
        capture.providerStatus,
        JSON.stringify(capture.raw),
        capture.providerRequestId,
        capture.inputTokens,
        capture.outputTokens,
        capture.reportedCost === null ? null : String(capture.reportedCost),
        now,
        item.reservation_id,
      ],
      item,
      now,
    ),
    guarded(
      env,
      `UPDATE geo_run_items SET status='succeeded',terminal_reason=NULL,lease_token=NULL,lease_until=NULL WHERE id=?`,
      [item.id],
      item,
      now,
    ),
  ]);
}

export async function processGeoCollectors(env: CloudflareBindings, limit = 5, at = new Date()) {
  const started = Date.now();
  const clock = () => at.getTime() + Date.now() - started;
  await reconcileGeoItems(env, at);
  await createDailyGeoRuns(env, at);
  const rows = await sql(
    env,
    `SELECT id FROM geo_run_items WHERE status IN ('pending','submitted') AND due_at<=?
    AND (lease_until IS NULL OR lease_until<=?) ORDER BY due_at,project_id,id LIMIT ?`,
    at.getTime(),
    at.getTime(),
    Math.max(0, Math.min(20, Math.floor(limit))),
  ).all<{ id: string }>();
  for (const row of rows.results) {
    const item = await claimGeoItem(env, row.id, new Date(clock()));
    if (!item) continue;
    const now = clock(),
      context = JSON.parse(item.context_json) as GeoRequestContext;
    const acquired = await sql(
      env,
      `UPDATE provider_call_reservations SET lease_token=?,lease_until=? WHERE id=? AND status='reserved'
      AND EXISTS(SELECT 1 FROM geo_run_items i JOIN projects p ON p.id=i.project_id WHERE i.id=? AND i.lease_token=? AND p.user_id=provider_call_reservations.user_id)`,
      item.lease_token,
      item.lease_until,
      item.reservation_id,
      item.id,
      item.lease_token,
    ).run();
    if (!acquired.meta.changes) continue;
    if (item.submitted_at !== null && now - item.submitted_at > 24 * 3600_000) {
      await terminal(env, item, 'failed', 'POLL_WINDOW_EXPIRED', null, null, now);
      continue;
    }
    const polling = item.provider_task_id !== null;
    if (
      item.engine === 'perplexity'
        ? !env.PERPLEXITY_API_KEY
        : !env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD
    ) {
      if (polling) await deferPoll(env, item, null, 'COLLECTOR_NOT_CONFIGURED', 3600, now);
      else await terminal(env, item, 'failed', 'COLLECTOR_NOT_CONFIGURED', null, null, now);
      continue;
    }
    try {
      if (item.engine === 'perplexity') {
        await saveCapture(
          env,
          item,
          await capturePerplexityGeo(env.PERPLEXITY_API_KEY, context),
          clock(),
        );
      } else if (item.provider_task_id !== null) {
        const result = await pollDataForSeo(
          env.DATAFORSEO_LOGIN,
          env.DATAFORSEO_PASSWORD,
          context,
          item.provider_task_id,
        );
        if (result.status === 'pending') await deferPoll(env, item, result.raw, null, 300, clock());
        else await saveCapture(env, item, result.capture, clock());
      } else {
        const result = await submitDataForSeo(
          env.DATAFORSEO_LOGIN,
          env.DATAFORSEO_PASSWORD,
          context,
          item.id,
        );
        const completed = clock();
        await env.DB.batch([
          guarded(
            env,
            `UPDATE provider_call_reservations SET provider_request_id=?,provider_response_json=?,reported_cost=?,provider_status='20100' WHERE id=?`,
            [
              result.taskId,
              JSON.stringify(result.raw),
              result.cost === null ? null : String(result.cost),
              item.reservation_id,
            ],
            item,
            completed,
          ),
          guarded(
            env,
            `UPDATE geo_run_items SET status='submitted',provider_task_id=?,submitted_at=?,due_at=?,lease_token=NULL,lease_until=NULL WHERE id=?`,
            [result.taskId, completed, completed + 300_000, item.id],
            item,
            completed,
          ),
        ]);
      }
    } catch (error) {
      const code =
        error instanceof DataForSeoError || error instanceof CaptureError
          ? error.code
          : 'COLLECTOR_ERROR';
      const raw =
        error instanceof DataForSeoError
          ? error.raw
          : error instanceof CaptureError
            ? (error.raw ?? error.diagnostic)
            : null;
      const cost = error instanceof DataForSeoError ? error.cost : null;
      const transient = /TIMEOUT|TRANSPORT|BODY_ERROR|HTTP_(429|5\d\d)/u.test(code);
      if (polling && transient)
        await deferPoll(
          env,
          item,
          raw,
          code,
          error instanceof DataForSeoError ? (error.retryAfterSeconds ?? 300) : 300,
          clock(),
        );
      else
        await terminal(
          env,
          item,
          !polling &&
            (transient ||
              (error instanceof DataForSeoError
                ? error.uncertain
                : /EMPTY_BODY|MALFORMED|RESPONSE_TOO_LARGE/u.test(code)))
            ? 'submission_uncertain'
            : 'failed',
          code,
          raw,
          cost,
          clock(),
        );
    }
  }
  await finishRuns(env, clock());
}

export async function reconcileGeoSubmission(
  env: CloudflareBindings,
  itemId: string,
  taskId: string | null,
) {
  const item = await sql(
    env,
    `SELECT i.* FROM geo_run_items i JOIN projects p ON p.id=i.project_id
    JOIN provider_call_reservations v ON v.id=i.reservation_id WHERE i.id=? AND i.status='submission_uncertain' AND v.user_id=p.user_id AND v.status='reserved'`,
    itemId,
  ).first<GeoItemRow>();
  if (!item) throw new Error('UNCERTAIN_ITEM_NOT_FOUND');
  const now = Date.now();
  if (taskId) {
    if (item.engine === 'perplexity') throw new Error('SURFACE_NOT_RECOVERABLE');
    if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD)
      throw new Error('COLLECTOR_NOT_CONFIGURED');
    const result = await pollDataForSeo(
      env.DATAFORSEO_LOGIN,
      env.DATAFORSEO_PASSWORD,
      JSON.parse(item.context_json) as GeoRequestContext,
      taskId,
    );
    const raw = result.status === 'pending' ? result.raw : result.capture.raw;
    const tag = (raw as { tasks?: { data?: { tag?: unknown } }[] }).tasks?.[0]?.data?.tag;
    if (tag !== item.id) throw new Error('TASK_CORRELATION_MISMATCH');
  }
  await env.DB.batch([
    sql(
      env,
      `UPDATE provider_call_reservations SET failure_code=?,status=?,completed_at=?
      WHERE id=? AND user_id IS NOT NULL AND EXISTS(SELECT 1 FROM geo_run_items WHERE id=? AND status='submission_uncertain')`,
      taskId ? 'operator_task_recovered' : 'operator_closed_without_retry',
      taskId ? 'reserved' : 'failed',
      taskId ? null : now,
      item.reservation_id,
      item.id,
    ),
    sql(
      env,
      `UPDATE geo_run_items SET status=?,provider_task_id=?,submitted_at=coalesce(submitted_at,?),due_at=?,terminal_reason=?,lease_token=NULL,lease_until=NULL
      WHERE id=? AND status='submission_uncertain' AND EXISTS(SELECT 1 FROM projects WHERE id=geo_run_items.project_id)`,
      taskId ? 'submitted' : 'failed',
      taskId,
      now,
      now,
      taskId ? 'operator_task_recovered' : 'operator_closed_without_retry',
      item.id,
    ),
  ]);
  await finishRuns(env, now);
}
