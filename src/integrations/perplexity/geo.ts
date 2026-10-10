import type { RequestContext } from '../../shared/evidence';
import type { GeoCapture, GeoRequestContext } from '../../shared/geo';
import { captureEvidence } from './evidence';
import { neutralResearchInstruction } from './provider';

export function legacyRequestContext(context: GeoRequestContext): RequestContext {
  return {
    schemaVersion: 1,
    questionId: context.promptId,
    text: context.promptText,
    contextVersion: context.contextVersion,
    brand: context.brand,
    competitors: context.competitors,
    provider: 'perplexity',
    preset: 'fast',
    instruction: neutralResearchInstruction,
    instructionVersion: context.instructionVersion,
    maxOutputTokens: context.maxOutputTokens,
    matcherVersion: 'mentions-v1',
    extractorVersion: 'answer-parts-1',
    citationParserVersion: 'fast-numeric-1',
  };
}

export async function capturePerplexityGeo(
  apiKey: string,
  context: GeoRequestContext,
  fetcher: typeof fetch = fetch,
): Promise<GeoCapture> {
  const capture = await captureEvidence(apiKey, legacyRequestContext(context), fetcher);
  const offsets = new Map<string, number>();
  let offset = 0;
  for (const part of capture.textParts) {
    offsets.set(`${String(part.itemIndex)}:${String(part.contentIndex)}`, offset);
    offset += part.text.length + 1;
  }
  return {
    schemaVersion: 'geo-capture-1',
    answerText: capture.text,
    raw: capture.raw,
    model: capture.model,
    modelReported: true,
    sources: capture.sources.map((source) => {
      const spans = capture.links
        .filter((link) => link.status === 'verified' && link.sourceKeys.includes(source.key))
        .map((link) => {
          const start = offsets.get(`${String(link.itemIndex)}:${String(link.contentIndex)}`) ?? 0;
          return { start: start + link.start, end: start + link.end };
        });
      return {
        id: source.key,
        url: source.url,
        canonicalUrl: source.canonicalUrl,
        title: source.title,
        referenceLevel: spans.length ? 'inline_verified' : 'retrieved',
        ...(spans.length ? { spans } : {}),
      };
    }),
    quality:
      capture.sourceParseStatus === 'partial' || capture.citationStatus === 'unresolved'
        ? 'partial'
        : 'complete',
    providerRequestId: capture.responseId,
    providerStatus: capture.providerStatus,
    reportedCost: capture.reportedCost,
    inputTokens: capture.inputTokens,
    outputTokens: capture.outputTokens,
    textParts: capture.textParts,
  };
}
