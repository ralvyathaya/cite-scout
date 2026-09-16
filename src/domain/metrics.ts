export interface MetricObservation {
  success: boolean;
  brandPosition: number | null;
  mentionedEntities: readonly string[];
}
export interface VisibilityMetrics {
  mentionRate: number | null;
  shareOfVoice: number | null;
  averageMentionPosition: number | null;
  averagePositionQuality: number | null;
  visibilityScore: number | null;
  coverage: number | null;
}

export function calculateMetrics(
  observations: readonly MetricObservation[],
  brandKey: string,
): VisibilityMetrics {
  const successful = observations.filter((item) => item.success);
  if (observations.length === 0)
    return {
      mentionRate: null,
      shareOfVoice: null,
      averageMentionPosition: null,
      averagePositionQuality: null,
      visibilityScore: null,
      coverage: null,
    };
  const coverage = successful.length / observations.length;
  if (successful.length === 0)
    return {
      mentionRate: null,
      shareOfVoice: null,
      averageMentionPosition: null,
      averagePositionQuality: null,
      visibilityScore: null,
      coverage,
    };
  const positions = successful.flatMap((item) =>
    item.brandPosition === null ? [] : [item.brandPosition],
  );
  const mentionRate = positions.length / successful.length;
  const allMentions = successful.reduce(
    (sum, item) => sum + new Set(item.mentionedEntities).size,
    0,
  );
  const brandMentions = successful.filter((item) =>
    new Set(item.mentionedEntities).has(brandKey),
  ).length;
  const shareOfVoice = allMentions === 0 ? null : brandMentions / allMentions;
  const averageMentionPosition =
    positions.length === 0
      ? null
      : positions.reduce((sum, position) => sum + position, 0) / positions.length;
  const averagePositionQuality =
    successful.reduce(
      (sum, item) => sum + (item.brandPosition === null ? 0 : 1 / item.brandPosition),
      0,
    ) / successful.length;
  return {
    mentionRate,
    shareOfVoice,
    averageMentionPosition,
    averagePositionQuality,
    visibilityScore: 100 * (0.7 * mentionRate + 0.3 * averagePositionQuality),
    coverage,
  };
}

export function metricDelta(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : current - previous;
}
