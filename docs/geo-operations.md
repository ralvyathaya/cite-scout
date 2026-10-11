# GEO operations

Configuration/code inspected on 2026-10-11. The local action loop is available with synthetic data. Production GEO capture, analysis and owned-page checks stay off until the applicable live gates below pass. DataForSEO and Jev are optional; neither is required for the local/MVP flow. The latest provider decision overrides the original plan's mandatory Jev/DataForSEO choices.

## Local preview and checks

Use Node 22.12+ and the repository's existing dependencies:

```powershell
npm install
if (-not (Test-Path -LiteralPath '.dev.vars')) { Copy-Item .dev.vars.example .dev.vars }
npm run cf:typegen
npm run dev
```

`predev` applies local D1 migrations before Vite starts; `npm run db:migrate:local` is the explicit equivalent. Do not overwrite an existing credential file. Open `http://localhost:5173/app/overview?fixture=1`. The fixture also accepts loopback `127.0.0.1` and `[::1]`, never a production hostname. Workspace API requests are intercepted before fetch, data is held in a separate browser-memory store, and a persistent banner labels all results synthetic. Requested fixture mode on other hosts blocks live workspace requests. Billing/portal/raw actions use the fixture transport; no real provider, inference, page-check or billing request belongs to this flow. Refresh resets synthetic data; Exit fixture clears the session marker. It does not seed monitoring tables.

Local `wrangler.jsonc` has no `AI` binding. Production `wrangler.production.jsonc` declares `AI`. Adding a remote binding locally is outside the no-cost fixture flow and may spend account credits. `EXTERNAL_INTEGRATIONS_ENABLED=false` is a server gate; it does not turn real provider responses into fixtures.

The host owns the authoritative verification receipt. Run these before release, retaining output and the tested revision:

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run check:v2
npm run build
npm run test:e2e -- tests/e2e/workspace.spec.ts tests/e2e/geo-workspace.spec.ts tests/e2e/geo-overview.spec.ts
git diff --check
```

`check:v2` is a direct integration harness, separate from Vitest. Browser checks must include desktop/tablet/mobile, keyboard navigation/monitor/completion, original/raw evidence, unavailable engines, partial/queued/quota states, accepted task → completion pin → comparable follow-up, and fixture transport isolation. Mock/fixture success proves application behavior, not real provider quality or billing.

## Flags, bindings and secrets

Both checked-in Wrangler files use the following GEO values; caps accept nonnegative integers and represent attempt counts, not dollars:

| Setting                            | Default/configured value | Purpose                                                       |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------- |
| `GEO_SCANS_ENABLED`                | `false`                  | New GEO collector submissions and daily run creation          |
| `GEO_ANALYSIS_ENABLED`             | `false`                  | Classification of saved captures                              |
| `GEO_CLASSIFIER_MODEL`             | `clef-flash`             | Explicit choices: `clef-flash`, `clef`, `jev-1.13.0`          |
| `GEO_PAGE_CHECKS_ENABLED`          | `false`                  | Manual owned-page verification                                |
| `GEO_GLOBAL_DAILY_CALL_CAP`        | `0`                      | Global collector budget, shared with retained anonymous usage |
| `GEO_PROJECT_DAILY_CALL_CAP`       | `0`                      | Project daily collector budget                                |
| `GEO_PROJECT_MONTHLY_CALL_CAP`     | `0`                      | Project monthly collector budget                              |
| `GEO_PROCESSING_PROJECT_DAILY_CAP` | `0`                      | Shared analysis/page-processing budget per project            |
| `GEO_PROCESSING_GLOBAL_DAILY_CAP`  | `0`                      | Shared global processing budget                               |

`V2_SCANS_ENABLED=true` is also required for new GEO checks. `EXTERNAL_INTEGRATIONS_ENABLED` is `false` locally and `true` in production. `TEST_AUTH_ENABLED` is `true` locally and `false` in production; production rejects test auth. The cron is `*/5 * * * *` UTC in both configs. `MAX_PROVIDER_CALLS_PER_CRON_INVOCATION=20` bounds selected collector work; when GEO capture is enabled the scheduled handler divides that work between V2 and GEO, then processes up to five analysis/page items. These are work limits, not total SQL or cash caps.

Legacy `GLOBAL_DAILY_PROVIDER_CALL_CAP=150` and `PER_USER_MONTHLY_PROVIDER_CALL_CAP=350` remain distinct from GEO settings. The effective global collector cap uses the smaller legacy/GEO global cap when GEO is enabled. Do not copy legacy per-user allowances into four-engine production promises.

`.dev.vars.example` lists `PERPLEXITY_API_KEY`, `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `TYPESAFE_API_KEY`, `LEMON_SQUEEZY_API_KEY`, `LEMON_SQUEEZY_WEBHOOK_SECRET`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `OPERATOR_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`. Never place them in browser code, docs, fixtures or Wrangler vars. Perplexity requires its key; the three optional DataForSEO engines require both login/password. Jev alone requires TypeSafe's key. Clef Flash/Clef require the `AI` binding; there is no automatic paid fallback. Production requires an `OPERATOR_SECRET` of at least 32 characters.

After a Worker exists, set only the needed secrets interactively:

```powershell
npx wrangler secret put PERPLEXITY_API_KEY --config wrangler.production.jsonc
npx wrangler secret put OPERATOR_SECRET --config wrangler.production.jsonc
# Only for enabled optional adapters:
npx wrangler secret put DATAFORSEO_LOGIN --config wrangler.production.jsonc
npx wrangler secret put DATAFORSEO_PASSWORD --config wrangler.production.jsonc
npx wrangler secret put TYPESAFE_API_KEY --config wrangler.production.jsonc
```

These commands are instructions, not evidence that accounts, secrets or deployment were verified.

## Runs, usage and evidence

Tenant-authenticated routes are mounted at `/api/v2/geo`. Read `/capabilities`, `/allowance`, `/usage`, `/settings`, `/runs`, `/runs/:id` and `/runs/:id/attempts` before diagnosing failures. Settings contain selected `engines`, `dailyEnabled`, `languageCode`, `locationCode` and `device`; missing provider capabilities are explicitly unavailable. Perplexity has no native locale/device control; Google/Bing support locale/device, and ChatGPT Search supports locale with forced web search. Frozen context records unsupported values for audit, but comparability uses only the controls that surface supports.

New manual checks use `POST /api/v2/geo/runs` with a fresh UUID and optional selections:

```json
{
  "requestId": "00000000-0000-4000-8000-000000000001",
  "promptIds": ["YOUR_PROMPT_ID"],
  "engines": ["perplexity"]
}
```

Use the same UUID and identical selection to replay a transport retry; different content with that UUID returns `IDEMPOTENCY_CONFLICT`. A new accepted manual run is independent of daily intent, subject to paid access, positive budgets, five-minute prompt/engine cooldown and in-flight exclusion. Daily intent is unique for a frozen project/day/snapshot. New paid access starts next UTC day where the preserved trial contract requires it. Sent prompts stay neutral: tracked brand/competitor details go into post-processing rather than hidden query enrichment.

Original captures and prompt versions are immutable. Detail/raw endpoints retain sent prompt/context, run/capture timestamps, engine/surface/collector, reported model when available, source levels and parsed provider JSON. `/observations/:id/raw` is a tenant-protected download with `private, no-store`; it is parsed JSON, not a byte-for-byte HTTP archive. List views are bounded/truncated, so use detail/raw for full evidence. Returned SERP links (`retrieved`), answer references, element references and verified inline links are separate; a returned-only link is not proof of a citation or retrieval root cause.

Classification and diagnoses are separate versioned processing attempts. Current versions are `geo-context-1`, `geo-collector-1`, `geo-capture-1`, `geo-rubric-1`, `geo-policy-1`, `geo-domain-1`, `geo-template-1` and `geo-measurement-1`. Preserve old outputs when changing a model/rubric/policy; queue a new attempt against the saved capture. No classifier retry should collect a paid answer again. Native probabilities/confidence are not measured accuracy, and every diagnosis currently requires review. Capture failure, partial parsing, no overview, unavailable analysis and uncertainty must not become brand absence.

Completion/reopen events preserve their history and distinguish recorded completion from user-reported implementation time. Completing an action does not submit a paid capture. Comparisons use the first eligible frozen sample per comparable cohort/UTC day, seven-day before/after windows, denominators and coverage. Prompt/context/surface/configuration/reported model or classifier/rubric/policy changes separate cohorts; missing expected model makes the comparison inconclusive. Surfaces without model reporting expose that limitation. Pins establish temporal association, not causal uplift or financial ROI.

`/usage` exposes collector attempts/today/month, provider-reported USD cost and unknown-cost attempt count, plus processing attempts/today, estimated USD cost and unknown-cost attempt count. A missing price is unknown, never proof of free usage; a summed known cost of zero does not eliminate the unknown count. Failed/ambiguous attempts remain consumed. Classifier estimates are derived from recorded input-token usage and documented model rates; they are not invoices. Real workload cost, accuracy and p50/p95 latency remain unmeasured.

Acceptance reserves usage for the current UTC day; immediately before a new paid submission/inference/page request, the claim rechecks the applicable budgets and moves its sticky `usage_date` to the actual call-start UTC day. Collectors recheck project daily/monthly and global daily caps; processing rechecks project/global daily caps. A midnight/month boundary cannot spend against only yesterday's allowance. A blocked queued item remains queued until a later eligible day; it does not submit. `created_at` remains the immutable acceptance timestamp, separate from usage accounting; saved-task GET polls retain the original submission's usage date. The scheduler takes a fresh clock at each stage rather than reusing its trigger timestamp after earlier work. Usage displays and processing caps use `usage_date`.

## Recovery and pause

DataForSEO submission saves the task ID before asynchronous polling. A pending/transient GET reuses that ID; it does not POST another task. Expired submitting leases or ambiguous submissions become `submission_uncertain`, retain accounting and require operator reconciliation. Never replay a potentially accepted paid POST automatically.

Inspect the run and attempt raw JSON, then use provider task history to recover the original task ID matching the saved item tag. The operator route polls the recovered ID and validates both returned task ID and `tasks[0].data.tag === itemId`. A wrong task/tag is rejected. Perplexity submissions have no equivalent saved-task recovery; close the uncertain item without retry after reviewing provider state/cost. The route uses operator Bearer authorization, not an ordinary user's session:

```http
POST /api/operator/geo/reconcile
Authorization: Bearer YOUR_OPERATOR_SECRET
Content-Type: application/json

{"itemId":"YOUR_UNCERTAIN_ITEM_ID","taskId":"RECOVERED_PROVIDER_TASK_ID"}
```

If no recoverable task exists or the operator chooses to stop, the same route accepts:

```json
{ "itemId": "YOUR_UNCERTAIN_ITEM_ID", "taskId": null }
```

This closes the item as failed without retry or accounting refund. A deliberate new capture is a separate fresh request and possible new charge. Restore credentials/balance for future captures; keep authentication, low balance and provider errors separate from observed no-overview results. DataForSEO `40102` (NoSearchResults) is retained as `partial`, not an observed absent overview; only a successfully parsed Google/Bing result lacking an overview supports `no_feature`.

For an interrupted/failed classifier attempt, inspect `failureCode` and retry `POST /api/v2/geo/observations/:id/analyses` with `{"requestId":"NEW_UUID"}` after resolving the cause. Same-input queued/running/completed analysis is cached by input/model/rubric/policy; failed attempts require a new request. Original captures remain readable.

Pause new captures with `GEO_SCANS_ENABLED=false`; retain credentials to recover saved DataForSEO tasks through GET polling. Saved GET polling continues even when new submissions are paused; removing credentials defers it. Pause classification/page work with their own flags. History, raw evidence, actions, completion pins and comparison records remain readable. Set project `dailyEnabled=false` when pausing that schedule. Configured GEO projects remain excluded from legacy paid daily run creation even when GEO is paused; pending legacy paid work is cancelled for those projects. Preserved active trial follow-up follows its separate frozen contract. Changing feature flags is a reversible pause; deleting tables or rewriting historical captures is not a rollback.

## Manual source/page checks

Review source URL/platform, period, actual observations and reference strength before accepting an Earned task. Serper/Tavily discovery was considered and audited but is not wired into this bounded monitoring implementation; neither generic SERP nor synthesized search answers count as target AI observations.

Page verification requires `GEO_PAGE_CHECKS_ENABLED=true`, external integrations and positive processing budgets. It is an explicit `POST /api/v2/geo/observations/:id/page-checks`:

```json
{ "requestId": "NEW_UUID", "target": "https://YOUR_OWNED_DOMAIN/" }
```

Only an observed source or configured brand homepage is a known target, and the checker further requires ownership/public HTTPS validation. It checks DNS, redirects, HTTP/header/meta/canonical evidence within ten seconds and 128 KB; it does not prove indexing. Same-input page work is cached for one hour, shares processing caps, and does not rerun the collector. Workers fetch cannot pin a resolved IP; repeated public-address validation relies on Workers' outbound boundary. Do not port unchanged to a server with private-network access.

## Migration, retention and deletion

`GET /runs` returns the latest ten tenant-owned runs and seven recorded daily outcomes. The dashboard discovers scheduled runs without starting a manual check, including zero-capture failures. A quota/cooldown rejection retains its UTC-day reason without reserving another provider call; later admission updates that day's outcome. Provider pause leaves existing history readable. Uncertain run progress continues polling until operator reconciliation settles the run.

Successful saved-task GET followed by a storage error stays submitted, retaining its task ID, raw response and sticky submission cost for the next GET. Failed persistence after a potentially accepted paid POST stays uncertain for operator recovery. Neither path automatically repeats a paid submission.

Completed analysis atomically marks playbook synchronization pending. Cron retries local, idempotent synchronization while provider flags are paused; ownership/deletion guards still apply. It uses the existing thirty-day playbook evidence eligibility window. Review `geo_processing_attempts.playbook_sync_pending` and `geo_playbook_deferred` when a completed diagnosis lacks its task.

Before/after rates give each distinct frozen cohort the same weight in both windows; sample counts still report actual eligible days, and missing scope remains inconclusive. Trend reads reuse retained samples, and the dashboard refreshes them after run/classification completion or **Refresh saved evidence**, rather than polling retained history every five seconds.

Apply the ordered migration chain, never a GEO table reset. `0003` adds frozen prompts/context/runs/captures and immutable triggers; `0004` adds separate processing/accounting; `0005` adds actions/evidence/immutable events; `0006` adds frozen measurement samples; `0007_geo_processing_usage.sql` adds/indexes processing `usage_date` and backfills existing rows from their original `created_at` UTC day. `0008_geo_playbook_recovery.sql` adds a durable pending playbook marker and backfills completed tenant analyses for idempotent recovery; `0009_geo_daily_outcomes.sql` retains admitted/skipped daily outcomes with a tenant cascade. These are additive to V1/V2 history/trial/billing tables. Preserve original usage reservations and trial eligibility; do not backfill invented provenance into legacy captures. Review the full SQL chain and database backup/restore strategy before a remote migration:

```powershell
npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
```

`npm run db:migrate:remote` uses the local Wrangler config; use the explicit production config above for production. Deployment and remote migration are separate operator actions. Validate legacy history/raw downloads, billing/access, active trial context/follow-up and tenant isolation after migration.

Account deletion requires recent authentication/confirmation and provider-confirmed cancelled/expired subscription where one exists. Product evidence/actions/events/pins and sessions cascade away; processing input/result and reservation context/raw are redacted, leases revoked, and in-flight writes require surviving tenant ownership. Anonymous usage/cost ledger rows and minimal retired billing identifiers remain to prevent quota reset or billing resurrection. A paid call already sent can still incur cost; deletion cannot revoke an external provider transaction. Verify delayed completion cannot recreate deleted evidence.

## Production gates and exact blockers

No live provider or inference calls were made for this bounded documentation work. No live held-out dataset, classifier accuracy, p50/p95 latency, invoice-reconciled workload cost or safe numerical four-engine budget has been established. Missing credentials/account access and authorized bounded live workload keep the associated gates open. Optional missing adapters stay unavailable rather than blocking the synthetic workspace or being replaced by generic search.

| Gate                         | Blocker now                                                                                                              | Recovery/evidence required                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Enabled surface authenticity | No bounded live capture receipt for newly enabled surfaces                                                               | Configure only chosen collectors; obtain a real successful or observed-no-overview capture, raw metadata and locale/device/model validation per enabled surface                |
| Async failure/recovery       | Fixture/local behavior is not provider-account evidence                                                                  | Observe pending/error/uncertain task recovery, saved task/tag correlation, auth/low-balance/rate-limit behavior and no duplicate POST                                          |
| Classifier quality           | No human-labeled held-out answers or live Clef workload                                                                  | Separate tuning/held-out sets, per-engine/per-dimension quality and evidence checks, abstention coverage, p50/p95 latency, tokens and measured cost; keep missing metrics null |
| Spend budget                 | Only configured caps and model-rate estimates exist                                                                      | Reconcile reported/unknown attempts with provider invoices/balance; choose positive operator caps from the authorized workload before daily fan-out                            |
| Production D1 scope          | Local forty-item acceptance passes within fifty prepared statements; full authenticated/cron workload is unverified live | Verify intended plan and complete max-scope workload including authentication, polling, processing and surrounding queries before advertising production scope                 |
| Retention/security           | Local tests cannot prove remote migrated state                                                                           | Back up and migrate intentionally; verify V1/V2 trial/history/access/billing, ownership/raw downloads, deletion during async work and pause recovery                           |

Cloudflare documents fifty D1 queries per Worker invocation on Free and one thousand on Paid. The host observed the previous acceptance implementation at 105 prepared statements, then replaced per-item writes with one atomic five-statement JSON set-insert batch. The strengthened local `startGeoRun` test now proves forty items and forty reservations within fifty prepared statements. This is acceptance evidence, not a full live authenticated/cron invocation or proof of zero production cost. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Keep GEO flags off/zero while gates are unresolved. A production `AI` binding or synthetically passing test suite is not the release signal. Record actual live evidence in [the evaluation report](../research/geo-evaluation-report.md) before enabling the corresponding production feature.
