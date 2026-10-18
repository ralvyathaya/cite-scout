# Website setup suggestions

**Date:** 2026-10-17 · **Change:** new retrieval/generation capability · **Decision:** go for offline implementation; conditional for live activation.

The founder requested URL-only input followed by review/edit, replacing manual entry of every field. The target is a usable draft of the brand, competitor candidates and three buyer questions from one public homepage. Current baseline: manual entry. Measure success through a real owner review of category fit, correct brand quotation, competitor relevance and question usefulness; automated fixture success does not establish model quality.

## Flow and boundaries

`Suggest setup` reads the HTTPS homepage, then makes at most one OpenAI Responses request using `gpt-6-luna`, `reasoning:none`, a strict JSON schema, 1,600 maximum output tokens and `store:false`. No search/tool is enabled and no paid request retries automatically. The existing visibility collectors, classifier, diagnosis policy, prompts and measurement cohorts are unchanged. The model/rates were checked against [OpenAI's model reference](https://developers.openai.com/api/docs/models/gpt-6-luna) and [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

The response is only an editable setup draft. Brand evidence must quote the extracted input; competitor names remain inferred, unverified candidates, and their domains are left blank. Three distinct buyer questions are suggested. Original generated reasons and the source/time remain inspectable after edits. Returning to the same website preserves edits without regeneration; choosing a different website starts another draft. Project creation and monitoring each retain their existing explicit confirmation and access checks.

Homepage text is untrusted data, never an instruction source. Responses with refusal, incomplete status, malformed JSON, invented quotation, duplicate names/questions or unsupported fields are rejected. React renders returned text normally rather than as HTML. A page/model failure preserves user input and offers manual setup.

## Retrieval and spending controls

- The shared public-page reader retains owned-domain redirects, public IPv4/IPv6 DNS checks at every hop, HTTPS only, three redirects, a ten-second timeout and a 128 KiB body ceiling. IP literals, credentials, custom ports and private/local targets are rejected. Homepage profiling drops user-supplied paths, query strings and fragments. No credentials/cookies are forwarded to the site.
- This is an HTTP metadata/text reader, not a browser. It cannot see JavaScript-only content, authenticated pages or all product pages; sparse, blocked, oversized or error responses fall back to manual setup.
- `ONBOARDING_SUGGESTIONS_DAILY_CAP=0` or `ONBOARDING_SUGGESTIONS_TOTAL_BUDGET_USD=0` disables new generation in local, staging and production defaults. Enabling is an operator action after migration and approved live scope. The existing OpenAI key remains a secret.
- One additive table, `onboarding_suggestions`, reserves before retrieval/inference. An atomic conditional insert enforces global UTC-day and three-per-account caps, a unique request ID and one active request per account/domain. Replays, overlapping clicks and restarts do not dispatch the same reservation again.
- Successful drafts are reusable per account/domain/version, including after disabling generation or removing its key. They retain their original source/time; they are saved setup drafts, not fresh captures of a changed website. Failed attempts consume their reservation; there is no refund/retry that could conceal a paid request. Cached hits consume no new inference attempt. Outputs never enter monitoring observation tables or visibility denominators.
- The total budget is checked in the same atomic insert as the daily quotas, summing US$0.01 reservations across the entire environment ledger. UTC rollover, unknown cost, failed attempts and account deletion do not restore budget. Do not delete/reset this ledger while a testing allowance is active.
- Each reservation conservatively retains US$0.01 for inference, with a 16,000-byte request ceiling. Standard rates checked on this date are US$0.10/million input and US$0.50/million output tokens; recheck before activation. Usage yields an **estimate**, not a reported charge. Unknown costs stay null and retain the reservation. The separate ledger records provider start, tokens, model and failure code. Account deletion clears draft/source data and nulls ownership while retaining anonymous global usage accounting; it also prevents an in-flight response from restoring a deleted draft. This does not reset or spend the existing GEO experiment ledger.

## Risks, rollback and owner review

The main degradation risk is a plausible but irrelevant competitor or question, especially when a homepage describes the category poorly. Homepage metadata can also be stale or malicious. Schema and exact-quotation tests detect structural problems; an owner must judge the semantic fit. No accuracy, coverage, ranking or visibility claim follows from a generated draft.

The blast radius is onboarding only. No project or scan is created until confirmation. Generated draft/cost metadata is saved separately; editing the draft affects only the later explicit project payload. Rollback disables the cap and retains manual setup; the additive table and ledger can remain. No staging/production migration, deployment, key change or paid call is part of offline validation.

Before activation, the owner reviews the synthetic desktop/mobile flow and authorizes the URL/count/budget for a live smoke test. At ship, disclose candidate uncertainty, homepage limitations and manual fallback in the product; support uses this document.

## Approved local smoke test

On 2026-10-17, the owner approved one OpenAI request for the public `cite-scout.com` homepage with a US$0.01 ceiling. The authenticated local onboarding flow completed successfully using `gpt-6-luna`: 388 input tokens, 219 output tokens, and a conservatively rounded ledger estimate of **US$0.000149**. This is a token-based estimate, not an invoice or a reported provider charge. The separate US$0.01 reservation remains recorded.

The draft extracted **CiteScout**, supported by the exact homepage quotation “CiteScout — Buyer questions on Perplexity.” It proposed a broad AI-answer brand-monitoring category, three unverified candidates (Profound, Peec AI and Otterly.AI), and three editable buyer questions. Structural validation passed. An initial qualitative inspection found category alignment, but questions two and three both concern selection criteria and could be made more distinct during review. Candidate relevance and overall setup quality still require the owner's judgment; one successful homepage is not a quality evaluation across websites. No owner edits or approval of the generated content are recorded yet.

One cache-only replay displayed the saved draft without another homepage/model request. Final local ledger: **one reservation, one provider dispatch, one successful draft**. Generation was disabled again by removing the temporary local cap override; all tracked environment defaults remain zero. No project was created, no visibility monitoring was started, and staging/production were unchanged. A local development hot-reload failure required a dev-server restart; the saved backend draft survived and the cache replay succeeded. The in-memory form does not survive a full browser reload.

Offline verification passed: full unit suite (234), Worker integration suite (170), 12 focused browser tests including 320px, typecheck, lint, build, dependency audit and existing V2/migration checks. Synthetic desktop/mobile screenshots and a screenshot of the real cached draft are stored outside the repository under the dated local visualizations folder.

## Local testing allowance, 2026-10-18

The owner reported that localhost showed suggestions as unavailable after the smoke test. The cap/key gate also blocked saved drafts, and the six-hour cache prevented reopening them the next day. Generation readiness now gates only new requests; saved drafts remain tenant-scoped and reusable for their original website/parser version. Regression coverage reproduces the original rejection, reopens an old draft without a key/cap, and rejects another account or an uncached website without making a provider call.

The owner separately approved **US$0.10 total for local testing**. Local ignored configuration enables a daily cap of ten attempts and a total budget of US$0.10; staging/production defaults remain zero. The earlier US$0.01 reservation counts against this ceiling, leaving at most nine additional reservations. This intentionally over-reserves compared with token estimates. Concurrency and next-day tests verify that the total cannot reset or overspend through simultaneous requests. This allowance is for onboarding suggestions only and does not enable monitoring or a scheduled job.

Verification: all 172 Worker integration tests, typecheck, lint and formatting passed. The authenticated localhost browser reopened CiteScout's saved draft after a dev-server restart. The local ledger still has exactly one reservation (US$0.01 reserved, US$0.000149 estimated), so this verification made no additional paid call. The owner can now test new websites within the approved total budget and the existing three-attempt/account/UTC-day quota. Saved drafts cost no new reservation. No deployment or remote migration was performed.

Later the same day, the owner authorized moving the remaining US$0.09 allowance to isolated staging. Local new generation was disabled, preserving its original ledger. See the [staging login/onboarding review record](2026-10-18-staging-login-onboarding.md) for that deployment, migration, allowance transfer and pending Google callback registration.
