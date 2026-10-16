# GEO classification evaluation

Status on 2026-10-16: offline evaluation tooling is ready; **G3 is pending human labels**. Twenty stored owner-staging observations and classifier outputs were exported read-only. No capture, inference, deployment or paid request was made. Synthetic tests and JSON validation do not establish real model accuracy.

| Evidence                                           | Current result                      |
| -------------------------------------------------- | ----------------------------------- |
| Real observations accounted once                   | 20                                  |
| Observed capture quality                           | 9 complete, 6 partial, 5 no-feature |
| Frozen prompt/near-duplicate groups                | 3                                   |
| Calibration                                        | 14 observations in 2 groups         |
| Held-out                                           | 6 observations in 1 group           |
| Human-reviewed observations                        | 0 — pending                         |
| Held-out precision/recall and safety counts        | not measurable                      |
| Real classifier latency or invoice-reconciled cost | not measured here                   |

The private packet contains 1,249 unreviewed field slots, including source/evidence labels. Counts follow frozen groups; empty Bing and partial OpenAI records remain included. Classification does not turn these into successful AI-answer captures.

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

Fill every label in `human-labels.json`, plus `reviewedBy` and ISO `reviewedAt`. Review capture/answer quality, entity presence/stance, criterion fit, competitors, evidence, sources, diagnosis status and task usefulness. Missing checked content stays unavailable; missing verified product facts stay unclear. Brand absence permits suspected retrieval, not proof of indexing failure. Use unknown when supplied evidence cannot resolve a question.

Freeze labels before opening the model report:

```sh
npx tsx scripts/evaluate-geo.ts freeze research/private/owner-evaluation-input.json research/private/owner-evaluation-review
npx tsx scripts/evaluate-geo.ts score research/private/owner-evaluation-input.json research/private/owner-evaluation-review
```

Freeze rejects incomplete/invalid labels and creates a non-overwritten lock. Score rejects changed inputs, labels, split or packet. It reuses the existing evaluation builder, classification projection, diagnosis policy and task generator locally, comparing stored decisions to frozen human labels. Stored/current policy disagreements are separate; history is not rewritten. There is no provider request.

## Metrics and limitations

Private `report.json` contains raw per-field/per-class TP/FP/FN, eligible denominators, coverage, correct/incorrect abstentions and disagreements, separated by calibration, held-out and engine. Unknown/unclear/ambiguous/unavailable/not-applicable outputs are listed explicitly as abstentions. On determinate gold, a model abstention is a false negative and coverage loss, never an excluded row. Zero eligible denominators produce **not measurable**.

Safety counts distinguish false-complete captures, invalid original quotes, invalid provider-source IDs, unsupported supported diagnoses, evidence support without checked content, fit without verified facts and stored-policy disagreements. The script always returns `pilotGatePassed:false`; the owner still assesses the four gates separately.

Six held-out records cover only one prompt family. Even after review, this is a small diagnostic sample, not general accuracy, consumer-chat parity, causal uplift or financial ROI. Missing language/brand/buyer-intent coverage needs truthful notes; synthetic examples cannot fill real denominators.

## Offline verification receipt

Tests were written first and observed failing because the evaluation module did not exist. The implementation then passed nine focused synthetic tests: twenty unique IDs, grouped partitions, hidden model outputs, frozen input/labels/split rejection, abstention misses, unknown denominators, quote/source/diagnosis failures, fixture isolation, partial/no-feature suppression, homonyms, competitor-only text and embedded instructions. A fetch spy verifies the scorer makes no network requests. These application guardrails are separate from real human review.

Authoritative full-tree typecheck, lint, unit/Worker integration, migration checks, build and browser receipts belong to the parent implementation. Focused test success does not claim those checks ran.

No human labels, label lock or real scored report were generated. The owner must review the blind private packet, run freeze/score and inspect held-out disagreements and safety failures before G3 can pass. New live inference remains outside this offline scope.

Operational limits and paid-call pause/recovery remain in [GEO operations](../docs/geo-operations.md) and [owner staging](../docs/four-engine-staging.md). Automatic promotion, paid replays, hosted evaluation infrastructure and a second classifier were not added; stored-answer review needs none of them.
