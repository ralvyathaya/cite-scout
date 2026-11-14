# U3 production cost guard — staging preparation

The production admission guard is implemented, with no active cost policy configured. This closes the missing-code portion of U3 in the [MVP plan](../plans/2026-10-22-public-mvp-readiness-plan.md); final budget approval, verified rates/invoices, margin and production activation remain open.

No price, selected provider/model, active budget, entitlement, schedule, historical row or database schema is changed. No paid provider request or merchant transaction is run. Existing staging owner ceilings and legacy $19 Perplexity rights remain separate.

## Behavior

- `GEO_PRODUCTION_COST_POLICY` is an optional JSON configuration value. Its default is empty. Only `DEPLOYMENT_ENV=production` uses it; malformed, absent or zero-limit policies fail closed. No operational values have been selected or deployed.
- Fresh monitoring and analysis admission report an unavailable/support state when a production policy is missing. Cached/replayed analysis remains readable. Removing a policy after enqueue prevents provider dispatch; a no-HTTP paused intent remains resumable rather than becoming a terminal failed analysis.
- Immediately before billable dispatch, the existing ledger reserves a positive collector-specific ceiling atomically under global and project monthly USD **and** request limits. Existing observation/day/month caps and the independent SerpApi request cap still apply. The production guard never falls through to a Perplexity or staging allowance for an unconfigured collector.
- USD comparisons use integer microdollars. Exposure is the largest of reserved, reported and estimated cost for each row. A higher reported cost reduces remaining headroom; a lower settlement does not release the original reservation.
- UTC calendar months define this application window. Known historical rows remain stored outside the new month's sums. Uncertain, stale-started or completed-unpriced entries block further admission across month boundaries until operator reconciliation. Deleting an account/project does not erase its global ledger exposure.
- Two Google requests reserve two provider entries, independently of their one customer observation. Replay cannot reserve or dispatch the same operation twice. Existing DataForSEO recovery GETs retrieve already-submitted work; they are not new billable submissions.
- A production SerpApi estimate, when supplied, must be positive and no larger than its reservation ceiling. It is frozen in the ledger with the policy version at admission; later config changes cannot reprice that row. Missing estimates remain unknown. Zero cannot be used as an unverified free-tier shortcut. Reported answer-provider fees are never attributed to SerpApi.
- The configured reservation is an operator forecast, not a vendor billing hard limit. An actual response can exceed it; the larger settlement then blocks further work. Production activation needs verified maximum request costs and vendor-side controls, not merely a syntactically valid JSON object.

## Policy contract for the future release manifest

| Field                                             | Meaning                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                                         | Stable operator reference to the approved cost/rate assumptions; 1–100 ASCII letters/digits, dot, underscore or hyphen.                                                                                                                              |
| `globalMonthlyUsd`, `projectMonthlyUsd`           | Positive monthly USD ceilings, at most six fractional digits.                                                                                                                                                                                        |
| `globalMonthlyRequests`, `projectMonthlyRequests` | Positive integer limits for billable provider operations in the UTC month.                                                                                                                                                                           |
| `requestCeilingsUsd`                              | Positive per-request reservations keyed by the actual configured collector: `perplexity_api`, `openai_responses`, `serpapi`, `workers_ai`, `typesafe`, or `dataforseo_standard`. Unsupported keys are rejected; a missing collector cannot dispatch. |
| `serpapiEstimatedCostUsd`                         | Optional verified account-allocation estimate per search request, bounded by the SerpApi reservation. Omit when unknown.                                                                                                                             |

An empty collector map is invalid. Anthropic remains staging-only under the existing Claude guard; this policy does not enable it in production. Fictional policy values occur only in isolated tests. Operators must not copy those numbers into an active environment. Adding a real binding/configuration is a separate approval step; this deployment leaves it absent.

## Evidence and remaining gates

The new regression first reproduced the audit defect: a production request with positive count quotas and no dollar policy was admitted. It now rejects before HTTP. Review found a missing processing pause error case; its regression first observed a terminal `failed` attempt, then passed with the original intent left `queued` and no provider request.

Coverage includes malformed/zero policy, concurrent reservations at the exact ceiling, replay, project/global request caps, actual cost overage, two Google requests, frozen search estimates, unknown/uncertain/stale costs, month boundaries, retained exposure after project deletion and policy removal before collector/analysis dispatch. Existing historical-collector tests now supply an explicit synthetic production policy; no live budget changes are used to make them pass. Desktop/mobile tests confirm disabled monitoring directs customers to support without exposing the internal config name or starting paid work.

U4 metadata check: the existing private blind packet contains 20 records; reviewer and review date are empty, and neither a labels lock nor scored report exists. No labels were filled or guessed. U6 still needs a production data-copy/restore rehearsal and real test/live merchant lifecycle receipts. The earlier [synthetic migration rehearsal and margin report](2026-10-23-mvp-blocker-followup.md) remains applicable; the 60% contribution gate is not passed by adding this guard. Production and public sales remain blocked.

Verification: 287 unit tests, 251 integration tests and four targeted desktop/mobile Playwright tests passed. Full build/typecheck, lint, changed-file formatting, whitespace checks and the existing V2 migration/backup self-check passed. The historical DataForSEO fixture was updated with a synthetic production policy; assertions about the original collector and recovery behavior were preserved.

Full code review completed with no open actionable findings: run `20261023-production-cost-review`, artifact directory `C:/Users/RALVY/AppData/Local/Temp/compound-engineering/ce-code-review/20261023-production-cost-review`. Correctness, testing, security, reliability, performance and adversarial lenses were collected. The analysis resumability finding was fixed and independently reconciled against current source; the final test counts above are from after that fix. The Claude peer stopped before code egress because `jq` was unavailable; adversarial review used the local fallback. This is a completed local review, not independent cross-provider corroboration.

Additional coverage suggested by review, not established defects: exercise SerpApi's second HTTP callback at a production cap through the full collector; explicitly test an omitted collector ceiling in an otherwise valid policy; verify processing completion's frozen price version and shared capture/classifier exposure; and verify successful completion exactly once after restoring a removed policy. The current regressions cover direct reservations, malformed maps, pre-dispatch policy removal, pause/replay, and existing processing/collector behavior. No production throughput benchmark was claimed; observe D1 admission latency and rows read before increasing traffic.

## Staging receipt and owner actions

Deployed version `7b44c479-3a88-4b5e-a86c-d4ac071b923e` at 100%, verified through deployment listing. Previous version/rollback target: `73c90f48-b5cc-4a31-904d-680970eab093`. `versions upload --keep-vars` used the active snapshot; all 54 bindings and runtime fields matched exactly before activation. No trigger or migration command was run; the new production policy binding remains absent. This does not activate a production budget or new public sales.

The owner-dependent inputs still needed are:

1. Complete the blind 20-record review using the existing private packet and human labels, including reviewer/date. Freeze and scoring can run offline afterward; no model-generated human labels are acceptable.
2. Confirm merchant test variants/identifiers and connect billing test credentials to the staging Worker. Snapshot shows empty store/product/legacy variant IDs, absent API/webhook secrets and no new variant mapping; local `.dev.vars` alone does not configure remote billing. Real checkout/portal/lifecycle validation is still pending. Keep live selling disabled.
3. Supply verified account tariffs/invoices and expected initial capacity, then approve a bounded production cost policy only after the package economics are acceptable. Current illustrative margins do not pass 60% for all cadences; prices, provider choices and active budgets have not been altered to obtain a pass.
4. Perform/document a real website change with its URL and implementation time. Any missing complete provider captures and follow-up samples require separately approved prompts, engines, number of requests and spend cap. Existing synthetic tests do not replace these observations.

Production rollout and a production-copy restore drill remain separate operator-authorized work after these gates; the owner is not asked to perform manual SQL migrations as part of this staging review.
