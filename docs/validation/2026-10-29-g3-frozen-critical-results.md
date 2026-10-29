# Frozen prospective G3 results — 29 October 2026

**Review, freeze and local scoring are complete. G3 remains unmet pending adjudication and identity checks.** This is the result of the [bounded staging batch](2026-10-29-g3-prospective-staging-validation.md), not an additional paid test or a public-release approval.

## Frozen evidence

The owner completed all 48 critical labels across three answers and confirmed at `2026-10-29T02:39:45.263Z`. The local reviewer process was stopped, and byte-identical packet and label copies were saved before the existing CLI ran `freeze`, then `score`. Classifier results were inspected only after the label lock existed. No human values were entered or replaced by the agent.

| Artifact               | SHA-256 of saved bytes                                             |
| ---------------------- | ------------------------------------------------------------------ |
| Packet                 | `8cf9a4521c7e7e60a894f130389d5caeb60185ed313af43d664314734ab47d5f` |
| Human labels           | `fdc7895d24d2ffac0ec1c1b617d38d64c246241b5c3dd3020de483f227f8e88b` |
| Label lock             | `c48d54390d99fd74641b87e55f3f5ca2dbe3467990f38acab1294391e85df838` |
| Original scored report | `4cd192929e6a3929a42ffc66680c42918a6a7cafa8ec63eb8af6bca2659543ab` |

The private result is `critical_fields_human_reviewed_real`, scoring version `geo-local-scoring-4`. All three prospective prompt groups are held out, with one Perplexity capture and one existing-method analysis per group. Two questions are unbranded; one names CiteScout and its competitors. This is a small critical-field check, not a general accuracy estimate or an organic brand-discovery study.

All three captures agree with the owner's `complete` and `usable` judgments. There are **22 differing field occurrences out of 48**, across the following categories. Repeated fields within an answer are not independent samples; no combined accuracy percentage is claimed.

| Category                        | Differing field occurrences |
| ------------------------------- | --------------------------: |
| Stance toward the tracked brand |                           2 |
| Source-content evidence support |                           3 |
| Product fit                     |                           1 |
| Competitor stance               |                           3 |
| Diagnoses                       |                           4 |
| Proposed actions                |                           9 |

The initial human labels and stored projections both label two answers absent and one present. That last agreement concerns a literal name match whose entity identity remains unresolved; it must not be represented as verified visibility of the owner's business.

## Safety checks and limits

All seven counters are zero: false-complete, invalid original quotes, invalid provider-source IDs, unsupported supported diagnoses, evidence support without checked content, fit without verified facts, and stored-policy replay disagreements. These structural/evidence guards passing do not reconcile the human/model differences or prove that every useful task was proposed.

No checked page contents or verified product criteria are supplied for these three records. Source role, content type and per-segment relevance were intentionally outside this narrower review. Those dimensions, untested classes and other engines remain unmeasured. The scorer's automatic pilot flag remains false.

The third answer discusses a product called CiteScout, while a returned source is `app.outercite.com/citescout`, outside the tracked `cite-scout.com` domain. Its title describes competitive intelligence. This is an indication of a possible same-name entity mismatch, not proof of a citation to that source: the saved reference is only `retrieved`, and its page contents were not checked. The positive name match cannot establish visibility of the owner's CiteScout. Preserve the original response and investigate identity separately rather than rewriting the historical answer or silently counting it as confirmed success.

## Adjudication and next step

The immutable raw report retains all 22 differences. Guided corrections go only into the separate private `adjudication-2026-10-29.json` ledger, with the original artifact hashes and explicit owner decisions. These post-score decisions are assisted/model-exposed; they are not a new independent gold set or a replacement accuracy report. The frozen review was reopened read-only.

Through guided pattern 12, the owner has adjudicated **17 of the 22 raw differences**, plus the additional identity concern. The latter is now explicitly `ambiguous`; the original human/model agreement on `present` was not part of the 22 differences. Five raw fields remain: product-fit actions on three answers and third-party-source inspection on two. The original choices and report remain unchanged.

Decisions retain genuine disagreements: Otterly's recommendation with a caveat in answer 1 remains a direct recommendation; inspecting an owned page in answer 3 remains useful; some diagnosis/action judgments are unknown rather than the model's no/none. Task usefulness and the generator's conservative emission thresholds are different questions. Corrections are not forced to match the model.

The [entity-uncertainty correction](2026-10-29-g3-entity-abstention.md) investigates why the weak native match became definite presence and introduces a separate policy version. Any replay of this now-exposed batch is development evidence, not a fresh held-out score or retrospective G3 pass.

Before a G3 pass, assess the remaining critical disagreements and identity concern against the frozen method and actual evidence. Model agreement is not itself a reason to change a human label. If a real behavior defect remains, record it as a defect; tuning on this batch would make it development evidence rather than another fresh holdout. Do not lower the gate or purchase replacement answers to make the result green without a new explicit scope.

The initial freeze/scoring step used only local files and the existing evaluation CLI. It made no provider requests, deployment, database writes, merchant transactions or configuration changes; application code and broad runtime tests were unchanged at that checkpoint. Freeze/hash validation and local scoring completed successfully. The later policy-3 implementation, staging deployment and preservation checks are recorded separately in the entity-uncertainty correction linked above, rather than attributed to the frozen evaluation.

The [public MVP plan](../plans/2026-10-22-public-mvp-readiness-plan.md) is still incomplete: G1/G2/G4, package economics with actual costs, merchant mappings/lifecycle and real recovery evidence remain separate gates. Prices, provider/model configuration, budgets and customer entitlement are unchanged.
