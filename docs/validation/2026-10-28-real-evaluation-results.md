# Frozen owner evaluation — 28 October 2026

**Verdict: the local review and scoring step is complete; G3 is unmet.** This is a partial real-data evaluation, not a public release approval or a general classifier accuracy estimate. U4 and the [public MVP plan](../plans/2026-10-22-public-mvp-readiness-plan.md) remain open.

Subsequent [guided adjudication and same-capture Google archive checks](2026-10-28-g3-adjudication-and-google-capture.md) resolved the 16-case worklist and demonstrated missing structured answer content in all four Google captures. The frozen results below remain unchanged; their earlier unresolved-Google assessment is superseded by that evidence. G3 still does not pass.

## Review, freeze and provenance

The owner saved all 171 source groups: 110 calibration groups with assisted provenance and 61 held-out groups without displayed proposals. All actual fields were accounted for, and the owner explicitly confirmed completion at `2026-10-28T09:37:00.215Z`. The agent did not enter or replace any human judgment.

The verified local reviewer process was stopped before freezing. A byte-preserved checkpoint of the packet, original human labels and source sidecar was saved under ignored `research/private/owner-evaluation-review/confirmed-2026-10-28/`. The existing CLI then ran successfully, in this order:

```sh
node --import tsx scripts/evaluate-geo.ts freeze research/private/owner-evaluation-input.json research/private/owner-evaluation-review
node --import tsx scripts/evaluate-geo.ts score research/private/owner-evaluation-input.json research/private/owner-evaluation-review
```

The lock and report remain private. All 341 original non-null human choices match the pre-assisted checkpoint exactly; completion changed review metadata, not those choices. The 888 raw human source slots remain null, with the accepted decisions represented only by the separately locked sidecar. Twenty duplicate legacy placeholders remain excluded.

| Artifact               | SHA-256 of saved bytes                                             |
| ---------------------- | ------------------------------------------------------------------ |
| Packet                 | `ba6f27ee54053d97cd413596893c295c5f1d16c41e35c2ce25fd599b4d977825` |
| Confirmed human labels | `1e2bc46c24f3d94559858855b5edc8208370ff08e4a39ea22db2c6c7aaa165d6` |
| Source review          | `71f3fc49a3341b4bfc846223568071ad5ccb9e1906a362f97adfc3adbbf2ce1e` |

The CLI validated the original export, packet, split and provenance before writing the lock, then verified the lock before scoring. The model decisions were inspected only after the real lock existed. No provider request, inference, deployment, merchant transaction or database mutation occurred.

## Scope and denominators

| Item                                                        | Result                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Real observations                                           | 20: six OpenAI Web Search API, four Google AI Overview, five Perplexity, five Bing Copilot    |
| Calibration / held-out                                      | 14 / six observations; held-out covers one prompt family                                      |
| Actual field slots accounted for                            | 1,229                                                                                         |
| Assisted source fields excluded from every accuracy summary | 612                                                                                           |
| Remaining scored field occurrences                          | 617: 341 original human choices and 276 held-out source fields                                |
| Held-out source judgments                                   | 60 ownership groups and one missing-content abstention group, covering 138 source occurrences |
| Checked source-page contents                                | 0 of 444 occurrences; zero in each partition                                                  |
| Report status / version                                     | `partially_human_reviewed_real` / `geo-local-scoring-3`                                       |
| Automatic pilot pass                                        | `false`                                                                                       |

Field occurrences, grouped judgments and independent observations are different denominators. Repeated source references do not create additional independent samples. The 138 held-out source-type unknowns acknowledge missing content; they do not validate content-category recognition. No positive CiteScout presence judgments exist, so positive mention/recommendation recall is unmeasured. No real Claude or ChatGPT Search observations are in this corpus. Missing latency and invoice-reconciled cost remain unmeasured.

## Findings retained for adjudication

1. **Capture completeness: 10 of 20 human judgments differ from stored capture quality.** Six OpenAI captures remain partial while the reviewer chose complete. Record 5 has provider `incomplete` / `max_output_tokens` and an incomplete message; the other five retain a search item in `searching` despite completed text. Four Google captures are stored complete while the reviewer chose partial. Capture-envelope completeness and usefulness of the prose require separate judgments. These are the previously documented [capture-envelope discrepancies](2026-10-24-primary-review-checkpoint.md), still present in the frozen labels; no history was upgraded.
2. **The scorer reports four `falseComplete` flags.** All are the Google complete-versus-human-partial comparisons above. They are unresolved review flags, not four independently demonstrated parser defects. The labels and raw envelopes are preserved rather than changed to make this counter pass.
3. **Diagnosis/task judgments need rubric adjudication.** Retrieval diagnosis differs on 19/20 records; evidence diagnosis on 19/20; recommendation-fit diagnosis on 20/20. The human labels include 14 supported retrieval findings, while stored diagnoses are more conservative. Brand absence alone cannot establish a supported technical cause. Evidence/fit judgments also have many unknowns and no checked source contents or verified product criteria. These counts describe disagreement, not an instruction to strengthen the model's claims or a clean accuracy estimate.
4. **Held-out source ownership has four differing field occurrences, all from one Semrush hostname group.** The reviewer marked that group competitor-owned; the stored output is third-party. The frozen context lists only Peec AI and Otterly.AI as competitors. Adjudicate the configured-context definition separately from whether Semrush competes commercially. There are 134 matching ownership occurrences out of 138, across only 60 grouped ownership decisions; do not market that occurrence agreement as general accuracy.
5. **The held-out gate lacks enough eligible examples.** Only two of six held-out observations are stored complete and classified usable; G3 requires at least three real complete/usable held-out answers with correct critical labels or appropriate abstention. One of the two also has human partial/incomplete labels, and critical disagreements remain. The gate does not pass.

Safety counters for invalid original quotes, invalid provider-source IDs, unsupported supported diagnoses, supported evidence without checked content, fit without verified facts, and current-versus-stored policy disagreements are all zero. This limited result does not verify source-page contents, every claim or recommendation correctness, or unavailable positive classes.

Selected counts are below to make the denominator and unresolved unknowns visible. A disagreement includes different abstention labels; it is not automatically a determinate-label error.

| Dimension                    | Overall reviewed / determinate human labels / disagreements | Held-out reviewed / determinate human labels / disagreements |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| Capture quality              | 20 / 20 / 10                                                | 6 / 6 / 3                                                    |
| Answer quality               | 20 / 18 / 9                                                 | 6 / 6 / 3                                                    |
| Brand presence               | 20 / 14 / 6                                                 | 6 / 3 / 3                                                    |
| Brand stance                 | 20 / 0 / 13                                                 | 6 / 0 / 6                                                    |
| Evidence support             | 20 / 0 / 16                                                 | 6 / 0 / 6                                                    |
| Retrieval diagnosis          | 20 / 15 / 19                                                | 6 / 4 / 6                                                    |
| Evidence diagnosis           | 20 / 1 / 19                                                 | 6 / 0 / 6                                                    |
| Recommendation-fit diagnosis | 20 / 0 / 20                                                 | 6 / 0 / 6                                                    |

Private `report.json` retains all per-field/per-class TP/FP/FN, eligible/covered counts, precision/recall, abstentions, disagreements, partitions and engine summaries. No blended headline accuracy is substituted for those dimensions.

## Verification

The 23 focused evaluation/source-review/form tests passed after scoring. A second in-memory calculation of the real report with native `fetch` replaced by a throwing guard matched the saved report exactly and recorded zero fetch attempts. Assertions also verified zero remaining source fields, all 888 original human source slots still null, the 612 assisted exclusions, the 617 scored occurrences, and byte-identical packet/labels/sidecar versus the pre-freeze checkpoint. No checked page contents or verified criteria are supplied in any of the 20 input records.

Saved report byte SHA-256: `99aa9fe648839a67ec13a457a9d77b050dbd571494fc7511fd333de8e65f53ab`. Saved lock byte SHA-256: `a6233063863396d89dd2db0fd1938e2be590fefd1f7fc25fa0cf8875760aecf9`. The CLI lock hashes parsed JSON; these additional byte hashes identify the saved files and are not substituted for its validation rules. Documentation formatting and whitespace checks pass. No app code changed, so full app lint/build/browser and live billing/staging checks were not repeated for this receipt.

## Gates and next work

| Gate / unit                                 | Current decision                                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1: final OpenAI baseline                   | Unmet; replaying the six historical partial envelopes does not supply three new complete buyer captures.                                                                   |
| G2: buyer-relevant Copilot answer           | Unmet; all five Bing observations in this corpus remain no-feature.                                                                                                        |
| G3: reviewed diagnosis quality              | Unmet for the reasons above. Review/freeze/scoring completion is recorded, rather than asking the owner to repeat 888 selections.                                          |
| G4: actual action and comparable follow-ups | Unmet; this evaluation supplies no real post-action samples.                                                                                                               |
| U3 / U5 / U6                                | Unchanged: approved economics and 60% margin, correct six billing variants and real lifecycle verification, production-copy recovery and rollout gates remain outstanding. |

Next, use a short adjudication worklist: the capture-versus-answer distinction (especially record 5), the supported-versus-suspected retrieval definition, and the one Semrush ownership decision. Do not unlock or edit this scored baseline. Any later adjudication must be separately versioned with the original judgment, revised judgment, reviewer, reason, evidence and exposure to model results retained; it cannot be represented as a new untouched blind evaluation. A later classifier change needs a separate unchanged held-out dataset or new eligible evidence, never relabeling to fit its predictions.

No new paid test is authorized by completion of this review. Fresh captures/follow-ups still require an explicitly bounded scope and allowance. Prices, providers/models, active budgets, entitlement, subscription configuration, schedules and the current UI remain unchanged. No staging deployment is needed for private local scoring and documentation.
