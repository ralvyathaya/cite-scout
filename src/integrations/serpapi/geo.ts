import { canonicalSourceUrl } from '../../domain/evidence';
import type { GeoCapture, GeoRequestContext, GeoSource } from '../../shared/geo';
import { redactProviderData } from '../provider-redaction';
import { readProviderJson } from '../read-response';

export class SerpApiError extends Error {
  readonly reportedCost = null;
  constructor(
    readonly code: string,
    readonly raw: unknown = null,
    readonly uncertain = false,
  ) {
    super(code);
    this.name = 'SerpApiError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalize(
  body: Record<string, unknown>,
  context: GeoRequestContext,
  raw: unknown,
): GeoCapture {
  const metadata = record(body.search_metadata);
  const capture: GeoCapture = {
    schemaVersion: 'geo-capture-1',
    answerText: '',
    raw,
    model: null,
    modelReported: false,
    inlineReferencesAvailable: false,
    sources: [],
    quality: 'complete',
    providerRequestId: typeof metadata?.id === 'string' ? metadata.id : null,
    providerStatus: typeof metadata?.status === 'string' ? metadata.status : null,
    reportedCost: null,
    inputTokens: null,
    outputTokens: null,
    textParts: [],
  };
  const partial = () => {
    capture.quality = 'partial';
  };
  const part = (value: unknown, itemIndex = 0) => {
    if (typeof value !== 'string') {
      partial();
      return;
    }
    if (value.trim())
      capture.textParts.push({ itemIndex, contentIndex: capture.textParts.length, text: value });
  };
  const sourceKeys = new Set<string>();
  const source = (candidate: unknown, referenceLevel: GeoSource['referenceLevel']) => {
    const data = record(candidate);
    const url = typeof data?.link === 'string' ? data.link : null;
    const canonicalUrl = url === null ? null : canonicalSourceUrl(url);
    if (!data || !url || !canonicalUrl) {
      partial();
      return;
    }
    if (data.title != null && typeof data.title !== 'string') partial();
    const key = `${referenceLevel}:${canonicalUrl}`;
    if (sourceKeys.has(key)) return;
    sourceKeys.add(key);
    capture.sources.push({
      id: `source-${String(capture.sources.length + 1)}`,
      url,
      canonicalUrl,
      title: typeof data.title === 'string' ? data.title : null,
      referenceLevel,
    });
  };
  const sources = (value: unknown, level: GeoSource['referenceLevel']) => {
    if (value == null) return;
    if (!Array.isArray(value)) {
      partial();
      return;
    }
    value.forEach((candidate: unknown) => {
      source(candidate, level);
    });
  };
  sources(body.organic_results, 'retrieved');
  const featureName = context.engine === 'google_aio' ? 'ai_overview' : 'copilot_answer';
  if (!(featureName in body)) {
    if (!Array.isArray(body.organic_results))
      throw new SerpApiError('SERPAPI_MALFORMED_RESULT', raw);
    capture.quality = capture.quality === 'partial' ? 'partial' : 'no_feature';
    return capture;
  }
  const feature = record(body[featureName]);
  if (!feature) return { ...capture, quality: 'partial' };
  if (feature.error != null) throw new SerpApiError('SERPAPI_FEATURE_ERROR', raw);
  if (context.engine === 'google_aio') {
    const indexedSources = new Map<number, unknown>();
    if (Array.isArray(feature.references))
      feature.references.forEach((candidate: unknown, index) => {
        const data = record(candidate);
        if (data?.index != null && (!Number.isSafeInteger(data.index) || Number(data.index) < 0))
          partial();
        else indexedSources.set(typeof data?.index === 'number' ? data.index : index, candidate);
      });
    sources(feature.references, 'answer');
    const links = (block: Record<string, unknown>) => {
      sources(block.snippet_links, 'element');
      if (block.reference_indexes == null) return;
      if (!Array.isArray(block.reference_indexes)) {
        partial();
        return;
      }
      for (const index of block.reference_indexes) {
        if (!Number.isSafeInteger(index) || !indexedSources.has(index as number)) partial();
        else source(indexedSources.get(index as number), 'element');
      }
    };
    const blocks = (value: unknown, depth = 0, itemIndex = 0) => {
      if (!Array.isArray(value) || depth > 8) {
        partial();
        return;
      }
      value.forEach((candidate: unknown, index) => {
        const block = record(candidate);
        if (!block || typeof block.type !== 'string') {
          partial();
          return;
        }
        const blockIndex = depth ? itemIndex : index;
        links(block);
        switch (block.type) {
          case 'heading':
          case 'paragraph':
            part(block.snippet, blockIndex);
            break;
          case 'expandable':
            if (block.title != null) part(block.title, blockIndex);
            if (block.subtitle != null) part(block.subtitle, blockIndex);
            blocks(block.text_blocks, depth + 1, blockIndex);
            break;
          case 'list':
            if (!Array.isArray(block.list)) {
              partial();
              break;
            }
            for (const entry of block.list) {
              const item = record(entry);
              if (!item) {
                partial();
                continue;
              }
              if (item.title != null) part(item.title, blockIndex);
              if (item.snippet != null) part(item.snippet, blockIndex);
              if (item.title == null && item.snippet == null && item.list == null) partial();
              links(item);
              if (item.list != null)
                blocks([{ type: 'list', list: item.list }], depth + 1, blockIndex);
            }
            break;
          case 'comparison':
            if (block.product_labels != null) {
              if (
                Array.isArray(block.product_labels) &&
                block.product_labels.every((label: unknown) => typeof label === 'string')
              )
                part(block.product_labels.join('\t'), blockIndex);
              else partial();
            }
            if (!Array.isArray(block.comparison)) {
              partial();
              break;
            }
            for (const candidateRow of block.comparison) {
              const row = record(candidateRow);
              if (
                !row ||
                typeof row.feature !== 'string' ||
                !Array.isArray(row.values) ||
                !row.values.every((cell: unknown) => typeof cell === 'string')
              )
                partial();
              else part([row.feature, ...row.values].join('\t'), blockIndex);
            }
            break;
          case 'table':
            if (!Array.isArray(block.table)) {
              partial();
              break;
            }
            for (const row of block.table) {
              if (!Array.isArray(row) || !row.every((cell: unknown) => typeof cell === 'string'))
                partial();
              else part(row.join('\t'), blockIndex);
            }
            break;
          default:
            partial();
        }
      });
    };
    blocks(feature.text_blocks);
  } else {
    sources(feature.sources, 'answer');
    if (feature.overview != null) {
      const overview = record(feature.overview);
      if (!overview) partial();
      else {
        part(overview.snippet);
        sources(overview.references, 'answer');
        if (overview.facts != null) {
          if (!Array.isArray(overview.facts)) partial();
          else
            for (const candidate of overview.facts) {
              const fact = record(candidate);
              const label = record(fact?.label);
              const content = record(fact?.content);
              if (
                !label ||
                !content ||
                typeof label.text !== 'string' ||
                typeof content.text !== 'string'
              )
                partial();
              else part(`${label.text}\n${content.text}`);
            }
        }
      }
    }
    if (feature.question_and_answer != null) {
      const answer = record(feature.question_and_answer);
      if (!answer) partial();
      else {
        if (answer.title != null) part(answer.title);
        if (typeof answer.answer !== 'string' || !answer.answer.trim()) partial();
        else part(answer.answer);
        sources(answer.sitelinks, 'answer');
        if (answer.link != null) source(answer, 'retrieved');
      }
    }
    if ('tabbed_content' in feature) {
      const tabs = feature.tabbed_content;
      if (!Array.isArray(tabs) || tabs.length === 0) partial();
      else
        tabs.forEach((candidate: unknown, index) => {
          const tab = record(candidate);
          if (
            !tab ||
            typeof tab.title !== 'string' ||
            !tab.title.trim() ||
            typeof tab.content !== 'string' ||
            !tab.content.trim()
          ) {
            partial();
            return;
          }
          part(tab.title, index);
          part(tab.content, index);
          source(tab, 'answer');
        });
    }
  }
  capture.answerText = capture.textParts.map((value) => value.text).join('\n');
  if (!capture.answerText.trim()) partial();
  return capture;
}

export async function captureSerpApiGeo(
  apiKey: string,
  context: GeoRequestContext,
  beforeRequest: () => Promise<void>,
  fetcher: typeof fetch = fetch,
): Promise<GeoCapture> {
  if (!apiKey.trim()) throw new SerpApiError('SERPAPI_MISSING_KEY');
  if (!['google_aio', 'bing_copilot'].includes(context.engine))
    throw new SerpApiError('SERPAPI_UNSUPPORTED_ENGINE');
  if (context.languageCode !== 'en' || context.locationCode !== 2840)
    throw new SerpApiError('SERPAPI_UNSUPPORTED_LOCALE');
  const request = async (parameters: Record<string, string>, deadline?: number) => {
    const url = new URL('https://serpapi.com/search.json');
    url.search = new URLSearchParams({
      ...parameters,
      api_key: apiKey,
      no_cache: 'true',
    }).toString();
    if (deadline !== undefined && Date.now() >= deadline)
      throw new SerpApiError('SERPAPI_TOKEN_EXPIRED');
    await beforeRequest();
    if (deadline !== undefined && Date.now() >= deadline)
      throw new SerpApiError('SERPAPI_TOKEN_EXPIRED');
    const signal = AbortSignal.timeout(45_000);
    let response: Response;
    try {
      response = await fetcher(url.href, {
        method: 'GET',
        redirect: 'manual',
        headers: { Accept: 'application/json' },
        signal,
      });
    } catch {
      throw new SerpApiError(
        signal.aborted ? 'SERPAPI_TIMEOUT' : 'SERPAPI_TRANSPORT_ERROR',
        null,
        true,
      );
    }
    if (response.status >= 300 && response.status < 400)
      throw new SerpApiError('SERPAPI_REDIRECT_REFUSED', null, true);
    let raw: unknown;
    try {
      raw = await readProviderJson(response, 512 * 1024);
    } catch (error) {
      const code =
        error instanceof Error &&
        ['PROVIDER_EMPTY_BODY', 'PROVIDER_RESPONSE_LIMIT', 'PROVIDER_MALFORMED_JSON'].includes(
          error.message,
        )
          ? error.message
          : 'SERPAPI_BODY_ERROR';
      throw new SerpApiError(signal.aborted ? 'SERPAPI_TIMEOUT' : code, null, true);
    }
    const safeRaw = redactProviderData(raw, [apiKey]);
    if (!response.ok)
      throw new SerpApiError(
        `SERPAPI_HTTP_${String(response.status)}`,
        safeRaw,
        response.status >= 500,
      );
    const body = record(raw),
      metadata = record(body?.search_metadata);
    if (body?.error != null || metadata?.status === 'Error')
      throw new SerpApiError('SERPAPI_PROVIDER_ERROR', safeRaw);
    if (
      !body ||
      !metadata ||
      typeof metadata.id !== 'string' ||
      !metadata.id.trim() ||
      typeof metadata.status !== 'string'
    )
      throw new SerpApiError('SERPAPI_MALFORMED_RESPONSE', safeRaw);
    if (metadata.status !== 'Success') throw new SerpApiError('SERPAPI_NOT_READY', safeRaw);
    return body;
  };
  const startedAt = Date.now();
  const search = await request({
    engine: context.engine === 'google_aio' ? 'google' : 'bing',
    q: context.promptText,
    device: context.device,
    ...(context.engine === 'google_aio' ? { gl: 'us', hl: 'en' } : { mkt: 'en-US' }),
  });
  let result = search;
  let aiOverview: Record<string, unknown> | null = null;
  const feature = record(search.ai_overview);
  if (
    context.engine === 'google_aio' &&
    feature?.page_token != null &&
    (feature.text_blocks == null ||
      (Array.isArray(feature.text_blocks) && feature.text_blocks.length === 0))
  ) {
    if (typeof feature.page_token !== 'string' || !feature.page_token.trim())
      throw new SerpApiError('SERPAPI_MALFORMED_TOKEN', redactProviderData(search, [apiKey]));
    const createdAt = record(search.search_metadata)?.created_at;
    const providerTime = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
    const deadline =
      Math.min(startedAt, Number.isFinite(providerTime) ? providerTime : startedAt) + 60_000;
    aiOverview = await request(
      { engine: 'google_ai_overview', page_token: feature.page_token },
      deadline,
    );
    result = aiOverview;
    if (!('ai_overview' in result))
      throw new SerpApiError('SERPAPI_MALFORMED_RESULT', redactProviderData(result, [apiKey]));
  }
  const safe = record(redactProviderData(result, [apiKey]));
  if (!safe) throw new SerpApiError('SERPAPI_MALFORMED_RESPONSE');
  const raw = redactProviderData({ search, ...(aiOverview ? { aiOverview } : {}) }, [apiKey]);
  return normalize(safe, context, raw);
}
