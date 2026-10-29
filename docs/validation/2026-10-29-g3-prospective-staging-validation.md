# Prospective G3 staging validation — 29 October 2026

**Three new captures and three analyses completed; human review is pending. G3 and the full public MVP plan are not yet complete.** This follows the [staging guard release](2026-10-28-g3-staging-release.md). The owner subsequently authorized its previously proposed additional test allowance of at most $1.51.

## Execution and cost

Before dispatch, a private manifest froze three new prompt families, the existing `geo-rubric-2` / `geo-policy-2` method, the built Worker hash, the call limits and acceptance criteria. Two prompts are unbranded purchase/evidence questions; one explicitly names CiteScout and its configured competitors. The branded case tests explicit brand handling and is not organic discovery evidence. No model, provider, research instruction or output-token setting changed.

Exactly three Perplexity captures and three `clef-flash` analyses completed, with no retry, replacement, or other engine call. All three captures have provider-derived `complete` status; this is not yet a human judgment of answer usefulness or classifier quality. Counts rose from 6 to 9 Perplexity requests and 20 to 23 classifier requests; Anthropic, OpenAI and SerpApi counts stayed unchanged.

| Measure                                              |         USD |
| ---------------------------------------------------- | ----------: |
| Additional reservation allowance                     |       1.506 |
| Perplexity charges reported for these three requests |    0.009430 |
| Classifier estimate from returned usage              | 0.000334932 |
| Combined recorded/estimated direct cost              | 0.009764932 |

These are not reconciled invoices or package margin validation. The reservation ceiling is deliberately larger than the observed charges. Shared search subscriptions, infrastructure, payment fees, failures and customer-volume economics remain part of U3.

The temporary cumulative test ceiling was $6.41 instead of $4.90, with three additional observation attempts and provider-specific cumulative quotas. No counters were reset. The owner-test expiration was renewed for one hour in a version-scoped secret; no provider key was read or replaced. Analysis had zero unrelated eligible backlog before activation. Global/project daily capture limits remained three, and other provider budgets were preserved.

The owner has no paid subscription for adding customer prompts. Three prompts were inserted as explicitly scoped operator-prepared validation data, without changing subscription or entitlement. The normal authenticated UI dispatched each run with one prompt and Perplexity selected. This does not certify customer onboarding or paid prompt CRUD.

## Restoration and configuration evidence

The temporary version was `adb49f35-c843-4e34-8afe-76b5eab5d301`. After the six calls completed, staging returned to `42dcfe1c-eb56-4668-bf60-982431a0be89` at 100%. Its entire version resource snapshot matches the pre-test version, including bindings and runtime. The exact schedule, original selected engines, daily monitoring off, and three original active prompts were preserved. Only the three added validation prompts were paused; their captures and analyses remain available.

Cloudflare rejected the initial ordinary version redeploy with error 10220 because the test-expiration secret had changed. Cloudflare's requested `force=true` API parameter then restored the explicitly named prior version and its previous secret bindings. No secret values were retrieved. All restored-version resources and schedules were rechecked.

**Important for future deployments:** the control-plane `/settings` response after a versions upload describes the latest uploaded settings, even when an earlier version serves traffic. In this run it still displayed the uploaded test variables after restoration. Read the active deployment's version bindings for the operative variable snapshot; do not blindly copy those inactive test settings into a future release. No public or production deployment occurred.

## Review protocol and tooling

The new local `prepare-g3` mode prepares only the 16 critical labels per answer: capture/answer quality, brand presence/stance, evidence support, fit, competitor stance, diagnoses and actions. The original answer, source metadata, context and available checks remain visible. All 48 labels start blank; all three prospective groups are held out. The mode does not assert independent provenance for arbitrary supplied data: this batch's pre-dispatch manifest supplies that evidence.

Source ownership/type and per-segment relevance accuracy are explicitly unmeasured by this narrower protocol. Structural quote and source-ID safety checks still run during scoring. The report uses `critical_fields_human_reviewed_real` after a completed real review and never automatically passes a release gate. No new report has been scored, and no human judgments have been filled by AI.

The full-review mode and original frozen packets are retained. The CLI now reconstructs each packet with its saved method and review scope instead of the newest defaults. Local review instructions display the actual answer count. A stale shared synthetic fixture was also corrected to persist the same rubric/policy it projects; generic action lifecycle tests use eligible Perplexity/OpenAI evidence. Google SerpApi partial-coverage guards remain unchanged.

Validation passed: 314 unit tests, 257 integration tests, 18 desktop/mobile evidence-review browser tests, project typecheck, build, V2 self-check, staging isolation, changed-file formatting and whitespace. Project lint passed with ignored private operational scripts excluded. Independent code-review receipts found no actionable defect in the tooling and fixture repairs; no paid external peer review ran. Existing large client chunk and dependency sourcemap warnings remain.

Local implementation commits: `997a2aa` (blinded critical review and legacy CLI reconstruction) and `8fa1132` (synthetic method/capture fixture repairs). Completed review runs were `20261029-075154-9dc1d865`, its fixture addendum, and its UI addendum. Five original frozen artifact hashes still match the previous checkpoint. The local helper and test changes do not require a Worker code release.

Private manifests, source exports, costs, screenshots and the still-blinded review are under ignored `research/private/g3-validation-2026-10-29/`, outside deployable assets. The original review is not replaced.

## Remaining owner work and release boundaries

1. Review the new answers without opening their classifier results first. Begin with answer 1's five **Jawaban** labels, save, then continue the remaining critical fields with guidance. Confirm the review only after all fields are complete; freeze/scoring follows that confirmation.
2. Any disagreement stays a finding or adjudication. Do not tune on these answers and reuse them as a fresh independent test. A three-answer Perplexity smoke does not establish broad accuracy or three-engine release quality.
3. U4 still needs separate G1, G2 and genuine post-action G4 receipts. The small validation batch does not generate after-action uplift evidence.
4. U3 needs actual invoice/rate/capacity evidence for the 60% contribution target. U5 needs the intended CiteScout merchant product and six authorized variant mappings. U6 needs the real billing lifecycle and production-copy restore/rollout evidence. Prices, other provider budgets, customer entitlement and production remain unchanged.
