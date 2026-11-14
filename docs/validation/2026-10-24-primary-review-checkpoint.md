# Primary answer review checkpoint — 24 October 2026

Scope: resume U4–U6 using stored evidence and the owner's saved labels. Prices, providers/models, budgets, entitlements, subscription bindings, schedules and staging/production deployments are unchanged. No inference, paid monitoring request, merchant transaction or database mutation was made.

## Human progress

All 20 Answer sections are saved: 100 manually selected labels. Identity is present; 1,149 source/evidence/diagnosis/task fields remain null. No record has every required detail field complete. No full reviewed-at timestamp, labels-lock or classifier report was created. The existing strict freeze/score contract has not been weakened.

The primary draft was copied byte-for-byte into ignored private storage before examining transport discrepancies. Its SHA-256 is `6db80cd70b3653a0284f3bcf9069b2e20b3c83d816ef8d24df0b886ddffcc5b9`; the original blind packet's SHA-256 remains `ba6f27ee54053d97cd413596893c295c5f1d16c41e35c2ce25fd599b4d977825`. This preserves a review checkpoint, not a full label lock. Original labels and packet were not rewritten or filled by the agent.

| Primary field    | Human judgments at checkpoint              |
| ---------------- | ------------------------------------------ |
| Capture quality  | 11 complete, four partial, five no-feature |
| Answer quality   | 11 usable, seven incomplete, two unknown   |
| Brand presence   | 14 absent, six unknown                     |
| Brand stance     | 19 unknown, one not-applicable             |
| Evidence support | 16 unknown, four unavailable               |

These are human-label distributions, not model accuracy or a customer visibility rate. In particular, unknown is not absent. No classifier decisions, probabilities, diagnoses or task predictions were opened/scored. No labels were supplied automatically.

The owner reports CiteScout is still being developed. A corpus without positive CiteScout mentions can test some negative/abstention cases; it cannot establish recall for positive mentions or recommendations. The product's development stage is context, not a verified causal explanation for absence. Existing synthetic positive cases remain synthetic. Do not reinterpret a low mention count as a broken collector or claim marketing uplift from this review.

## Capture completeness needs separate review

Ten primary capture-quality judgments differ from the immutable capture envelope: records 1, 5, 7, 10, 13 and 14 are stored as partial OpenAI captures but labeled complete by the reviewer; records 2, 8, 19 and 20 are stored as complete Google captures but labeled partial. These differences are retained for review, not counted as classifier errors or silently resolved in favor of either label.

Record 5 has explicit original provider evidence: response status `incomplete`, reason `max_output_tokens`, and an incomplete message item. The other five legacy OpenAI records have a completed top-level response/message but also a search item still marked `searching`; a readable paragraph alone does not establish a complete capture. These records used the historical 700-token context; they are not a new test of the current prospective configuration. Their history was not upgraded or assigned to a different cohort.

For Google, the parser preserves all supplied text, but transport success does not prove the answer's prose is useful or semantically complete. Keep capture quality and answer quality separate; short or awkward text is not by itself proof that the parser dropped content. The owner must assess original evidence and may revise their own labels. The agent did not substitute transport statuses for human judgments.

The local form now explains the five-label first stage and distinguishes technical capture completeness from answer usefulness. Its progress shows `Ringkasan utama 20/20` separately from the remaining full-review labels. Saved labels remain unchanged; the browser was reopened at record 5 for the next human step. This is local review tooling, not customer UI or a staging release.

## Offline answer-envelope replay

The current capture parsers were replayed against all 20 stored envelopes: six OpenAI, four Google AI Overview, five Perplexity and five Bing. All 20 preserved answer text, source objects and capture quality exactly. The native fetch implementation was replaced with a throwing guard; parsers received only in-memory Response objects. There were 20 in-memory responses, zero native fetch attempts and zero provider charges. Assertions verified the source export, original blind packet and live human-label file were byte-identical before/after replay.

For Google, the stored search response has an intentionally redacted page token and a retained secondary answer envelope. The secondary envelope was fed directly to the parser. This checks answer parsing; it does **not** reproduce the two-step transport, admission, token-expiry recovery or a live Google query. Preliminary harness runs that attempted full chained replay are not success evidence; the private final receipt is `parser-replay-2026-10-24-answer-envelopes.json`.

No parser defect was established by this replay, so no collector/model/output/budget change was made. Reproducing old partial/no-feature results is not a new complete capture and does not close G1/G2. No classifier quality score or release approval follows from parser preservation.

## Remaining steps

1. Review capture/answer distinctions, starting with record 5's explicit incomplete envelope. Keep the prior human draft as a checkpoint and save any human revisions normally.
2. Complete the remaining source/evidence/diagnosis/task judgments before the existing full freeze/score workflow. Do not populate unknown fields using model predictions merely to make the CLI accept them. Positive real-class coverage remains unmeasured in this primary corpus.
3. U5/U6 still require the intended merchant test store/product and six matching test variants, remotely configured test secrets/identifiers, and genuine billing lifecycle receipts. Prior read-only discovery found unrelated variants, not a configured CiteScout offer. No merchant mapping was guessed here.
4. Real after-action samples, acceptable verified package economics and a production-copy recovery drill remain open. Existing public-sales and production gates remain unchanged.

Verification for this follow-up: all 100 primary values were validated against their blind packet choices without reading predictions; the immutable draft copy and guarded parser replay assertions passed. The local form's JavaScript syntax, changed-file formatting and whitespace checks passed. No new app build, paid/live engine test, classifier inference or staging deployment was run for this local-only follow-up.
