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

/** Conservative context for one historical matched term, without borrowing another brand's praise. */
export function classifyMentionContext(
  answer: string,
  brandTerm: string,
  otherTerms: readonly string[] = [],
): ContextClassification {
  const matches = (clause: string, term: string) =>
    firstMatch(normalizeText(clause), { key: 'term', name: term }) !== null;
  // ponytail: deterministic clause heuristic; expand against labeled examples, never infer rankings.
  // Keep dots inside domains; split sentences and contrastive clauses before normalization.
  const clause = answer
    .split(/(?<=[.!?])\s+|[;\n]|,?\s+(?:while|whereas|but)\s+/iu)
    .find((part) => matches(part, brandTerm));
  if (!clause || otherTerms.some((term) => matches(clause, term))) return 'mentioned';
  const text = normalizeText(clause);
  if (
    /\b(?:not|never|isnt|isn t|dont|don t|cannot|can t|avoid(?:ing)?|against|poor|weak|drawback|problem)\b/u.test(
      text,
    )
  )
    return 'negative';
  return /\b(?:recommend|recommended|best|strong choice|top pick|ideal|excellent)\b/u.test(text)
    ? 'recommended'
    : 'mentioned';
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
    classification = classifyMentionContext(
      answer,
      brandMatch.term,
      found.filter((item) => item.entity.key !== brand.key).map((item) => item.term),
    );
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
