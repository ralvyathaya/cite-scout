# G3 grounded entity guard — 30 October 2026

**AI change class: guardrail. Verdict: proceed with local verification and staging only; no paid validation or public-release pass.** The [policy-3 review](2026-10-29-g3-policy3-frozen-results.md) isolates six excessive presence/stance abstentions. Its owner review is complete: nine explicit corrections, six confirmed guard findings and eight retained judgments that compare different emission contracts account for all 23 raw differences. No human label remains blank or requires another decision for this worklist. Original gold and reports remain immutable.

## Bounded correction

Policy 4 keeps the existing weak-decision boundary but checks the evidence the classifier actually received. A weak native positive can remain present when that answer explicitly names the tracked hostname or a real subdomain; a bare ambiguous name still abstains. A weak native absence can remain absent only when the evaluated answer has neither the tracked name as a distinct name nor its domain. Existing incomplete-capture/excerpt guards continue to prevent whole-answer absence. Native unknown/ambiguous choices are never promoted.

This is an identity anchor, not proof of product capabilities, website ownership, source support or recommendation. Parse URL hostnames; a lookalike suffix, URL userinfo, email, redirect query or unrelated source metadata is not an owned-domain anchor. Inspect only the supplied answer segments, not an unseen tail. Preserve policy 1–3 replay and use a new versioned measurement context; do not rewrite saved analyses.

## Trade-offs and release conditions

- Expected improvement: remove the six observed guard-induced presence/stance changes while retaining abstention on the older same-name positive. Measure with synthetic regressions and stored-native development replay; these exposed answers cannot certify a fresh pass.
- Main degradation risk: a domain mention may concern several products or quote misleading claims. Require the native positive as well; keep `needsReview` and all evidence/fit safeguards. A weak negative with a name collision remains unknown. High-confidence entity mistakes are still possible.
- Blast radius: future classifications, stance, proposed diagnoses/tasks and comparable trends. No provider/model instruction, API contract, database schema, dependency, prices, budget or entitlement change.
- Before ship: test safe/unsafe domain identities, name boundaries, missing context, partial captures, classifier excerpt limits and exact historical replay. Review the fix, then stage with the named active-version configuration and inherited secrets. Analysis remains operationally disabled; no provider dispatch is authorized here.
- Rollback: deploy the pre-change active version; retain all versioned evidence. The owner receives this receipt and scoped test/staging results. A separately authorized prospective cohort is required before claiming G3 is satisfied; G1/G2/G4, economics, billing and recovery remain separate MVP gates.

## Verified implementation

Implemented as rubric 2 / **policy 4** / ownership 1. Policies 1–3 remain supported explicitly; pending jobs use their saved method, while a new request uses policy 4. No old analysis, capture, label, report or native probability is rewritten. The bounded hostname recognizer supports plain host/URL tokens and standalone Markdown links with outer emphasis and sentence punctuation. Other complex formats may still abstain; it is not a general identity resolver or Markdown renderer.

**361 unit tests, 259 integration tests and 22 related desktop/mobile browser tests passed**, together with lint, typecheck/build, changed-file formatting, staging isolation and V2 self-check. The focused classification file has 57 proof cases, including URL userinfo, quoted delimiters, nested redirect queries, punctuation, emphasis, exact-name boundaries and unseen classifier tails. Initial regression failures were observed before their fixes. Review caught and closed three URL/Markdown boundary findings before release.

All **26 stored classifications** replay exactly with their original method. All three frozen reports replay byte-identically through copies. Development replay recovers the six excessive presence/stance abstentions and retains ambiguity on the earlier wrong-identity positive. These exposed replays do not pass G3 or measure population accuracy.

Review scope was the four fix-owned source/test files, based on `37dc675`. A focused correctness/adversarial review (`20261030-grounded-entity-37dc675`) has no unresolved findings after verification. The separately dispatched adversarial read used the same serving family; no cross-model independence is claimed. The bundled external route could not run because the available Bash executable was a WSL shim without a distribution; no external peer call started. Simplification preserved all proof tests and skipped work for native unknown/ambiguous decisions. The existing large-client-chunk warning remains outside this fix.

**Staging deployment: pending final active-version preservation checks.** Analysis remains disabled; no new provider capture or inference is authorized by this change.
