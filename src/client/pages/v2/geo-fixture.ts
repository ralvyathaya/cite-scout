import { actionCandidates, sourceOpportunities } from '../../../domain/geo-playbooks';
import { syntheticOnboardingSuggestion } from '../../../shared/onboarding-fixture';
import {
  buildGeoEvaluation,
  projectGeoClassification,
  belongsToDomain,
} from '../../../domain/geo-classification';
import { diagnoseGeo } from '../../../domain/geo-diagnosis';
import {
  compareCohortSamples,
  dailySamples,
  measurementCohort,
} from '../../../domain/geo-measurement';
import {
  geoRunRequestSchema,
  geoSettingsSchema,
  geoPromptSetSchema,
  geoSurfaces,
  geoCollectorPolicy,
  type GeoEngine,
  type GeoObservation,
  type GeoRun,
  type GeoSettings,
  type GeoPromptSet,
} from '../../../shared/geo';
import { geoVersions, type GeoAnalysis, type NativeDecision } from '../../../shared/geo-analysis';
import {
  geoActionPatchSchema,
  geoFollowUpSchema,
  type GeoAction,
  type GeoActionEvent,
  type GeoActionDetail,
  type GeoAnalyzedObservation,
} from '../../../shared/geo-actions';
import {
  geoCompletionSchema,
  geoReopenSchema,
  geoMetrics,
  geoMeasurementVersion,
  type GeoDailySample,
  type GeoMetricObservation,
  type GeoPinMeasurement,
} from '../../../shared/geo-measurement';
import type { V2ProjectPayload } from '../../../shared/v2';
import { z } from 'zod';
export const fixtureDisposition = (hostname: string, requested: boolean) => ({
  requested,
  enabled: requested && ['localhost', '127.0.0.1', '[::1]'].includes(hostname),
});
const DAY = 86400_000;
const fixtureCollector = (engine: GeoEngine) =>
  engine === 'google_aio' || engine === 'bing_copilot' ? 'serpapi' : geoSurfaces[engine].collector;
// Separate browser-memory store and transport; no fetch, production database or provider client.
export class GeoFixtureWorkspace {
  private observations: GeoObservation[] = [];
  private analyses: GeoAnalysis[] = [];
  private actions: GeoAction[] = [];
  private followUpEvidence = new Map<string, GeoActionDetail['evidence']>();
  private events: GeoActionEvent[] = [];
  private runs: GeoRun[] = [];
  private samples = new Map<string, GeoDailySample>();
  private promptSets: GeoPromptSet[] = [];
  private mutations = new Map<string, { hash: string; value: unknown }>();
  private settings: GeoSettings = {
    projectId: 'fixture-project',
    engines: ['perplexity', 'google_aio', 'chatgpt_search', 'bing_copilot'],
    dailyEnabled: false,
    languageCode: 'en',
    locationCode: 2840,
    device: 'desktop',
    configured: true,
    revision: 1,
  };
  private project: V2ProjectPayload;
  constructor(private at = new Date()) {
    this.project = {
      project: {
        id: 'fixture-project',
        brandName: 'CedarFlow',
        canonicalDomain: 'cedarflow.example',
        contextVersion: 1,
        competitors: [{ id: 'fixture-rival', name: 'Rival', canonicalDomain: 'rival.example' }],
        questions: [
          'Which onboarding tool works for a small marketing team?',
          'Which tools provide transparent pricing and buyer evidence?',
        ].map((text, index) => ({
          id: `fixture-prompt-${String(index)}`,
          text,
          enabled: true,
          archivedAt: null,
          updatedAt: at.toISOString(),
          replacesQuestionId: null,
        })),
      },
      enrolled: true,
      canScan: true,
      internalTestAccess: false,
      trial: null,
      scansEnabled: true,
      supportEmail: 'support@cite-scout.com',
      usage: {
        today: 0,
        month: 0,
        dailyLimit: 100,
        monthlyLimit: 1000,
        resetAt: new Date(at.getTime() + DAY).toISOString(),
        monthlyResetAt: new Date(at.getTime() + 30 * DAY).toISOString(),
      },
    };
    this.seed();
  }
  private seed() {
    for (const days of [3, 1]) this.collect(new Date(this.at.getTime() - days * DAY), false);
    this.syncActions();
    this.promptSets = [
      {
        id: 'fixture-set',
        name: 'Buyer discovery',
        promptIds: this.project.project?.questions.map((q) => q.id) ?? [],
        updatedAt: this.at.toISOString(),
      },
    ];
  }
  private collect(
    at: Date,
    improved: boolean,
    input?: { promptIds?: string[]; engines?: GeoEngine[] },
  ) {
    const project = this.project.project;
    if (!project) throw new Error('Fixture project unavailable');
    const run: GeoRun = {
      id: crypto.randomUUID(),
      trigger: 'manual',
      status: 'completed',
      createdAt: at.toISOString(),
      completedAt: at.toISOString(),
      items: [],
    };
    for (const question of project.questions.filter(
      (q) => q.enabled && !q.archivedAt && (!input?.promptIds || input.promptIds.includes(q.id)),
    )) {
      for (const engine of input?.engines ?? this.settings.engines) {
        const id = crypto.randomUUID(),
          itemId = crypto.randomUUID(),
          surface = geoSurfaces[engine];
        const text = improved
          ? 'CedarFlow is recommended for a small team. Its buyer page now gives clearer pricing and product evidence. Rival is another option.'
          : 'Rival is recommended for a small team. Compare pricing, onboarding needs and independent buyer reviews before choosing.';
        const observation: GeoObservation = {
          id,
          projectId: project.id,
          runId: run.id,
          itemId,
          promptVersionId: `${question.id}-v1`,
          engine,
          capturedAt: at.toISOString(),
          context: {
            schemaVersion: 'geo-context-1',
            projectId: project.id,
            contextVersion: 1,
            settingsRevision: this.settings.revision,
            promptId: question.id,
            promptVersionId: `${question.id}-v1`,
            promptText: question.text,
            engine,
            surface: surface.surface,
            collector: fixtureCollector(engine),
            ...geoCollectorPolicy(engine, fixtureCollector(engine)),
            ...(engine === 'openai_web_search' ? { requestedModel: 'fixture-model' } : {}),
            languageCode: this.settings.languageCode,
            locationCode: this.settings.locationCode,
            device: this.settings.device,
            forceWebSearch: engine === 'chatgpt_search' || engine === 'openai_web_search',
            brand: { id: project.id, name: project.brandName, domain: project.canonicalDomain },
            competitors: project.competitors.map((rival) => ({
              id: rival.id,
              name: rival.name,
              domain: rival.canonicalDomain,
            })),
            instructionVersion: 'neutral-research-1',
          },
          capture: {
            schemaVersion: 'geo-capture-1',
            answerText: text,
            raw: {
              dataOrigin: 'fixture',
              notice: 'Synthetic adapter output; never a response from an AI provider.',
              engine,
              text,
            },
            model: surface.reportsModel ? 'fixture-model' : null,
            modelReported: surface.reportsModel,
            inlineReferencesAvailable: false,
            quality: 'complete',
            providerRequestId: `fixture-${id}`,
            providerStatus: 'fixture',
            reportedCost: 0,
            inputTokens: 0,
            outputTokens: 0,
            textParts: [{ itemIndex: 0, contentIndex: 0, text }],
            sources: [
              {
                id: 'fixture-community',
                url: 'https://community.example/reviews/onboarding-tools',
                canonicalUrl: 'https://community.example/reviews/onboarding-tools',
                title: 'Synthetic independent buyer discussion',
                referenceLevel: 'answer',
              },
              ...(improved
                ? [
                    {
                      id: 'fixture-owned',
                      url: 'https://cedarflow.example/buyers',
                      canonicalUrl: 'https://cedarflow.example/buyers',
                      title: 'Synthetic buyer comparison',
                      referenceLevel: 'answer' as const,
                    },
                  ]
                : []),
            ],
          },
        };
        run.items.push({
          id: itemId,
          runId: run.id,
          promptId: question.id,
          engine,
          status: 'succeeded',
          context: observation.context,
          reservationId: `fixture-${itemId}`,
          providerTaskId: null,
          attemptsUsed: 1,
          dueAt: at.toISOString(),
          terminalReason: null,
        });
        const evaluation = buildGeoEvaluation(observation);
        const answers: NativeDecision['answers'] = {};
        for (const [name, question] of Object.entries(evaluation.questions)) {
          if (question.type === 'noul') {
            answers[name] = { type: 'noul', noul: 1 };
            continue;
          }
          let choice = Object.keys(question.criteria)[0] ?? 'unknown';
          if (name === 'brand_presence') choice = improved ? 'present' : 'absent';
          else if (name === 'brand_stance') choice = improved ? 'recommended' : 'not_applicable';
          else if (name.startsWith('competitor_')) choice = 'recommended';
          else if (name.startsWith('fit_')) choice = 'unclear';
          answers[name] = {
            type: 'choice',
            choice,
            confidence: 1,
            probabilities: Object.fromEntries(
              Object.keys(question.criteria).map((option) => [option, option === choice ? 1 : 0]),
            ),
          };
        }
        const native: NativeDecision = {
          model: 'clef-flash',
          usage: { input_tokens: 0, output_tokens: 0 },
          answers,
        };
        const classification = projectGeoClassification(observation, evaluation, native);
        this.observations.push(observation);
        this.analyses.push({
          id: `fixture-analysis-${id}`,
          observationId: id,
          state: 'completed',
          model: 'clef-flash',
          rubricVersion: geoVersions.rubric,
          policyVersion: geoVersions.policy,
          inputHash: `fixture-${id}`,
          createdAt: at.toISOString(),
          completedAt: at.toISOString(),
          latencyMs: null,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          failureCode: null,
          classification,
          diagnoses: diagnoseGeo(observation, classification),
        });
      }
    }
    this.runs.push(run);
    return run;
  }
  private evidence(): GeoAnalyzedObservation[] {
    return this.observations.flatMap((observation) =>
      this.analyses
        .filter((a) => a.observationId === observation.id)
        .map((analysis) => ({ observation, analysis })),
    );
  }
  private syncActions() {
    for (const candidate of actionCandidates(this.evidence())) {
      const existing = this.actions.find((action) => action.dedupeKey === candidate.dedupeKey),
        { evidence, ...brief } = candidate;
      const scopes = Array.from(
        new Map(
          evidence.map((proof) => [
            `${proof.scope.context.promptId}:${proof.scope.context.engine}`,
            proof.scope,
          ]),
        ).values(),
      );
      if (existing) {
        existing.evidenceCount = evidence.length;
        existing.scopes = scopes;
        continue;
      }
      this.actions.push({
        ...brief,
        id: `fixture-action-${String(this.actions.length + 1)}`,
        projectId: 'fixture-project',
        status: 'proposed',
        revision: 1,
        checkedIds: [],
        notes: '',
        createdAt: this.at.toISOString(),
        updatedAt: this.at.toISOString(),
        evidenceCount: evidence.length,
        scopes,
      });
    }
  }
  private metricRows(): GeoMetricObservation[] {
    return this.observations.map((row) => {
      const a = this.analyses.find((analysis) => analysis.observationId === row.id);
      return {
        id: row.id,
        projectId: row.projectId,
        requestedAt: row.capturedAt,
        capturedAt: row.capturedAt,
        context: row.context,
        capture: row.capture,
        analysis:
          a?.state === 'completed'
            ? {
                id: a.id,
                model: a.classification.model,
                rubricVersion: a.rubricVersion,
                policyVersion: a.policyVersion,
                answerQuality: a.classification.answerQuality,
                scope: a.classification.scope,
                brandPresence: a.classification.brandPresence,
                brandStance: a.classification.brandStance,
              }
            : null,
      };
    });
  }
  private freeze(samples: GeoDailySample[]) {
    for (const sample of samples) {
      const key = `${sample.series}:${sample.cohort}:${sample.day}`;
      if (!this.samples.has(key)) this.samples.set(key, sample);
    }
  }
  private detail(action: GeoAction): GeoActionDetail {
    const candidate = actionCandidates(this.evidence()).find(
      (candidate) => candidate.dedupeKey === action.dedupeKey,
    );
    return {
      action,
      evidence: this.followUpEvidence.get(action.id) ?? candidate?.evidence ?? [],
      events: this.events
        .filter((event) => event.actionId === action.id)
        .slice()
        .reverse(),
      nextEvidenceCursor: null,
    };
  }
  private async measurements(action: GeoAction): Promise<GeoPinMeasurement[]> {
    const rows = this.metricRows(),
      pins: GeoPinMeasurement[] = [];
    for (const event of this.events.filter(
      (event) => event.actionId === action.id && event.kind === 'completed',
    )) {
      const { implementedAt, changeDescription, changeUrl } = event.details;
      if (typeof implementedAt !== 'string' || typeof changeDescription !== 'string')
        throw new Error('Fixture completion unavailable');
      const beforeWindow = {
          from: new Date(Date.parse(implementedAt) - 7 * DAY).toISOString(),
          to: implementedAt,
        },
        afterWindow = {
          from: implementedAt,
          to: new Date(Date.parse(implementedAt) + 7 * DAY).toISOString(),
        };
      this.freeze(await dailySamples(rows, `${event.id}:before`, beforeWindow));
      this.freeze(
        await dailySamples(rows, `${event.id}:after`, {
          ...afterWindow,
          requestedAfter: implementedAt,
        }),
      );
      const cohorts = await Promise.all(
        event.scopes.map(async (scope) => {
          const original = rows.find((row) => row.id === scope.observationId);
          const keys = {} as Record<(typeof geoMetrics)[number], string | null>;
          for (const metric of geoMetrics)
            keys[metric] = original ? await measurementCohort(original, metric) : null;
          return { scope, keys };
        }),
      );
      const metrics = geoMetrics.map((metric) => {
        const expected = cohorts.map((cohort) => cohort.keys[metric]);
        const samples = Array.from(this.samples.values()).filter(
          (sample) => sample.metric === metric && expected.includes(sample.cohort),
        );
        const left = samples.filter((sample) => sample.series === `${event.id}:before`),
          right = samples.filter((sample) => sample.series === `${event.id}:after`);
        const scopeComplete = expected.every((key, index) => {
          const scope = event.scopes[index];
          return (
            scope !== undefined &&
            key !== null &&
            this.settings.engines.includes(scope.context.engine) &&
            left.some((s) => s.cohort === key) &&
            right.some((s) => s.cohort === key)
          );
        });
        return {
          metric,
          ...compareCohortSamples(left, right, expected, scopeComplete),
        };
      });
      pins.push({
        eventId: event.id,
        actionId: action.id,
        implementedAt,
        recordedAt: event.recordedAt,
        changeDescription,
        changeUrl: typeof changeUrl === 'string' ? changeUrl : null,
        version: geoMeasurementVersion,
        beforeWindow,
        afterWindow,
        windowComplete: false,
        cohorts,
        metrics,
        limitations: [
          'Synthetic fixture comparison; no provider monitoring, billing, causal or ROI evidence.',
        ],
      });
    }
    return pins;
  }
  async request(
    path: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
  ): Promise<unknown> {
    if (method !== 'GET') this.at = new Date(Math.max(Date.now(), this.at.getTime()));
    const value = await this.handle(path, body, method);
    return structuredClone(value);
  }
  private async handle(path: string, body: unknown, method: string): Promise<unknown> {
    const url = new URL(path, 'https://fixture.invalid'),
      route = url.pathname;
    const filterRows = (rows: GeoObservation[]) =>
      rows.filter(
        (row) =>
          (!url.searchParams.get('engine') || row.engine === url.searchParams.get('engine')) &&
          (!url.searchParams.get('promptId') ||
            row.context.promptId === url.searchParams.get('promptId')) &&
          (!url.searchParams.get('days') ||
            Date.parse(row.capturedAt) >=
              this.at.getTime() - Number(url.searchParams.get('days')) * DAY),
      );
    if (route === '/project' && method === 'GET') return this.project;
    if (route === '/onboarding/suggestions' && method === 'POST')
      return syntheticOnboardingSuggestion;
    if (route === '/api/billing/status' && method === 'GET')
      return {
        subscription: null,
        checkoutAvailable: false,
        portalAvailable: false,
        availabilityMessage:
          'Fixture billing is synthetic. No checkout, payment or subscription changes are available.',
      };
    if (route === '/questions' && method === 'POST') {
      const input = z.object({ text: z.string().trim().min(10).max(500) }).parse(body);
      const question = {
        id: crypto.randomUUID(),
        text: input.text,
        enabled: true,
        archivedAt: null,
        updatedAt: this.at.toISOString(),
        replacesQuestionId: null,
      };
      if ((this.project.project?.questions.filter((q) => !q.archivedAt).length ?? 0) >= 10)
        throw new Error('Fixture prompt limit reached');
      this.project.project?.questions.push(question);
      return question;
    }
    if (route.startsWith('/questions/')) {
      const question = this.project.project?.questions.find((q) => q.id === route.split('/')[2]);
      if (!question) throw new Error('Fixture prompt unavailable');
      if (route.endsWith('/history') && method === 'GET')
        return { question, entries: [], nextCursor: null };
      if (method === 'PATCH') {
        const input = z
          .object({
            action: z.enum(['pause', 'resume', 'archive']).optional(),
            text: z.string().trim().min(10).max(500).optional(),
            expectedUpdatedAt: z.string(),
          })
          .parse(body);
        if (input.expectedUpdatedAt !== question.updatedAt)
          throw new Error('Fixture prompt changed. Reload before editing.');
        if (input.text) question.text = input.text;
        if (input.action) question.enabled = input.action === 'resume';
        if (input.action === 'archive') question.archivedAt = this.at.toISOString();
        question.updatedAt = this.at.toISOString();
        return question;
      }
    }
    if (route === '/questions' && method === 'GET')
      return {
        questions:
          this.project.project?.questions.map((question) => ({
            ...question,
            latest: null,
            latestAttempt: null,
            previousId: null,
            baselineId: null,
            delta: null,
            stale: false,
            contextChanged: false,
            needsAttention: false,
          })) ?? [],
        summary: {
          tracked: 2,
          available: 0,
          brandMatched: 0,
          comparable: 0,
          changed: 0,
          sourcesUnavailable: 0,
          from: null,
          to: null,
        },
      };
    if (route === '/geo/capabilities')
      return {
        engines: Object.fromEntries(
          (Object.keys(geoSurfaces) as GeoEngine[]).map((engine) => [
            engine,
            {
              available: true,
              reason: null,
              collector: fixtureCollector(engine),
              requestedModel: engine === 'openai_web_search' ? 'fixture-model' : null,
              nextStep:
                'Synthetic provider configuration. No credentials or provider calls are used.',
            },
          ]),
        ),
        classifier: { available: true, model: 'clef-flash', needsReview: true, reason: null },
        pageChecks: { available: false, reason: 'No real page requests in the fixture workspace.' },
      };
    if (route === '/geo/settings') {
      if (method === 'PUT')
        this.settings = {
          ...this.settings,
          ...geoSettingsSchema.parse(body),
          revision: this.settings.revision + 1,
        };
      return this.settings;
    }
    if (route === '/geo/allowance')
      return {
        enabled: true,
        reason: null,
        today: 0,
        month: 0,
        globalToday: 0,
        limits: { projectDaily: 100, projectMonthly: 1000, globalDaily: 1000 },
        cooldownSeconds: 300,
      };
    if (route === '/geo/usage')
      return {
        collectors: { today: 0, month: 0, reportedCostUsd: 0, unknownCostAttempts: 0, attempts: 0 },
        processing: { today: 0, estimatedCostUsd: 0, unknownCostAttempts: 0, attempts: 0 },
        limits: { collectorDaily: 100, collectorMonthly: 1000, processingDaily: 100 },
        classifierModel: 'clef-flash',
        providerRequests: {
          total: 0,
          serpapi: 0,
          reportedCostUsd: 0,
          estimatedCostUsd: 0,
          unknownCostRequests: 0,
          reservedCostUsd: 0,
          spendCapUsd: 5,
          serpapiMonthlyCap: 250,
        },
      };
    if (route === '/geo/prompt-sets') {
      if (method === 'POST') {
        const input = geoPromptSetSchema.parse(body);
        const item = {
          id: input.id ?? crypto.randomUUID(),
          name: input.name,
          promptIds: input.promptIds,
          updatedAt: this.at.toISOString(),
        };
        this.promptSets = this.promptSets.filter((set) => set.id !== item.id).concat(item);
        return item;
      }
      return this.promptSets;
    }
    if (route.startsWith('/geo/prompt-sets/') && method === 'DELETE') {
      this.promptSets = this.promptSets.filter((set) => set.id !== route.split('/').at(-1));
      return { deleted: true };
    }
    if (route === '/geo/observations' && method === 'GET') {
      const all = filterRows(this.observations).slice().reverse(),
        cursor = url.searchParams.get('cursor'),
        offset = cursor ? Number(cursor) : 0;
      return {
        observations: all.slice(offset, offset + 20),
        nextCursor: all.length > offset + 20 ? String(offset + 20) : null,
      };
    }
    if (route === '/geo/analyses') return this.analyses.slice().reverse();
    if (route === '/geo/sources')
      return sourceOpportunities(
        this.evidence().filter((row) => filterRows([row.observation]).length > 0),
      );
    if (route === '/geo/trends') {
      const observations = filterRows(this.observations),
        ids = new Set(observations.map((row) => row.id)),
        rows = this.metricRows().filter((row) => ids.has(row.id));
      this.freeze(await dailySamples(rows, 'trend'));
      return {
        version: geoMeasurementVersion,
        asOf: this.at.toISOString(),
        samples: Array.from(this.samples.values()).filter(
          (sample) => sample.series === 'trend' && ids.has(sample.observationId),
        ),
        captures: observations.length,
        classifiedCaptures: observations.length,
        method:
          'Synthetic fixture data. First eligible sample per cohort and UTC day; never production monitoring results.',
      };
    }
    if (route === '/geo/runs' && method === 'POST') {
      const input = geoRunRequestSchema.parse(body),
        hash = JSON.stringify({ path, body }),
        replay = this.mutations.get(input.requestId);
      if (replay) {
        if (replay.hash !== hash) throw new Error('IDEMPOTENCY_CONFLICT');
        return replay.value;
      }
      this.at = new Date(Math.max(Date.now(), this.at.getTime() + 1));
      const run = this.collect(
        this.at,
        this.events.some((event) => event.kind === 'completed'),
        input,
      );
      this.syncActions();
      this.mutations.set(input.requestId, { hash, value: run });
      return run;
    }
    if (route === '/geo/runs' && method === 'GET')
      return {
        runs: [...this.runs]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 10)
          .map(({ items, ...run }) => ({
            ...run,
            successfulCount: items.filter((item) => item.status === 'succeeded').length,
            totalCount: items.length,
          })),
        dailyOutcomes: [],
      };
    if (route.startsWith('/geo/runs/') && method === 'GET') {
      const run = this.runs.find((run) => run.id === route.split('/')[3]);
      if (!run) throw new Error('Fixture run unavailable');
      return route.endsWith('/attempts') ? [] : run;
    }
    if (route.startsWith('/geo/observations/')) {
      const observation = this.observations.find((row) => row.id === route.split('/')[3]);
      if (!observation) throw new Error('Fixture observation unavailable');
      if (route.endsWith('/raw'))
        return {
          observationId: observation.id,
          capturedAt: observation.capturedAt,
          requestedAt: this.runs.find((run) => run.id === observation.runId)?.createdAt ?? null,
          context: observation.context,
          provenance: 'Synthetic fixture adapter; no actual provider response.',
          raw: observation.capture.raw,
        };
      if (route.endsWith('/analyses'))
        return this.analyses.filter((a) => a.observationId === observation.id);
      if (route.endsWith('/page-checks')) return [];
      return observation;
    }
    if (route === '/geo/actions') return this.actions;
    if (route.startsWith('/geo/actions/')) {
      const action = this.actions.find((action) => action.id === route.split('/')[3]);
      if (!action) throw new Error('Fixture action unavailable');
      if (route.endsWith('/measurements')) return this.measurements(action);
      if (method === 'GET') return this.detail(action);
      if (route.endsWith('/follow-ups')) {
        const input = geoFollowUpSchema.parse(body);
        const hash = JSON.stringify({ path, body }),
          replay = this.mutations.get(input.requestId);
        if (replay) {
          if (replay.hash !== hash) throw new Error('IDEMPOTENCY_CONFLICT');
          return replay.value;
        }
        if (input.revision !== action.revision) throw new Error('GEO_ACTION_CHANGED');
        if (action.category !== 'owned' || !belongsToDomain(input.targetUrl, action.targetDomain))
          throw new Error('GEO_FOLLOW_UP_INVALID_TARGET');
        const sourceProofs = this.detail(action).evidence;
        const selected = input.proofs.map((proof) => {
          const match = sourceProofs.find(
            (row) =>
              row.observationId === proof.observationId && row.analysisId === proof.analysisId,
          );
          const observation = this.observations.find((row) => row.id === proof.observationId);
          const analysis = this.analyses.find((row) => row.id === proof.analysisId);
          if (
            !match ||
            observation?.capture.quality !== 'complete' ||
            analysis?.classification?.answerQuality !== 'usable'
          )
            throw new Error('GEO_FOLLOW_UP_INVALID_PROOF');
          return structuredClone(match);
        });
        if (
          new Set(
            selected.map(
              (proof) => `${proof.scope.context.promptId}:${proof.scope.context.engine}`,
            ),
          ).size !== selected.length
        )
          throw new Error('GEO_FOLLOW_UP_INVALID_PROOF');
        const next: GeoAction = {
          ...structuredClone(action),
          id: `fixture-follow-up-${input.requestId}`,
          dedupeKey: `follow-up:${action.id}:${input.requestId}`,
          status: 'accepted',
          revision: 1,
          checkedIds: [],
          notes: '',
          targetUrl: input.targetUrl,
          createdAt: this.at.toISOString(),
          updatedAt: this.at.toISOString(),
          scopes: selected.map((proof) => proof.scope),
          evidenceCount: selected.length,
        };
        this.actions.push(next);
        this.followUpEvidence.set(next.id, selected);
        this.events.push({
          id: input.requestId,
          actionId: next.id,
          kind: 'accepted',
          recordedAt: this.at.toISOString(),
          details: {
            ...input,
            sourceActionId: action.id,
            excludedProofs: sourceProofs
              .filter((proof) => !input.proofs.some((row) => row.analysisId === proof.analysisId))
              .map(({ observationId, analysisId }) => ({ observationId, analysisId })),
          },
          scopes: structuredClone(next.scopes),
          evidenceIds: selected.flatMap((proof) => proof.evidenceIds),
        });
        const result = structuredClone(this.detail(next));
        this.mutations.set(input.requestId, { hash, value: result });
        return result;
      }
      const completion = route.endsWith('/complete'),
        reopened = route.endsWith('/reopen');
      const input = completion
        ? geoCompletionSchema.parse(body)
        : reopened
          ? geoReopenSchema.parse(body)
          : geoActionPatchSchema.parse(body);
      const hash = JSON.stringify({ path, body }),
        replay = this.mutations.get(input.requestId);
      if (replay) {
        if (replay.hash !== hash) throw new Error('IDEMPOTENCY_CONFLICT');
        return replay.value;
      }
      if (input.revision !== action.revision) throw new Error('GEO_ACTION_CHANGED');
      if (completion) {
        if (action.status === 'completed' || action.status === 'dismissed')
          throw new Error('GEO_ACTION_CHANGED');
        const details = geoCompletionSchema.parse(body);
        if (Date.parse(details.implementedAt) > this.at.getTime())
          throw new Error('INVALID_IMPLEMENTATION_TIME');
        action.status = 'completed';
      } else if (reopened) {
        if (action.status !== 'completed') throw new Error('GEO_ACTION_CHANGED');
        action.status = 'in_progress';
      } else {
        if (action.status === 'completed') throw new Error('GEO_ACTION_REOPEN_REQUIRED');
        const patch = geoActionPatchSchema.parse(body);
        if (patch.checkedIds?.some((id) => !action.checklist.some((step) => step.id === id)))
          throw new Error('INVALID_CHECKLIST');
        action.status = patch.status ?? action.status;
        action.checkedIds = patch.checkedIds ?? action.checkedIds;
        action.notes = patch.notes ?? action.notes;
      }
      action.revision++;
      action.updatedAt = this.at.toISOString();
      this.events.push({
        id: crypto.randomUUID(),
        actionId: action.id,
        kind: completion ? 'completed' : reopened ? 'reopened' : 'progress',
        recordedAt: this.at.toISOString(),
        details: { ...input },
        scopes: structuredClone(action.scopes),
        evidenceIds: action.scopes.map((scope) => scope.observationId),
      });
      this.mutations.set(input.requestId, { hash, value: structuredClone(action) });
      return action;
    }
    throw new Error(`Fixture route unavailable: ${method} ${route}. No live request was made.`);
  }
}
