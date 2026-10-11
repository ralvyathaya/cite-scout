# Provider change approved on 2026-10-11

This implementation addendum supersedes the original plan's mandatory Jev/DataForSEO choices. The user requested Clef Flash as primary classifier, an optional Jev adapter, optional DataForSEO, real target responses where available, and an isolated fixture flow without API costs. Product scope, evidence transparency and comparison limits remain in force.

| Original DataForSEO use | Endpoint family                                                                    | Data collected                                                     | MVP treatment                                     |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| Google AIO              | `/v3/serp/google/organic/task_post` and saved `task_get/advanced`                  | Actual Google overview, SERP results and answer/element references | Optional adapter; unavailable when not configured |
| ChatGPT Search          | `/v3/ai_optimization/chat_gpt/llm_scraper/task_post` and saved `task_get/advanced` | Captured ChatGPT search answer and reported model/references       | Optional adapter; unavailable when not configured |
| Bing Copilot Answers    | `/v3/serp/bing/organic/task_post` and saved `task_get/advanced`                    | Copilot overview in Bing, nested references and SERP results       | Optional adapter; unavailable when not configured |

Perplexity continues using its actual Agent API. It is labeled as that API surface rather than consumer chat UI parity. Missing target collectors never silently become web-search observations.

Serper offers Google SERP research; its public example documents organic links/snippets and does not establish an AI Overview response contract. Use it only for supporting discovery unless an actual provider contract/capture proves an overview field. [Serper](https://serper.dev/) currently advertises 2,500 free queries; actual available balance still belongs to the account.

Tavily search/extract support source discovery and supplied page evidence. Its optional synthesized answer is not an observation of ChatGPT, Google AIO, Bing Copilot or Perplexity. Auxiliary outputs must stay outside visibility rates and citation-frequency counts. [Search reference](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Extract reference](https://docs.tavily.com/documentation/api-reference/endpoint/extract).

Classifier contract: `env.AI.run('@cf/cloudflare/clef-flash', {model:'clef-flash',state,questions})`. The Choice/Noul schema is provider-neutral; a selected `clef` or `jev-1.13.0` records a distinct model/rubric cohort. There is no automatic paid fallback. [Clef Flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/), [TypeSafe native contract](https://docs.typesafe.ai/api).

Local Worker tests disable remote bindings and replace inference/network boundaries with explicit synthetic adapters. The development fixture workspace must carry a persistent synthetic-data banner, avoid live endpoints, and never persist into production monitoring tables. Live adapters remain gated by secrets, positive operator budgets and explicit enabled flags; all secrets are server-side.

Owned page verification is limited to known owned targets, public DNS records, HTTPS, validated redirects, ten seconds and 128 KB. It observes HTTP/meta/header/canonical signals and never proves indexing. Native Workers `fetch` cannot pin the resolved IP; public-address validation is repeated before each fetch/redirect and Workers' public outbound network is relied on at connection time. Keep this boundary on Workers, and do not port it unchanged to a Node server with private-network access. Page checks remain off by default.
