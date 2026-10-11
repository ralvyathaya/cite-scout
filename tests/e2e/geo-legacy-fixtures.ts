// Legacy browser fixtures explicitly describe an unconfigured GEO rollout.
export function legacyGeoFixture(path: string, projectId: string): unknown {
  if (path.endsWith('/settings'))
    return {
      projectId,
      configured: false,
      revision: 1,
      engines: ['perplexity'],
      dailyEnabled: false,
      languageCode: 'en',
      locationCode: 2840,
      device: 'desktop',
    };
  if (path.endsWith('/observations')) return { observations: [], nextCursor: null };
  if (path.endsWith('/capabilities'))
    return {
      engines: Object.fromEntries(
        ['perplexity', 'google_aio', 'chatgpt_search', 'bing_copilot'].map((engine) => [
          engine,
          { available: false, reason: 'GEO monitoring is paused in this legacy workspace.' },
        ]),
      ),
      classifier: {
        available: false,
        model: 'clef-flash',
        reason: 'Classification unavailable.',
        needsReview: true,
      },
      pageChecks: { available: false, reason: 'Page checks unavailable.' },
    };
  if (path.endsWith('/usage'))
    return {
      collectors: { today: 0, month: 0, reportedCostUsd: 0, unknownCostAttempts: 0, attempts: 0 },
      processing: { today: 0, estimatedCostUsd: 0, unknownCostAttempts: 0, attempts: 0 },
      limits: { collectorDaily: 0, collectorMonthly: 0, processingDaily: 0 },
      classifierModel: 'clef-flash',
    };
  if (path.endsWith('/allowance'))
    return {
      enabled: false,
      reason: 'GEO_SCANS_DISABLED',
      today: 0,
      month: 0,
      globalToday: 0,
      limits: { projectDaily: 0, projectMonthly: 0, globalDaily: 0 },
      cooldownSeconds: 300,
    };
  if (path.endsWith('/trends'))
    return {
      version: 'geo-measurement-1',
      samples: [],
      captures: 0,
      classifiedCaptures: 0,
      method: 'No GEO captures in this legacy workspace.',
    };
  return [];
}
