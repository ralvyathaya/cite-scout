# G3 adjudication and Google capture findings — 28 October 2026

**G3 remains unmet.** The owner completed the 16-case guided worklist. A small Google parser correction is verified locally; it does not repair incomplete provider output or establish release readiness. The [MVP plan](../plans/2026-10-22-public-mvp-readiness-plan.md) remains open.

## Human decisions and preserved baseline

The explicit owner replies cover 48 distinct field occurrences: 46 revised judgments and two reaffirmed original judgments. Google answer 2 remains **partial**; the Peec AI stance in answer 4 remains **conditional recommendation**. Grouped replies apply only to their enumerated fields, not entire records.

The private adjudication ledger records each reply, field, original value, supporting evidence and model exposure. It is post-review assisted adjudication, not new independent gold. The packet, original human labels, source sidecar, lock and scored report retain their original byte hashes. No reviewed value was copied into the frozen labels. Recomputing the original report in memory still matches it exactly with native fetch blocked and zero fetch attempts.

The separate private comparison has no overall accuracy or pilot-pass claim. All 16 listed cases are resolved; this does not mean every original disagreement is resolved. Missing source-page contents, positive CiteScout examples, latency and invoice-reconciled costs remain unmeasured.

## Same-capture evidence for the four Google discrepancies

Archived HTML and structured JSON were retrieved for the original Google searches, without issuing a new query. Read-only staging D1 results confirm that persisted answer text and text blocks match the evaluation export. The archived provider JSON matches those blocks too. D1 reported zero rows written.

| Answer | Content present in its original HTML but absent from its structured answer blocks  |
| ------ | ---------------------------------------------------------------------------------- |
| 2      | Tool list including Mergeflo, Topify, Peec AI, Semrush and WordLift                |
| 8      | List entries for Otterly.AI and Peec AI                                            |
| 19     | List entries for Mergeflo and Peec AI                                              |
| 20     | Standardized prompt-library and baseline-audit sections, among other missing lists |

These are contents of historical AI answers, not verified claims about those vendors. The proof uses the same original captures, rather than today's Google output. It supports the original partial labels for all four records; only answer 2 required the additional explicit owner reaffirmation. The other three were already labeled partial, and no new human decision was invented for them.

This supersedes the earlier uncertainty about whether Google short answers merely looked incomplete. It demonstrates omissions in these four archived structured outputs; it does not prove the same defect affects every Google response. HTML, normalized comparisons, JSON receipts and hashes remain private. The [Search Archive API](https://serpapi.com/search-archive-api) supports retrieving existing results; no fresh search, classifier inference, key change or historical-data mutation occurred here.

## Parser correction and AI change assessment

**Class:** retrieval/data interpretation. **Decision:** proceed with the bounded parser correction; no public release or paid validation approval.

An additional code inspection found a separate defect: Google's documented JSON list items can contain nested `text_blocks`, but CiteScout only read their title, snippet or nested list. The [SerpApi example](https://serpapi.com/google-ai-overview-api) includes headings, paragraphs and lists inside those blocks.

- `src/integrations/serpapi/geo.ts` now traverses that documented structure using the existing depth, reference and URL validation. Raw responses and source-reference distinctions remain intact. It adds no HTTP request, retry, HTML fallback or dependency.
- New Google/SerpApi contexts use `geo-collector-4`; pending older-context requests keep their prior parsing behavior. OpenAI, Bing, Perplexity, Claude and DataForSEO policies are unchanged. The evaluation input validator accepts the additional version.
- Collector version participates in measurement cohorts. New parsing results cannot silently join old trends or before/after comparisons; a method-compatible baseline is required. Prior captures and contexts are not rewritten.
- This improves inputs that actually contain nested JSON blocks. It cannot recover answer sections already absent from provider JSON. In particular, the four historical Google omissions remain findings, not repaired captures.

**Risk and checks:** recursive extraction could lose order, mishandle sources or accept malformed content. Synthetic regressions cover ordered nested headings/paragraphs/lists, source linkage, malformed blocks, unsafe links, invalid indexes, excessive nesting, old-context behavior and unchanged request counts. Cohort and context tests verify method separation and retained history. The bug was reproduced by a failing test before the parser edit.

**Blast radius:** future Google/SerpApi capture parsing and its downstream classifications, Sources and measurements. Saved outputs can persist; the owner should review any new sample before promotion. Rollback is a code revert; do not relabel version-4 captures as version 2 or delete evidence to merge cohorts. No runtime provider, model, price, budget, entitlement or schedule was changed.

## Findings still requiring work

1. Four historical Google captures are stored complete despite missing answer content. The archive proof confirms the review concern; the new nested-block parser alone does not solve upstream omission detection.
2. Classifier/projection findings remain for empty AI answers, whole-answer absence on truncated text, stance when the brand is not discussed, and conditional competitor recommendations. These need versioned policy tests, not human labels changed to match predictions.
3. The local task scorer evaluates one observation at a time, while earned-source tasks require evidence from multiple observations. Offline replay produces zero earned tasks in each singleton versus 16 across the stored corpus. That is a scoring-scope mismatch, not proof that those tasks are useful. The corpus includes the disputed Google captures and is not a newly validated task set.
4. Of six original held-out records, only one remains a complete/usable candidate after excluding Google captures with demonstrated omissions. G3 requires at least three real complete/usable held-out answers with correct critical judgments or appropriate abstention. New examples must remain unseen during tuning; assisted adjudication cannot create that independent evidence.

No fresh paid request is implied by this receipt. Inspect suitable existing saved captures first. Any missing paid capture scope needs an explicit request/spend allowance; production promotion remains gated separately.

## Verification checkpoint

The original frozen report replays exactly, all five baseline file hashes are unchanged, and the adjudication comparison checks 48 unique approved fields without assisted-source leakage. The full **305-test unit suite** and **38 targeted four-engine/measurement integration tests** pass, along with typecheck, lint, build, changed-file formatting and whitespace checks. The build retains the existing large-client-chunk warning; integration reports the existing dependency sourcemap warning. No browser run is claimed for this parser-only change. No UI redesign, provider activation, merchant transaction or deployment was performed for this checkpoint.
