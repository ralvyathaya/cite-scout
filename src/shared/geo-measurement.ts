import { z } from 'zod';
import type { GeoCapture, GeoRequestContext } from './geo';
import type { GeoClassification } from './geo-analysis';
export const geoMeasurementVersion = 'geo-measurement-1';
export const geoMetrics = [
  'mention',
  'recommendation',
  'owned_answer_reference',
  'owned_inline_reference',
  'overview_occurrence',
] as const;
export type GeoMetric = (typeof geoMetrics)[number];
export interface GeoMetricObservation {
  id: string;
  projectId: string;
  capturedAt: string;
  requestedAt: string;
  context: GeoRequestContext;
  capture: Pick<
    GeoCapture,
    'model' | 'modelReported' | 'quality' | 'sources' | 'inlineReferencesAvailable'
  >;
  analysis:
    | (Pick<
        GeoClassification,
        | 'model'
        | 'rubricVersion'
        | 'policyVersion'
        | 'answerQuality'
        | 'scope'
        | 'brandPresence'
        | 'brandStance'
      > & { id: string })
    | null;
}
export interface GeoDailySample {
  series: string;
  cohort: string;
  metric: GeoMetric;
  day: string;
  value: 0 | 1;
  observationId: string;
  analysisId: string | null;
  capturedAt: string;
}
export type GeoOutcome = 'improved' | 'unchanged' | 'worsened' | 'inconclusive';
export interface GeoMetricComparison {
  metric: GeoMetric;
  outcome: GeoOutcome;
  before: number | null;
  after: number | null;
  beforeSamples: number;
  afterSamples: number;
  limitedData: boolean;
  scopeComplete: boolean;
  observationIds: string[];
}
export interface GeoPinMeasurement {
  eventId: string;
  actionId: string;
  recordedAt: string;
  implementedAt: string;
  changeDescription: string;
  changeUrl: string | null;
  version: typeof geoMeasurementVersion;
  beforeWindow: { from: string; to: string };
  afterWindow: { from: string; to: string };
  windowComplete: boolean;
  metrics: GeoMetricComparison[];
  limitations: string[];
}
export const geoCompletionSchema = z
  .object({
    requestId: z.uuid(),
    revision: z.number().int().positive(),
    implementedAt: z.iso.datetime(),
    changeDescription: z.string().trim().min(5).max(2000),
    changeUrl: z
      .url()
      .max(2000)
      .refine((url) => {
        const parsed = new URL(url);
        return (
          ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
        );
      })
      .optional(),
  })
  .strict();
export type GeoCompletion = z.infer<typeof geoCompletionSchema>;
export const geoReopenSchema = z
  .object({
    requestId: z.uuid(),
    revision: z.number().int().positive(),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export type GeoReopen = z.infer<typeof geoReopenSchema>;
