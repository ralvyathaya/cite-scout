import { describe, expect, it } from 'vitest';
import { getEntitlement } from '../../src/domain/entitlements';
import { calculateMetrics, metricDelta } from '../../src/domain/metrics';

describe('visibility metric formulas', () => {
  it('uses successful prompts only as the denominator', () => {
    const result = calculateMetrics(
      [
        { success: true, brandPosition: 1, mentionedEntities: ['brand'] },
        { success: true, brandPosition: null, mentionedEntities: [] },
        { success: false, brandPosition: null, mentionedEntities: [] },
      ],
      'brand',
    );
    expect(result.mentionRate).toBe(0.5);
    expect(result.coverage).toBeCloseTo(2 / 3, 10);
  });

  it('counts each tracked entity at most once per response for share of voice', () => {
    const result = calculateMetrics(
      [{ success: true, brandPosition: 1, mentionedEntities: ['brand', 'a', 'a', 'a'] }],
      'brand',
    );
    // brand + a = 2 tracked mentions, brand share = 1/2
    expect(result.shareOfVoice).toBe(0.5);
  });

  it('averages first-mention position only across responses where the brand appeared', () => {
    const result = calculateMetrics(
      [
        { success: true, brandPosition: 2, mentionedEntities: ['brand'] },
        { success: true, brandPosition: 4, mentionedEntities: ['brand'] },
        { success: true, brandPosition: null, mentionedEntities: [] },
      ],
      'brand',
    );
    expect(result.averageMentionPosition).toBe(3);
  });

  it('applies the documented 0.7/0.3 weighting for the visibility score', () => {
    const result = calculateMetrics(
      [
        { success: true, brandPosition: 2, mentionedEntities: ['brand'] },
        { success: true, brandPosition: null, mentionedEntities: [] },
      ],
      'brand',
    );
    // mentionRate 0.5, avg position quality = (0.5 + 0) / 2 = 0.25
    expect(result.visibilityScore).toBeCloseTo(100 * (0.7 * 0.5 + 0.3 * 0.25), 10);
  });

  it('gives an absent brand zero position quality', () => {
    const result = calculateMetrics(
      [{ success: true, brandPosition: null, mentionedEntities: [] }],
      'brand',
    );
    expect(result.averagePositionQuality).toBe(0);
    expect(result.visibilityScore).toBe(0);
  });

  it('returns explicit nulls rather than misleading percentages without data', () => {
    const empty = calculateMetrics([], 'brand');
    expect(empty).toEqual({
      mentionRate: null,
      shareOfVoice: null,
      averageMentionPosition: null,
      averagePositionQuality: null,
      visibilityScore: null,
      coverage: null,
    });

    const allFailed = calculateMetrics(
      [{ success: false, brandPosition: null, mentionedEntities: [] }],
      'brand',
    );
    expect(allFailed.mentionRate).toBeNull();
    expect(allFailed.visibilityScore).toBeNull();
    expect(allFailed.coverage).toBe(0);
  });

  it('reports share of voice as null when nothing tracked was ever mentioned', () => {
    const result = calculateMetrics(
      [{ success: true, brandPosition: null, mentionedEntities: [] }],
      'brand',
    );
    expect(result.shareOfVoice).toBeNull();
  });

  it('only reports a delta when both comparable values exist', () => {
    expect(metricDelta(84.2, 76.5)).toBeCloseTo(7.7, 10);
    expect(metricDelta(null, 76.5)).toBeNull();
    expect(metricDelta(84.2, null)).toBeNull();
    expect(metricDelta(null, null)).toBeNull();
  });
});

describe('entitlement grace-period boundary', () => {
  it('keeps access up to and not beyond ends_at', () => {
    const endsAt = new Date('2026-09-16T12:00:00Z');
    expect(
      getEntitlement({ status: 'cancelled', endsAt }, new Date('2026-09-16T11:59:59Z')).canScan,
    ).toBe(true);
    expect(
      getEntitlement({ status: 'cancelled', endsAt }, new Date('2026-09-16T12:00:01Z')).canScan,
    ).toBe(false);
  });

  it('never treats a cancelled subscription without ends_at as still active', () => {
    expect(getEntitlement({ status: 'cancelled', endsAt: null }, new Date()).canScan).toBe(false);
  });
});
