import { describe, expect, it } from 'vitest';
import { calculateMetrics, metricDelta } from '../../src/domain/metrics';

describe('visibility metrics', () => {
  it('uses successful prompts and counts each entity once', () => {
    const result = calculateMetrics(
      [
        { success: true, brandPosition: 2, mentionedEntities: ['brand', 'a', 'a'] },
        { success: true, brandPosition: null, mentionedEntities: ['a'] },
        { success: false, brandPosition: null, mentionedEntities: [] },
      ],
      'brand',
    );
    expect(result.mentionRate).toBe(0.5);
    expect(result.shareOfVoice).toBe(1 / 3);
    expect(result.averageMentionPosition).toBe(2);
    expect(result.averagePositionQuality).toBe(0.25);
    expect(result.visibilityScore).toBe(42.5);
    expect(result.coverage).toBe(2 / 3);
  });
  it('returns insufficient data rather than misleading percentages', () => {
    expect(calculateMetrics([], 'brand').mentionRate).toBeNull();
    expect(metricDelta(2, null)).toBeNull();
  });
});
