# CiteScout public MVP audit

**Audit date:** 22 October 2026, Asia/Bangkok. **Reviewed revision:** `1379ddf`. **Verdict:** not ready for public paid GEO release.

CiteScout stores AI-search answers, shows their sources and classifications, proposes evidence-linked work, and compares later observations. This audit assumes a public, self-serve product for founders managing one B2B SaaS brand. Capacity examples use ten paying accounts; they are scenarios, not a promised service level.

The current UI is the accepted baseline. This audit changes documentation only. No live provider call, classifier inference, checkout, account creation, migration, deployment, schedule/entitlement change or remote data update was performed. Local tests use isolated databases, synthetic accounts and mocked providers. Cloudflare settings and aggregate D1 evidence were read directly; secrets, emails, prompt text and raw private answers are not included in the runtime receipt.

## 1. Evidence and readiness levels

| Level                  | What it establishes                                                              | Result                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Source present         | A path exists in the checked-out code                                            | Most core workflow paths exist                                                                         |
| Synthetic verification | Behavior under local/mocked inputs                                               | 260 unit, 185 integration and 136 browser tests passed                                                 |
| Real evidence          | An actual provider result or observed user action                                | 22 stored staging captures, 20 analyses and action history; incomplete quality/after-action validation |
| Active deployment      | What is actually installed                                                       | Staging is current; production is an older binary/schema                                               |
| Commercial readiness   | Correct entitlement, sustainable package, live payment and recoverable operation | Not established; blockers below                                                                        |

Repository config is not evidence that those values are deployed. The sanitized [runtime receipt](2026-10-22-public-mvp-runtime.json) records actual settings, deployment versions, migration names, aggregate evidence and explicit failed queries. Production GEO-table queries returned HTTP 400; the separate successful schema inventory confirms that those tables do not exist. Those failures are not zero observations or a successful empty GEO workspace.

## 2. Must resolve before public paid GEO

### B1. Production has not received the v2/GEO schema and current application — P1, PERBAIKI

- **What:** production Worker `citescout` serves version `bc938a47-378d-42ef-909c-c003569ad041`, deployed 10 October. Its D1 contains migrations 0000–0001 only, no GEO/pilot/onboarding tables, and no AI binding. Its cron is `0 * * * *`. Staging serves `0bbff4e8-6b52-4bc3-ab4b-481c34eb8683`, migrations 0000–0011 and `*/5 * * * *`.
- **Problem:** deploying the current binary against the current production schema would make new project/workspace paths query absent tables. The production configuration in Git describes resources and flags not present on the active old deployment.
- **Smallest correction:** prepare an additive migration/backup/compatibility rehearsal against an isolated copy, then a separately authorized production rollout with an explicit live configuration manifest. Do not copy staging owner grants, reset counters, or silently replace the production cron with a local default.
- **If skipped:** the public site and the reviewed application remain different products, or a code-only deployment breaks authenticated routes. Evidence: runtime receipt; `src/server/v2/routes.ts`; `migrations/0002*` through `0011*`.

### B2. Retained test subscriptions satisfy the paid predicate — P1, PERBAIKI

- **What:** `paidProjectSql` checks subscription status/end time, not `test_mode`. `paidAccess` passes status/end time to `getEntitlement` without checking the configured billing mode. Webhook ingestion validates incoming test/live mode, but that does not invalidate retained rows.
- **Problem:** an existing `active, test_mode=1` subscription can remain entitled after changing the environment to live billing. Production currently contains one active test subscription; this audit does not change it or identify its owner.
- **Smallest correction:** make new paid work and its displayed availability require a subscription matching the environment's configured billing mode. Preserve the record and readable evidence. Apply the same policy at conditional writes and execution, not only in the UI.
- **If skipped:** a test payment can continue granting production compute. Evidence: `src/server/scan-policy.ts:paidProjectSql`, `src/server/v2/read-model.ts:paidAccess`, `src/server/billing-sync.ts:validateSubscription`.

**Reproduction:** copied the actual `paidProjectSql` expression into an in-memory SQLite query, inserted one synthetic active test subscription, and observed `admitted=1`. No remote request or source change was required. This establishes the predicate defect, not a live exploit.

### B3. Fresh analysis/page processing lacks the production paid-access gate — P1, PERBAIKI

- **What:** `reserveProcessing` validates observation ownership, flags, cache and processing quotas. Its access exception is staging-only. The production queue and execution paths do not call the paid-access policy used by `startGeoRun`.
- **Problem:** an owner with historical evidence and an expired/unpaid subscription can request previously uncached analysis when processing is enabled. The automatic analysis sweep also selects captures without a production subscription predicate. Existing tenant ownership prevents access to another account, but does not authorize fresh paid compute.
- **Smallest correction:** enforce the shared paid policy for newly queued and dispatched analysis/page work. Completed cached results and saved answers remain readable. Recheck queued work after a subscription expires and before dispatch.
- **If skipped:** former customers can consume processing capacity and inference budget. Evidence: `src/server/v2/analysis.ts:reserveProcessing/processGeoAnalysis`; `src/server/v2/geo-routes.ts` analysis/page POST handlers. This is a source-traced finding; an unpaid-production regression is still required and was not represented by existing passing tests.

### B4. Staging dollar safeguards are not a production spend policy — P1, BUILD

- **What:** `reserveGeoProviderRequest` enables cumulative USD/unknown-cost checks through the `internal` staging branch. Production has observation/processing count caps and a SerpApi request cap, but no equivalent enforced global/project dollar allowance. SerpApi completion always stores an estimated zero under a free-plan pricing version.
- **Problem:** positive production call caps do not establish a dollar ceiling. A paid SerpApi account or a costlier response can make the ledger materially understate delivery costs. An application reservation remains a forecast, not a provider billing hard limit.
- **Smallest correction:** extend the existing request ledger/admission design for an explicitly approved production cost policy, including paid SerpApi accounting and unknown-cost handling. Reuse tables and keep staging ceilings unchanged; do not add a second budget database.
- **If skipped:** monitoring can be within request limits and still violate the package's cost assumptions. Evidence: `src/server/v2/geo-provider-budget.ts:reserveGeoProviderRequest/completeGeoProviderRequests`; cost scenarios in section 6.

### B5. The public package and the intended full GEO MVP are different contracts — P1, PASTIKAN

- **What:** `src/shared/brand.ts` sets $19/month. Pricing/FAQ in `src/client/App.tsx` explicitly includes Perplexity monitoring and excludes other engines, diagnoses and Action Playbook as preview. Current GEO access relies on paid status rather than a distinct full-GEO package entitlement.
- **Problem:** publishing the desired full workflow under the existing promise would silently change the offer, cost and access boundary. The audit cannot infer a new price or allowance from an owner-test grant.
- **Smallest correction:** require an owner-approved commercial manifest covering included surfaces/features, prompt/observation limits, frequency, account capacity and price before configuring live GEO access or changing customer promises. Existing $19 Perplexity rights must remain intact.
- **If skipped:** customers may buy one offer while the application and cost model implement another. This is an unresolved commercial release gate, not permission to rewrite pricing or entitlement during this audit.

### B6. Live billing has not been exercised for this application release — P1, PASTIKAN

- **What:** active production is in Lemon Squeezy test mode with one active test subscription. Staging has no Lemon Squeezy key/webhook-secret bindings and no complete billing identifiers. Local signed-webhook, canonical-state, refund-event and subscription lifecycle tests pass.
- **Problem:** neither environment supplies a verified live checkout → webhook → correct feature access → renewal/cancellation recovery receipt for the new workflow.
- **Smallest correction:** complete isolated billing test-mode rehearsal after the access fixes, then explicitly provision/validate live billing and conduct an authorized transaction/recovery check. Keep test and live records distinguishable; do not fabricate a paid subscription.
- **If skipped:** a customer can be charged without the intended service or recovery path being verified. Evidence: runtime receipt; `src/server/routes/billing.ts`; `src/server/billing-sync.ts`; `tests/integration/billing-lifecycle.test.ts`.

### B7. Real quality and after-action gates remain unmet — P1, PASTIKAN

| Engine                | Stored captures | Actual quality in saved envelope | What remains unknown                                                                  |
| --------------------- | --------------: | -------------------------------- | ------------------------------------------------------------------------------------- |
| Perplexity            |               5 | 5 complete                       | General quality, current-model costs and broader customer prompts                     |
| Google AI Overview    |               4 | 4 complete                       | Coverage across relevant buyer queries/locales; no-feature remains legitimate         |
| OpenAI Web Search API |               6 | 6 partial                        | Real complete captures under the newer output policy; old rows must stay partial      |
| Bing Copilot Answers  |               5 | 5 no-feature                     | A complete real Bing AI answer on the agreed buyer scope                              |
| Claude Web Search API |               2 | 2 partial                        | Complete research output; the latest prose ended normally but hit a search-tool limit |
| ChatGPT Search        |               0 | No saved capture                 | Collector access and quality; it is not interchangeable with OpenAI API               |

The private blind-label packet has 20 records, no reviewer/date, no `labels-lock.json`, and no scored report. Stored analyses therefore do not establish measured classifier accuracy. Stage evidence has two completion events and before samples, but **no stored after series**. Daily monitoring is off. A future ordinary eligible capture might be frozen by the existing measurement reader; the audit did not invoke that reader, generate more captures, or classify observations.

Retain existing G1–G4 gates in `docs/plans/2026-10-16-0804-fix-founder-pilot-gates-plan.md`. A decision to omit a surface from the first public package must be explicit; do not declare an unmet gate passed or replace its surface silently. Those pilot smoke gates are necessary existing evidence checks, not a statistical public-accuracy guarantee.

## 3. Six-module disposition

| Area                      | PASTIKAN / existing capability                                                                                                                     | PERBAIKI or BUILD for the chosen MVP                                                                    | TUNDA                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Sampling and transparency | Fixed/versioned prompts, groups, neutral instructions, frozen contexts, manual/daily intent, original/raw responses, capabilities and count quotas | B1–B7; verify actual surface availability, denominator and package capacity                             | N-times/day experiments, control-group system and dedicated fan-out analytics |
| Parsing and visibility    | Presence and stance classification; owned/competitor/third-party source roles; retrieved, answer, element and verified-inline levels               | Human evaluation and honest partial/unknown handling                                                    | General sentiment analytics; hard-coded Owned/Earned 40/60                    |
| Technical GEO             | Public URL/DNS boundary, HTTP/noindex/canonical checks, bounded page text                                                                          | Explain that an observed obstacle is not proof of search indexing or crawler-specific firewall behavior | Full crawler/robots.txt audit, entity graph and branded Carcass scoring       |
| Histories and gaps        | Comparable context hashing, 7/14/30-day trends, suspected/supported diagnosis and source opportunities                                             | Real eligible before/after evidence and no-data gaps                                                    | Claim-pattern mining and 360-degree semantic site comparison                  |
| Action loop               | Evidence-linked tasks, checklist/notes, progress, completion/reopen history, follow-up work, measurement pins                                      | Distinguish a follow-up task from a newly scheduled monitoring request; retain truthful availability    | Draft generation, automated publishing or a separate campaign subsystem       |
| Analytics and ROI         | Descriptive observed changes only                                                                                                                  | Keep claims aligned with available evidence                                                             | GA4/GSC connectors, lead/revenue attribution and causal ROI                   |

`dailySamples` selects the first eligible answer per UTC day and comparable cohort/metric; all repeated manual answers remain evidence but do not become independent daily samples. Context/model/output-budget changes separate cohorts. Missing usable data stays null/inconclusive. `owned_answer_reference` and `owned_inline_reference` are distinct metrics. GSC/traffic data would not by itself prove an AI visibility change caused revenue.

Carcass is a vendor framework, not a required validated industry score. Google documents relevant SEO fundamentals and query fan-out, but app-generated subqueries are not access to a provider's hidden searches. Sources: [Peppermint](https://peppermint.global/services/aeo-optimized-websites), [Google AI features](https://developers.google.com/search/docs/appearance/ai-features).

## 4. Existing SQL/Drizzle model mapping

Canonical schema is `src/db/schema.ts`; SQL migrations are under `migrations/`. No Prisma conversion or new tables are needed to describe these concepts.

| Requested concept | Existing storage and relationship                                                                          | Boundary                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Prompt            | `projects` → `prompts` → `geo_prompt_versions`; optional `geo_prompt_sets`                                 | One project per account; versions preserve captured text; groups can overlap        |
| PromptRun         | `scan_runs` → `geo_run_snapshots` → `geo_run_items` → `geo_observations`                                   | Snapshot/UUID idempotency, per-prompt/engine reservations and frozen context        |
| Citation          | `geo_observations.capture_json.sources[]`, with `referenceLevel` and verified spans when available         | JSON evidence, not a standalone Citation table; retrieved is not an answer citation |
| Mention           | `geo_processing_attempts.result_json.classification` and its evidence quotes/spans                         | Presence, stance and competitor classifications are not a generic sentiment table   |
| GapAnalysis       | `geo_processing_attempts.result_json.diagnoses` plus source opportunities derived by `sourceOpportunities` | A bounded diagnosis, not a complete site-wide 360-degree gap crawl                  |
| ActionLog         | `geo_actions` + `geo_action_evidence` + `geo_action_events` + `geo_measurement_samples`                    | Task/evidence links, immutable completion history and before/after samples          |
| ROIIntegration    | None                                                                                                       | Deferred; auth `accounts` are sign-in identities, not analytics connectors          |
| Costs and quota   | `provider_call_reservations` + `geo_provider_requests` + processing usage + `geo_daily_outcomes`           | Observation intent differs from actual provider HTTP requests and invoices          |
| Billing and setup | `subscriptions`, `billing_webhook_receipts`, `onboarding_suggestions`                                      | Canonical billing sync, bounded optional draft suggestions, manual fallback         |

Storage note: actual saved capture rows use `status='captured'`, while quality is in `capture_json.quality`; the Drizzle status enum still lists quality-like values. Queries in this audit use the envelope for quality. Correcting this type/schema description is a small follow-up, not a data rewrite or evidence upgrade.

## 5. Actual REST surface

The authenticated workspace is mounted at `/api/v2`; GEO endpoints are under `/api/v2/geo`. Ownership checks resolve data through the authenticated project's owner. Router links `/app/questions`, `/app/observations`, `/app/trends` and `/app/sources` are UI routes, not provider endpoints.

| Purpose                  | Existing endpoints                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup and identity       | `GET/POST/PATCH /api/v2/project`; `POST /api/v2/onboarding/suggestions`                                                                           |
| Prompt lifecycle         | `GET/POST /api/v2/questions`; `PATCH /questions/:id`; `POST /questions/:id/replacement`; `GET /questions/:id/history`                             |
| Configuration            | `GET/PUT /geo/settings`; `GET /geo/capabilities`, `/geo/allowance`, `/geo/usage`                                                                  |
| Prompt groups            | `GET/POST /geo/prompt-sets`; `DELETE /geo/prompt-sets/:id`                                                                                        |
| Monitoring               | `POST/GET /geo/runs`; `GET /geo/runs/:id`; `GET /geo/runs/:id/attempts`                                                                           |
| Answers                  | `GET /geo/observations`; `GET /geo/observations/:id`; `GET /geo/observations/:id/raw`                                                             |
| Analysis and page checks | `GET /geo/analyses`; `GET/POST /geo/observations/:id/analyses`; `GET/POST /geo/observations/:id/page-checks`                                      |
| Sources and trends       | `GET /geo/sources`; `GET /geo/trends`                                                                                                             |
| Work                     | `GET /geo/actions`; `GET/PATCH /geo/actions/:id`; `POST /geo/actions/:id/follow-ups`, `/complete`, `/reopen`; `GET /geo/actions/:id/measurements` |
| Legacy evidence          | `GET /api/v2/observations/:id` and `/raw`; legacy scans/history stay separate                                                                     |
| Commercial               | `GET /api/billing/status`; `POST /api/billing/checkout`, `/portal`; `POST /api/webhooks/lemonsqueezy`; `DELETE /api/account/`                     |

In rows with shortened `/questions` or `/geo` paths, prepend `/api/v2`. No tRPC layer is present or proposed. GET trend/measurement readers can freeze derived measurement rows: they do not start provider capture, but are **not strictly database-read-only**. The runtime audit used direct SELECTs instead.

## 6. Unit economics: scenarios, not approved allowances

Actual historical staging ledger: Perplexity reports $0.021360 for six request records; OpenAI estimates $0.0691305 for six; classifier estimates $0.001968476 for twenty. These are tiny, mixed-quality cohorts. All six OpenAI captures were partial, so their average is not a reliable complete-answer forecast. Claude's latest partial capture estimates $0.055704; its three ledger rows include one verified pre-HTTP failure and two actual captures. SerpApi's seventeen rows estimate zero under the existing free-plan assumption; no provider invoice was verified here.

For a **hypothetical** mix of Perplexity + OpenAI API + Google AIO, one run/day, 30 days, and one classification/observation:

`observations = prompts × 3 × 30`

`monthly cost = provider usage + paid search-plan allocation + classification + setup/failure reserve + Workers/D1/email + payment/payout fees + support`

| Prompts/account | Observations/month | Google searches/month, at 1–2/capture | Perplexity historical proxy | OpenAI historical proxy | Classifier historical proxy |
| --------------: | -----------------: | ------------------------------------: | --------------------------: | ----------------------: | --------------------------: |
|               3 |                270 |                                90–180 |                     $0.3204 |                 $1.0370 |                     $0.0266 |
|              10 |                900 |                               300–600 |                     $1.0680 |                 $3.4565 |                     $0.0886 |

These engine labels intentionally do not call OpenAI API "ChatGPT Search". Failure/retry charges, varying token usage, unclassified captures and prompt changes make the illustration incomplete. A no-feature result may still consume a successful search request. Count limits must include actual HTTP work; Google can need a second search request.

[SerpApi pricing](https://serpapi.com/pricing), checked 22 October: free 250 searches/month; Starter $25/1,000; Developer $75/5,000; Production $150/15,000. These are shared account plans, not per-customer packages. Do not allocate the same free balance to each tenant.

- One 10-prompt customer needs 300–600 Google searches, exceeding the entire free monthly allocation. If this customer carries the Starter bill, the illustration is **$29.61/month before infrastructure, failures and payment fees** ($25 + $4.6131).
- Ten such customers need 3,000–6,000 Google searches. At the published plan steps this needs $75 or $150 account spend, before the other engines. Spare capacity and account-wide usage must be included; multiplying a perfectly utilized per-query average can hide plan-step costs.
- Adding Claude for ten daily prompts would add **$16.71/month** using its one latest partial answer as a proxy. This is not an approved price or justification to include Claude in the public package; current code intentionally restricts it to staging.

The existing $19 offer is Perplexity-only. [Lemon Squeezy fees](https://docs.lemonsqueezy.com/help/getting-started/fees) document a base 5% + $0.50 and +0.5% for subscriptions; a simplified $19 transaction leaves $17.455 before tax effects, international/PayPal additions, payout fees and operating cost. This is an illustrative calculation, not this store's settled invoice or margin. [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) currently lists Clef Flash at $0.038/M input tokens; its account-wide free allocation does not make all customer inference free.

Capacity is a second gate: ten accounts × ten prompts × three engines requires **300 observation attempts/day**. Production's currently exposed legacy global cap is 150/day, and prospective GEO caps in Git default to zero. No active public multi-engine allowance follows from those numbers. Approve a package and capacity manifest before setting any new caps.

## 7. Failure behavior, recovery and rollout limits

| Situation                                     | Existing behavior / remaining gate                                                                                                                                                                                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty/refusal/partial/no-feature              | Quality is preserved, original evidence remains available, unusable classifications do not become absence metrics; real-case coverage remains limited                                                                                                                                   |
| Slow/lost request                             | Leases and persisted attempts support recovery; ambiguous paid requests are not proof of zero cost; production spend policy needs B4                                                                                                                                                    |
| Incorrect confident classification            | Evidence/details are visible and `needsReview` remains true; human accuracy evaluation and a consistent support/feedback process are still unverified                                                                                                                                   |
| New account/no evidence                       | Manual setup and honest empty/loading/error states pass mocked browser checks                                                                                                                                                                                                           |
| Unsafe source/page                            | Markdown raw HTML disabled, URL schemes constrained, public-page/DNS boundary present; tests are not a penetration test                                                                                                                                                                 |
| Paid access ends while work is queued         | Collection has access reconciliation; processing needs B3                                                                                                                                                                                                                               |
| Test subscription retained during live switch | Needs B2; a webhook mode check alone is insufficient                                                                                                                                                                                                                                    |
| Rollback                                      | Operator can pause GEO capture/classification/page work, and legacy scan starts separately, using environment flags; configuration/deployment changes are required. Submitted work/accounting stays retained. Rollback timing and a production restore drill have not been demonstrated |

Do not advertise a pin as scheduled remeasurement, a source result as a citation, or an observed before/after change as caused uplift. Suggested customer framing: "Review saved answers and their sources, choose a task, record the change, then compare later checks with the same context. Results vary; suggested findings need review."

## 8. Verification receipt and UI baseline

| Check                          | Result on reviewed code                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                     | 260 unit tests / 27 files and 185 integration tests / 21 files passed                                                                             |
| `npm run check:v2`             | Passed: migrations, trial/retry/caps, concurrent claims, paid scheduling, evidence, ownership, refunds, deletion                                  |
| `npm run lint`                 | Passed                                                                                                                                            |
| `npm run build`                | Typecheck and Worker/client build passed; existing large-client-chunk warning remains                                                             |
| Playwright targeted regression | 136 passed: auth, workspace/onboarding, Monitoring, Sources, Competitors, Diagnoses, action notes, customer presentation; desktop/mobile projects |
| Test/live predicate diagnostic | Synthetic SQLite counterexample reproduced, with zero remote requests                                                                             |
| Runtime audit                  | Settings/deployments/schedules and aggregate D1 SELECTs only; no changed-db result accepted                                                       |
| Human labeling                 | Not completed; no reviewer/date/lock/scored report                                                                                                |
| Visual inspection              | Current generated Monitoring screenshots at 1440px and 390px inspected; neutral sidebar and existing layout retained. No UI source was edited     |

The browser tests exercise mocked/synthetic responses, not real login/payment/provider quality. They cover 320/390 mobile and 1280/1440 desktop conditions through existing scenarios, safe sources, preserved navigation scope, no-read-triggered monitoring, partial/error/empty states, keyboard controls and contrast. No new snapshot expectations were accepted. Screenshots are in ignored `test-results/`; they are execution evidence, not new app assets.

## 9. Roadmap and next artifact

The [readiness plan](../plans/2026-10-22-public-mvp-readiness-plan.md) sequences the blockers without redesigning the app. A reusable [audit prompt](../prompts/citescout-public-mvp-audit.md) keeps future reviews inside the same boundaries.

Content roadmap after a working paid core: evidence-linked brief → reviewed draft → founder publishes manually → comparable follow-up. Consider publishing integration only after users demonstrate repeated demand and the platform permits the access. [Reddit Developer Terms](https://redditinc.com/policies/developer-terms) require an appropriate commercial agreement; Quora publishing access was not verified. No scraping, account automation, new writing model, GA4/GSC connector or posting agent was added.

**Not checked:** real payment or email delivery, vendor invoices/account balances, new provider captures/inference, broad statistical accuracy, production load/restore drills, independent security penetration testing, or all legacy/public browser suites. The existing green regressions do not close B1–B7.
