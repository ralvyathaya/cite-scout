import { CaptureError } from '../shared/evidence';
import type {
  CitationLink,
  ComparableObservation,
  EntityMatch,
  EvidenceCapture,
  EvidenceDelta,
  RequestContext,
  SourceDelta,
  SourceRecord,
} from '../shared/evidence';
import { analyzeMentions } from './mentions';

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function canonicalSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function nonnegative(value: unknown, integer = false): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    (!integer || Number.isSafeInteger(value))
    ? value
    : null;
}

function sourceRecords(output: unknown[]): {
  sources: SourceRecord[];
  sourceParseStatus: 'complete' | 'partial';
} {
  const sources: SourceRecord[] = [];
  let sourceParseStatus: 'complete' | 'partial' = 'complete';
  output.forEach((value, itemIndex) => {
    const item = record(value);
    if (!item || typeof item.type !== 'string') {
      sourceParseStatus = 'partial';
      return;
    }
    if (item.type !== 'search_results') {
      if (/source|search_result|citation/u.test(item.type)) sourceParseStatus = 'partial';
      return;
    }
    if (!Array.isArray(item.results)) {
      sourceParseStatus = 'partial';
      return;
    }
    item.results.forEach((value: unknown, resultIndex: number) => {
      const source = record(value);
      const url = typeof source?.url === 'string' ? source.url : null;
      const canonicalUrl = url === null ? null : canonicalSourceUrl(url);
      if (!source || url === null || canonicalUrl === null) {
        sourceParseStatus = 'partial';
        return;
      }
      const id =
        typeof source.id === 'number' && Number.isSafeInteger(source.id) && source.id > 0
          ? source.id
          : null;
      if (
        id === null ||
        (source.title != null && typeof source.title !== 'string') ||
        (source.snippet != null && typeof source.snippet !== 'string')
      )
        sourceParseStatus = 'partial';
      sources.push({
        key: `${String(itemIndex)}:${String(resultIndex)}`,
        itemIndex,
        resultIndex,
        id,
        url,
        canonicalUrl,
        hostname: new URL(canonicalUrl).hostname,
        title: typeof source.title === 'string' ? source.title : null,
        snippet: typeof source.snippet === 'string' ? source.snippet : null,
      });
    });
  });
  return { sources, sourceParseStatus };
}

/** Mask markdown syntax without moving offsets into the captured text. */
function markerText(text: string, fence: { char: string; size: number }): string {
  const lines = text.split(/(?<=\n)/u);
  const visible = lines
    .map((line) => {
      const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line.replace(/\r?\n$/u, ''));
      if (fence.size > 0) {
        if (
          delimiter?.[1]?.[0] === fence.char &&
          delimiter[1].length >= fence.size &&
          !delimiter[2]?.trim()
        )
          fence.size = 0;
        return ' '.repeat(line.length);
      }
      if (delimiter?.[1]) {
        fence.char = delimiter[1][0] ?? '';
        fence.size = delimiter[1].length;
        return ' '.repeat(line.length);
      }
      return line;
    })
    .join('');
  const chars = visible.split('');
  for (let start = 0; start < visible.length; start += 1) {
    if (visible[start] !== '[' || visible[start - 1] === '\\') continue;
    let depth = 1;
    let end = start + 1;
    for (; end < visible.length && depth > 0; end += 1) {
      if (visible[end - 1] === '\\') continue;
      if (visible[end] === '[') depth += 1;
      if (visible[end] === ']') depth -= 1;
    }
    if (depth !== 0) continue;
    if (
      visible[end] === '(' ||
      visible[end] === '[' ||
      (visible[end] === ':' &&
        /^\s*$/u.test(visible.slice(visible.lastIndexOf('\n', start) + 1, start)))
    ) {
      for (let i = start; i < end; i += 1) chars[i] = ' ';
      start = end - 1;
    }
  }
  return chars.join('');
}

function citationLinks(
  parts: EvidenceCapture['textParts'],
  sources: SourceRecord[],
): CitationLink[] {
  const links: CitationLink[] = [];
  const fence = { char: '', size: 0 };
  for (const part of parts) {
    const visible = markerText(part.text, fence);
    for (const match of visible.matchAll(/\[([^\]\n]+)\]/gu)) {
      if (visible[match.index - 1] === '\\') continue;
      const token = match[1] ?? '';
      if (!/^\d+$/u.test(token) && !/^(?:web\s*:|\s*\d[\d\s,;:–—-]*)/iu.test(token)) continue;
      const parsed = /^\d+$/u.test(token) ? Number(token) : null;
      const sourceId =
        parsed !== null && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
      const candidates =
        sourceId === null ? [] : sources.filter((source) => source.id === sourceId);
      const urls = new Set(candidates.map((source) => source.canonicalUrl));
      const reason =
        sourceId === null
          ? 'unsupported_marker'
          : urls.size === 0
            ? 'missing_source'
            : urls.size > 1
              ? 'conflicting_id'
              : null;
      links.push({
        itemIndex: part.itemIndex,
        contentIndex: part.contentIndex,
        start: match.index,
        end: match.index + match[0].length,
        marker: match[0],
        sourceId,
        sourceKeys: reason === null ? candidates.map((source) => source.key) : [],
        status: reason === null ? 'verified' : 'unresolved',
        reason,
      });
    }
  }
  return links;
}

export function analyzeEvidence(raw: unknown, context: RequestContext): EvidenceCapture {
  const body = record(raw);
  const status = typeof body?.status === 'string' ? body.status : null;
  const fail = (code: string): never => {
    throw new CaptureError(code, status, raw);
  };
  if (!body || !Array.isArray(body.output)) return fail('UNSUPPORTED_RESPONSE_SHAPE');
  if (status !== 'completed')
    return fail(
      status === 'queued' || status === 'in_progress'
        ? 'UNSUPPORTED_PENDING_OUTCOME'
        : 'PROVIDER_NOT_COMPLETED',
    );
  if (body.error != null || body.incomplete_details != null) return fail('PROVIDER_NOT_COMPLETED');
  if (
    typeof body.id !== 'string' ||
    !body.id.trim() ||
    typeof body.model !== 'string' ||
    !body.model.trim()
  )
    return fail('MISSING_RESPONSE_IDENTITY');
  const textParts: EvidenceCapture['textParts'] = [];
  body.output.forEach((value: unknown, itemIndex: number) => {
    const item = record(value);
    if (!item || typeof item.type !== 'string') return fail('UNSUPPORTED_ANSWER_SHAPE');
    if (item.type !== 'message') {
      if (item.role === 'assistant' || item.type === 'output_text')
        return fail('UNSUPPORTED_ANSWER_SHAPE');
      return;
    }
    if (item.role != null && item.role !== 'assistant') return;
    if ((item.status != null && item.status !== 'completed') || item.incomplete_details != null)
      return fail('ASSISTANT_NOT_COMPLETED');
    if (!Array.isArray(item.content)) return fail('UNSUPPORTED_ANSWER_SHAPE');
    item.content.forEach((value: unknown, contentIndex: number) => {
      const content = record(value);
      if (content?.type !== 'output_text' || typeof content.text !== 'string')
        return fail('UNSUPPORTED_ANSWER_SHAPE');
      textParts.push({ itemIndex, contentIndex, text: content.text });
    });
  });
  const text = textParts.map((part) => part.text).join('\n');
  if (!text.trim()) return fail('EMPTY_ANSWER');
  const { sources, sourceParseStatus } = sourceRecords(body.output);
  const links = citationLinks(textParts, sources);
  const entities: EntityMatch[] = [context.brand, ...context.competitors].map((entity, index) => {
    const detected = analyzeMentions(
      text,
      { key: entity.id, name: entity.name, domain: entity.domain },
      [],
    );
    return {
      ...entity,
      kind: index === 0 ? 'brand' : 'competitor',
      matched: detected.brandMentioned,
      matchedTerms: detected.matchedTerms,
    };
  });
  const usage = record(body.usage);
  const cost = record(usage?.cost);
  return {
    responseId: body.id,
    model: body.model,
    providerStatus: status,
    raw,
    textParts,
    text,
    sources,
    links,
    sourceParseStatus,
    citationStatus: links.some((link) => link.status === 'unresolved')
      ? 'unresolved'
      : links.length > 0
        ? 'verified'
        : 'unverified',
    entities,
    inputTokens: nonnegative(usage?.input_tokens, true),
    outputTokens: nonnegative(usage?.output_tokens, true),
    reportedCost: nonnegative(cost?.total_cost),
  };
}

function contextKey(context: RequestContext): string {
  return JSON.stringify([
    context.schemaVersion,
    context.questionId,
    context.text,
    context.contextVersion,
    [context.brand.id, context.brand.name, context.brand.domain],
    context.competitors
      .map((entity) => [entity.id, entity.name, entity.domain])
      .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? '')),
    context.provider,
    context.preset,
    context.instruction,
    context.instructionVersion,
    context.maxOutputTokens,
    context.matcherVersion,
    context.extractorVersion,
    context.citationParserVersion,
  ]);
}

function unavailable(reason: string): SourceDelta {
  return { available: false, reason, added: [], removed: [] };
}

function sourceDelta(before: string[], after: string[]): SourceDelta {
  const left = new Set(before);
  const right = new Set(after);
  return {
    available: true,
    reason: null,
    added: [...right].filter((url) => !left.has(url)).sort(),
    removed: [...left].filter((url) => !right.has(url)).sort(),
  };
}

function citedUrls(capture: EvidenceCapture): string[] {
  const keys = new Set(
    capture.links.filter((link) => link.status === 'verified').flatMap((link) => link.sourceKeys),
  );
  return capture.sources
    .filter((source) => keys.has(source.key))
    .map((source) => source.canonicalUrl);
}

/** Caller supplies adjacent successes, or the baseline within that uninterrupted compatible series. */
export function compareEvidence(
  before: ComparableObservation,
  after: ComparableObservation,
): EvidenceDelta {
  let reason: string | null = null;
  if (
    !before.context ||
    !after.context ||
    !before.evidenceVersion ||
    !after.evidenceVersion ||
    before.evidenceVersion.startsWith('legacy') ||
    after.evidenceVersion.startsWith('legacy') ||
    before.context.schemaVersion !== 1 ||
    after.context.schemaVersion !== 1
  )
    reason = 'incomplete_provenance';
  else if (before.id === after.id) reason = 'same_observation';
  else if (before.context.questionId !== after.context.questionId) reason = 'different_question';
  else if (
    before.evidenceVersion !== after.evidenceVersion ||
    contextKey(before.context) !== contextKey(after.context)
  )
    reason = 'configuration_changed';
  else if (
    !before.capture.model ||
    !after.capture.model ||
    before.capture.model === 'unknown' ||
    after.capture.model === 'unknown'
  )
    reason = 'unknown_model';
  else if (before.capture.model !== after.capture.model) reason = 'model_changed';
  else if (
    before.capture.providerStatus !== 'completed' ||
    after.capture.providerStatus !== 'completed'
  )
    reason = 'unsuccessful_capture';
  const left = before.capture;
  const right = after.capture;
  const leftBrand = left.entities.find((entity) => entity.kind === 'brand');
  const rightBrand = right.entities.find((entity) => entity.kind === 'brand');
  if (
    !leftBrand ||
    !rightBrand ||
    left.entities.length !== right.entities.length ||
    left.entities.some(
      (entity) =>
        !right.entities.some((other) => other.id === entity.id && other.kind === entity.kind),
    )
  )
    reason ??= 'incomplete_entity_evidence';
  if (reason || !leftBrand || !rightBrand)
    return {
      eligible: false,
      reason: reason ?? 'incomplete_entity_evidence',
      brand: null,
      competitors: [],
      returnedSources: unavailable(reason ?? 'incomplete_entity_evidence'),
      citedSources: unavailable(reason ?? 'incomplete_entity_evidence'),
      changed: false,
      summary: 'New baseline: configuration or model changed',
    };
  const change = (a: boolean, b: boolean): 'appeared' | 'disappeared' | null =>
    a === b ? null : b ? 'appeared' : 'disappeared';
  const brand = {
    before: leftBrand.matched,
    after: rightBrand.matched,
    change: change(leftBrand.matched, rightBrand.matched),
  };
  const competitors: EvidenceDelta['competitors'] = right.entities.flatMap((entity) => {
    if (entity.kind !== 'competitor') return [];
    const previous = left.entities.find((other) => other.id === entity.id);
    const delta = previous ? change(previous.matched, entity.matched) : null;
    return delta ? [{ id: entity.id, name: entity.name, change: delta }] : [];
  });
  const complete = left.sourceParseStatus === 'complete' && right.sourceParseStatus === 'complete';
  const returnedSources = complete
    ? sourceDelta(
        left.sources.map((source) => source.canonicalUrl),
        right.sources.map((source) => source.canonicalUrl),
      )
    : unavailable('source_extraction_incomplete');
  const citedSources = !complete
    ? unavailable('source_extraction_incomplete')
    : left.citationStatus !== 'verified' || right.citationStatus !== 'verified'
      ? unavailable('citation_linkage_unavailable')
      : sourceDelta(citedUrls(left), citedUrls(right));
  const sourcesChanged = [returnedSources, citedSources].some(
    (delta) => delta.added.length + delta.removed.length > 0,
  );
  const changed = brand.change !== null || competitors.length > 0 || sourcesChanged;
  return {
    eligible: true,
    reason: null,
    brand,
    competitors,
    returnedSources,
    citedSources,
    changed,
    summary: brand.change
      ? `Brand match ${brand.change}`
      : competitors.length > 0
        ? 'Competitor matches changed'
        : sourcesChanged
          ? 'Sources changed'
          : !returnedSources.available || !citedSources.available
            ? 'No mention changes; source comparison unavailable'
            : 'No tracked changes',
  };
}
