import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { buildGeoEvaluation, projectGeoClassification } from '../src/domain/geo-classification';
import { diagnoseGeo } from '../src/domain/geo-diagnosis';
import { actionCandidates } from '../src/domain/geo-playbooks';
import {
  geoClassificationSchema,
  geoDiagnosisSchema,
  geoVersions,
  readGeoVersions,
  type GeoPageCheck,
  type GeoVersionSet,
} from '../src/shared/geo-analysis';
import { geoEngineSchema, type GeoObservation } from '../src/shared/geo';
import {
  isAssistedSourceField,
  readSourceReview,
  resolveSourceReview,
  type SourceReview,
} from './geo-source-review';

export interface EvaluationRecord {
  observation: GeoObservation;
  promptFamily: string;
  checks: GeoPageCheck[];
  criteria: { id: string; criterion: string; verifiedFact: string }[];
  classification: z.infer<typeof geoClassificationSchema>;
  diagnoses: z.infer<typeof geoDiagnosisSchema>[];
}
export interface EvaluationInput {
  dataset: 'real' | 'synthetic';
  expectedObservationIds: string[];
  records: EvaluationRecord[];
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
function similar(a: string, b: string, threshold: number) {
  const left = new Set(normalize(a).split(' ')),
    right = new Set(normalize(b).split(' '));
  return (
    [...left].filter((word) => right.has(word)).length / new Set([...left, ...right]).size >=
    threshold
  );
}
const issues = geoDiagnosisSchema.shape.type.options;
const templates = [
  ...geoDiagnosisSchema.shape.templateIds.element.options,
  'inspect_earned_source',
];
const abstentions = new Set(['unknown', 'unclear', 'ambiguous', 'unavailable', 'not_applicable']);
export const isEvaluationReviewField = (field: string) => field !== 'evidence.support';
function fieldOptions(
  row: EvaluationRecord,
  versions: GeoVersionSet,
  reviewScope?: 'g3_validation',
) {
  const fields: Record<string, readonly string[]> = {
    captureQuality: ['complete', 'partial', 'no_feature'],
    answerQuality: geoClassificationSchema.shape.answerQuality.options,
    brandPresence: geoClassificationSchema.shape.brandPresence.options,
    brandStance: geoClassificationSchema.shape.brandStance.options,
    evidenceSupport: geoClassificationSchema.shape.evidenceSupport.options,
  };
  for (const [id, question] of Object.entries(
    buildGeoEvaluation(row.observation, row.checks, row.criteria, versions).questions,
  )) {
    if (id.startsWith('fit_') && question.type === 'choice')
      fields[`fit.${id.slice(4)}`] = Object.keys(question.criteria);
    if (id.startsWith('evidence_') && question.type === 'noul')
      fields[`evidence.${id.slice(9)}`] = ['yes', 'no', 'unknown'];
  }
  for (const competitor of row.observation.context.competitors.slice(0, 5))
    fields[`competitor.${competitor.id}`] = geoClassificationSchema.shape.brandStance.options;
  for (const source of row.observation.capture.sources) {
    fields[`source.${source.id}.role`] =
      geoClassificationSchema.shape.sources.element.shape.role.options;
    fields[`source.${source.id}.type`] =
      geoClassificationSchema.shape.sources.element.shape.type.options;
  }
  for (const issue of issues)
    fields[`diagnosis.${issue}`] = ['none', ...geoDiagnosisSchema.shape.status.options];
  for (const template of templates) fields[`task.${template}`] = ['yes', 'no', 'unknown'];
  return reviewScope === 'g3_validation'
    ? Object.fromEntries(
        Object.entries(fields).filter(([field]) => !/^(source|evidence)\./u.test(field)),
      )
    : fields;
}
export function prepareEvaluation(
  input: EvaluationInput,
  method: GeoVersionSet = geoVersions,
  reviewScope?: 'g3_validation',
) {
  const versions = readGeoVersions(method);
  z.literal('g3_validation').optional().parse(reviewScope);
  if (reviewScope !== undefined && versions.policy !== 'geo-policy-2')
    throw new Error('Unsupported review scope or method');
  const ids = input.records.map((row) => row.observation.id),
    expected = input.expectedObservationIds;
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    new Set(expected).size !== expected.length ||
    hash([...ids].sort()) !== hash([...expected].sort())
  )
    throw new Error('Observation IDs must match the complete declared export exactly once');
  if (
    input.dataset === 'real' &&
    input.records.some((row) => {
      const raw = row.observation.capture.raw;
      return (
        (typeof raw === 'object' &&
          raw !== null &&
          ('synthetic' in raw ||
            'fixture' in raw ||
            ('dataOrigin' in raw && raw.dataOrigin === 'fixture'))) ||
        row.observation.capture.model?.startsWith('fixture')
      );
    })
  )
    throw new Error('Synthetic fixture observations cannot enter a real evaluation');
  const parents = ids.map((_, i) => i);
  const root = (i: number): number => {
    const parent = parents.at(i);
    if (parent === undefined) throw new Error('Unknown evaluation group');
    return parent === i ? i : root(parent);
  };
  for (let i = 0; i < input.records.length; i++)
    for (let j = 0; j < i; j++) {
      const a = input.records.at(i),
        b = input.records.at(j);
      if (!a || !b) throw new Error('Missing evaluation record');
      const samePrompt =
        a.promptFamily === b.promptFamily ||
        a.observation.context.promptId === b.observation.context.promptId ||
        similar(a.observation.context.promptText, b.observation.context.promptText, 0.8);
      const sameAnswer =
        normalize(a.observation.capture.answerText).split(' ').length >= 6 &&
        similar(a.observation.capture.answerText, b.observation.capture.answerText, 0.9);
      if (samePrompt || sameAnswer) parents[root(i)] = root(j);
    }
  const grouped = new Map<number, string[]>();
  ids.forEach((id, i) => grouped.set(root(i), [...(grouped.get(root(i)) ?? []), id]));
  const groups = [...grouped.values()]
    .map((members) => ({ id: hash([...members].sort()), members: [...members].sort() }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const heldOut = reviewScope ? groups.length : Math.max(1, Math.round(groups.length / 3));
  const assigned = groups.map((group, index) => ({
    ...group,
    split: index >= groups.length - heldOut ? ('held_out' as const) : ('calibration' as const),
  }));
  const manifest = {
    version: 'geo-local-evaluation-1',
    dataset: input.dataset,
    versions,
    ...(reviewScope ? { reviewScope } : {}),
    inputHash: hash(input),
    groups: assigned,
    records: input.records.map((row) => {
      const group = assigned.find((group) => group.members.includes(row.observation.id));
      if (!group) throw new Error('Missing evaluation group');
      return {
        id: row.observation.id,
        inputHash: hash({
          observation: row.observation,
          promptFamily: row.promptFamily,
          checks: row.checks,
          criteria: row.criteria,
        }),
        groupId: group.id,
        split: group.split,
        engine: row.observation.engine,
      };
    }),
  };
  return {
    manifest,
    review: input.records.map((row) => ({
      id: row.observation.id,
      context: row.observation.context,
      capturedAt: row.observation.capturedAt,
      captureQuality: row.observation.capture.quality,
      answerText: row.observation.capture.answerText,
      sources: row.observation.capture.sources,
      checks: row.checks,
      criteria: row.criteria,
      candidates: buildGeoEvaluation(row.observation, row.checks, row.criteria, versions)
        .candidates,
      options: fieldOptions(row, versions, reviewScope),
    })),
    labels: {
      reviewedBy: '',
      reviewedAt: null as string | null,
      records: input.records.map((row) => ({
        id: row.observation.id,
        values: Object.fromEntries(
          Object.keys(fieldOptions(row, versions, reviewScope)).map((field) => [
            field,
            null as string | null,
          ]),
        ),
      })),
    },
  };
}
type Packet = ReturnType<typeof prepareEvaluation>;
type HumanLabels = Packet['labels'];
function preparedPacketHash(packet: Packet) {
  // Legacy packets included a duplicate choice question with no corresponding prediction.
  const normalized = structuredClone(packet);
  for (const row of normalized.review) {
    if (
      Object.hasOwn(row.options, 'evidence.support') &&
      hash(row.options['evidence.support']) !== hash(['yes', 'no', 'unknown'])
    )
      throw new Error('Prepared legacy field changed');
    delete row.options['evidence.support'];
  }
  for (const row of normalized.labels.records) {
    if (Object.hasOwn(row.values, 'evidence.support') && row.values['evidence.support'] !== null)
      throw new Error('Prepared legacy placeholder changed');
    delete row.values['evidence.support'];
  }
  return hash(normalized);
}
export function freezeHumanLabels(
  packet: Packet,
  labels: HumanLabels,
  sourceReview?: SourceReview,
) {
  if (
    !labels.reviewedBy.trim() ||
    !labels.reviewedAt ||
    !Number.isFinite(Date.parse(labels.reviewedAt))
  )
    throw new Error('Human review identity and timestamp required');
  if (
    labels.records.length !== packet.review.length ||
    new Set(labels.records.map((row) => row.id)).size !== packet.review.length
  )
    throw new Error('Every observation requires one human label record');
  const resolved = sourceReview ? resolveSourceReview(packet, labels, sourceReview).labels : labels;
  for (const row of packet.review) {
    const label = resolved.records.find((label) => label.id === row.id);
    if (!label || hash(Object.keys(label.values).sort()) !== hash(Object.keys(row.options).sort()))
      throw new Error('Human label fields must match the blinded packet');
    for (const [field, options] of Object.entries(row.options)) {
      const value = label.values[field] ?? null;
      if (value === null && !isEvaluationReviewField(field)) continue;
      if (value === null || !options.includes(value))
        throw new Error(`Missing or invalid human label for ${field}`);
    }
  }
  return {
    packetHash: hash(packet),
    labelsHash: hash(labels),
    ...(sourceReview ? { sourceReviewHash: hash(sourceReview) } : {}),
  };
}
const taskInput = (row: EvaluationRecord) => ({
  observation: row.observation,
  analysis: {
    id: `stored-${row.observation.id}`,
    state: 'completed' as const,
    createdAt: row.observation.capturedAt,
    classification: row.classification,
    diagnoses: row.diagnoses,
  },
});
function predictions(row: EvaluationRecord, tasks = actionCandidates([taskInput(row)])) {
  const classification = row.classification;
  const fields: Record<string, string> = {
    captureQuality: row.observation.capture.quality,
    answerQuality: classification.answerQuality,
    brandPresence: classification.brandPresence,
    brandStance: classification.brandStance,
    evidenceSupport: classification.evidenceSupport,
  };
  for (const [id, fit] of Object.entries(classification.fitByCriterion)) fields[`fit.${id}`] = fit;
  for (const competitor of classification.competitors)
    fields[`competitor.${competitor.id}`] = competitor.stance;
  for (const evidence of classification.evidence)
    fields[`evidence.${evidence.id}`] = evidence.supportProbability >= 0.8 ? 'yes' : 'no';
  for (const source of classification.sources) {
    fields[`source.${source.id}.role`] = source.role;
    fields[`source.${source.id}.type`] = source.type;
  }
  for (const issue of issues)
    fields[`diagnosis.${issue}`] =
      row.diagnoses.find((diagnosis) => diagnosis.type === issue)?.status ?? 'none';
  for (const template of templates)
    fields[`task.${template}`] = tasks.some(
      (task) =>
        task.templateId === template &&
        task.evidence.some((proof) => proof.observationId === row.observation.id),
    )
      ? 'yes'
      : 'no';
  return fields;
}
const ratio = (numerator: number, denominator: number) =>
  denominator ? numerator / denominator : ('not measurable' as const);
interface Counter {
  tp: number;
  fp: number;
  fn: number;
}
function summarize(
  rows: {
    id: string;
    expected: Record<string, string | null>;
    predicted: Record<string, string>;
  }[],
) {
  const fields: Record<
    string,
    {
      reviewed: number;
      eligible: number;
      covered: number;
      correctAbstentions: number;
      incorrectAbstentions: number;
      classes: Record<string, Counter>;
      disagreements: { id: string; expected: string; predicted: string }[];
    }
  > = {};
  for (const row of rows)
    for (const [field, gold] of Object.entries(row.expected)) {
      if (gold === null) throw new Error('Unreviewed human label');
      const prediction = row.predicted[field] ?? 'unknown';
      const count = (fields[field] ??= {
        reviewed: 0,
        eligible: 0,
        covered: 0,
        correctAbstentions: 0,
        incorrectAbstentions: 0,
        classes: {},
        disagreements: [],
      });
      count.reviewed++;
      const goldAbstains = abstentions.has(gold),
        modelAbstains = abstentions.has(prediction);
      if (!goldAbstains) {
        count.eligible++;
        if (!modelAbstains) count.covered++;
        const actualClass = (count.classes[gold] ??= { tp: 0, fp: 0, fn: 0 });
        if (prediction === gold) actualClass.tp++;
        else actualClass.fn++;
      }
      if (modelAbstains) {
        if (goldAbstains && prediction === gold) count.correctAbstentions++;
        else count.incorrectAbstentions++;
      } else if (prediction !== gold) (count.classes[prediction] ??= { tp: 0, fp: 0, fn: 0 }).fp++;
      if (prediction !== gold)
        count.disagreements.push({ id: row.id, expected: gold, predicted: prediction });
    }
  return {
    observations: rows.length,
    fields: Object.fromEntries(
      Object.entries(fields).map(([field, count]) => {
        const totals = Object.values(count.classes).reduce(
          (sum, value) => ({ tp: sum.tp + value.tp, fp: sum.fp + value.fp, fn: sum.fn + value.fn }),
          { tp: 0, fp: 0, fn: 0 },
        );
        return [
          field,
          {
            ...count,
            coverage: ratio(count.covered, count.eligible),
            precision: ratio(totals.tp, totals.tp + totals.fp),
            recall: ratio(totals.tp, totals.tp + totals.fn),
            classes: Object.fromEntries(
              Object.entries(count.classes).map(([label, value]) => [
                label,
                {
                  ...value,
                  precision: ratio(value.tp, value.tp + value.fp),
                  recall: ratio(value.tp, value.tp + value.fn),
                },
              ]),
            ),
          },
        ];
      }),
    ),
  };
}
export function scoreEvaluation(
  input: EvaluationInput,
  packet: Packet,
  labels: HumanLabels,
  lock: ReturnType<typeof freezeHumanLabels>,
  sourceReview?: SourceReview,
) {
  const versions = readGeoVersions(packet.manifest.versions);
  if (
    hash(lock) !== hash(freezeHumanLabels(packet, labels, sourceReview)) ||
    packet.manifest.inputHash !== hash(input) ||
    preparedPacketHash(packet) !==
      hash(prepareEvaluation(input, versions, packet.manifest.reviewScope))
  )
    throw new Error('Frozen input, labels or split changed');
  const safety = {
    falseComplete: 0,
    invalidQuotes: 0,
    invalidSourceLinks: 0,
    unsupportedSupportedDiagnoses: 0,
    unsupportedEvidenceSupport: 0,
    unsupportedFit: 0,
    storedPolicyDisagreements: 0,
  };
  const resolved = sourceReview ? resolveSourceReview(packet, labels, sourceReview) : undefined;
  const splits = new Map(packet.manifest.records.map((row) => [row.id, row.split]));
  const taskGroup = (row: EvaluationRecord) =>
    hash({
      split: splits.get(row.observation.id),
      projectId: row.observation.projectId,
      contextVersion: row.observation.context.contextVersion,
      brand: row.observation.context.brand,
      competitors: [...row.observation.context.competitors].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      method: [
        row.classification.rubricVersion,
        row.classification.policyVersion,
        row.classification.ownershipVersion,
      ],
    });
  const groups = new Map<string, EvaluationRecord[]>();
  if (versions.policy === 'geo-policy-2')
    for (const row of input.records) {
      const key = taskGroup(row),
        group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
  const cohortTasks = new Map(
    [...groups].map(([key, group]) => [key, actionCandidates(group.map(taskInput))]),
  );
  const rows = input.records.map((row) => {
    const expected = (resolved?.labels ?? labels).records.find(
      (label) => label.id === row.observation.id,
    )?.values;
    if (!expected) throw new Error('Human label missing');
    const storedMethod = readGeoVersions({
      rubric: row.classification.rubricVersion,
      policy: row.classification.policyVersion,
      ownership: row.classification.ownershipVersion,
    });
    const evaluation = buildGeoEvaluation(row.observation, row.checks, row.criteria, storedMethod);
    const replay = projectGeoClassification(
      row.observation,
      evaluation,
      row.classification.native,
      storedMethod,
    );
    const diagnoses = diagnoseGeo(row.observation, replay, row.checks);
    safety.falseComplete += Number(
      row.observation.capture.quality === 'complete' && expected.captureQuality !== 'complete',
    );
    safety.invalidQuotes += row.classification.evidence.filter(
      (evidence) =>
        evidence.end <= evidence.start ||
        evidence.end > row.observation.capture.answerText.length ||
        row.observation.capture.answerText.slice(evidence.start, evidence.end) !== evidence.quote,
    ).length;
    safety.invalidSourceLinks += row.classification.sources.filter(
      (source) => !row.observation.capture.sources.some((original) => original.id === source.id),
    ).length;
    safety.unsupportedSupportedDiagnoses += row.diagnoses.filter(
      (diagnosis) =>
        diagnosis.status === 'supported' &&
        (expected[`diagnosis.${diagnosis.type}`] !== 'supported' ||
          !diagnoses.some(
            (replayed) =>
              replayed.type === diagnosis.type &&
              replayed.status === 'supported' &&
              replayed.reasonCode === diagnosis.reasonCode,
          )),
    ).length;
    safety.unsupportedEvidenceSupport += Number(
      row.classification.evidenceSupport === 'supported' &&
        !(evaluation.state.checkedPages as GeoPageCheck[]).length,
    );
    safety.unsupportedFit += Number(
      !row.criteria.length &&
        Object.values(row.classification.fitByCriterion).some((fit) =>
          ['meets', 'partial', 'mismatch'].includes(fit),
        ),
    );
    safety.storedPolicyDisagreements += Number(
      hash(row.classification) !== hash(replay) || hash(row.diagnoses) !== hash(diagnoses),
    );
    return {
      id: row.observation.id,
      engine: row.observation.engine,
      split: packet.manifest.records.find((item) => item.id === row.observation.id)?.split,
      expected: Object.fromEntries(
        Object.entries(expected).filter(
          ([field]) =>
            isEvaluationReviewField(field) &&
            (!resolved || !isAssistedSourceField(resolved.assisted, row.observation.id, field)),
        ),
      ),
      predicted: predictions(row, cohortTasks.get(taskGroup(row))),
    };
  });
  return {
    status: packet.manifest.reviewScope
      ? `critical_fields_human_reviewed_${input.dataset}`
      : resolved?.assisted.size
        ? `partially_human_reviewed_${input.dataset}`
        : `human_reviewed_${input.dataset}`,
    dataset: input.dataset,
    ...(packet.manifest.reviewScope
      ? {
          reviewScope: packet.manifest.reviewScope,
          unmeasuredDimensions: ['source role', 'source type', 'segment relevance'],
        }
      : {}),
    pilotGatePassed: false,
    scoringVersion:
      versions.policy === 'geo-policy-2'
        ? 'geo-local-scoring-4'
        : sourceReview
          ? 'geo-local-scoring-3'
          : 'geo-local-scoring-2',
    ...(versions.policy === 'geo-policy-2'
      ? { taskScope: 'frozen_partition_and_project_context' }
      : {}),
    ...(resolved
      ? {
          sourceReview: {
            protocol: sourceReview?.protocol,
            assistedFieldsExcludedFromAccuracy: resolved.assisted.size,
            independentGroupDecisions: resolved.independentGroups,
            assistedGroupDecisions: resolved.assistedGroups,
            remainingSourceFields: resolved.remaining,
            contentCoverage: resolved.contentCoverage,
            preservedHumanSourceDifferences: resolved.preservedHumanDifferences,
            note: 'Assisted annotations are excluded from accuracy. Repeated source occurrences are not independent samples; missing-content unknowns do not validate content categories.',
          },
        }
      : {}),
    unscoredLegacyFields: packet.review.some((row) =>
      Object.hasOwn(row.options, 'evidence.support'),
    )
      ? [
          {
            field: 'evidence.support',
            records: packet.review.filter((row) => Object.hasOwn(row.options, 'evidence.support'))
              .length,
            reason: 'Duplicate of evidenceSupport; no separate classifier prediction.',
          },
        ]
      : [],
    manifestHash: hash(packet.manifest),
    labelsHash: hash(labels),
    abstentionLabels: [...abstentions],
    overall: summarize(rows),
    byPartition: Object.fromEntries(
      ['calibration', 'held_out'].map((split) => [
        split,
        summarize(rows.filter((row) => row.split === split)),
      ]),
    ),
    byEngine: Object.fromEntries(
      [...new Set(rows.map((row) => row.engine))].map((engine) => [
        engine,
        summarize(rows.filter((row) => row.engine === engine)),
      ]),
    ),
    safety,
  };
}

const pageCheckSchema = z.object({
  id: z.string(),
  target: z.url(),
  finalUrl: z.url().nullable(),
  status: z.enum(['checked', 'unavailable', 'rejected']),
  httpStatus: z.number().nullable(),
  noindex: z.boolean().nullable(),
  canonical: z.string().nullable(),
  robots: z.string().nullable(),
  excerpt: z.string().nullable(),
  checkedAt: z.iso.datetime(),
  reason: z.string().nullable(),
});
const entitySchema = z.object({ id: z.string(), name: z.string(), domain: z.string().nullable() });
const observationSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  runId: z.string(),
  itemId: z.string(),
  promptVersionId: z.string(),
  engine: geoEngineSchema,
  capturedAt: z.iso.datetime(),
  context: z.object({
    schemaVersion: z.literal('geo-context-1'),
    projectId: z.string(),
    contextVersion: z.number(),
    settingsRevision: z.number(),
    promptId: z.string(),
    promptVersionId: z.string(),
    promptText: z.string(),
    engine: geoEngineSchema,
    surface: z.enum([
      'perplexity_agent',
      'openai_web_search',
      'google_ai_overview',
      'chatgpt_search',
      'bing_copilot_answers',
    ]),
    collector: z.enum(['perplexity_api', 'openai_responses', 'serpapi', 'dataforseo_standard']),
    collectorVersion: z.enum([
      'geo-collector-1',
      'geo-collector-2',
      'geo-collector-3',
      'geo-collector-4',
    ]),
    requestedModel: z.string().optional(),
    languageCode: z.string(),
    locationCode: z.number(),
    device: z.enum(['desktop', 'mobile']),
    forceWebSearch: z.boolean(),
    brand: entitySchema,
    competitors: z.array(entitySchema),
    instructionVersion: z.literal('neutral-research-1'),
    maxOutputTokens: z.number(),
  }),
  capture: z.object({
    schemaVersion: z.literal('geo-capture-1'),
    answerText: z.string(),
    raw: z.unknown(),
    model: z.string().nullable(),
    modelReported: z.boolean(),
    inlineReferencesAvailable: z.boolean().optional(),
    sources: z.array(
      z.object({
        id: z.string(),
        url: z.url(),
        canonicalUrl: z.url(),
        title: z.string().nullable(),
        referenceLevel: z.enum(['retrieved', 'answer', 'element', 'inline_verified']),
        spans: z.array(z.object({ start: z.number(), end: z.number() })).optional(),
      }),
    ),
    quality: z.enum(['complete', 'partial', 'no_feature']),
    providerRequestId: z.string().nullable(),
    providerStatus: z.string().nullable(),
    reportedCost: z.number().nullable(),
    inputTokens: z.number().nullable(),
    outputTokens: z.number().nullable(),
    textParts: z.array(
      z.object({ itemIndex: z.number(), contentIndex: z.number(), text: z.string() }),
    ),
  }),
});
const inputSchema = z.object({
  dataset: z.enum(['real', 'synthetic']),
  expectedObservationIds: z.array(z.string()),
  records: z.array(
    z.object({
      observation: observationSchema,
      promptFamily: z.string().trim().min(1),
      checks: z.array(pageCheckSchema),
      criteria: z.array(
        z.object({ id: z.string(), criterion: z.string(), verifiedFact: z.string() }),
      ),
      classification: geoClassificationSchema,
      diagnoses: z.array(geoDiagnosisSchema),
    }),
  ),
});
async function main() {
  const [command, inputFile, directory] = process.argv.slice(2);
  if (
    !command ||
    !['prepare', 'prepare-g3', 'freeze', 'score'].includes(command) ||
    !inputFile ||
    !directory
  )
    throw new Error(
      'Usage: npx tsx scripts/evaluate-geo.ts prepare|prepare-g3|freeze|score research/private/input.json research/private/review',
    );
  const privateRoot = resolve('research/private');
  const privatePath = (path: string) => {
    const full = resolve(path),
      local = relative(privateRoot, full);
    if (
      !local ||
      local === '..' ||
      local.startsWith(`..${sep}`) ||
      resolve(privateRoot, local) !== full
    )
      throw new Error('Evaluation files must stay under ignored research/private/');
    return full;
  };
  const source = privatePath(inputFile),
    output = privatePath(directory);
  const readJson = async (name: string): Promise<unknown> =>
    JSON.parse(await readFile(name, 'utf8')) as unknown;
  const input: EvaluationInput = inputSchema.parse(await readJson(source));
  if (command === 'prepare' || command === 'prepare-g3') {
    const packet = prepareEvaluation(
      input,
      geoVersions,
      command === 'prepare-g3' ? 'g3_validation' : undefined,
    );
    await mkdir(output, { recursive: true });
    for (const [file, value] of [
      ['packet.json', packet],
      ['human-labels.json', packet.labels],
    ] as const)
      await writeFile(resolve(output, file), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    console.log(
      `Prepared ${String(input.records.length)} ${input.dataset} observations; label blind packet before freezing.`,
    );
    return;
  }
  const packet = (await readJson(resolve(output, 'packet.json'))) as Packet;
  const labels = (await readJson(resolve(output, 'human-labels.json'))) as HumanLabels;
  const sourceReview = await readSourceReview(output);
  if (
    preparedPacketHash(packet) !==
    hash(prepareEvaluation(input, packet.manifest.versions, packet.manifest.reviewScope))
  )
    throw new Error('Prepared input or split changed');
  if (command === 'freeze') {
    await writeFile(
      resolve(output, 'labels-lock.json'),
      `${JSON.stringify(freezeHumanLabels(packet, labels, sourceReview), null, 2)}\n`,
      { flag: 'wx' },
    );
    console.log(
      'Review frozen, including source provenance when supplied. Model results may now be scored locally.',
    );
  } else {
    const lock = (await readJson(resolve(output, 'labels-lock.json'))) as ReturnType<
      typeof freezeHumanLabels
    >;
    const report = scoreEvaluation(input, packet, labels, lock, sourceReview);
    await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      `Scored ${String(input.records.length)} ${input.dataset} observations. Private report written; pilot gate remains pending.`,
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  void main().catch((error: unknown) => {
    const detail =
      error instanceof z.ZodError
        ? error.issues
            .slice(0, 5)
            .map((issue) => `${issue.path.join('.')}: ${issue.code}`)
            .join('; ')
        : error instanceof Error
          ? error.message
          : 'Unknown local input error';
    console.error(`GEO evaluation failed: ${detail}. No provider request was made.`);
    process.exitCode = 1;
  });
