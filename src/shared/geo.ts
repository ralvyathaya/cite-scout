import { z } from 'zod';

export const geoEngineSchema = z.enum([
  'perplexity',
  'google_aio',
  'chatgpt_search',
  'bing_copilot',
]);
export type GeoEngine = z.infer<typeof geoEngineSchema>;
export const geoSurfaces = {
  perplexity: {
    label: 'Perplexity',
    surface: 'perplexity_agent',
    collector: 'perplexity_api',
    reportsModel: true,
  },
  google_aio: {
    label: 'Google AI Overview',
    surface: 'google_ai_overview',
    collector: 'dataforseo_standard',
    reportsModel: false,
  },
  chatgpt_search: {
    label: 'ChatGPT Search',
    surface: 'chatgpt_search',
    collector: 'dataforseo_standard',
    reportsModel: true,
  },
  bing_copilot: {
    label: 'Bing Copilot Answers',
    surface: 'bing_copilot_answers',
    collector: 'dataforseo_standard',
    reportsModel: false,
  },
} as const;

const unique = (items: unknown[]) => new Set(items).size === items.length;
export const geoRunRequestSchema = z.object({
  requestId: z.uuid(),
  promptIds: z.array(z.string().min(1).max(100)).min(1).max(10).refine(unique).optional(),
  engines: z.array(geoEngineSchema).min(1).max(4).refine(unique).optional(),
});
export type GeoRunRequest = z.infer<typeof geoRunRequestSchema>;

export const geoSettingsSchema = z.object({
  engines: z.array(geoEngineSchema).min(1).max(4).refine(unique),
  dailyEnabled: z.boolean(),
  languageCode: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  locationCode: z.number().int().positive(),
  device: z.enum(['desktop', 'mobile']),
});
export type GeoSettingsInput = z.infer<typeof geoSettingsSchema>;
export interface GeoSettings extends GeoSettingsInput {
  projectId: string;
  revision: number;
  configured: boolean;
}

export const geoPromptSetSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(100),
  promptIds: z.array(z.string().min(1).max(100)).min(1).max(10).refine(unique),
});
export type GeoPromptSetInput = z.infer<typeof geoPromptSetSchema>;
export interface GeoPromptSet {
  id: string;
  name: string;
  promptIds: string[];
  updatedAt: string;
}

export interface GeoRequestContext {
  schemaVersion: 'geo-context-1';
  projectId: string;
  contextVersion: number;
  settingsRevision: number;
  promptId: string;
  promptVersionId: string;
  promptText: string;
  engine: GeoEngine;
  surface: (typeof geoSurfaces)[GeoEngine]['surface'];
  collector: (typeof geoSurfaces)[GeoEngine]['collector'];
  collectorVersion: 'geo-collector-1';
  languageCode: string;
  locationCode: number;
  device: 'desktop' | 'mobile';
  forceWebSearch: boolean;
  brand: { id: string; name: string; domain: string | null };
  competitors: { id: string; name: string; domain: string | null }[];
  instructionVersion: 'neutral-research-1';
  maxOutputTokens: number;
}

export interface GeoSource {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string | null;
  referenceLevel: 'retrieved' | 'answer' | 'element' | 'inline_verified';
  spans?: { start: number; end: number }[];
}

export interface GeoCapture {
  schemaVersion: 'geo-capture-1';
  answerText: string;
  raw: unknown;
  model: string | null;
  modelReported: boolean;
  sources: GeoSource[];
  quality: 'complete' | 'partial' | 'no_feature';
  providerRequestId: string | null;
  providerStatus: string | null;
  reportedCost: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  textParts: { itemIndex: number; contentIndex: number; text: string }[];
}

export type GeoItemStatus =
  | 'pending'
  | 'submitting'
  | 'submitted'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'submission_uncertain';
export interface GeoRunItem {
  id: string;
  runId: string;
  promptId: string;
  engine: GeoEngine;
  status: GeoItemStatus;
  context: GeoRequestContext;
  reservationId: string;
  providerTaskId: string | null;
  attemptsUsed: number;
  dueAt: string;
  terminalReason: string | null;
}
export interface GeoRun {
  id: string;
  trigger: 'manual' | 'scheduled';
  status: string;
  createdAt: string;
  completedAt: string | null;
  items: GeoRunItem[];
}
export interface GeoObservation {
  id: string;
  projectId: string;
  runId: string;
  itemId: string;
  promptVersionId: string;
  engine: GeoEngine;
  capturedAt: string;
  context: GeoRequestContext;
  capture: GeoCapture;
}
export interface GeoObservationPage {
  observations: GeoObservation[];
  nextCursor: string | null;
}
export interface GeoAllowance {
  enabled: boolean;
  reason: string | null;
  today: number;
  month: number;
  globalToday: number;
  limits: { projectDaily: number; projectMonthly: number; globalDaily: number };
  cooldownSeconds: 300;
}

export async function geoHash(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export const geoPayloadHash = (input: GeoRunRequest) =>
  geoHash({
    promptIds: input.promptIds ? [...input.promptIds].sort() : null,
    engines: input.engines ? [...input.engines].sort() : null,
  });
