import { normalizeDomain, normalizeText } from './normalization';

export type ContextClassification = 'recommended' | 'mentioned' | 'negative' | 'absent' | 'unknown';
export interface TrackedEntity {
  key: string;
  name: string;
  domain?: string | null;
  aliases?: readonly string[];
}
export interface MentionAnalysis {
  brandMentioned: boolean;
  brandPosition: number | null;
  competitorKeys: string[];
  entityOrder: string[];
  classification: ContextClassification;
  matchedTerms: string[];
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function firstMatch(text: string, entity: TrackedEntity): { index: number; term: string } | null {
  const candidates = [
    entity.name,
    entity.domain ? normalizeDomain(entity.domain) : '',
    ...(entity.aliases ?? []),
  ].filter(Boolean);
  let first: { index: number; term: string } | null = null;
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    const pattern = new RegExp(`(?:^|\\s)${escaped(normalized)}(?:$|\\s)`, 'u');
    const match = pattern.exec(text);
    if (match && (first === null || match.index < first.index))
      first = { index: match.index, term: candidate };
  }
  return first;
}

export function analyzeMentions(
  answer: string,
  brand: TrackedEntity,
  competitors: readonly TrackedEntity[],
): MentionAnalysis {
  if (!answer.trim())
    return {
      brandMentioned: false,
      brandPosition: null,
      competitorKeys: [],
      entityOrder: [],
      classification: 'unknown',
      matchedTerms: [],
    };
  const text = normalizeText(answer.replace(/https?:\/\/(?:www\.)?/giu, ' '));
  const found = [brand, ...competitors]
    .flatMap((entity) => {
      const match = firstMatch(text, entity);
      return match ? [{ entity, ...match }] : [];
    })
    .sort((a, b) => a.index - b.index);
  const brandMatch = found.find((item) => item.entity.key === brand.key);
  const brandPosition = brandMatch
    ? found.findIndex((item) => item.entity.key === brand.key) + 1
    : null;
  let classification: ContextClassification = brandMatch ? 'mentioned' : 'absent';
  if (brandMatch) {
    const around = text.slice(
      Math.max(0, brandMatch.index - 70),
      brandMatch.index + normalizeText(brandMatch.term).length + 90,
    );
    if (/\b(avoid|poor|weak|not recommended|drawback|problem)\b/u.test(around))
      classification = 'negative';
    else if (/\b(recommend|best|strong choice|top pick|ideal|excellent)\b/u.test(around))
      classification = 'recommended';
  }
  return {
    brandMentioned: Boolean(brandMatch),
    brandPosition,
    competitorKeys: found
      .filter((item) => item.entity.key !== brand.key)
      .map((item) => item.entity.key),
    entityOrder: found.map((item) => item.entity.key),
    classification,
    matchedTerms: found.map((item) => item.term),
  };
}
