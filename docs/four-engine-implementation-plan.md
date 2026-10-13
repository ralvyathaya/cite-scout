# CiteScout: four engines and owner validation

## Accepted scope

Implement Prompt Set → Observation → Diagnosis → Action Playbook → Re-measurement for the founder/marketing workflow. Preserve the professional sidebar, overview/trend/work/evidence composition, visible Monitor Prompts control, original prompt and timestamp, clickable references, Owned/Earned tasks, completion pins, and limited-sample labels. No large dashboard redesign, publishing, billing activation, or Copilot chat.

Use Perplexity Agent API, a distinct OpenAI Web Search API engine (Responses, required web search, maximum one tool call, store:false, requested gpt-6-luna), SerpApi Google AIO and Bing Copilot Answers, and Clef Flash through Workers AI. Keep historical ChatGPT Search/DataForSEO and optional Jev adapters. Five catalog engines, at most four engines/ten prompts per run. Fresh monitoring without provider caching or automatic paid retries. Freeze collector, requested model, prompt, parser and configuration; collector/model changes create separate measurement cohorts. Redact provider credentials before persistence and raw downloads.

## Delivery units

1. Isolated staging Worker/D1/hostname/secrets, real app authentication and exact-owner Cloudflare Access; workers.dev and preview URLs disabled. An expiring, at most 14-day internal GEO grant applies only to its configured account and is rejected in production. Legacy collectors cannot bypass staging accounting.
2. Native Workers fetch adapters for OpenAI and SerpApi with bounded bodies, partial/incomplete and missing-feature states, original answer text, verified citation spans and retained retrieved-source distinctions. Google page-token follow-up stays on a fixed endpoint and within expiry; Bing organic snippets cannot become AI answers.
3. Durable accounting distinguishes observations and actual provider requests, reserves every request before dispatch, preserves uncertain spending across restarts/deletion, limits SerpApi requests, and caps owner testing at US$5. Reported cost, dated estimate and unknown cost remain distinct. Unknown/ambiguous costs halt additional internal spending until operator reconciliation; no paid fallback.
4. Dashboard setup/readiness/next-step guidance, selected-engine progress, readable locale controls, usage and cost transparency. Preserve prior trial/billing/history and synthetic fixture isolation.
5. Public repo delivery: required PR, strict green Checks, no force-push/master deletion, zero mandatory second reviewers, secret scanning/push protection and Dependabot security updates. CI uses synthetic fixtures and no real provider keys.

## Verification contract

Typecheck, lint, unit, Worker integration, migrations/retention, build and desktop/mobile keyboard browser tests. Cover fresh search, multipart citations, incomplete/invalid captures, Google direct/follow-up/expiry/missing/error, Bing AI-only text, concurrent workers/replay/restart/persistence failure, quota and unknown costs, frozen collector/model, trial-owner grant/other-account denial/expiry/production rejection, and synthetic nonproduction data. Review classifier decisions against raw answers during live validation.

Live validation uses 3 neutral prompts × 4 engines × 2 different UTC days: at most 24 observations, 6 OpenAI calls, 6 Perplexity calls, 18 SerpApi requests, and 24 classifications. First round validates adapters without extra paid probes. Verify account/model access, current tariffs, free SerpApi allowance and conservative ceilings before the first call. US/en desktop, daily schedule initially off. Record a completed external task and inspect its pin and linked remeasurement; success does not require improved visibility or imply causality/financial ROI.

## Operator dependencies

Follow [the staging runbook](four-engine-staging.md). Live Access policy verification, staging Turnstile/authentication secrets, provider keys, owner account ID, verified ceilings and two separate UTC days are required before the live criteria can be claimed. Missing credentials or permission do not justify exposing an unprotected staging Worker or substituting fixture results for monitoring.
