# CiteScout v2: answer and source evidence

Research date: **2026-10-04 (Asia/Bangkok)**. Code baseline: **de78226773fb329f019014015895dbd4b3d6314e**. Research branch: **codex/research/citescout-v2-source-evidence**.

Question: What can CiteScout honestly call an exact answer and a cited source?

This is an evidence asset for the Wayfinder research ticket. It establishes factual constraints; it does not choose trial, comparison, storage-schema, or screen behavior. Research used official Perplexity documentation and repository code. No live API request, credits, secrets, or customer records were used. Documentation was retrieved on the date above; examples are documentation examples, not a production compatibility test.

## Bounded answer

CiteScout can preserve **the answer text returned by one Perplexity Agent API request**, with its request context and provider metadata. This does not establish what any consumer saw in Perplexity's app. Perplexity explicitly says API and UI configurations and underlying models can differ. [Official FAQ, Search & Results](https://docs.perplexity.ai/docs/resources/faq#search--results)

A **returned source** is a source record actually present in that response. A **cited source** requires a supported link from the answer to that record. Source presence alone does not prove citation, factual support, recommendation quality, or causal influence.

Current storage is an extracted, normalized answer and returned source list. It cannot truthfully be described as a byte-exact provider response or a verified list of cited sources. Historical precision cannot be reconstructed from fields that were discarded.

## Official evidence and its limits

| Topic | Finding | Primary source |
|---|---|---|
| Response boundary | Agent API uses an output array containing messages and other items; the SDK offers aggregated output_text. This is a response representation, not consumer-app output. | [Agent API quickstart](https://docs.perplexity.ai/docs/agent-api/quickstart) |
| Numeric citation linkage | The official cookbook maps fast-preset markers such as [1] to search-result **id**, not array position. Collect every search_results batch; the documented ID space is shared across batches. Its examples distinguish sources found from sources cited. | [Streaming Citation Parsing](https://docs.perplexity.ai/docs/cookbook/articles/streaming-citations/README) |
| Format variability | That cookbook documents different marker formats: fast uses [1], low uses [web:1]. Missing IDs remain unresolved rather than being assigned invented URLs. It does not guarantee that every returned result will appear in text. | [Streaming Citation Parsing](https://docs.perplexity.ai/docs/cookbook/articles/streaming-citations/README#tips-and-best-practices) |
| Annotations | The endpoint example includes output_text annotations with type, URL, title, start_index and end_index. The retrieved reference does not establish universal non-empty annotations or enough offset semantics to assume a parser is correct. | [Create Agent Response](https://docs.perplexity.ai/api-reference/agent-post) |
| Empty annotations | An official response example contains inline [web:N] markers while annotations is empty. Therefore, empty annotations alone does not mean no sources were cited. | [Output Control](https://docs.perplexity.ai/docs/agent-api/output-control) |
| Search occurrence | With web_search available, the model decides whether to invoke it based on prompt and instructions. Search configuration controls returned context; source metadata is not a copy of the entire cited page. | [Web Search](https://docs.perplexity.ai/docs/agent-api/tools/web-search) |
| Completion | The reference enumerates completed, failed, incomplete, in_progress, queued and cancelled. Background documentation calls incomplete a terminal run stopped before finishing, including truncation. | [Create Agent Response](https://docs.perplexity.ai/api-reference/agent-post), [Background Mode](https://docs.perplexity.ai/docs/agent-api/background-mode#poll-for-the-result) |
| Output ceiling | max_output_tokens caps generation. Neither that description nor the inspected status definitions promises substantive completeness, factual correctness, or a universal finish-reason guarantee for every model. | [Create Agent Response](https://docs.perplexity.ai/api-reference/agent-post#body-max-output-tokens) |
| Moving preset | Perplexity manages named presets; model and configuration can change. Explicit request fields override defaults, with a documented tools exception. Recording only fast is insufficient to establish identical configuration over time. | [Presets](https://docs.perplexity.ai/docs/agent-api/presets#what-changes-when-a-preset-is-updated) |

The cookbook establishes a documented mapping convention, not that any arbitrary bracketed number is necessarily a citation. A defensible implementation validates actual IDs and retains unresolved or ambiguous references. It does not convert a source into a claim of influence.

## What this code currently preserves

Code references below are relative to the repository root at the baseline commit.

- **Request:** src/integrations/perplexity/provider.ts:46 and :55 sends the user's prompt, CiteScout's own neutral instruction, preset fast, an output ceiling, and stream false. src/server/scans.ts:175 supplies **700 output tokens**. Because instructions override the preset default, do not assume CiteScout inherits all preset citation instructions. [Override contract](https://docs.perplexity.ai/docs/agent-api/presets#customizing-presets)
- **Text extraction:** provider.ts:65–79 accepts message objects only when every content element fits output_text, extracts their text, inserts newlines between parts, and trims both ends. A mixed content array can cause the whole message to be skipped. Role, per-message status, content boundaries and annotations are not preserved by the returned Observation.
- **Sources:** provider.ts:69–83 flattens valid search_results items into a variable named citations. It never checks markers. citationSchema at :3 retains id, URL, optional title/snippet; other metadata is stripped. If one record fails that array schema, safeParse rejects the entire search-results item and silently omits its sources.
- **Successful response:** provider.ts:62–64 rejects non-completed responses; :84 rejects empty extracted text. Nonempty completed text with zero sources succeeds. Unknown output shapes can therefore be indistinguishable from absent data after extraction.
- **Persistence:** src/server/scans.ts:190–212 stores normalized text in rawResponseText, source JSON, model, preset, request ID and input/output token counts. src/db/schema.ts:214–232 defines those fields. There is no full response envelope, annotation array, original content parts, provider status, incomplete_details, provider timestamp, or request snapshot in this result write.
- **Failures:** scans.ts:230–254 records a sanitized diagnostic and a failed reservation. The thrown incomplete/failed response's partial answer and metadata do not become an observation.
- **Fixtures:** tests/unit/perplexity.test.ts:8–37 constructs a mock with one source and one matching [1]. It checks source count, not citation linkage or exact text preservation. tests/integration/fixtures.ts:9–19 constructs a mock with a source but no marker. Neither is an authenticated production sample. No such sample was inspected.

Thus **exact captured answer text** for future records should mean preserving each returned decoded text value unchanged, including whitespace, with original order and boundaries. That is distinct from byte-exact HTTP/JSON preservation: JSON escaping and transport bytes are a separate fidelity claim. A normalized display string can coexist as a derivative; it must not replace the evidence needed to support the claim.

## Conservative treatment boundaries

These are research conclusions for downstream decisions, not implementation tickets.

| Observed condition | What the evidence supports |
|---|---|
| completed, usable text, validated source marker | Captured answer; corresponding record can be identified as cited by a supported marker. Keep its linkage provenance. |
| completed, usable text, sources but no verified linkage | Captured answer plus **returned sources**. Citation usage remains unverified. |
| completed, usable text, no returned sources | An answer was captured; no source records were returned/retained. Do not invent sources or equate this with provider failure. Distinguish absent data from parser rejection. |
| Recognized marker without matching ID, conflicting IDs, unsupported format | Preserve text and records; flag linkage as unresolved. Do not resolve via array position or a guessed URL. |
| incomplete, failed, cancelled, queued or in_progress | This is not a successfully completed observation. Any retained partial text requires its original status. Pending and terminal failure are different states. |
| completed but near/at the requested token cap | Preserve completed as the provider's status; retain cap and usage. A possible clipping warning is an inference, not proof. Do not silently relabel it incomplete or assert a complete investigation. |
| Empty/unparseable response | No usable answer evidence. Do not turn failure into “brand absent” or “source disappeared”. |
| Legacy row | Describe actual retained fidelity and provenance. Do not backfill invented completion detail, annotation linkage or raw bytes. |

## Minimum audit information to carry into the spec

The following requirements are inferences from the losses above; storage layout and lifecycle are owned by downstream tickets.

1. **Request context:** exact buyer-question text, neutral/system instruction and version, endpoint/provider, requested preset/model and explicit parameters including output cap. If effective preset internals are unavailable, retain that limitation.
2. **Capture identity:** local attempt/observation ID, request/receipt timestamps, returned response ID and model, provider timestamps when supplied.
3. **Evidence:** unchanged ordered output_text values and their message/content identity; original returned source IDs and metadata; annotations when supplied. Preserve unknown or rejected structure sufficiently to distinguish absent evidence from extraction failure.
4. **Outcome:** provider response/message statuses and supplied error/incomplete details, transport or parse outcome, requested cap, token usage, and reported cost when available. The API reference exposes usage/cost; do not estimate provider-reported values and label them exact. [Response contract](https://docs.perplexity.ai/api-reference/agent-post)
5. **Derivation provenance:** extraction/citation-parser version, normalized-display rule, detected marker-to-source links, unresolved links and reasons. Mention detection is a separate derived layer, never a replacement for the answer.

## Remaining unknowns and smallest verification

- No production sample establishes the actual marker format, annotation population, mixed content shapes, or clipping behavior for CiteScout's overridden instruction and 700-token ceiling. Capture an appropriately approved dogfood response through the normal observation path later; keep this report's conservative fallback until supported linkage is present.
- The inspected docs do not fully specify annotation offset units, duplicate/conflicting source IDs, or every model's behavior when hitting its cap. Do not invent a universal parser contract. Preserve original evidence; test only supported conventions, leaving ambiguous links unresolved.
- Preset changes may be invisible beyond the returned model. Even identical visible request settings do not establish a deterministic experiment or prove the user's action caused a difference.
- Source URLs and snippets are not immutable snapshots of source-page content. This research does not authorize page crawling or a content-archiving feature.

**Research sufficiency:** the evidence is sufficient to resolve the terminology and fidelity boundary now: preserve captured API text, distinguish returned from verified cited sources, retain incomplete/unknown status, and attach provenance. Empirical compatibility remains a bounded validation task; it does not require pretending that today's fixtures establish stronger guarantees.
