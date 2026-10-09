export interface RequestContext {
  schemaVersion: number;
  questionId: string;
  text: string;
  contextVersion: number;
  brand: { id: string; name: string; domain: string | null };
  competitors: { id: string; name: string; domain: string | null }[];
  provider: 'perplexity';
  preset: 'fast';
  instruction: string;
  instructionVersion: string;
  maxOutputTokens: number;
  matcherVersion: string;
  extractorVersion: string;
  citationParserVersion: string;
}

export interface SourceRecord {
  key: string;
  itemIndex: number;
  resultIndex: number;
  id: number | null;
  url: string;
  canonicalUrl: string;
  hostname: string;
  title: string | null;
  snippet: string | null;
}

export interface CitationLink {
  itemIndex: number;
  contentIndex: number;
  /** UTF-16 offsets within the unchanged output_text value, end exclusive. */
  start: number;
  end: number;
  marker: string;
  sourceId: number | null;
  sourceKeys: string[];
  status: 'verified' | 'unresolved';
  reason: 'missing_source' | 'conflicting_id' | 'unsupported_marker' | null;
}

export interface EntityMatch {
  id: string;
  kind: 'brand' | 'competitor';
  name: string;
  domain: string | null;
  matched: boolean;
  matchedTerms: string[];
}

export interface EvidenceCapture {
  responseId: string;
  model: string;
  providerStatus: string;
  raw: unknown;
  textParts: { itemIndex: number; contentIndex: number; text: string }[];
  /** Display derivative only; textParts and raw preserve original boundaries. */
  text: string;
  sources: SourceRecord[];
  links: CitationLink[];
  sourceParseStatus: 'complete' | 'partial';
  citationStatus: 'verified' | 'unverified' | 'unresolved';
  entities: EntityMatch[];
  inputTokens: number | null;
  outputTokens: number | null;
  reportedCost: number | null;
}

export class CaptureError extends Error {
  constructor(
    readonly code: string,
    readonly providerStatus: string | null = null,
    readonly raw: unknown = null,
    readonly diagnostic: { prefix: string; truncated: boolean } | null = null,
  ) {
    super(code);
    this.name = 'CaptureError';
  }
}

export interface ComparableObservation {
  id: string;
  evidenceVersion: string;
  context: RequestContext | null;
  capture: EvidenceCapture;
}

export interface SourceDelta {
  available: boolean;
  reason: string | null;
  added: string[];
  removed: string[];
}

export interface EvidenceDelta {
  eligible: boolean;
  reason: string | null;
  brand: { before: boolean; after: boolean; change: 'appeared' | 'disappeared' | null } | null;
  competitors: { id: string; name: string; change: 'appeared' | 'disappeared' }[];
  returnedSources: SourceDelta;
  citedSources: SourceDelta;
  changed: boolean;
  summary: string;
}
