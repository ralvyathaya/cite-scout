import { belongsToDomain } from './geo-classification';
import type {
  GeoActionCandidate,
  GeoAnalyzedObservation,
  GeoSourceOpportunity,
} from '../shared/geo-actions';
const eligible = (row: GeoAnalyzedObservation) =>
  row.observation.capture.quality === 'complete' &&
  row.analysis.state === 'completed' &&
  row.analysis.classification?.scope === 'complete' &&
  row.analysis.classification.answerQuality === 'usable';
export function sourceOpportunities(input: GeoAnalyzedObservation[]): GeoSourceOpportunity[] {
  const firstAnalysis = new Map<string, GeoAnalyzedObservation>();
  for (const row of input
    .filter(eligible)
    .sort(
      (a, b) =>
        a.analysis.createdAt.localeCompare(b.analysis.createdAt) ||
        a.analysis.id.localeCompare(b.analysis.id),
    )) {
    if (!firstAnalysis.has(row.observation.id)) firstAnalysis.set(row.observation.id, row);
  }
  const rows = Array.from(firstAnalysis.values()),
    sources = new Map<string, GeoSourceOpportunity>();
  const dates = rows.map((row) => row.observation.capturedAt).sort();
  for (const row of rows) {
    const seen = new Set<string>(),
      returned = new Set<string>(),
      referenced = new Set<string>(),
      inline = new Set<string>();
    const competitorRecommended =
      row.analysis.classification?.competitors.some((competitor) =>
        ['recommended', 'conditional_recommendation'].includes(competitor.stance),
      ) ?? false;
    for (const source of row.observation.capture.sources) {
      const role = belongsToDomain(source.canonicalUrl, row.observation.context.brand.domain)
        ? 'owned'
        : row.observation.context.competitors.some((competitor) =>
              belongsToDomain(source.canonicalUrl, competitor.domain),
            )
          ? 'competitor_owned'
          : 'third_party';
      let opportunity = sources.get(source.canonicalUrl);
      if (!opportunity) {
        opportunity = {
          url: source.canonicalUrl,
          title: source.title,
          domain: new URL(source.canonicalUrl).hostname,
          role,
          observations: 0,
          denominator: rows.length,
          returnedResults: 0,
          answerReferences: 0,
          inlineReferences: 0,
          competitorCooccurrences: 0,
          competitorLinked: null,
          engines: [],
          observationIds: [],
          period: {
            from: dates[0] ?? row.observation.capturedAt,
            to: dates.at(-1) ?? row.observation.capturedAt,
          },
        };
        sources.set(source.canonicalUrl, opportunity);
      }
      if (opportunity.role !== role) opportunity.role = 'unknown';
      if (!seen.has(source.canonicalUrl)) {
        opportunity.observations++;
        opportunity.observationIds.push(row.observation.id);
        if (!opportunity.engines.includes(row.observation.engine))
          opportunity.engines.push(row.observation.engine);
        if (competitorRecommended) opportunity.competitorCooccurrences++;
        seen.add(source.canonicalUrl);
      }
      if (source.referenceLevel === 'retrieved' && !returned.has(source.canonicalUrl)) {
        opportunity.returnedResults++;
        returned.add(source.canonicalUrl);
      }
      if (source.referenceLevel !== 'retrieved' && !referenced.has(source.canonicalUrl)) {
        opportunity.answerReferences++;
        referenced.add(source.canonicalUrl);
      }
      if (source.referenceLevel === 'inline_verified' && !inline.has(source.canonicalUrl)) {
        opportunity.inlineReferences++;
        inline.add(source.canonicalUrl);
      }
    }
  }
  return Array.from(sources.values()).sort(
    (a, b) =>
      b.answerReferences - a.answerReferences ||
      b.observations - a.observations ||
      a.url.localeCompare(b.url),
  );
}
const ownedTemplates = {
  inspect_owned_page: {
    title: 'Inspect a buyer-relevant page',
    checklist: [
      'Choose the real page that answers this buyer prompt.',
      'Check public access and applicable robots/noindex/canonical signals.',
      'Check whether the page clearly identifies the product and the buyer use case.',
      'Record the URL, findings and next concrete change.',
    ],
    deliverable:
      'A page inspection note with the selected URL and measured or manually verified findings.',
    done: 'The real target URL and inspection findings are recorded; unverified index status stays unknown.',
  },
  fix_page_access: {
    title: 'Fix the measured page obstacle',
    checklist: [
      'Confirm the recorded HTTP/noindex obstacle applies to the monitored engine.',
      'Change the relevant access or page directive in your own tools.',
      'Recheck the endpoint and applicable directive.',
      'Record the actual URL and the change made.',
    ],
    deliverable: 'A recorded access/directive fix and verification result for the measured URL.',
    done: 'The change and verification result are recorded; future AI citation remains unproven.',
  },
  verify_buyer_evidence: {
    title: 'Verify and document buyer evidence',
    checklist: [
      'Identify the exact buyer claim that needs evidence.',
      'Inspect the actual product page and supplied source claim.',
      'Gather genuine product/customer evidence with method and scope.',
      'Record the URL and the verified finding or content change.',
    ],
    deliverable:
      'A factual evidence brief with claim, method, scope and publication or inspection URL.',
    done: 'Evidence and its limits are recorded; no invented product capability or customer proof.',
  },
  clarify_product_fit: {
    title: 'Verify the reported product-fit concern',
    checklist: [
      'Read the original reason for rejection in the observed answer.',
      'Check the real product capability and target segment.',
      'Clarify the limitation or relevant use case using true facts.',
      'Record the selected asset URL, evidence and change.',
    ],
    deliverable: 'A verified product-fit note and any user-performed clarification.',
    done: 'The limitation/use case and change are recorded; copy changes do not imply a missing capability was fixed.',
  },
} as const;
const evidence = (row: GeoAnalyzedObservation, ids: string[]) => ({
  observationId: row.observation.id,
  analysisId: row.analysis.id,
  evidenceIds: ids,
  scope: {
    observationId: row.observation.id,
    analysisId: row.analysis.id,
    context: row.observation.context,
    capturedAt: row.observation.capturedAt,
  },
});
export function actionCandidates(input: GeoAnalyzedObservation[]): GeoActionCandidate[] {
  const rows = input.filter(eligible),
    actions = new Map<string, GeoActionCandidate>();
  const merge = (candidate: GeoActionCandidate) => {
    const existing = actions.get(candidate.dedupeKey);
    if (existing)
      existing.evidence.push(
        ...candidate.evidence.filter(
          (proof) => !existing.evidence.some((saved) => saved.analysisId === proof.analysisId),
        ),
      );
    else actions.set(candidate.dedupeKey, candidate);
  };
  for (const row of rows)
    for (const diagnosis of row.analysis.diagnoses) {
      if (!['suspected', 'supported'].includes(diagnosis.status)) continue;
      for (const templateId of diagnosis.templateIds) {
        const template = ownedTemplates[templateId];
        const observedTarget =
          row.observation.capture.sources.find((source) =>
            belongsToDomain(source.canonicalUrl, row.observation.context.brand.domain),
          )?.canonicalUrl ?? null;
        const target =
          diagnosis.targetUrl &&
          belongsToDomain(diagnosis.targetUrl, row.observation.context.brand.domain)
            ? diagnosis.targetUrl
            : observedTarget;
        const asset =
          target ??
          `owned:${row.observation.context.brand.domain ?? row.observation.context.brand.id}`;
        const priority = diagnosis.status === 'supported' ? 1 : 3;
        merge({
          dedupeKey: JSON.stringify([
            row.observation.projectId,
            diagnosis.reasonCode,
            asset,
            templateId,
            '1',
          ]),
          templateId,
          templateVersion: 'geo-template-1',
          category: 'owned',
          issue: diagnosis.reasonCode,
          title: target ? `${template.title}: ${new URL(target).pathname}` : template.title,
          reason: `${diagnosis.status === 'supported' ? 'A measured obstacle is recorded' : 'The answer suggests an issue that still needs verification'} for “${row.observation.context.promptText}”. Missing checks: ${diagnosis.missingChecks.join(', ') || 'review the evidence'}.`,
          targetUrl: target,
          targetDomain: row.observation.context.brand.domain,
          priority,
          priorityReason:
            priority === 1
              ? 'Measured obstacle on the tracked website; verify engine applicability.'
              : 'Verification is required before deciding on an optimization.',
          effort: '30–60 minutes',
          checklist: template.checklist.map((text, index) => ({
            id: `step_${String(index + 1)}`,
            text,
          })),
          deliverable: template.deliverable,
          doneCriteria: template.done,
          needsReview: true,
          evidence: [evidence(row, diagnosis.evidenceIds)],
        });
      }
    }
  for (const source of sourceOpportunities(rows)) {
    if (
      source.role !== 'third_party' ||
      source.observations < 2 ||
      source.competitorCooccurrences === 0
    )
      continue;
    const associated = rows.filter((row) => source.observationIds.includes(row.observation.id));
    const projectId = associated[0]?.observation.projectId;
    if (!projectId) continue;
    merge({
      dedupeKey: JSON.stringify([
        projectId,
        'third_party_source_opportunity',
        source.url,
        'inspect_earned_source',
        '1',
      ]),
      templateId: 'inspect_earned_source',
      templateVersion: 'geo-template-1',
      category: 'earned',
      issue: 'third_party_source_opportunity',
      title: `Inspect the observed source on ${source.domain}`,
      reason: `Appeared in ${String(source.observations)} of ${String(source.denominator)} eligible observations (${String(source.answerReferences)} answer references, ${String(source.returnedResults)} returned results). Competitor recommendations co-occurred in ${String(source.competitorCooccurrences)} observations; direct competitor citation linkage is unavailable.`,
      targetUrl: source.url,
      targetDomain: source.domain,
      priority: 2,
      priorityReason:
        'Repeated observed source with competitor recommendation co-occurrence; inspect relevance before contributing.',
      effort: '30–90 minutes',
      checklist: [
        {
          id: 'step_1',
          text: 'Open this exact source and inspect the original buyer discussion or product facts.',
        },
        {
          id: 'step_2',
          text: 'Check platform rules and which profile, facts or relevant contribution you can legitimately provide.',
        },
        {
          id: 'step_3',
          text: 'Prepare accurate evidence that answers the actual question or corrects a factual gap.',
        },
        {
          id: 'step_4',
          text: 'Record any user-performed contribution/profile correction and its URL; do not claim guaranteed placement.',
        },
      ],
      deliverable:
        'A source-specific inspection/contribution brief, with platform rules, true evidence and a change URL.',
      doneCriteria:
        'The inspection and any manual contribution are recorded; relevance and platform rules were checked. Visibility outcome is measured separately.',
      needsReview: true,
      evidence: associated.map((row) => evidence(row, [])),
    });
  }
  return Array.from(actions.values()).sort(
    (a, b) => a.priority - b.priority || a.title.localeCompare(b.title),
  );
}
