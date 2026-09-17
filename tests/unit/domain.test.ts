import { describe, expect, it } from 'vitest';
import { getEntitlement } from '../../src/domain/entitlements';
import { analyzeMentions } from '../../src/domain/mentions';
import { normalizeDomain, normalizeText, utcDate } from '../../src/domain/normalization';

const brand = { key: 'brand', name: 'OrbitCal', domain: 'orbitcal.test' };

describe('normalization edge cases', () => {
  it('collapses punctuation, symbols and whitespace deterministically', () => {
    expect(normalizeText('  Orbit—Cal!!  ')).toBe('orbit cal');
    expect(normalizeText('A.B,C')).toBe('a b c');
    expect(normalizeText('')).toBe('');
  });

  it('normalizes Unicode rather than throwing on it', () => {
    expect(() => normalizeText('Café ☕ 日本語')).not.toThrow();
    expect(normalizeText('Café')).toBe('café');
  });

  it('strips schemes, www and trailing slashes from domains', () => {
    expect(normalizeDomain('https://www.Example.com/path/')).toBe('example.com');
    expect(normalizeDomain('EXAMPLE.com')).toBe('example.com');
    expect(normalizeDomain('http://sub.example.com./')).toBe('sub.example.com');
  });

  it('rejects nonsense domains instead of inventing one', () => {
    expect(() => normalizeDomain('')).toThrow();
    expect(() => normalizeDomain('not a domain')).toThrow();
    expect(() => normalizeDomain('localhost')).toThrow();
  });

  it('derives the UTC date, not the local date', () => {
    expect(utcDate(new Date('2026-09-16T00:00:00Z'))).toBe('2026-09-16');
    expect(utcDate(new Date('2026-09-16T23:59:59Z'))).toBe('2026-09-16');
    expect(utcDate(new Date('2026-09-17T00:00:01Z'))).toBe('2026-09-17');
  });
});

describe('mention detection boundaries', () => {
  it('never matches a short competitor name inside a longer word', () => {
    const result = analyzeMentions('Use a calendar to schedule the call.', brand, [
      { key: 'cal', name: 'Cal' },
    ]);
    expect(result.competitorKeys).toEqual([]);
    expect(result.classification).toBe('absent');
  });

  it('matches a short name when it stands as its own token', () => {
    const result = analyzeMentions('Options include Cal and others.', brand, [
      { key: 'cal', name: 'Cal' },
    ]);
    expect(result.competitorKeys).toEqual(['cal']);
  });

  it('does not credit the brand for an unrelated substring', () => {
    const result = analyzeMentions('Orbital mechanics are unrelated to this question.', brand, []);
    expect(result.brandMentioned).toBe(false);
    expect(result.classification).toBe('absent');
  });

  it('records the relative first-mention order across tracked entities', () => {
    const result = analyzeMentions(
      'SavvyCal is polished. Cal.com is flexible. OrbitCal is a strong choice.',
      brand,
      [
        { key: 'cal', name: 'Cal.com' },
        { key: 'savvy', name: 'SavvyCal' },
      ],
    );
    expect(result.entityOrder).toEqual(['savvy', 'cal', 'brand']);
    expect(result.brandPosition).toBe(3);
  });

  it('classifies conservatively and defaults to mentioned, not recommended', () => {
    expect(analyzeMentions('OrbitCal exists.', brand, []).classification).toBe('mentioned');
    expect(
      analyzeMentions('OrbitCal is the best option for consultants.', brand, []).classification,
    ).toBe('recommended');
    expect(analyzeMentions('Avoid OrbitCal for enterprise teams.', brand, []).classification).toBe(
      'negative',
    );
  });

  it('returns unknown when there is no answer text to analyse', () => {
    expect(analyzeMentions('   ', brand, []).classification).toBe('unknown');
  });
});

describe('entitlement decisions', () => {
  const now = new Date('2026-09-16T12:00:00Z');

  it('grants full access only to active or in-grace subscriptions', () => {
    expect(getEntitlement({ status: 'active', endsAt: null }, now).canScan).toBe(true);
    expect(
      getEntitlement({ status: 'cancelled', endsAt: new Date('2026-09-20T00:00:00Z') }, now)
        .canScan,
    ).toBe(true);
  });

  it('removes scanning for every lapsed or risky state but keeps history flag', () => {
    for (const status of ['paused', 'past_due', 'unpaid', 'expired'] as const) {
      const result = getEntitlement({ status, endsAt: null }, now);
      expect(result.canScan).toBe(false);
      expect(result.hasPaidFeatures).toBe(true);
    }
  });

  it('treats a cancelled subscription past its end date as expired access', () => {
    expect(
      getEntitlement({ status: 'cancelled', endsAt: new Date('2026-09-10T00:00:00Z') }, now)
        .canScan,
    ).toBe(false);
  });

  it('never intentionally enables provider trials', () => {
    expect(getEntitlement({ status: 'on_trial', endsAt: null }, now).canScan).toBe(false);
    expect(getEntitlement({ status: 'on_trial', endsAt: null }, now, true).canScan).toBe(true);
  });

  it('gives no scanning entitlement to an account with no subscription', () => {
    expect(getEntitlement(null, now).canScan).toBe(false);
    expect(getEntitlement(null, now).hasPaidFeatures).toBe(false);
  });
});
