# Owner staging validation: first UTC day

The first real CiteScout run completed on 2026-10-13 in isolated staging. This is a partial validation result; the second UTC day and a genuine completed-action comparison remain pending.

## Scope and result

- Project: CiteScout, `cite-scout.com`; competitors Peec AI and Otterly.AI.
- Real owner authentication behind owner-only Cloudflare Access; no trial enrollment or legacy baseline call.
- US / English / desktop, four selected engines, daily schedule disabled.
- Run `f0b6512d-3ae3-411a-bb7b-a4b52c479bc4`: 12 attempts, 9 saved observations, 3 failed attempts, terminal status `partial`.

| Engine                           | Saved observations | Fidelity and failure states                                                                                                                                                                                                       |
| -------------------------------- | -----------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perplexity Agent API             |                  2 | Complete answers retained; one additional response ended at its output limit and was rejected as incomplete.                                                                                                                      |
| OpenAI Web Search API            |                  3 | All retain actual `gpt-6-luna` text, usage, request IDs and verified citation spans, but remain partial. Two completed envelopes also contain an unfinished search item; the third envelope is incomplete at its output limit.    |
| Google AI Overview via SerpApi   |                  2 | Actual AIO text and source references retained. One follow-up response reported no Google results and remained a failed attempt.                                                                                                  |
| Bing Copilot Answers via SerpApi |                  2 | Neither result contained a Copilot block. Both are `no_feature` observations with empty AI text; organic snippets are retained only as returned sources. One earlier attempt failed before dispatch and was closed without retry. |

Capture quality totals: four complete, three partial, two absent AI features. Saved observations therefore do not mean nine AI answers. Missing or partial evidence is excluded from eligible visibility measurements.

The unchanged prompt set is:

1. Which tools help a small SaaS team monitor brand mentions and citations in AI search answers?
2. Which generative engine optimization tools help founders turn AI visibility data into concrete marketing tasks?
3. How can a small marketing team compare AI search visibility across answer engines and measure changes after website improvements?

## Classification and proposed work

Nine Clef Flash classifications completed through the Workers AI binding. Measured application latency was 1,417–1,766 ms; this run does not demonstrate a sub-50 ms end-to-end service. Results remain provisional and require review; classifier accuracy is not established by nine samples.

The playbook proposed:

- **Web / Owned:** inspect a buyer-relevant CiteScout page, verify public access and robots/noindex/canonical signals, assess product/use-case clarity, and record the actual URL and next change.
- **Earned Media:** inspect the observed `moz.com/blog/best-brand-monitoring-tools` source. The brief distinguishes one answer reference from one returned result across four eligible observations; competitor recommendation co-occurrence does not prove a direct competitor citation.

The saved answers support investigation, not a confirmed indexing defect or guaranteed placement. Both tasks remain proposed. No external publication or website change was invented, no completion event was recorded, and no live action pin or causal/ROI claim was created.

## Cost and retained accounting

| Collector  | Retained request reservations | Reported USD | Estimated USD |
| ---------- | ----------------------------: | -----------: | ------------: |
| Perplexity |                             3 |      0.01171 |             — |
| OpenAI     |                             3 |            — |     0.0345393 |
| SerpApi    |                             9 |            — |             0 |
| Workers AI |                             9 |            — |   0.000855988 |

Reported plus estimated cost is approximately US$0.047105288, not a reconciled invoice. Conservative reservations total US$2.268 against the US$5 ceiling. There are no unresolved cost entries.

SerpApi's account API confirmed an active Free Plan, eight searches used and 242 remaining. Nine local reservations include the one confirmed failure before dispatch; only eight SerpApi HTTP requests were made. No paid fallback or ambiguous submission was retried.

Operator reconciliation preserved every request and attempt row:

- The first Bing failure occurred because the Workers runtime rejects `redirect: 'error'` before fetch dispatch. Native Worker regression reproduced that failure; SerpApi usage remained zero. It was closed without retry and given a zero estimate with explicit before-dispatch provenance.
- The incomplete Perplexity response reported USD `usage.cost.total_cost=0.00395`; its retained ledger row was reconciled to that provider-reported amount without another call.
- The two failed Google request reservations were given zero estimates only after verifying the active free allowance. The capture remains failed.

Configured local credential values were absent from the saved capture/attempt/classification JSON and built client assets. Production resources, billing and other users were not changed.

## Delivery checks and remaining work

The runtime redirect fix (`ca00d1b`) passed 179 unit tests, 143 Worker integration tests and hosted `Checks`, including migration checks and the full browser suite. The dashboard follow-up passed build/typecheck, lint and 20 targeted desktop/mobile tests. It replaces raw HTML parse errors with a recovery instruction, preserves actual saved answer text, and performs only GET requests when refreshing evidence.

Complete a real Owned or Earned task and record its findings/change URL before marking it done. Then run the same three prompts and four engines once on another UTC day, earliest **2026-10-14 00:00 UTC** (07:00 Asia/Bangkok). Preserve the current prompt, collector, model and configuration cohort. Changes to output limits or parser policy require a new cohort; they cannot silently repair historical partial captures.

Remaining gates: live completion pin and linked remeasurement, broader classifier/citation-fidelity evaluation, provider reliability and quota economics, and the existing development-dependency security alerts before a founder pilot. Production deployment, live billing and automated publishing remain outside this validation.

See [the staging runbook](../four-engine-staging.md) for setup and shutdown. The [D1 query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) supports the guarded operator batch used for this staging-only reconciliation; Access protections were not bypassed or weakened.
