# Policy-3 critical review: frozen results, 29 October 2026

**G3 remains unmet.** The owner completed all 48 critical labels for the three [prospective policy-3 captures](2026-10-29-g3-policy3-prospective-validation.md), confirmed the review at `2026-10-29T15:25:38.759Z`, and the local writer was stopped before freeze/scoring. All three cases are real, complete/usable and in three separately frozen held-out groups. No human labels were supplied by AI.

The existing CLI reports `critical_fields_human_reviewed_real`, scope `g3_validation`, scorer `geo-local-scoring-4`. The automatic pilot flag remains false. Source ownership/type and per-segment relevance are outside this narrower review; other engines/classes remain unmeasured. These results are not a population accuracy estimate.

## Immutable result

| Frozen file  | SHA-256 of file bytes                                              |
| ------------ | ------------------------------------------------------------------ |
| Packet       | `e4292e3eba7287e0ef0a4a8accda1b5a969fcaca6a765a6052be1c5bf5b6b4c0` |
| Human labels | `be0fbf0230c52be37e35c34b009f040439ed1ad7aea0c789f65a66e8bf5fddf7` |
| Review lock  | `92d50ab3de7fa5e86a8b8a3e8f4cb2eb61d1e90445c468805db5ccc794d8aced` |
| Raw report   | `7a35bcd80a4c88e3b98da5dd05eeceb8238650c4b4c5cad5a04f11bcedee98a6` |

The report retains **23 raw field differences**:

| Field family                                   | Differences |
| ---------------------------------------------- | ----------: |
| Tracked-brand presence                         |           3 |
| Tracked-brand stance                           |           3 |
| Evidence support                               |           3 |
| Buyer fit                                      |           3 |
| Competitor stance                              |           1 |
| Retrieval diagnosis                            |           3 |
| Evidence diagnosis                             |           1 |
| Task usefulness versus generated-task emission |           6 |

All seven structural safety counters are zero: false-complete, invalid quotes, invalid source links, unsupported supported diagnoses, unsupported evidence support, unsupported fit and saved-policy replay disagreement. Their passing does not establish correct abstention or resolve the raw differences. Manual task usefulness and generated task emission remain separate contracts, as fixed before dispatch; a difference between them is not automatically a model error.

## Confirmed guard defect

An isolated local replay reproduces **six presence/stance differences caused by the policy-3 confidence rule** in `projectGeoClassification`. The native presence winners agree with the frozen owner labels in these three cases; the guard replaces the two absences with unknown and the domain-explicit presence with ambiguous. The dependent stance rule then makes all three stances unknown. Native decisions and probabilities are unchanged. Policy-2 development replay preserves the six original choices, but does not resolve the older same-name identity defect.

| Case                    | Native presence | Native confidence | Selected-option probability | Frozen human presence | Policy-3 presence |
| ----------------------- | --------------- | ----------------: | --------------------------: | --------------------- | ----------------- |
| Vendor evidence         | absent          |            0.2872 |                      0.6430 | absent                | unknown           |
| Name-collision demo     | absent          |            0.1549 |                      0.5415 | absent                | unknown           |
| Explicit tracked domain | present         |            0.3043 |                      0.6468 | present               | ambiguous         |

The trigger is a confidence below 0.5, followed by the forced presence conversion and its stance dependency. This loss of useful determinate coverage was an identified risk in the [policy-3 change](2026-10-29-g3-entity-abstention.md); it is now observed in prospective evidence. A confidence value is not interchangeable with selected-option probability or calibrated correctness.

Changing the numeric cutoff alone is not a demonstrated fix. The older wrong-identity positive had confidence 0.3408 and selected-option probability 0.6846, both **higher** than the new correct domain-explicit positive. A monotonic threshold cannot accept the latter while rejecting the former using either signal alone. Reverting globally to policy 2 would reintroduce the known same-name false positive.

The bounded follow-up is an evidence-aware identity decision: distinguish explicit tracked-domain discussion from a bare name match, preserve whole-answer absence only with complete capture/classifier coverage, and retain abstention for genuinely ambiguous identities. Preserve earlier policies and historical analyses. Test adversarial domains, third-party discussion, multiple same-name products, partial captures and missing context before a versioned staging change. Do not tune a cutoff to make this exposed cohort pass or relabel it as a fresh holdout.

## Separate owner adjudication

The original labels/report remain immutable. A separate private ledger records explicit owner decisions after model exposure; it is assisted adjudication, not new blind gold.

- Pattern 1: retrieval diagnosis on case 1, supported → **suspected**. No page, HTTP or crawler checks establish a supported root cause.
- Pattern 2: evidence support on cases 1–3, not applicable / not applicable / insufficient → **unavailable**. No inspected source-page contents are present in the packet.
- Buyer-fit review is pending. All three packets contain no verified product criteria; the source facts and the field contract must be distinguished from general product knowledge.

The six confirmed guard differences are retained as model-policy findings. They are not a request to change the owner's presence or stance labels to agree with an abstention. Other differences remain findings or field-contract review items; no automatic pass is inferred from assisted corrections.

## Scope and next evidence

This review performed local freeze, scoring, hash preservation checks and the isolated causal replay. Nine prior frozen artifacts from the original 20-record and policy-2 three-record reviews retain their recorded hashes. No new provider calls, budget activation, configuration change, deployment, migration, merchant action or application-code edit occurred. Existing prices, provider/model settings, customer entitlement and schedules are unchanged.

The [public MVP plan](../plans/2026-10-22-public-mvp-readiness-plan.md) remains open. G1/G2, genuine post-action G4, actual package economics, merchant lifecycle and production recovery remain separate gates. A corrected implementation will require its own regression checks and prospective validation; this now-exposed cohort can serve as development evidence, never as another independent pass.
