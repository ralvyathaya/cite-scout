import { z } from 'zod';
import { canonicalSourceUrl } from '../../domain/evidence';
import type { GeoCapture, GeoRequestContext, GeoSource } from '../../shared/geo';

export class DataForSeoError extends Error {
  constructor(
    readonly code: string,
    readonly raw: unknown = null,
    readonly cost: number | null = null,
    readonly uncertain = false,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
    this.name = 'DataForSeoError';
  }
}

const taskSchema = z.looseObject({
  id: z.string().optional(),
  status_code: z.number().int(),
  status_message: z.string().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  result: z.unknown().optional(),
});
const envelopeSchema = z.looseObject({
  status_code: z.number().int(),
  cost: z.number().nonnegative().nullable().optional(),
  tasks: z.array(taskSchema).length(1),
});
export function dataForSeoTask(raw: unknown, submitting = false) {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) throw new DataForSeoError('MALFORMED_RESPONSE', raw, null, submitting);
  const body = parsed.data;
  const task = body.tasks[0];
  if (!task) throw new DataForSeoError('MALFORMED_RESPONSE', raw, null, submitting);
  const cost = task.cost ?? body.cost ?? null;
  if (body.status_code !== 20000)
    throw new DataForSeoError(`DATAFORSEO_${String(body.status_code)}`, raw, cost);
  return { task, cost };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeDataForSeo(raw: unknown, context: GeoRequestContext): GeoCapture {
  const { task, cost } = dataForSeoTask(raw);
  const capture: GeoCapture = {
    schemaVersion: 'geo-capture-1',
    answerText: '',
    raw,
    model: null,
    modelReported: false,
    sources: [],
    quality: task.status_code === 40106 ? 'partial' : 'complete',
    providerRequestId: task.id ?? null,
    providerStatus: String(task.status_code),
    reportedCost: cost,
    inputTokens: null,
    outputTokens: null,
    textParts: [],
  };
  if (task.status_code === 40102) return { ...capture, quality: 'no_feature' };
  if (![20000, 40106].includes(task.status_code))
    throw new DataForSeoError(`DATAFORSEO_${String(task.status_code)}`, raw, cost);
  const fail = (): never => {
    throw new DataForSeoError('MALFORMED_RESULT', raw, cost);
  };
  if (context.engine === 'perplexity' || !Array.isArray(task.result) || task.result.length !== 1)
    return fail();
  const result = record(task.result[0]);
  if (!result) return fail();
  const sources: GeoSource[] = [];
  const sourceKeys = new Set<string>();
  const addSources = (value: unknown, level: GeoSource['referenceLevel']) => {
    // Documented null references mean none; malformed entries remain a partial capture.
    if (value == null) return;
    if (!Array.isArray(value)) {
      capture.quality = 'partial';
      return;
    }
    for (const candidate of value) {
      const source = record(candidate);
      const url = typeof source?.url === 'string' ? source.url : null;
      const canonicalUrl = url === null ? null : canonicalSourceUrl(url);
      if (!source || url === null || canonicalUrl === null) {
        capture.quality = 'partial';
        continue;
      }
      if (source.title != null && typeof source.title !== 'string') capture.quality = 'partial';
      const key = `${level}:${canonicalUrl}`;
      if (sourceKeys.has(key)) continue;
      sourceKeys.add(key);
      sources.push({
        id: `source-${String(sources.length + 1)}`,
        url,
        canonicalUrl,
        title: typeof source.title === 'string' ? source.title : null,
        referenceLevel: level,
      });
    }
  };
  const addPart = (text: string, itemIndex: number, contentIndex: number) => {
    capture.textParts.push({ itemIndex, contentIndex, text });
  };
  const elements = (value: unknown, itemIndex: number, depth = 0, extractText = false) => {
    if (value == null) return;
    if (!Array.isArray(value) || depth > 4) {
      capture.quality = 'partial';
      return;
    }
    value.forEach((candidate, contentIndex) => {
      const element = record(candidate);
      if (!element || typeof element.type !== 'string') {
        capture.quality = 'partial';
        return;
      }
      addSources(element.references, 'element');
      addSources(element.sources, 'element');
      const text =
        typeof element.markdown === 'string'
          ? element.markdown
          : typeof element.text === 'string'
            ? element.text
            : null;
      if (extractText && text !== null) addPart(text, itemIndex, contentIndex);
      elements(element.items, itemIndex, depth + 1, extractText && text === null);
      elements(element.components, itemIndex, depth + 1, extractText && text === null);
    });
  };
  if (context.engine === 'chatgpt_search') {
    if (typeof result.markdown !== 'string') return fail();
    addPart(result.markdown, 0, 0);
    capture.model = typeof result.model === 'string' && result.model.trim() ? result.model : null;
    capture.modelReported = capture.model !== null;
    addSources(result.search_results, 'retrieved');
    addSources(result.sources, 'answer');
    elements(result.items, 0);
  } else {
    if (!Array.isArray(result.items)) return fail();
    let overviewFound = false;
    for (const [itemIndex, candidate] of result.items.entries()) {
      const item = record(candidate);
      if (!item || typeof item.type !== 'string') return fail();
      if (item.type === 'organic') addSources([item], 'retrieved');
      if (item.type !== 'ai_overview') continue;
      overviewFound = true;
      const hasMarkdown = typeof item.markdown === 'string' && item.markdown.trim().length > 0;
      if (hasMarkdown) addPart(item.markdown as string, itemIndex, 0);
      addSources(item.references, 'answer');
      elements(item.items, itemIndex, 0, !hasMarkdown);
    }
    if (!overviewFound) capture.quality = task.status_code === 40106 ? 'partial' : 'no_feature';
  }
  capture.answerText = capture.textParts.map((part) => part.text).join('\n');
  capture.sources = sources;
  if (capture.quality !== 'no_feature' && !capture.answerText.trim()) capture.quality = 'partial';
  return capture;
}
