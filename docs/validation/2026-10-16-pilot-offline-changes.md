# Founder-gates offline implementation

Scope: U1–U5 of the [approved plan](../plans/2026-10-16-0804-fix-founder-pilot-gates-plan.md). U6, deployment, provider spending and pilot invitations remain unapproved.

## AI change log

**Date:** 2026-10-16. **Class:** collector/parser configuration. **Verdict:** go for offline implementation; live candidate requires separate scope and budget approval.

OpenAI keeps `gpt-6-luna`, required `web_search`, one tool call, `reasoning:none` and `store:false`. New captures increase its output ceiling from 700 to 1,600 and use `geo-collector-3`; other engines keep their own budgets and versions. The parser recognizes documented `find_in_page`. Historical captures and contexts are immutable.

The intended improvement is fewer output-limit truncations; the live measure remains three complete buyer answers on the final configuration. Six local historical replays remain partial, including unfinished searches. A larger output limit has not proved that problem solved. Risks are higher output cost, latency and continued partial results. Conservative per-request reservations and strict response/item/citation checks remain in place. The owner reviews saved envelopes before authorizing the next live request.

These settings affect newly requested OpenAI observations only. Reverting code requires a Worker deployment; stored results keep their original cohort. The owner is informed through this receipt and PR. No classifier/model/rubric change is justified by synthetic tests or unfilled human labels.

References: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [historical replay](2026-10-16-openai-offline-replay.md).

## Live gate status

G1 OpenAI, G2 positive Bing answer, G3 human-reviewed diagnosis and G4 genuine post-action measurement remain **unmet**. Offline regression tests and prepared review packets are not live success receipts.
