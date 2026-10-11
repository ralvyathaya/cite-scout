import type { GeoClassification, GeoDiagnosis, GeoPageCheck } from '../shared/geo-analysis';
import type { GeoObservation } from '../shared/geo';
import { belongsToDomain } from './geo-classification';
export function diagnoseGeo(
  observation: GeoObservation,
  classification: GeoClassification,
  checks: GeoPageCheck[] = [],
): GeoDiagnosis[] {
  if (
    observation.capture.quality !== 'complete' ||
    classification.scope !== 'complete' ||
    classification.answerQuality !== 'usable'
  )
    return [];
  const evidenceIds = classification.evidence
    .filter((e) => e.supportProbability >= 0.8)
    .map((e) => e.id);
  const issues: GeoDiagnosis[] = [];
  const problem = (
    type: GeoDiagnosis['type'],
    status: GeoDiagnosis['status'],
    reasonCode: string,
    missingChecks: string[],
    templateIds: GeoDiagnosis['templateIds'],
  ) => {
    const issue: GeoDiagnosis = {
      type,
      status,
      reasonCode,
      evidenceIds,
      missingChecks,
      templateIds,
      needsReview: true,
    };
    issues.push(issue);
    return issue;
  };
  const obstacle = checks.find(
    (check) =>
      check.status === 'checked' &&
      belongsToDomain(check.target, observation.context.brand.domain) &&
      ((check.httpStatus !== null && check.httpStatus >= 400) || check.noindex === true),
  );
  const ownedReference = observation.capture.sources.some(
    (source) =>
      source.referenceLevel !== 'retrieved' &&
      belongsToDomain(source.canonicalUrl, observation.context.brand.domain),
  );
  if (obstacle) {
    const issue = problem(
      'retrieval_problem',
      'supported',
      'measured_owned_page_obstacle',
      ['verify_engine_applicability'],
      ['fix_page_access'],
    );
    issue.targetUrl = obstacle.target;
    issue.checkIds = [obstacle.id];
  } else if (classification.brandPresence === 'absent' && !ownedReference)
    problem(
      'retrieval_problem',
      'suspected',
      'brand_and_owned_reference_not_observed',
      ['inspect_owned_page', 'verify_engine_applicability'],
      ['inspect_owned_page'],
    );
  if (['insufficient', 'contradicted'].includes(classification.evidenceSupport))
    problem(
      'evidence_problem',
      'suspected',
      'buyer_evidence_requires_verification',
      ['verify_current_product_fact', 'inspect_owned_page'],
      ['verify_buyer_evidence'],
    );
  if (
    Object.values(classification.fitByCriterion).some((fit) => fit === 'mismatch') ||
    classification.brandStance === 'discouraged'
  )
    problem(
      'recommendation_fit_problem',
      'suspected',
      'reported_rejection_or_fit_mismatch',
      ['verify_product_limitation'],
      ['clarify_product_fit'],
    );
  return issues;
}
