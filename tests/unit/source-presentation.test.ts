import { describe, expect, it } from 'vitest';
import { sourceDomains, sourceHost } from '../../src/client/lib/source-data';
import { answerQuery, answerReturnTo } from '../../src/client/lib/answer-navigation';
import type { GeoSourceOpportunity } from '../../src/shared/geo-actions';

function page(
  url: string,
  ids: string[],
  role: GeoSourceOpportunity['role'] = 'third_party',
): GeoSourceOpportunity {
  return {
    url,
    title: null,
    domain: new URL(url).hostname,
    role,
    observations: ids.length,
    denominator: 10,
    returnedResults: 0,
    answerReferences: ids.length,
    inlineReferences: 0,
    competitorCooccurrences: 0,
    competitorLinked: null,
    engines: ['perplexity'],
    observationIds: ids,
    period: { from: '2026-10-01', to: '2026-10-19' },
  };
}

describe('source domain totals', () => {
  it('deduplicates shared answers and engines, keeps subdomains separate and marks mixed ownership', () => {
    const domains = sourceDomains([
      page('https://www.example.com/a', ['a', 'b'], 'owned'),
      page('https://example.com/b', ['b', 'c'], 'competitor_owned'),
      page('https://docs.example.com/a', ['b']),
    ]);
    expect(domains).toHaveLength(2);
    expect(domains[0]?.domain).toBe('example.com');
    expect(domains[0]?.pages).toHaveLength(2);
    expect(domains[0]?.observationIds.size).toBe(3);
    expect(domains[0]?.engines.size).toBe(1);
    expect(domains[0]?.role).toBe('mixed');
    expect(domains[1]?.domain).toBe('docs.example.com');
  });
  it('accepts source hosts without trusting credentials or executable URL schemes', () => {
    expect(sourceHost('https://WWW.YouTube.com./watch?v=a')).toBe('youtube.com');
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hello',
      'https://youtube.com@evil.test/a',
      'bad url',
    ])
      expect(sourceHost(url)).toBeNull();
    expect(sourceHost('https://youtube.com.evil.test')).toBe('youtube.com.evil.test');
  });
});

describe('answer return navigation', () => {
  it('preserves internal source state and narrows evidence parameters', () => {
    expect(answerReturnTo({ returnTo: '/app/sources?view=domains&q=guide&page=2' })).toBe(
      '/app/sources?view=domains&q=guide&page=2',
    );
    expect(answerReturnTo({ returnTo: '/app/competitors?days=14&cursor=older&q=Rival' })).toBe(
      '/app/competitors?days=14&cursor=older&q=Rival',
    );
    expect(answerReturnTo({ returnTo: '/app/diagnoses?status=suspected&page=2' })).toBe(
      '/app/diagnoses?status=suspected&page=2',
    );
    expect(
      answerQuery(
        new URLSearchParams('days=14&engine=perplexity&promptId=p&cursor=c&q=guide&view=domains'),
      ),
    ).toBe('days=14&engine=perplexity&promptId=p&cursor=c');
    expect(answerQuery(new URLSearchParams('days=90&engine=claude'))).toBe('');
  });
  it('rejects external and unrelated return destinations', () => {
    for (const returnTo of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test/app/sources',
      '/app/settings',
      '/app/sources/elsewhere',
      '/app/observations/one',
    ])
      expect(answerReturnTo({ returnTo })).toBeNull();
    expect(answerReturnTo(null)).toBeNull();
  });
});
