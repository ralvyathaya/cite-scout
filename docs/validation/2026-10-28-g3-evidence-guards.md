# G3 evidence guards — 28 October 2026

**Status: code fixes verified; G3 is not passed.** This follows the [guided review and archive investigation](2026-10-28-g3-adjudication-and-google-capture.md). The [MVP plan](../plans/2026-10-22-public-mvp-readiness-plan.md) still has real-evidence, commercial and rollout gates.

## Versioned corrections

- New analysis uses `geo-rubric-2` / `geo-policy-2`, with the existing classifier/model. Capture quality is supplied explicitly. Empty/no-feature answers produce unknown answer quality, presence and stance. Incomplete captures or classifier excerpts cannot establish whole-answer absence. Explicit positive evidence may remain visible but its scope stays partial, excluding it from complete-sample metrics.
- Known brand absence in a complete answer implies no applicable brand stance. Missing or ambiguous presence cannot produce a positive or negative stance. Original native decisions/probabilities remain unchanged and available for inspection.
- The stance rubric distinguishes direct recommendations from recommendations contingent on buyer needs, for both brand and competitors. This instruction change has synthetic checks; real adherence is not yet verified.
- Processing uses the versions saved with each queued job. Version-1 jobs retain their original method, and unsupported version combinations fail before a classifier reservation or call. New analysis creates a different input hash. Existing captures, labels, classifications and measurement cohorts are not relabeled.
- Automatic analysis skips partial, no-feature and empty captures before consuming inference allowance. An explicitly requested analysis of partial evidence remains available, with guarded unknown values and partial scope. Enabling a bounded validation batch must not silently classify the older partial Claude backlog.
- Prospective Google/SerpApi version-4 captures remain **partial** because structured JSON alone did not establish complete answer coverage in the archived cases. Text and sources remain saved; no-feature stays distinct. No HTML fallback, new HTTP request, provider switch or extra dependency was added. Synthetic workspace captures follow this same limitation.
- New-policy reanalysis also treats older Google/SerpApi coverage as unverified and partial, without changing its saved capture quality. Automatic analysis excludes it. The legacy method still replays the original historical output; it is not silently upgraded to the new policy.

The Google guard is conservative: even genuinely complete structured answers remain outside metrics requiring complete captures until coverage can be verified. It prevents unsupported completeness claims; it does not repair upstream extraction or establish Google readiness. Historical version-2 captures keep their original saved quality and remain documented discrepancies.

## Evaluation compatibility and task scope

New packets use scoring version `geo-local-scoring-4`. Repeated-source task evaluation uses the actual multi-observation generator, isolated by frozen partition, project, brand/competitor context and classification method. A task counts for a record only when its proof list includes that observation. Calibration evidence cannot satisfy a held-out task threshold. No missing diagnosis is silently relabeled as a proven technical cause.

Old packets replay their original methods and singleton task semantics, retaining scoring version 2 or 3. The real 20-record report still reproduces exactly with native fetch blocked; all five baseline byte hashes remain unchanged. The separately approved 48-field adjudication remains assisted, outside frozen gold. Replaying old native answers through the new projection is a development check, not new model inference or independent accuracy.

## AI change assessment

**Class:** guardrail and rubric change. **Decision:** staging code only; no public promotion or paid request without the test scope below.

**Expected improvement:** stop false whole-answer absence on empty/partial input, inconsistent stance for absent brands, and singleton false negatives for repeated-source tasks. Failing synthetic regressions reproduced these cases before the fixes.

**Possible degradation:** conservative abstention lowers coverage; Google complete-sample metrics remain unavailable. More explicit instructions may slightly increase classifier input tokens. Rubric/policy changes split measurement cohorts, so old/new results must not be presented as comparable uplift. Real conditional-recommendation precision, latency and invoice costs remain unmeasured.

**Blast radius:** new analysis jobs, Google/SerpApi captures, associated Sources/tasks/metrics, and new local evaluation packets. The owner is informed before staging; no messaging to external parties is authorized. Rollback restores the previous code version without deleting evidence or upgrading old contexts.

## Actual remaining evidence and budget boundary

Read-only staging inventory found 22 saved captures: six partial OpenAI, four historically complete-but-disputed Google, five complete Perplexity, five Bing no-feature and two partial Claude. There are no additional saved complete captures available beyond the original reviewed set. Those old answers have now been exposed during diagnosis/tuning; they cannot become fresh independent validation of the new rubric.

Active staging has analysis disabled, Perplexity/classifier test limits zero and processing daily caps zero. The cumulative test spend cap is **$4.90**; ledger exposure using the existing conservative reservation rule is **$4.896736**, not an invoice total. No budget, provider, price, entitlement or schedule was changed to create room.

A concrete next test proposal requires explicit owner approval as an exception to the unchanged-test-budget boundary:

1. Freeze this release's code/rubric and three new buyer-prompt families before receiving answers. Keep existing brand, selected engines and daily scheduling unchanged.
2. Allow at most **three Perplexity captures and three classifier calls**, without retries, fallback calls or another engine. Use a temporary owner-only staging allowance; retain the same provider/model and global safeguards.
3. Permit at most **$1.51 additional reserved test exposure**, taking the cumulative cap from **$4.90 to $6.41**. Keep the previously used conservative reservation ceilings: $0.50 per capture and $0.002 per classifier request, at most $1.506 for the six calls. These are accounting ceilings, not quoted provider prices or an invoice forecast. Verify current rate/output bounds and access first; do not lower reservations to manufacture headroom or dispatch if their safety is not defensible.
4. Test quotas are cumulative: Perplexity six used becomes a ceiling of nine; classifier 20 used becomes 23. Observation allowance and monthly technical cap may need 27 to 30. OpenAI, SerpApi, Anthropic limits, subscription rights and prices stay unchanged. Processing caps become three only for this scoped test; restore the original staging version/settings afterward. Any renewed owner test window is limited to this batch.
5. Preserve original evidence and keep new classifier decisions hidden during human labeling. Review complete/usable captures before freezing/scoring the new packet. Three attempts do not guarantee three eligible answers or a G3 pass. New prompts are disabled after the bounded test; saved evidence is retained.

This allowance has **not** been approved or applied. Existing zero limits are not bypassed. G3 additionally needs zero critical unsupported claims in its declared validation scope, sufficient complete/usable independent examples and clear untested-class/surface limits. Public MVP readiness also requires the separate G1/G2/G4, merchant lifecycle, economics and recovery evidence.

## Verification

Local checks pass: **313 unit tests**, **53 targeted integration tests**, **22 desktop/mobile Playwright tests**, typecheck/build, lint, V2 self-check and staging isolation checks. Old frozen real scoring and byte hashes are unchanged. No new inference or capture was dispatched. The [staging release receipt](2026-10-28-g3-staging-release.md) confirms preserved bindings, settings, schedules and existing test limits.
