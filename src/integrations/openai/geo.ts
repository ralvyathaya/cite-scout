import { z } from 'zod';
import { canonicalSourceUrl } from '../../domain/evidence';
import { CaptureError } from '../../shared/evidence';
import type { GeoCapture, GeoRequestContext, GeoSource } from '../../shared/geo';
import { neutralResearchInstruction } from '../perplexity/provider';
import { readProviderJson } from '../read-response';

const envelopeSchema = z.looseObject({
  id: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0),
  model: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0),
  status: z.enum(['completed', 'incomplete', 'failed', 'cancelled', 'in_progress', 'queued']),
  output: z.array(z.unknown()),
  usage: z.unknown().optional(),
});

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function tokens(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeOpenAi(raw: unknown): GeoCapture {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) throw new CaptureError('MALFORMED_RESPONSE', null, raw);
  const body = parsed.data;
  if (body.status === 'failed' || body.status === 'cancelled')
    throw new CaptureError(`OPENAI_${body.status.toUpperCase()}`, body.status, raw);

  const usage = record(body.usage);
  const capture: GeoCapture = {
    schemaVersion: 'geo-capture-1',
    answerText: '',
    raw,
    model: body.model,
    modelReported: true,
    inlineReferencesAvailable: true,
    sources: [],
    quality: body.status === 'completed' ? 'complete' : 'partial',
    providerRequestId: body.id,
    providerStatus: body.status,
    // The Responses usage contract reports tokens, not an actual USD charge.
    reportedCost: null,
    inputTokens: tokens(usage?.input_tokens),
    outputTokens: tokens(usage?.output_tokens),
    textParts: [],
  };
  const sourceMap = new Map<string, GeoSource>();
  let completedSearches = 0;
  let offset = 0;
  const partial = () => {
    capture.quality = 'partial';
  };
  const addSource = (
    source: Record<string, unknown> | null,
    level: 'retrieved' | 'inline_verified',
    span?: { start: number; end: number },
  ) => {
    const url = typeof source?.url === 'string' ? source.url : null;
    const canonicalUrl = url === null ? null : canonicalSourceUrl(url);
    if (source === null || url === null || canonicalUrl === null) {
      partial();
      if (level === 'inline_verified') capture.inlineReferencesAvailable = false;
      return;
    }
    if (source.title != null && typeof source.title !== 'string') partial();
    const key = `${level}:${canonicalUrl}`;
    const existing = sourceMap.get(key);
    if (existing) {
      if (span) existing.spans?.push(span);
      return;
    }
    const value: GeoSource = {
      id: `openai-source-${String(sourceMap.size + 1)}`,
      url,
      canonicalUrl,
      title: typeof source.title === 'string' ? source.title : null,
      referenceLevel: level,
      ...(span ? { spans: [span] } : {}),
    };
    sourceMap.set(key, value);
    capture.sources.push(value);
  };

  body.output.forEach((value, itemIndex) => {
    const item = record(value);
    if (!item || typeof item.type !== 'string') {
      partial();
      return;
    }
    if (item.type === 'web_search_call') {
      const action = record(item.action);
      if (
        item.status === 'completed' &&
        typeof action?.type === 'string' &&
        ['search', 'open_page', 'find'].includes(action.type)
      )
        completedSearches += 1;
      else partial();
      if (action?.sources != null) {
        if (!Array.isArray(action.sources)) {
          partial();
          return;
        }
        for (const source of action.sources) addSource(record(source), 'retrieved');
      }
      return;
    }
    if (item.type !== 'message') return;
    if (item.role !== 'assistant' || !Array.isArray(item.content)) {
      partial();
      return;
    }
    if (item.status !== 'completed') partial();
    item.content.forEach((value: unknown, contentIndex: number) => {
      const part = record(value);
      if (part?.type !== 'output_text' || typeof part.text !== 'string') {
        partial();
        return;
      }
      const text = part.text;
      capture.textParts.push({ itemIndex, contentIndex, text });
      if (!Array.isArray(part.annotations)) {
        partial();
        capture.inlineReferencesAvailable = false;
      } else {
        for (const value of part.annotations) {
          const annotation = record(value);
          const start = tokens(annotation?.start_index);
          const end = tokens(annotation?.end_index);
          const splitsSurrogate = (index: number) =>
            index > 0 &&
            index < text.length &&
            text.charCodeAt(index) >= 0xdc00 &&
            text.charCodeAt(index) <= 0xdfff &&
            text.charCodeAt(index - 1) >= 0xd800 &&
            text.charCodeAt(index - 1) <= 0xdbff;
          if (
            annotation?.type !== 'url_citation' ||
            start === null ||
            end === null ||
            end <= start ||
            end > text.length ||
            splitsSurrogate(start) ||
            splitsSurrogate(end)
          ) {
            partial();
            capture.inlineReferencesAvailable = false;
            continue;
          }
          addSource(annotation, 'inline_verified', { start: offset + start, end: offset + end });
        }
      }
      offset += text.length + 1;
    });
  });
  capture.answerText = capture.textParts.map((part) => part.text).join('\n');
  if (completedSearches !== 1 || !capture.answerText.trim()) partial();
  if (
    body.usage != null &&
    (!usage || capture.inputTokens === null || capture.outputTokens === null)
  )
    partial();
  return capture;
}

export async function captureOpenAiGeo(
  apiKey: string,
  context: GeoRequestContext,
  fetcher: typeof fetch = fetch,
  requestedModel = 'gpt-6-luna',
): Promise<GeoCapture> {
  const signal = AbortSignal.timeout(30_000);
  let response: Response;
  try {
    response = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: requestedModel,
        instructions: neutralResearchInstruction,
        input: context.promptText,
        tools: [{ type: 'web_search', external_web_access: true }],
        tool_choice: 'required',
        max_tool_calls: 1,
        include: ['web_search_call.action.sources'],
        reasoning: { effort: 'none' },
        max_output_tokens: context.maxOutputTokens,
        store: false,
        stream: false,
      }),
      signal,
    });
  } catch {
    throw new CaptureError(signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_TRANSPORT_ERROR');
  }
  let raw: unknown;
  try {
    raw = await readProviderJson(response);
  } catch (error) {
    const code =
      error instanceof Error && error.message === 'PROVIDER_RESPONSE_LIMIT'
        ? 'RESPONSE_TOO_LARGE'
        : error instanceof Error && error.message === 'PROVIDER_MALFORMED_JSON'
          ? 'MALFORMED_RESPONSE'
          : error instanceof Error && error.message === 'PROVIDER_EMPTY_BODY'
            ? 'EMPTY_BODY'
            : signal.aborted
              ? 'PROVIDER_TIMEOUT'
              : 'PROVIDER_BODY_ERROR';
    throw new CaptureError(response.ok ? code : `PROVIDER_HTTP_${String(response.status)}`);
  }
  if (!response.ok) throw new CaptureError(`PROVIDER_HTTP_${String(response.status)}`, null, raw);
  return normalizeOpenAi(raw);
}
