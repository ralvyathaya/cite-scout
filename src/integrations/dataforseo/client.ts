import type { GeoCapture, GeoRequestContext } from '../../shared/geo';
import { DataForSeoError, dataForSeoTask, normalizeDataForSeo } from './capture';
export { DataForSeoError } from './capture';

const base = 'https://api.dataforseo.com/v3';
const paths = {
  google_aio: '/serp/google/organic',
  bing_copilot: '/serp/bing/organic',
  chatgpt_search: '/ai_optimization/chat_gpt/llm_scraper',
};
function path(context: GeoRequestContext): string {
  if (context.engine === 'perplexity' || context.engine === 'openai_web_search')
    throw new DataForSeoError('UNSUPPORTED_ENGINE');
  return paths[context.engine];
}

async function request(
  login: string,
  password: string,
  url: string,
  method: 'GET' | 'POST',
  body: unknown,
  fetcher: typeof fetch,
) {
  const submitting = method === 'POST';
  const signal = AbortSignal.timeout(12_000);
  let response: Response;
  try {
    response = await fetcher(url, {
      method,
      redirect: 'manual',
      headers: {
        Authorization: `Basic ${btoa(`${login}:${password}`)}`,
        'Content-Type': 'application/json',
      },
      ...(submitting ? { body: JSON.stringify(body) } : {}),
      signal,
    });
  } catch {
    throw new DataForSeoError(
      signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_TRANSPORT_ERROR',
      null,
      null,
      submitting,
    );
  }
  if (response.status >= 300 && response.status < 400)
    throw new DataForSeoError('PROVIDER_REDIRECT_REFUSED', null, null, submitting);
  const retryHeader = response.headers.get('retry-after');
  const retryAfter =
    retryHeader !== null && /^\d+$/u.test(retryHeader) ? Math.min(Number(retryHeader), 3600) : null;
  if (!response.body) throw new DataForSeoError('EMPTY_BODY', null, null, submitting, retryAfter);
  const reader = response.body.getReader();
  const bytes = new Uint8Array(512 * 1024);
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (length + chunk.value.length > bytes.length) {
        await reader.cancel();
        throw new DataForSeoError('RESPONSE_TOO_LARGE', null, null, submitting, retryAfter);
      }
      bytes.set(chunk.value, length);
      length += chunk.value.length;
    }
  } catch (error) {
    if (error instanceof DataForSeoError) throw error;
    throw new DataForSeoError(
      signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_BODY_ERROR',
      null,
      null,
      submitting,
      retryAfter,
    );
  } finally {
    reader.releaseLock();
  }
  let raw: unknown;
  try {
    raw = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)),
    ) as unknown;
  } catch {
    throw new DataForSeoError('MALFORMED_RESPONSE', null, null, submitting, retryAfter);
  }
  if (!response.ok)
    throw new DataForSeoError(
      `PROVIDER_HTTP_${String(response.status)}`,
      raw,
      null,
      submitting && response.status >= 500,
      retryAfter,
    );
  return raw;
}

export async function submitDataForSeo(
  login: string,
  password: string,
  context: GeoRequestContext,
  tag: string,
  fetcher: typeof fetch = fetch,
): Promise<{ taskId: string; raw: unknown; cost: number | null }> {
  const providerPath = path(context);
  const raw = await request(
    login,
    password,
    `${base}${providerPath}/task_post`,
    'POST',
    [
      {
        keyword: encodeURIComponent(context.promptText),
        language_code: context.languageCode,
        location_code: context.locationCode,
        tag,
        ...(context.engine === 'chatgpt_search'
          ? { force_web_search: true }
          : {
              device: context.device,
              ...(context.engine === 'google_aio' ? { load_async_ai_overview: true } : {}),
            }),
      },
    ],
    fetcher,
  );
  const { task, cost } = dataForSeoTask(raw, true);
  if (task.status_code !== 20100)
    throw new DataForSeoError(
      `DATAFORSEO_${String(task.status_code)}`,
      raw,
      cost,
      task.status_code === 20000 || [40601, 40602].includes(task.status_code),
    );
  if (!task.id?.trim()) throw new DataForSeoError('MISSING_TASK_ID', raw, cost, true);
  return { taskId: task.id, raw, cost };
}

export async function pollDataForSeo(
  login: string,
  password: string,
  context: GeoRequestContext,
  taskId: string,
  fetcher: typeof fetch = fetch,
): Promise<
  | { status: 'pending'; raw: unknown; cost: number | null }
  | { status: 'captured'; capture: GeoCapture }
> {
  const raw = await request(
    login,
    password,
    `${base}${path(context)}/task_get/advanced/${encodeURIComponent(taskId)}`,
    'GET',
    null,
    fetcher,
  );
  const { task, cost } = dataForSeoTask(raw);
  if (task.id !== taskId) throw new DataForSeoError('TASK_ID_MISMATCH', raw, cost);
  if ([40601, 40602].includes(task.status_code)) return { status: 'pending', raw, cost };
  return { status: 'captured', capture: normalizeDataForSeo(raw, context) };
}
