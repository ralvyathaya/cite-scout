# Findings review and duplicate-field correction — 25 October 2026

Scope: continue U4–U6 through the local blind-review workflow. Prices, providers/models, active budgets, entitlement, subscription bindings and schedules are unchanged. No staging/production deployment, migration, paid provider call or merchant transaction was run.

## Human progress

The owner's primary Answer sections remain complete, and Findings/Tasks now have all 160 choices across 20 records. The first check found one missing `task.inspect_owned_page` at record 16; the owner filled and saved it. All 260 selected labels use the packet's allowed choices. The agent did not supply any judgments, change existing labels or read classifier predictions.

A private byte-preserved checkpoint is retained as `findings-draft-2026-10-25-4b0d06eda130.json`; labels SHA-256 is `4b0d06eda130e440247ef0f645918a8283df154ee728d42ffeaa27ab0c16c800`. The original packet SHA-256 remains `ba6f27ee54053d97cd413596893c295c5f1d16c41e35c2ce25fd599b4d977825`. The earlier primary draft remains available. None of these draft checkpoints is a full label lock or release approval.

## Confirmed tooling defect

`fieldOptions` in `scripts/evaluate-geo.ts` treated every question prefixed `evidence_` as a binary evidence-segment question. This included the choice question `evidence_support`, producing an extra `evidence.support` with yes/no/unknown choices in each record. The real primary field is `evidenceSupport`; `predictions` has that primary value and actual evidence segments, but no separate prediction for the duplicate. Requiring the duplicate therefore added reviewer work and could contaminate abstention/coverage counts.

The correction admits only `noul` segment questions to those generated fields. New packets omit the duplicate. Existing immutable packets remain usable: prepared-packet comparison recognizes only the exact original yes/no/unknown null placeholder; it does not remove anything from the saved packet. Freeze allows that legacy placeholder to stay null, while every actual label remains required. Scoring version `geo-local-scoring-2` excludes only this duplicate from metrics and reports its count/reason under `unscoredLegacyFields`.

Label locks still hash the entire original packet and human-label object, including legacy values. A changed legacy value after freezing is rejected. Unknown fields, modified actual evidence or missing actual labels are still rejected. This fixes a field with no separate prediction; it does not relax diagnosis safety requirements, alter classifier outputs or lower G3 acceptance criteria.

The loopback server shows only actual choices, rejects attempts to submit hidden duplicate choices and merges reviewed values without discarding the retained legacy placeholders. Counts now distinguish actual remaining work from those placeholders. Competitor IDs in the evidence section are rendered as names; evidence/fit help describes the supplied facts and quote context without suggesting judgments.

| Owner packet                                       | Count |
| -------------------------------------------------- | ----: |
| Original stored fields                             | 1,249 |
| Duplicate legacy placeholders retained, not scored |    20 |
| Actual required review fields                      | 1,229 |
| Saved human choices                                |   260 |
| Remaining evidence/fit/competitor choices          |    81 |
| Remaining source choices                           |   888 |
| Total actual remaining choices                     |   969 |

The two completed sections are not a full G3 evaluation. Capture-envelope disagreements noted in the [primary checkpoint](2026-10-24-primary-review-checkpoint.md) remain retained. No full completion timestamp or real label lock was generated; no classifier report or accuracy result was produced.

## Verification

Two regressions first failed because a fresh packet still contained the duplicate and the local server exposed it. After the fix, 289 unit tests passed; the 12 focused review/evaluation tests passed again with additional hash and payload assertions. Typecheck, full lint, changed-file formatting, inline JavaScript syntax and whitespace checks passed.

Coverage includes new packets, legacy packets retaining a null duplicate, exclusion from score fields, continued requirement for real `evidenceSupport`, unchanged packet/label bytes, rejection of tampered actual evidence, frozen legacy-value changes, hidden-field submissions, ordinary draft saves and completion with unreviewed legacy placeholders. Existing synthetic CLI prepare/freeze/score and no-overwrite tests still pass. Synthetic labels remain synthetic.

A real-packet `freeze` preflight reached the human-review identity/timestamp guard, proving compatibility comparison accepted the original packet; it failed as expected and did not create a lock. No timestamp or placeholder was fabricated to make it pass. The form was restarted after the saved-state check and showed 969 remaining actual choices, the 20-placeholder notice and four named evidence/fit/competitor choices for record 1.

Manual review traced packet comparison, complete-field validation, preserved inactive values, score filtering and the browser count against existing callers. An independent code review, app build, Worker integration suite and new public-app browser regression run were not performed for this local-only fix. Public app assets and remote configuration are unchanged.

## Next owner step

Complete **Bukti & kesesuaian** for records 1–20 (three to five choices per record, 81 total). Use only the supplied verified criteria for product fit; absent facts do not establish fit. Review the original candidate quote for evidence relevance, and assess each named competitor's stance separately. Save each record. Source-role/type review follows; the agent will not fill those labels automatically.

U5/U6's merchant test setup and real billing lifecycle, actual post-action evidence, verified economics and production-copy restore remain open as recorded in the earlier receipts. This progress does not activate public sales or a production cost policy.
