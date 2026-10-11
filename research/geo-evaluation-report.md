# GEO classification evaluation

Status: local contract and lifecycle checks run; real model quality evaluation pending. No dataset has yet been reviewed and labeled by a human, and no held-out accuracy or latency result is claimed.

The primary classifier is Workers AI `@cf/cloudflare/clef-flash`. `clef` is an explicit configuration alternative for later accuracy comparisons; `jev-1.13.0` remains an optional adapter. Model selection does not silently fall back or spend a second inference. All diagnoses currently require user review.

Local checks on 2026-10-11: 86 unit tests, 86 Worker integration tests, TypeScript, ESLint and the direct V2 migration/budget/deletion harness passed. These include exact native response validation, ordinary-word brand ambiguity, mention versus recommendation, independent failure/retry/cache accounting, immutable original quotes, absent-brand retrieval suspicion, partial and oversized input, and private/redirected page target rejection. Synthetic provider outputs establish application behavior, not model quality.

Before enabling automatic diagnosis promotion, freeze separate tuning and held-out answers captured from actual enabled surfaces. A human must label answer quality, entity presence/stance, criterion fit, supplied-content evidence support and evidence segment support. Include English/Indonesian, ambiguous brand names, competitor recommendations, refusals, partial/no-feature cases and instructions embedded inside answers. Record sample counts, per-dimension/per-engine precision and recall, evidence validity, abstention/review coverage, p50/p95 wall time and token usage/cost. Keep missing metrics null rather than fabricating zeros.

Current release blockers: no authorized live classifier budget/evaluation workload; DataForSEO and TypeSafe accounts are unavailable. They are optional rather than prerequisites for the local flow. Clef inference has not been exercised against the user's account. `<50ms`, causal lift and financial ROI remain unproven.

Rate estimates used in the ledger are $0.038/M input tokens for Clef Flash and $0.24/M for Clef, checked on 2026-10-11 against [Cloudflare's model docs](https://developers.cloudflare.com/workers-ai/models/clef-flash/) and [Clef docs](https://developers.cloudflare.com/workers-ai/models/clef/). Estimates do not represent invoices or assume calls fall within a free allowance. Review rates before activation.
