import { classifyMentionContext, type ContextClassification } from './mentions';

export type ObservationStatus = 'recommended' | 'mentioned' | 'displaced' | 'absent' | 'unknown';
export interface ObservationEvidence {
  id: string;
  rawResponseText: string | null;
  errorCode: string | null;
  brandMentioned: boolean;
  brandPosition: number | null;
  competitorMentionsJson: string;
  matchedTermsJson: string;
}
export interface ObservationInsight {
  status: ObservationStatus;
  context: ContextClassification;
  displacedCompetitors: { id: string; name: string }[];
  explanation: string | null;
}

export function stringArray(json: string | null): string[] {
  try {
    const value: unknown = JSON.parse(json ?? '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function successfulObservation(row: {
  errorCode: string | null;
  rawResponseText: string | null;
}): boolean {
  return row.errorCode === null && Boolean(row.rawResponseText?.trim());
}

export function observationInsight(
  row: ObservationEvidence,
  names: ReadonlyMap<string, string>,
): ObservationInsight {
  if (!successfulObservation(row))
    return { status: 'unknown', context: 'unknown', displacedCompetitors: [], explanation: null };
  const competitors = stringArray(row.competitorMentionsJson);
  const terms = stringArray(row.matchedTermsJson);
  const position = row.brandPosition;
  const validOrder =
    position !== null &&
    Number.isInteger(position) &&
    position >= 1 &&
    position <= competitors.length + 1;
  const term =
    validOrder && terms.length === competitors.length + 1 ? terms[position - 1] : undefined;
  const context = row.brandMentioned
    ? term
      ? classifyMentionContext(
          row.rawResponseText ?? '',
          term,
          terms.filter((_, i) => i !== (position ?? 1) - 1),
        )
      : 'mentioned'
    : 'absent';
  const ahead = row.brandMentioned
    ? validOrder
      ? competitors.slice(0, position - 1)
      : []
    : competitors;
  const displacedCompetitors = [...new Set(ahead)].map((id) => ({
    id,
    name: names.get(id) ?? 'Unknown competitor',
  }));
  const subject = displacedCompetitors.map((item) => item.name).join(', ');
  return {
    status:
      displacedCompetitors.length > 0
        ? 'displaced'
        : context === 'negative'
          ? 'mentioned'
          : context,
    context,
    displacedCompetitors,
    explanation: subject
      ? `${subject} appeared${row.brandMentioned ? ' before your brand in this answer.' : '; your brand was absent.'}`
      : null,
  };
}

export interface ReturnedSource {
  id: number;
  url: string;
  title: string | null;
}
export function returnedSources(json: string | null): ReturnedSource[] {
  try {
    const value: unknown = JSON.parse(json ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object' || !('url' in item) || typeof item.url !== 'string')
        return [];
      try {
        const url = new URL(item.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
        return [
          {
            id: 'id' in item && typeof item.id === 'number' ? item.id : 0,
            url: url.href,
            title: 'title' in item && typeof item.title === 'string' ? item.title : null,
          },
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export function sourceGuidance(domain: string): string {
  const is = (host: string) => domain === host || domain.endsWith(`.${host}`);
  if (is('reddit.com'))
    return 'Read the relevant discussion and contribute useful, transparent expertise where it answers the question.';
  if (is('g2.com'))
    return 'Keep your product profile accurate and invite customers to share genuine reviews.';
  if (is('wikipedia.org'))
    return 'Assess independent coverage and editorial eligibility; use appropriate disclosure and editorial channels.';
  if (is('techcrunch.com'))
    return 'Review relevant editorial coverage and identify a credible, newsworthy story for your category.';
  return 'Review this source for missing or outdated information about your category and identify a useful, factual contribution.';
}

export interface CitationOpportunity {
  domain: string;
  count: number;
  sourceUrl: string;
  action: string;
  observations: { id: string; prompt: string; date: string }[];
}
export function citationOpportunities(
  rows: readonly (ObservationEvidence & {
    citationDataJson: string | null;
    promptText: string;
    observationDate: string;
  })[],
  names: ReadonlyMap<string, string>,
): CitationOpportunity[] {
  const domains = new Map<string, CitationOpportunity>();
  for (const row of rows) {
    if (observationInsight(row, names).status !== 'displaced') continue;
    const seen = new Set<string>();
    for (const source of returnedSources(row.citationDataJson)) {
      const domain = new URL(source.url).hostname.toLowerCase().replace(/^www\./u, '');
      if (seen.has(domain)) continue;
      seen.add(domain);
      const item = domains.get(domain) ?? {
        domain,
        count: 0,
        sourceUrl: source.url,
        action: sourceGuidance(domain),
        observations: [],
      };
      item.count += 1;
      item.observations.push({ id: row.id, prompt: row.promptText, date: row.observationDate });
      domains.set(domain, item);
    }
  }
  return [...domains.values()]
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, 5);
}
