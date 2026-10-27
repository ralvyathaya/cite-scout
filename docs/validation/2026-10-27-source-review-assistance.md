# Source review assistance — 27 October 2026

**Class:** evaluation data/workflow change. **Verdict:** go for separate draft triage; assisted gold/scoring requires provenance support first.

The owner requested fewer manual source judgments, with AI assistance where useful and no fabricated evaluation results. The original 20-record packet and current human labels remain unchanged. No classifier prediction was inspected, no provider was called, and no application/configuration/deployment change was made.

## Current evidence

- Human choices: 341 valid selections: 100 primary, 81 evidence/fit/competitor, and 160 findings/tasks. Source choices remain unreviewed; no completion timestamp or lock exists.
- The 888 source fields describe 444 source entries, 330 distinct canonical URLs and 149 hostnames. The same supplied brand/competitor context applies throughout.
- Fourteen calibration records contain 306 entries: 227 canonical URLs and 109 hostnames. Six held-out records contain 138 entries: 125 canonical URLs and 60 hostnames. These counts overlap across partitions and must not be added as independent unique sources.
- No record contains checked source-page content. A URL/title does not verify a page's content category. Suggestions cannot supply that missing evidence.

## Prepared draft, not ground truth

Ignored private files `research/private/owner-evaluation-review/source-review-proposals-2026-10-27.{json,md}` group calibration source-role proposals by hostname plus the supplied ownership context. They are deterministic domain triage, not a newly trained classifier or AI-generated human labels. Proposed type is `unknown`, explicitly because checked content is absent. No fallback uses fabricated page content.

The draft contains proposals for calibration only. Held-out source labels receive no proposals; no label transfers across partitions. Original source IDs and per-record references are retained. The draft records the packet and human-label SHA-256 values; byte assertions confirmed neither original file changed. All references were checked against the calibration partition. There were zero provider calls.

Packet SHA-256: `ba6f27ee54053d97cd413596893c295c5f1d16c41e35c2ce25fd599b4d977825`.

Human-label SHA-256 at preparation: `eb68c8eef465c8a8e4a466f1ff249c4f288b3ed5b0b38ef1dbab0c0a3a524c4e`.

This is a review worklist only. The local form and strict freeze/scorer have not been changed to consume it. No source values were merged into `human-labels.json`, including automatic `unknown` values. The draft reduces duplicate material to inspect; it does not itself complete any human review or lower the release gate.

## Conditions for an assisted workflow

1. Store proposed, accepted-assisted and independently human-reviewed values separately, with input/rubric hashes and reviewer/method provenance. Never overwrite the existing 341 human choices.
2. Keep the six held-out records blind to proposals. Reuse one reviewed ownership decision only within an identical context and permitted partition; keep each original record/field traceable.
3. Human review may prioritize ambiguous/conflicting suggestions, but also needs a predefined independent sample. Reviewing only low-confidence cases cannot estimate overall accuracy. Confidence is not measured correctness.
4. Report assisted labels separately from independent gold, including unreviewed counts and missing-content coverage. Do not score a production rule against a copy of that same rule as independent validation. `unknown` for missing page content is abstention, not a correctly identified page category.
5. A reduced-scope result must be named partial and must not become a full G3 pass. The current strict scorer remains unchanged; it cannot honestly score these unreviewed drafts as human gold.
6. Any later AI suggestions must use only the blind packet and a separately recorded method; they must not read the stored classifier's decisions. Paid inference, external page fetching or additional source evidence needs its own bounded scope. None was performed here.

## Trade-off and rollback

The expected improvement is fewer repeated inspections, beginning with 306 calibration source occurrences grouped into 109 hostname decisions for ownership. Page content classification remains unavailable; 109 is not a promised count of all remaining human decisions.

The main risk is anchoring human reviewers to suggestions and then reporting those judgments as independent accuracy. A second risk is treating repeated URLs or domain matches as proof of content or legal ownership. Partition protection, method provenance, independent sampling and separate denominators are required before changing the scorer.

The owner is the reviewer and must see the draft/independent distinction before using proposals. No customer-facing communication or rollout is involved. Rollback is simply not consuming the private draft: the original packet, strict evaluator and human review are intact. Prices, providers/models, active budgets, entitlement, subscription configuration and schedules remain unchanged. U4/G3 and the previously recorded commercial blockers remain open.
