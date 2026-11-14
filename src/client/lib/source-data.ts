import type { GeoEngine } from '../../shared/geo';
import type { GeoSourceOpportunity } from '../../shared/geo-actions';

export function sourceHost(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return (
      url.hostname
        .toLowerCase()
        .replace(/^www\./u, '')
        .replace(/\.$/u, '') || null
    );
  } catch {
    return null;
  }
}

export const ownershipLabels = {
  owned: 'Your website',
  competitor_owned: 'Competitor',
  third_party: 'Third party',
  unknown: 'Unclear',
  mixed: 'Mixed',
};

export interface SourceDomain {
  domain: string;
  role: keyof typeof ownershipLabels;
  pages: GeoSourceOpportunity[];
  observationIds: Set<string>;
  engines: Set<GeoEngine>;
}

export function sourceDomains(pages: GeoSourceOpportunity[]) {
  const domains = new Map<string, SourceDomain>();
  for (const page of pages) {
    const host = sourceHost(page.url) ?? page.domain;
    let domain = domains.get(host);
    if (!domain) {
      domain = {
        domain: host,
        role: page.role,
        pages: [],
        observationIds: new Set(),
        engines: new Set(),
      };
      domains.set(host, domain);
    }
    if (domain.role !== page.role) domain.role = 'mixed';
    domain.pages.push(page);
    page.observationIds.forEach((id) => domain.observationIds.add(id));
    page.engines.forEach((engine) => domain.engines.add(engine));
  }
  return Array.from(domains.values());
}
