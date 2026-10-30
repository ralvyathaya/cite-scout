---
title: CiteScout public paid MVP readiness
date: 2026-10-22
execution: code
product_contract_source: user-approved-audit-2026-10-22
---

# CiteScout public paid MVP readiness

## Summary

This is the next implementation plan produced by the approved audit, not permission to execute its changes. The current request ends after delivering audit and planning artifacts. [Audit findings and evidence](../audits/2026-10-22-public-mvp-audit.md) are authoritative prerequisites; reviewed code is `1379ddf`.

The public MVP serves one brand/account for B2B SaaS founders: setup → fixed buyer prompts → saved AI answers/sources → reviewable findings → action → recorded implementation → comparable later measurements. Public paid readiness includes billing, access control, delivery capacity, honest claims and rollback. The current $19 Perplexity offer is not an approved price/entitlement for the full GEO workflow.

## Product Contract

### Requirements

- R1. Preserve the current layout/navigation, Switzer/Newsreader, neutral sidebar, compact tables, existing components and disclosures. Local fixes only; a substantial redesign requires a separate preview and decision.
- R2. Preserve tenant ownership, raw evidence, versions, unknown/partial/no-feature states, ledger history and existing paid rights. No resetting test counters or rewriting old captures to pass a gate.
- R3. Fresh paid work requires an environment-matching valid subscription; readable saved results do not. Existing staging owner exceptions remain staging-only.
- R4. Production request admission must enforce an explicitly approved cost policy and request capacity. Unknown cost is not zero; SerpApi paid usage must not be recorded as free.
- R5. Customer copy, package, checkout variant, entitlement and published limits must describe the same approved offer. Keep existing $19 Perplexity customers' rights intact.
- R6. Production receives reviewed additive migrations, bindings, configuration and compatible code through a separate authorized rollout. Keep the live cron and provider settings unless changes are explicitly included in that rollout manifest.
- R7. Validate real eligible captures, human-reviewed diagnoses and actual post-action measurements. Keep existing G1–G4 evidence gates; pilot smoke success alone does not establish public statistical accuracy.
- R8. Observation/source/citation/recommendation labels and daily comparable sampling retain current meanings. Do not imply causal uplift, financial ROI, hidden fan-out access or consumer-app parity.
- R9. No content agent, autopost, GA4/GSC, new collector/model, sentiment dashboard, control-group system, full-site crawler, Prisma/tRPC conversion or dependency expansion in this plan.

### Settled decisions

- Founder B2B SaaS and public paid readiness are the target (session-settled: user-directed). Governs R3–R7.
- Current UI is the baseline; broad redesign is not authorized (session-settled: user-directed). Governs R1.
- Agent content belongs after MVP, starting with reviewed drafts and manual publication (session-settled: user-approved). Governs R9.
- Current provider/budget/entitlement configuration stays unchanged during audit. Live activation needs an explicit scope and budget (session-settled: user-approved). Governs R2, R4–R6.

## Planning Contract

Keep React/Vite, Hono REST, Workers/D1 and Drizzle. Reuse `provider_call_reservations`, `geo_provider_requests`, processing attempts, action events and frozen samples. A public-launch cost policy is a specific approved configuration, not the existing `GEO_INTERNAL_TEST_*` staging allowance renamed as customer credits.

The initial implementation boundary can cover U1 and U2 without selecting a new commercial price or spending money. U3's final configuration and U4/U6's live execution remain gated by the manifest below. This plan must not be described as fully authorized to activate production.

### Commercial release manifest: unresolved owner decisions

Before implementing changed package entitlements or activating any public GEO feature, the owner must approve a manifest containing:

1. Included feature bundle and exact surfaces; whether it is an additional offer or an explicitly approved extension of the existing Perplexity plan.
2. Price and checkout variant mapping, treatment of existing subscribers, maximum prompts, selected engines, frequency and daily/monthly observation limits.
3. Global/project USD limits, per-provider cost/reservation assumptions, SerpApi account plan, failure/unknown-cost stop behavior and expected initial account capacity.
4. Separate staging verification allowance and any final production billing/provider transaction allowance, with exact scope and stop conditions.

The audit deliberately supplies scenarios instead of inventing these commercial numbers. Until approved, retain existing price/entitlements and block release. No implementer may resolve this by silently enabling all GEO features for an active $19 subscription.

## Implementation Units

### U1. Separate test/live access consistently

**Requirements:** R2, R3, R5. **Dependencies:** none. **Evidence:** B2.

**Approach:** introduce the smallest shared environment-aware subscription policy around existing entitlement reads and conditional writes. A valid subscription must match `LEMON_SQUEEZY_TEST_MODE`; active/cancelled-through-period semantics remain unchanged. Retained opposite-mode subscriptions and answers stay stored. Preserve explicit staging owner grants without enabling them in production.

**Touchpoints:** `src/server/scan-policy.ts`, `src/server/v2/read-model.ts`, billing availability/readers and collector access callers. Search every paid-predicate caller before modifying the shared interface.

**Tests:** extend `tests/unit/entitlements.test.ts`, `tests/integration/billing-lifecycle.test.ts`, `tests/integration/geo-runs.test.ts` and relevant legacy scan coverage. Start with the synthetic counterexample from the audit: active test subscription in a live environment must not admit new work. Cover matching live/test modes, cancelled end time, expired/unpaid, queued work losing access, staging grant and readable retained evidence. Test UI availability and atomic SQL policy agreement.

**Acceptance:** switching billing mode cannot promote a retained test payment into live paid rights; no historical row needs deletion.

### U2. Apply paid access to fresh processing

**Requirements:** R2, R3. **Dependencies:** U1. **Evidence:** B3.

**Approach:** use the shared policy at fresh analysis/page admission, automatic sweep and worker dispatch. Keep completed cache reads available. Subscription expiry between enqueue and execution must stop new paid dispatch while retaining the record and original evidence. Do not widen source/page targets or change classifier/model behavior.

**Touchpoints/tests:** `src/server/v2/analysis.ts`, related analysis/page POST routes; extend `tests/integration/geo-analysis.test.ts`, `tests/integration/geo-api.test.ts` and `tests/integration/geo-readiness.test.ts`.

**Scenarios:** expired owner with uncached saved capture, expired owner reading completed cache, other-tenant ID, paid owner within quota, automatic sweep over expired accounts, subscription revoked after enqueue, paused processing, and request replay. Use a synthetic provider spy to prove zero dispatch for denied work.

**Acceptance:** old evidence remains readable; only currently authorized fresh processing can consume resources.

### U3. Production cost admission and truthful accounting

**Requirements:** R2, R4, R5. **Dependencies:** U1; approved cost/package manifest before final policy configuration. **Evidence:** B4/B5 and audit section 6.

**Approach:** extend the existing durable ledger with explicit production limits rather than a new service/table. Admission must reserve the configured provider amount atomically under global/project dollar and request limits before HTTP. Preserve started/uncertain/unknown entries and require operator reconciliation before the policy permits further spend. Keep staged owner ceilings independent. SerpApi estimates need an approved pricing/account-allocation basis; zero is allowed only under verified available free allowance, never an unqualified fixed pricing version. Vendor-side billing limits remain separate from application estimates.

**Touchpoints/tests:** config/bindings, `geo-provider-budget`, readiness/usage and collector/processing callers; extend `tests/unit/config.test.ts`, `tests/integration/geo-four-engine.test.ts`, `tests/integration/geo-runs.test.ts` and processing budget coverage. No model/prompt/sampling change is part of this work.

**Scenarios:** absent/zero production policy, simultaneous reservations at the USD boundary, request-count versus observation-count limits, second Google request, paid SerpApi, exhausted shared free allowance, unknown timeout cost, replay, month/day boundaries and account deletion preserving accounting. Ensure every denied request has zero external dispatch.

**Acceptance:** positive request quotas alone cannot bypass the approved production dollar policy; customer Billing still shows the approved package/usage rather than internal provider charges.

### U4. Close real evidence gates and document the limits

**Requirements:** R2, R7, R8. **Dependencies:** offline evidence work can start immediately; new paid tests require the manifest's explicit allowance. **Evidence:** B7.

**Approach:** complete the existing 20-record blind human review before viewing/scoring classifier decisions; freeze labels using the existing evaluation tooling. Never generate or fill human judgments automatically. Reuse stored raw results for parser replay. Preserve partial/no-feature records; obtain only explicitly authorized missing complete captures and actual post-action samples. Keep each engine/surface's result separate.

**Touchpoints/tests:** existing evaluation CLI/report and founder gate receipts; `tests/unit/geo-evaluation.test.ts`, parser unit tests, `tests/integration/geo-measurement.test.ts`, `tests/e2e/geo-evidence-review.spec.ts` and `tests/e2e/geo-overview.spec.ts`.

**Scenarios:** complete/partial/refusal/no-feature, invalid quote/citation, model/config/output-limit changes, zero denominator, missing UTC days, an action pin with no post sample, requests begun before implementation, matching actual later samples, and unchanged/worsened outcomes. Keep unavailable scopes inconclusive.

**Acceptance:** G1–G4 receive separate pass/unmet receipts with actual scope/counts/costs. Public claims reflect the measured coverage, not model probabilities or a generalized accuracy percentage. A failure is a retained finding, not authority to switch models/surfaces.

**29 October checkpoint:** The earlier [critical labels are frozen and scored](../validation/2026-10-29-g3-frozen-critical-results.md); all 22 raw disagreements plus the additional identity concern have separate owner adjudication, with no fields pending for that earlier batch. The [policy-3 entity guard](../validation/2026-10-29-g3-entity-abstention.md) is deployed only to staging. The owner approved its bounded prospective validation: [three new captures and three analyses completed](../validation/2026-10-29-g3-policy3-prospective-validation.md), with $0.005836256 combined recorded/estimated direct cost, no other-provider calls, and complete operational restoration. The owner then completed all 48 new critical labels; [frozen scoring](../validation/2026-10-29-g3-policy3-frozen-results.md) retains 23 raw differences and isolates excessive guard abstention in six presence/stance fields. Separate assisted adjudication is in progress and leaves the independent labels untouched. G3, U4 and the overall public-MVP plan remain open; correcting an exposed development case does not create independent release evidence.

**30 October checkpoint:** owner review is complete for the policy-3 batch: nine explicit corrections, six guard defects and eight retained different-contract judgments account for all 23 differences; no further labels are requested. The [versioned policy-4 fix](../validation/2026-10-30-g3-grounded-entity-guard.md) passed 361 unit, 259 integration and 22 related browser tests, lint/build/typecheck, formatting and V2 self-check. Twenty-six historical classifications and three frozen reports replay unchanged. Staging version `50148678-c686-4e6a-a9c2-b2d7403094df` preserves all 54 operational bindings, runtime, schedules, original prompt/engine selection and provider-request counts; zero new provider calls and no production change. The six recovered fields are exposed development replay. G3 needs separately authorized prospective evidence; G1/G2/G4, actual margin evidence, merchant lifecycle and production recovery remain open. The implementation plan is not fully complete or ready for public paid release.

### U5. Align the approved offer and customer expectations

**Requirements:** R1, R5, R8, R9. **Dependencies:** owner-approved commercial manifest; U1–U3 where the offer changes access. **Evidence:** B5/B6.

**Approach:** update only necessary pricing/help/status wording and package access for the approved offer. Manual onboarding stays available when suggestions are disabled. Explain what one monitoring attempt counts, when daily checks can be deferred, and what saved evidence survives cancellation. Do not present an owner allowance as a subscription or the current preview as included before approval.

**Touchpoints/tests:** pricing/FAQ and existing Billing/Settings/onboarding components; extend `tests/e2e/public.spec.ts`, `tests/e2e/customer-presentation.spec.ts`, `tests/e2e/workspace.spec.ts`, `tests/e2e/claude-engine.spec.ts`, and `tests/integration/onboarding.test.ts` as applicable.

**Scenarios:** new unsubscribed account, existing subscriber, test/live mismatch, paid checkout return without a verified webhook, quotas reached, suggestion unavailable, paused engine and retained evidence. Opening pages, refresh and disclosure must not dispatch monitoring. Preserve navigation, fonts, compact tables and mobile keyboard behavior; compare screenshots to the current baseline.

**Acceptance:** advertised, charged and authorized features agree; the UI has no broad redesign.

### U6. Rehearse migration, billing and production rollout

**30 October merchant checkpoint:** the owner supplied a [verified six-variant test catalog](../validation/2026-10-30-billing-test-catalog.md). Its staging IDs and encrypted billing bindings are deployed with checkout disabled; code, providers, budgets, subscriptions, runtime and schedules are unchanged. Store ID is `476459` (the supplied `47645` omitted its last digit). The owner then authorized [callback-only Access routing and checkout smoke](../validation/2026-10-30-staging-webhook-checkout.md). The local guard update and 84 related tests pass, and six real merchant API Test-mode checkout records were verified without purchasing. Cloudflare denied the routing write with 403; a scoped Access write token is pending. No Access rule, staging callback, new deployment or entitlement changed during that step. Authenticated checkout, event delivery and lifecycle remain unverified; no billing or overall MVP gate pass is claimed.

**30 October connection checkpoint:** after the owner supplied the scoped token, [callback-only Access routing and the separate test webhook were connected](../validation/2026-10-30-staging-billing-connected.md). The original root owner-only policy is unchanged; sibling and descendant paths remain protected. Fourteen live boundary probes and all six hosted Test-mode checkout pages pass. Active staging version `4b9f6a66-a781-4aac-acd5-6281b1d9b418` changes only `BILLING_PLANS_ENABLED` to true, preserving application code, all other bindings, budgets, runtime, schedules, original prompts/engines, subscriptions and provider request counts. Eighty-four related tests and typecheck pass. No purchase was submitted; authenticated checkout, actual merchant event delivery, portal/payment lifecycle and recovery remain open. This does not complete U6 or the public MVP.

**30 October lifecycle preflight checkpoint:** the [obsolete production-directed Test-mode webhook was retired](../validation/2026-10-30-billing-lifecycle-preflight.md); the staging Test-mode webhook remains and no live webhook changed. Staging configuration, schedules, owner project/subscriptions and provider counts compared unchanged. The actual shared SerpApi allowance is Free Plan, 250 searches/month: one Growth account requires at least 465 Google requests per 31 days, before headroom. Capacity and the 60% margin gate therefore remain unmet without a reviewed commercial cost manifest. A SELECT-only production preflight confirmed two users, one active Test-mode subscription and only migrations 0000/0001. Synthetic backup/upgrade/restore checks pass, but no production export or recovery rehearsal occurred. Billing lifecycle awaits a separate normally authenticated staging test account; no purchase, entitlement mutation, provider request or new deployment was performed in this step.

**Requirements:** R2, R4–R8. **Dependencies:** U1–U5, manifest, real gate receipts, separate migration/rollout authority. **Evidence:** B1/B6.

**Approach:** snapshot active production configuration and schema, prepare a backup/restore strategy, and rehearse migrations 0002–0011 against an isolated copy containing the old schema and retained test subscription. Check each pending SQL migration rather than assuming additivity. Additive changes must preserve old evidence/accounting and the test/live access fix must prevent promotion of retained test rows. No new database is needed merely to reset allowances.

Validate test-mode billing lifecycle in staging with explicitly supplied environment-specific credentials and identifiers. Then validate the approved live billing flow without using synthetic subscription rows as proof. Use versioned deployment artifacts, reviewed bindings and `--keep-vars`; compare the full before/after manifest. Cron/provider/budget changes must be intentional, enumerated and approved rather than inherited from local defaults.

**Scenarios/checks:** migrate old schema, first setup/login, original evidence links, test/live webhook rejection, duplicate/out-of-order webhook, renewal, cancellation through period end, payment failure/recovery, refund handling under the published policy, incomplete provider setup, D1/HTTP failure and restore rehearsal. Extend `tests/integration/billing-lifecycle.test.ts` and existing migration/self-check coverage for code changes.

**Acceptance:** billing/feature/access/cost/schema/runtime receipts all refer to the same release. Do not accept public payment for an unverified package. Production release remains blocked until this receipt exists.

## Verification Contract

- Baseline: the audit ran 260 unit, 185 integration and 136 targeted desktop/mobile browser tests, self-check V2, lint and build successfully. The two newly found access gaps need meaningful regression tests; existing green tests do not close them.
- New money/access branches use failing synthetic regressions first, including atomic admission and execution boundaries. Provider fixtures stay separate from live verification.
- For changed UI/copy, keep current 1280/1440 × 720 and 320/390px layouts, source icons, breadcrumbs, focus restoration and contrast. Do not update screenshots merely to accept accidental changes.
- Run typecheck, lint, relevant unit/integration suites, V2 self-check, build, changed-file formatting and affected Playwright tests before staging review. Broaden testing only for touched behavior or failures.
- Validate capacity against the approved initial account count: account count × prompts × engines × frequency must fit both observation quotas and real provider requests, including Google fan-out requests. Document account-plan steps and headroom; do not promise unlimited capacity.

## Rollout and rollback

The operator owns activation. Snapshot settings/secrets-presence/bindings/cron/deployment IDs before and after. Deploy only to staging first. Provider-funded tests, billing transactions and production rollout have their own explicit scope/stop conditions.

Stop new GEO submissions, analysis and page work using the existing flags; stop legacy scan starts separately if that service is involved. Retain raw evidence, admitted jobs and all money rows; already-submitted work may still settle. Do not treat disabling new submissions as reversing an incurred charge. Re-enable only after operator reconciliation and the same approved cost/access policy passes.

Use the last tested schema-compatible application version for code rollback. Do not drop additive tables or reset ledgers as rollback. Backup restoration is a separate authorized recovery operation. The current audit has not demonstrated rollback latency or a production restore drill.

## Definition of Done

Public paid GEO is ready only when U1–U6 are complete, existing evidence gates are assessed, the commercial manifest is approved, cost/capacity and billing are verified, and a tested rollback path exists. All original data and existing paid rights remain preserved. Code presence, a fixture demonstration, an owner grant or a checkout redirect alone is insufficient.

The approved audit deliverable is complete when its report, runtime receipt, reusable prompt and this plan are saved and checked. That completion does not grant authority to execute U1–U6 or activate a service.

## Roadmap after MVP

Evidence-linked content brief first, then reviewed drafts with manual publication. Reuse the original prompt, answer/source IDs and the user's verified product facts; keep a path back to evidence and later measurement. Require demonstrated repeated customer demand before building publishing integrations. Reddit commercial access and Quora publication support need explicit platform verification. GA4/GSC, full-site GEO auditing, sentiment, control experiments and dedicated fan-out analytics remain separate future scopes.
