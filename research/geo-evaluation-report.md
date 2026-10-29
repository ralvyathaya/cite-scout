# GEO classification evaluation

Latest result: the owner-authorized prospective batch now has three real Perplexity answers with 48 confirmed critical labels, frozen and scored under version 4. All safety counters are zero, but 22 differences and a possible same-name identity mismatch remain for adjudication. [Frozen critical results](../docs/validation/2026-10-29-g3-frozen-critical-results.md) are the latest receipt; G3 remains unmet, with original labels/report preserved.

Implementation checkpoint: [versioned evidence guards and task scoring](../docs/validation/2026-10-28-g3-evidence-guards.md) are verified locally. New packets use scoring version 4; the original 20-record real report replays under version 3. The earlier allowance/review-pending entries below describe historical checkpoints.

The [staging code release](../docs/validation/2026-10-28-g3-staging-release.md) is active with the prior configuration and no new paid requests. Deployment does not substitute for that independent validation.

Latest 28 October checkpoint: the owner resolved the 16-case guided worklist, covering 48 fields, in a separate assisted adjudication ledger. Original labels, provenance lock and score remain unchanged. Same-search archives prove answer content missing from all four historical Google structured captures. A versioned nested-list parser correction is verified locally but cannot repair absent provider JSON. **G3 remains unmet**; [adjudication, parser change and remaining blockers](../docs/validation/2026-10-28-g3-adjudication-and-google-capture.md) are the latest receipt.

Final 28 October checkpoint: the owner completed all 171 source groups and explicitly confirmed the review. Labels and assisted-source provenance were frozen before opening classifier decisions; the existing local CLI then scored all 20 real observations. The report is **`partially_human_reviewed_real`**, scoring version `geo-local-scoring-3`: 612 assisted source fields are excluded, leaving 617 scored field occurrences. All 341 original human choices are preserved. No provider request or deployment occurred. **G3 remains unmet:** capture-label discrepancies, diagnosis/task rubric disagreements and insufficient complete/usable held-out coverage remain. [Frozen results and gate assessment](../docs/validation/2026-10-28-real-evaluation-results.md) are the current receipt; the checkpoints below describe earlier stages.

Earlier implementation checkpoint on 28 October: the approved grouped-source workflow is implemented locally. The 888 source fields map to 171 decisions; calibration ownership proposals can be accepted in bulk only after 11 individual spot-checks in this packet. Six held-out records remain without proposals. Original human labels stay in `human-labels.json`; grouped decisions and provenance use separate `source-review.json`. Freeze locks both; assisted fields are excluded from all independent accuracy summaries and the result is explicitly partial. Checked/missing content coverage is quantified overall and by partition. Missing-content groups allow only an explicit unknown abstention, not unsupported page categories. At that checkpoint no source decision, real completion, lock or score had been entered by the agent. [Implementation and MVP status](../docs/validation/2026-10-28-mvp-status-and-assisted-review.md).

Checkpoint on 27 October 2026: Evidence/Fit/Competitor review is complete, bringing saved human choices to 341 of 1,229 actual fields. The remaining 888 source fields describe 444 occurrences, 330 canonical URLs and 149 hostnames; no checked page contents are supplied. A separate private calibration-only draft groups ownership suggestions without changing human labels or revealing held-out suggestions. These are rule-derived proposals, not independent gold. The strict form/scorer remains unchanged, and no full completion timestamp, lock or score exists. [Source assistance boundaries](../docs/validation/2026-10-27-source-review-assistance.md) describe the requirements for future assisted review; G3 remains pending.

Checkpoint on 25 October 2026: primary Answer labels and Findings/Tasks are both complete across 20 records: 260 saved human choices, all valid. A tooling defect generated a duplicate `evidence.support` question with no corresponding classifier prediction. New packets omit it; old packets retain it unchanged but no longer require or score it. The owner packet therefore has 1,229 scored fields and 969 remaining (81 evidence/fit/competitor and 888 source labels), while its original 1,249-key structure remains intact. No full completion timestamp, label lock or classifier score exists. [Progress and compatibility fix](../docs/validation/2026-10-25-findings-review.md) record the boundary; G3 remains pending.

Checkpoint on 24 October 2026: the owner has saved the five primary Answer labels for all 20 records (100 of 1,249 fields). A private byte-preserved draft checkpoint was retained before reviewing capture-envelope discrepancies. The remaining 1,149 detail fields are unreviewed; no full completion timestamp, label lock or classifier score exists. The human primary labels contain 14 absent and six unknown brand-presence judgments, with no positive brand-presence examples. These are partial human-review drafts, not a G3 pass. [Checkpoint and parser replay](../docs/validation/2026-10-24-primary-review-checkpoint.md) record the limits. The historical counts below describe the original export.

Status on 2026-10-16: offline evaluation tooling is ready; **G3 is pending human labels**. Twenty stored owner-staging observations and classifier outputs were exported read-only. No capture, inference, deployment or paid request was made. Synthetic tests and JSON validation do not establish real model accuracy.

| Evidence at the original 16 October export         | Historical result                   |
| -------------------------------------------------- | ----------------------------------- |
| Real observations accounted once                   | 20                                  |
| Observed capture quality                           | 9 complete, 6 partial, 5 no-feature |
| Frozen prompt/near-duplicate groups                | 3                                   |
| Calibration                                        | 14 observations in 2 groups         |
| Held-out                                           | 6 observations in 1 group           |
| Human-reviewed observations                        | 0 — pending                         |
| Held-out precision/recall and safety counts        | not measurable                      |
| Real classifier latency or invoice-reconciled cost | not measured here                   |

The original private packet contains 1,249 field slots, including 20 duplicate placeholders excluded by scoring version `geo-local-scoring-2`. Its 1,229 actual review fields retain the same groups; empty Bing and partial OpenAI records remain included. Classification does not turn these into successful AI-answer captures.

The classifier remains Workers AI `@cf/cloudflare/clef-flash`, rubric `geo-rubric-1`, policy `geo-policy-1`. This work changes no model, rubric or diagnosis policy. Every diagnosis still requires review. Native probabilities are model outputs, not measured accuracy.

## Private local workflow

`scripts/evaluate-geo.ts` accepts local files only. It has no provider client, key input, hosted evaluation framework or inference transport. Input, packets, labels, locks and reports stay under ignored `research/private/`. The CLI rejects output outside that directory and refuses to overwrite an existing packet or label lock.

The existing sanitized export is normalized to `research/private/owner-evaluation-input.json`, with preparation complete at `research/private/owner-evaluation-review/`. Do not prepare again into that directory or edit the frozen packet. The internal run-item ID was not exported and is explicitly `not_exported`; evaluation does not use it to invent provenance. Checks and verified facts remain limited to the original classifier input.

For a new explicitly scoped local corpus:

```sh
npx tsx scripts/evaluate-geo.ts prepare research/private/input.json research/private/review
```

Input is `{dataset, expectedObservationIds, records}`. Dataset is `real` or `synthetic`; every record has the existing full `observation`, `promptFamily`, supplied `checks`, verified `criteria`, stored `classification` and `diagnoses`. The declared ID list must match exactly once. Obvious fixture markers are rejected from real datasets. Keep real and synthetic corpora separate; never copy synthetic expectations into real labels.

Preparation freezes SHA-256 hashes of the corpus, original inputs, rubric/policy versions, groups and partitions. Shared prompt IDs/families, near-duplicate prompts and sufficiently long near-duplicate answers are joined transitively across dates. Inspect grouping before labeling; incorrect grouping needs a new packet. The deterministic split assigns roughly one-third of groups to held-out review.

The reviewer opens **only `packet.json` and `human-labels.json`** while labeling. The packet contains the original answer, context, sources, supplied checks/facts, exact UTF-16 candidate quotes and allowed labels. It withholds classifier decisions, probabilities, diagnoses and task predictions. Do not inspect the source export or model results while creating blind labels.

For the existing owner packet, an optional local form avoids editing JSON by hand:

```sh
npx tsx scripts/review-geo.ts
```

Open the printed loopback link on this laptop. The form reads the blind packet, human labels and optional grouped-source provenance; it never calls an AI provider. Enter the reviewer name; review the Answer, Evidence, and Findings/Tasks sections per answer, saving before moving. Use **Review sumber ringkas** for source choices: proposals are displayed only for calibration, and every accepted calibration group is marked assisted. Held-out groups start blank and require independent judgment. Original labels are never auto-filled. All 1,229 actual fields must be accounted for through original human labels or explicitly approved source groups before completion; assisted values are excluded from accuracy. Twenty duplicate legacy placeholders remain unchanged and are not required. The complete-review button records the review time only after explicit confirmation.

Draft saves retain a one-time `.backup`, reject stale versions, and refuse edits after a label lock exists. This is a single-reviewer local helper: stop its process before manually editing labels or running freeze/score. It is not deployed to staging, and the private packet must never enter public build assets. Reloading the form discards unsaved selections; save first.

The original strict path requires every actual label in `human-labels.json`, plus reviewer identity and completion time. The approved hybrid path keeps source group decisions separately; never copy assisted proposals into human gold. Review capture/answer quality, entity presence/stance, criterion fit, competitors, evidence, sources, diagnosis status and task usefulness. Missing checked content stays unavailable; missing verified product facts stay unclear. Brand absence permits suspected retrieval, not proof of indexing failure. Use unknown when supplied evidence cannot resolve a question.

Freeze labels before opening the model report:

```sh
npx tsx scripts/evaluate-geo.ts freeze research/private/owner-evaluation-input.json research/private/owner-evaluation-review
npx tsx scripts/evaluate-geo.ts score research/private/owner-evaluation-input.json research/private/owner-evaluation-review
```

Freeze rejects incomplete/invalid actual labels or group coverage and creates a non-overwritten lock, including the source-review hash when a sidecar exists. The duplicate legacy `evidence.support` may remain null; real `evidenceSupport` and every actual field remain required or accounted for by an explicit source decision. Score rejects changed inputs, labels, split, packet or source provenance, including changes to ignored legacy values after freezing. Legacy comparison recognizes only the original duplicate placeholder, without editing the packet. It reuses the existing evaluation builder, classification projection, diagnosis policy and task generator locally. Assisted fields never enter overall, partition or engine accuracy; the hybrid report records their excluded count and group provenance separately under scoring version `geo-local-scoring-3`. Repeated source occurrences and missing-content abstentions do not validate independent content-category accuracy. Stored/current policy disagreements are separate; history is not rewritten. There is no provider request.

## Metrics and limitations

Private `report.json` contains raw per-field/per-class TP/FP/FN, eligible denominators, coverage, correct/incorrect abstentions and disagreements, separated by calibration, held-out and engine. Unknown/unclear/ambiguous/unavailable/not-applicable outputs are listed explicitly as abstentions. On determinate gold, a model abstention is a false negative and coverage loss, never an excluded row. Zero eligible denominators produce **not measurable**.

Safety counts distinguish false-complete captures, invalid original quotes, invalid provider-source IDs, unsupported supported diagnoses, evidence support without checked content, fit without verified facts and stored-policy disagreements. The script always returns `pilotGatePassed:false`; the owner still assesses the four gates separately.

Six held-out records cover only one prompt family. Even after review, this is a small diagnostic sample, not general accuracy, consumer-chat parity, causal uplift or financial ROI. Missing language/brand/buyer-intent coverage needs truthful notes; synthetic examples cannot fill real denominators.

## Offline verification receipt

Tests were written first and observed failing because the evaluation module did not exist. The implementation then passed nine focused synthetic tests: twenty unique IDs, grouped partitions, hidden model outputs, frozen input/labels/split rejection, abstention misses, unknown denominators, quote/source/diagnosis failures, fixture isolation, partial/no-feature suppression, homonyms, competitor-only text and embedded instructions. A fetch spy verifies the scorer makes no network requests. These application guardrails are separate from real human review.

A tenth test exercises the CLI in a temporary synthetic workspace through subprocesses: it rejects public output paths, refuses to overwrite an existing packet or frozen label lock, preserves their bytes, and completes synthetic prepare/freeze/score. No real private corpus is used by this test.

Authoritative full-tree typecheck, lint, unit/Worker integration, migration checks, build and browser receipts belong to the parent implementation. Focused test success does not claim those checks ran.

At the initial tooling checkpoint no human labels, label lock or real scored report had been generated. The owner's review, freeze and first real local score are now complete as recorded in the final 28 October receipt above. The reduced scope and unresolved disagreements do not close G3. New live inference remains outside this offline scope.

Operational limits and paid-call pause/recovery remain in [GEO operations](../docs/geo-operations.md) and [owner staging](../docs/four-engine-staging.md). Automatic promotion, paid replays, hosted evaluation infrastructure and a second classifier were not added; stored-answer review needs none of them.
