# G3 entity uncertainty guard — 29 October 2026

**Decision: proceed with local implementation and synthetic verification; no G3 pass or additional paid inference is approved.** Class: guardrail change. Prompted by the owner adjudicating the brand-seeded third answer as `ambiguous`, while its saved native result and policy-2 projection both said `present`.

## Cause and bounded correction

The saved classifier input includes the correct tracked name/domain and the returned same-name source on another domain. The information was not lost at serialization. The native entity choice has confidence `0.3408`; `projectGeoClassification` currently accepts its categorical winner without an uncertainty admission rule. Confidence is not measured accuracy. A source on a different domain alone cannot disprove identity, because legitimate third-party articles also discuss brands.

Policy 3 introduces an explicit operating abstention boundary: **entity confidence below 0.5** converts `present` to `ambiguous` and `absent` to `unknown`. The boundary is a conservative product rule on the native 0–1 signal, **not a calibrated 50% correctness claim or a validated optimum**. It is not fitted by searching for a passing G3 score. Values at or above the boundary retain the existing decision; they still require review and can be wrong. The resulting uncertain presence also suppresses an asserted brand stance through the existing policy-2 rule.

The [Cloudflare model documentation](https://developers.cloudflare.com/workers-ai/models/clef-flash/) and [publisher model card](https://huggingface.co/Cloudflare/clef-flash) describe typed decisions and per-option probabilities, not a guarantee that confidence measures CiteScout entity accuracy. No provider/model, model instruction, budget, price, entitlement, schedule or dependency changes are needed. Rubric 2 remains unchanged. Policy 1 and 2 keep their exact replay behavior; native output and saved history remain intact. New policy/version creates a separate measurement context.

## Trade-offs and checks

Expected improvement: weak positive matches and weak absence decisions stop becoming definite visibility outcomes. Check: a failing projection regression and the private stored-native replay turn green, with unchanged native evidence. This is development evidence after exposure, not fresh held-out validation.

The main degradation is reduced measurement coverage, including genuinely correct low-confidence mentions and absences. Tests must cover both directions, the exact boundary, explicit uncertainty, historical policies, and versioned processing. High-confidence wrong-entity decisions remain possible; this guard is not an entity resolver. Original evidence and review access stay available.

Blast radius: future classification, stance, diagnoses, actions and comparable trends. The founder reviews the trade-off here; customer/support copy must continue to describe uncertainty rather than guaranteed accuracy. Rollback is a code deployment to the prior policy default; already saved versioned results are preserved. Do not rewrite old analyses or combine their measurement cohorts.

## Release conditions

- Complete the separate owner adjudication; retain the 22 raw differences and frozen hashes.
- Pass projection, saved-method, evaluator, measurement and existing-engine regressions before a staging code deployment.
- Use the active deployment's configuration snapshot for staging; latest uploaded inactive settings are not the active operational configuration.
- No new inference, capture, retry or budget activation under the exhausted three-request authorization. Any future paid validation needs a separate explicit scope and budget.
- G3 and the public MVP stay open until fresh evidence validates the changed behavior and the other release gates are met.

## Verified outcome

Implemented and deployed **only to staging**, version `21700378-64d4-4e70-a629-bf34b7122a0c`. Rollback version is `42dcfe1c-eb56-4668-bf60-982431a0be89`. Analysis remains disabled by the original active configuration; no capture, inference, retry, budget activation, migration or production deployment occurred in this change. Historical classifications remain unchanged and need review; deploying this policy does not retroactively label them ambiguous.

Validation: **320 unit, 258 integration and 22 related desktop/mobile browser tests passed**, along with typecheck, lint, changed-file formatting, build, staging-isolation checks and V2 self-check. The first full integration run overlapped other resource-heavy checks and hit two timeouts; a complete rerun with two workers passed without changing test assertions or timeouts. Lint excludes the ignored `research/private/` one-off operation scripts. The existing large-client-chunk build warning remains outside this fix. A focused correctness/adversarial review (`20261029-entity-abstention-e03f7d6a`) retained no findings; its independent read used the same serving family, with no external model expenditure.

The private saved-native reproduction changes from definite `present` under policy 2 to `ambiguous` under policy 3, with unknown stance and unchanged native output. Both original frozen reports replay byte-identically through copies using the CLI: the 20-record policy-1 report and three-record policy-2 report retain their published hashes. This is exposed development replay, not a passing G3 evaluation.

Staging preservation used the active version snapshot, not the inactive paid-test upload's settings. Wrangler first staged code/assets with `--keep-vars` and an explicit snapshot of active plaintext values. The final version used the [Workers version API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/create/) to inherit every operational binding, including encrypted secrets, from the named active version; no secret value was retrieved or replaced. The staged public assets were reused through a completion token. All **54 operational bindings**, schedules and effective runtime settings match the original active version. The API serializes the already-effective `auto-trailing-slash` asset default explicitly; the active and new version's normalized configuration agree. No force deployment was needed.

Provider-request ledger counts are unchanged after activation: **zero additional provider or classifier requests**. Prices, provider/model settings, budgets and entitlement are unchanged. Raw owner adjudication still has five pending fields, and fresh validation of the changed policy remains a separate gate.
