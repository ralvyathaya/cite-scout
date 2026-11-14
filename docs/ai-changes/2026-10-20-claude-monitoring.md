# Claude monitoring preparation — disabled

Decision: go for synthetic verification and staging code deployment; no-go for live activation in this change.

This adds `claude_web_search` / `anthropic_messages` as an optional evidence collector. It gives customers another API answer surface to compare. Existing classifier, onboarding, subscriptions, entitlements, engine selection limits, schedules and provider settings are unchanged. No database migration or dependency is needed.

## Request and evidence

One Messages request uses `claude-sonnet-5-5`, the existing neutral research instruction, `web_search_20250305` with `max_uses: 1`, at most 1,600 output tokens and a 30 second timeout. Tool choice is automatic. There is no retry or automatic `pause_turn` continuation. Text blocks are retained without rewriting; search results are `retrieved`, citations are `answer`. `cited_text` is a source quote and never establishes answer offsets or verified inline citations. Thinking blocks are not displayed as the answer.

No search, tool errors (including HTTP 200), refusal, truncation and incomplete usage yield partial captures. Unsafe source URLs are excluded from normalized sources. Raw evidence is size bounded and redacted before storage/readback. Provider request ID, model and token usage remain available in answer details.

## Cost and blast radius

`GEO_CLAUDE_ENABLED` defaults to `false`. Anthropic has separate request and per-request reservation limits, both zero by default. Its optional key is not installed by this change. Admission requires staging, an unexpired owner grant, the key, positive Anthropic limits, the existing global budgets, and an owned active lease before HTTP. It never borrows Perplexity allowance. Existing five-key cumulative limits are unchanged. An uncertain request or unknown cost continues to block spend under the existing ledger rules.

Pricing version `anthropic-sonnet-5-5-web-search-2026-10-20` estimates $2 / million input tokens, $10 / million output tokens and $0.01 / search. Cache reads use $0.10 / million; unexpected cache creation is unknown because this request does not opt into caching. Missing/invalid token or search usage and unknown models remain unknown, never zero. Estimates are not invoices. Reservations must be reviewed before activation against real input length and provider rates.

The blast radius is the additive engine registry, collector dispatch, provider ledger, read capabilities and engine UI. Existing project settings are never rewritten. Old capability responses omit Claude safely; new selection hides it while disabled. Stored Claude evidence remains readable regardless of enablement. The four-engine selection limit is unchanged.

## Verification and remaining risks

Synthetic tests cover parser boundaries, citations, usage, tool failures, timeout/lost responses, no retry/continuation, zero HTTP with disabled/missing-key/zero-limit gates, isolated quota, ledger redaction and historical reads. Browser coverage checks disabled and older capabilities, four selection slots, and synthetic evidence through Answers, Sources, Diagnoses, Competitors and Trends on desktop/mobile. The opt-in local workspace is `/app/observations?fixture=1&claudeFixture=1&engine=claude_web_search`; fixture mode is localhost only and visibly synthetic.

The API can decline to search, truncate its answer or return tool errors. API answers are not a reproduction of the consumer Claude app. Real key/account/model access, search quality, latency and actual charges are deliberately unvalidated. The operator must review these before a separate activation; customer support/product must retain the API-surface and evidence-quality framing. Disable the flag to stop new Claude requests; historical captures remain readable. Staging rollout uses an active configuration snapshot and `--keep-vars`, with a before/after bindings, runtime and schedule comparison.

References: [Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/overview), [web search contract and pricing](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool). Retrieved 2026-10-20.

Validation: 253 unit tests and 184 integration tests passed. The 10 Claude admission/ledger cases were rerun after correcting test clock arguments. Browser runs passed 78 distinct desktop/mobile cases across Claude, Prompts, Monitoring, workspace, Sources, Competitors and Diagnoses. Typecheck, lint, build and formatting of changed files passed. Browser images were inspected locally; live-account visual QA still requires Cloudflare Access login.

Staging deployment is pending: the required Cloudflare Access preflight repeatedly returned HTTP 504 from the application/policy API despite a valid read token. Static isolation checks and the active Worker configuration snapshot succeeded (35 variables, 11 secrets); Claude flag/limits were absent and therefore default disabled/zero, with no Anthropic key present. The staging hostname still returned the Access login redirect. No deployment guard was bypassed and no remote settings were changed. The previous deployed version remains `46c4db5f-dbd0-4ffb-b5e4-7748094c2bdb`. Rerun the normal preflight, take a fresh active snapshot, deploy with `--keep-vars`, and verify before/after configuration once the API responds.
