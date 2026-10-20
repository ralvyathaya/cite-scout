import { z } from 'zod';
import { canonicalSourceUrl } from '../../domain/evidence';
import { CaptureError } from '../../shared/evidence';
import type { GeoCapture, GeoRequestContext, GeoSource } from '../../shared/geo';
import { neutralResearchInstruction } from '../perplexity/provider';
import { readProviderJson } from '../read-response';
import { redactProviderData } from '../provider-redaction';

const envelope = z.looseObject({
  id: z.string().trim().min(1),
  type: z.literal('message'),
  role: z.literal('assistant'),
  model: z.string().trim().min(1),
  content: z.array(z.unknown()),
  stop_reason: z.string().nullable(),
  usage: z.unknown().optional(),
});
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

export function normalizeAnthropic(raw: unknown, requestId: string | null = null): GeoCapture {
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) throw new CaptureError('MALFORMED_RESPONSE', null, raw);
  const body = parsed.data;
  const usage = record(body.usage);
  const sources = new Map<string, GeoSource>();
  const calls = new Set<string>();
  const results = new Set<string>();
  const capture: GeoCapture = {
    schemaVersion: 'geo-capture-1',
    answerText: '',
    raw,
    model: body.model,
    modelReported: true,
    inlineReferencesAvailable: false,
    sources: [],
    quality: body.stop_reason === 'end_turn' ? 'complete' : 'partial',
    providerRequestId: requestId ?? body.id,
    providerStatus: body.stop_reason,
    reportedCost: null,
    inputTokens: count(usage?.input_tokens),
    outputTokens: count(usage?.output_tokens),
    textParts: [],
  };
  const partial = () => {
    capture.quality = 'partial';
  };
  const source = (value: unknown, level: 'retrieved' | 'answer') => {
    const item = record(value);
    const url = typeof item?.url === 'string' ? item.url : null;
    const canonicalUrl = url === null ? null : canonicalSourceUrl(url);
    if (!url || !canonicalUrl) {
      partial();
      return;
    }
    const key = `${level}:${canonicalUrl}`;
    if (!sources.has(key))
      sources.set(key, {
        id: `anthropic-source-${String(sources.size + 1)}`,
        url,
        canonicalUrl,
        title: typeof item?.title === 'string' ? item.title : null,
        // cited_text quotes the source, not a span in the unchanged answer.
        referenceLevel: level,
      });
  };
  body.content.forEach((value, itemIndex) => {
    const block = record(value);
    if (!block) {
      partial();
      return;
    }
    if (block.type === 'server_tool_use') {
      if (block.name === 'web_search' && typeof block.id === 'string') calls.add(block.id);
      else partial();
    } else if (block.type === 'web_search_tool_result') {
      if (!Array.isArray(block.content) || typeof block.tool_use_id !== 'string') {
        partial();
        return;
      }
      results.add(block.tool_use_id);
      for (const result of block.content) {
        if (record(result)?.type !== 'web_search_result') partial();
        else source(result, 'retrieved');
      }
    } else if (block.type === 'text' && typeof block.text === 'string') {
      capture.textParts.push({ itemIndex, contentIndex: 0, text: block.text });
      if (block.citations != null) {
        if (!Array.isArray(block.citations)) partial();
        else
          for (const citation of block.citations) {
            if (record(citation)?.type !== 'web_search_result_location') partial();
            else source(citation, 'answer');
          }
      }
    } else if (block.type !== 'thinking' && block.type !== 'redacted_thinking') partial();
  });
  capture.answerText = capture.textParts.map((part) => part.text).join('\n');
  const searches = count(record(usage?.server_tool_use)?.web_search_requests);
  if (
    !capture.answerText.trim() ||
    calls.size !== 1 ||
    results.size !== 1 ||
    ![...calls].every((id) => results.has(id)) ||
    searches !== 1 ||
    capture.inputTokens === null ||
    capture.outputTokens === null
  )
    partial();
  capture.sources = [...sources.values()];
  return capture;
}

// Published Sonnet 5.5 token/cache rates plus basic web search; never an invoice.
export const anthropicPricingVersion = 'anthropic-sonnet-5-5-web-search-2026-10-20';
export function estimateAnthropicCost(capture: GeoCapture): number | null {
  if (capture.model !== 'claude-sonnet-5-5') return null;
  const usage = record(record(capture.raw)?.usage);
  const input = count(usage?.input_tokens),
    output = count(usage?.output_tokens);
  const searches = count(record(usage?.server_tool_use)?.web_search_requests);
  const cacheRead = count(
    usage?.cache_read_input_tokens === undefined ? 0 : usage.cache_read_input_tokens,
  );
  const cacheCreate = count(
    usage?.cache_creation_input_tokens === undefined ? 0 : usage.cache_creation_input_tokens,
  );
  // This request does not enable caching. Unexpected cache writes need their TTL rates verified.
  if (
    input === null ||
    output === null ||
    searches === null ||
    cacheRead === null ||
    cacheCreate !== 0
  )
    return null;
  return (input * 2 + output * 10 + cacheRead * 0.1) / 1_000_000 + searches * 0.01;
}

export async function captureAnthropicGeo(
  apiKey: string,
  context: GeoRequestContext,
  fetcher: typeof fetch = fetch,
): Promise<GeoCapture> {
  if (!apiKey.trim()) throw new CaptureError('COLLECTOR_NOT_CONFIGURED');
  const signal = AbortSignal.timeout(30_000);
  let response: Response;
  try {
    response = await fetcher('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: context.requestedModel ?? 'claude-sonnet-5-5',
        system: neutralResearchInstruction,
        messages: [{ role: 'user', content: context.promptText }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
        max_tokens: 1600,
        stream: false,
      }),
      signal,
      redirect: 'error',
    });
  } catch {
    throw new CaptureError(signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_TRANSPORT_ERROR');
  }
  let raw: unknown;
  try {
    raw = redactProviderData(await readProviderJson(response), [apiKey]);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'PROVIDER_BODY_ERROR';
    throw new CaptureError(
      !response.ok
        ? `PROVIDER_HTTP_${String(response.status)}`
        : signal.aborted
          ? 'PROVIDER_TIMEOUT'
          : code === 'PROVIDER_EMPTY_BODY'
            ? 'EMPTY_BODY'
            : code === 'PROVIDER_RESPONSE_LIMIT'
              ? 'RESPONSE_TOO_LARGE'
              : code === 'PROVIDER_MALFORMED_JSON'
                ? 'MALFORMED_RESPONSE'
                : 'PROVIDER_BODY_ERROR',
    );
  }
  if (!response.ok) throw new CaptureError(`PROVIDER_HTTP_${String(response.status)}`, null, raw);
  return normalizeAnthropic(raw, response.headers.get('request-id'));
}
