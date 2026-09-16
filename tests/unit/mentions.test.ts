import { describe, expect, it } from 'vitest';
import { analyzeMentions } from '../../src/domain/mentions';
import { normalizeDomain, normalizeText, utcDate } from '../../src/domain/normalization';

const brand = { key: 'orbitcal', name: 'OrbitCal', domain: 'https://www.orbitcal.test/' };
const competitors = [
  { key: 'cal', name: 'Cal.com', domain: 'cal.com' },
  { key: 'savvycal', name: 'SavvyCal' },
];

describe('normalization and mention detection', () => {
  it('normalizes unicode, punctuation, whitespace and canonical domains', () => {
    expect(normalizeText('  ORBIT—Cal!! ')).toBe('orbit cal');
    expect(normalizeDomain('https://WWW.Example.com/path/')).toBe('example.com');
    expect(utcDate(new Date('2026-09-16T23:59:00Z'))).toBe('2026-09-16');
  });
  it('avoids a short-name substring false positive', () => {
    expect(
      analyzeMentions('Use a calendar for the call.', brand, competitors).competitorKeys,
    ).not.toContain('cal');
  });
  it('orders entities and applies conservative recommendation context', () => {
    const result = analyzeMentions(
      'Calendly is common. OrbitCal is a strong choice, while SavvyCal is polished.',
      brand,
      [{ key: 'calendly', name: 'Calendly' }, ...competitors],
    );
    expect(result.brandPosition).toBe(2);
    expect(result.entityOrder).toEqual(['calendly', 'orbitcal', 'savvycal']);
    expect(result.classification).toBe('recommended');
  });
  it('detects domains without URL schemes', () => {
    expect(
      analyzeMentions('See https://www.orbitcal.test/ for details.', brand, competitors)
        .brandMentioned,
    ).toBe(true);
  });
});
