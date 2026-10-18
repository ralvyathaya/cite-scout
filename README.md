# CiteScout

**Know when AI recommends your competitors instead of you.**

CiteScout turns stored AI visibility observations into evidence, diagnoses, Owned/Earned tasks, completion pins and comparable follow-up for founders and marketing teams. The existing subscription is $19/month; it does not establish an affordable four-engine production allowance.

> GEO collectors use the real Perplexity Agent API and optional DataForSEO Google AI Overview, ChatGPT Search and Bing Copilot Answers captures. Missing collectors are explicitly unavailable. API observations are nondeterministic and do not promise consumer-chat parity or deterministic rankings. Production GEO capture, classification and page checks remain disabled pending live release gates.

See [GEO operations](docs/geo-operations.md), [provider audit](docs/geo-provider-audit.md) and [evaluation status](research/geo-evaluation-report.md) for the current configuration and activation blockers.

## Architecture

One TypeScript repository and one Cloudflare Worker deployment:

- React 19, Vite, React Router, Tailwind CSS
- Hono API routes and Worker handlers
- Workers Static Assets for the SPA
- D1 through the `DB` Worker binding
- Drizzle schema and generated SQL migrations
- Better Auth magic links, Resend, and Turnstile
- Perplexity Agent API behind `ObservationProvider`
- Optional native DataForSEO task collectors; Clef Flash through Workers AI, explicit Clef alternative and optional Jev classifier
- Lemon Squeezy hosted checkout, signed webhooks, and Customer Portal
- Five-minute Cron Trigger for bounded scheduling, saved-task polling and processing
- Vitest, Cloudflare Vitest plugin, and Playwright

D1 was chosen instead of Supabase or Convex because it keeps authentication, product data, quotas, and scheduled coordination in the same Cloudflare deployment with no external database connection pool or additional platform.

See [docs/architecture.md](docs/architecture.md).

## Local development

Requirements: Node 22.12+ and npm.

```powershell
npm install
if (-not (Test-Path -LiteralPath '.dev.vars')) { Copy-Item .dev.vars.example .dev.vars }
npm run cf:typegen
npm run db:migrate:local
npm run dev
```

Local configuration has `EXTERNAL_INTEGRATIONS_ENABLED=false`, GEO flags disabled and GEO budgets zero. Open `http://localhost:5173/app/overview?fixture=1` for the interactive synthetic workspace. Its persistent banner, separate browser-memory store and intercepted workspace API keep provider, classifier and billing requests out of this flow; fixture requests on non-localhost hosts fail closed. Refresh resets its data; Exit fixture clears its session marker. Production fails closed when test authentication is enabled. Local Wrangler intentionally has no `AI` binding; production Wrangler declares `AI`, so enabling production classification can incur inference cost.

**Never commit `.dev.vars`. Never put secrets in `wrangler.jsonc`. Never expose the Perplexity or Lemon
Squeezy API key to browser code.**

The production build deletes any local secret file (`.dev.vars`, `.env*`) from the output and fails the
build if one survives, so local credentials cannot reach a deployable artifact.

## Cloudflare and D1 deployment

Authenticate and create the production database:

```bash
npx wrangler login
npx wrangler d1 create promptwatch
```

Review the D1 IDs in both Wrangler files for the intended account. For the production database, review/apply migrations explicitly with the production config, then deploy:

```bash
npm run cf:typegen
npx wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
npm run deploy
```

`npm run deploy` targets production via `wrangler.production.jsonc`
(`wrangler deploy --config wrangler.production.jsonc`), which attaches the
`cite-scout.com` custom domain, enables external integrations, and schedules the five-minute
Cron Trigger. `wrangler.jsonc` stays local-dev friendly and is the only file the
Cloudflare Vite plugin reads — it ignores `env` blocks, which is why production
lives in a separate file. `npm run dev` is unaffected.

Production secrets can only be set after the first deploy creates the Worker:

```bash
wrangler secret put PERPLEXITY_API_KEY --config wrangler.production.jsonc
wrangler secret put BETTER_AUTH_SECRET --config wrangler.production.jsonc
wrangler secret put RESEND_API_KEY --config wrangler.production.jsonc
wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.production.jsonc
wrangler secret put OPERATOR_SECRET --config wrangler.production.jsonc
```

(Lemon Squeezy secrets follow the same pattern once the store is configured.)

## Preview and dogfood testing

`npm run deploy:preview` uploads a version without touching production traffic and
moves the stable `staging` alias to it (find the URL under dashboard → Workers &
Pages → citescout → Deployments). Full ritual, golden rules, and the launch gate
live in [docs/dogfood.md](docs/dogfood.md). Two hard limits: full login only works
on hostnames configured for the environment's Turnstile and OAuth clients, and
preview URLs expose no logs — debug locally.

Remote migrations are an explicit operator step. Review SQL and backup/restore strategy first. The Cron Trigger runs at `*/5 * * * *` UTC. `MAX_PROVIDER_CALLS_PER_CRON_INVOCATION` bounds the collector work limit; it is not an end-to-end D1 query or dollar-cost cap. GEO production activation requires the separate gates in the operations document.

## Secrets and configuration

Set every production secret interactively (after the first deploy creates the Worker):

```bash
npx wrangler secret put PERPLEXITY_API_KEY --config wrangler.production.jsonc
npx wrangler secret put LEMON_SQUEEZY_API_KEY --config wrangler.production.jsonc
npx wrangler secret put LEMON_SQUEEZY_WEBHOOK_SECRET --config wrangler.production.jsonc
npx wrangler secret put BETTER_AUTH_SECRET --config wrangler.production.jsonc
npx wrangler secret put RESEND_API_KEY --config wrangler.production.jsonc
npx wrangler secret put TURNSTILE_SECRET_KEY --config wrangler.production.jsonc
npx wrangler secret put OPERATOR_SECRET --config wrangler.production.jsonc
```

Set production values for `APP_URL`, Lemon Squeezy IDs and host, `RESEND_FROM_EMAIL`, `TURNSTILE_SITE_KEY`, and reviewed caps in production Wrangler. Optional GEO collectors need server-side `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`; only the optional Jev selection needs `TYPESAFE_API_KEY`. Clef Flash/Clef use the `AI` binding. See the operations document for all GEO flags, defaults and budgets.

## Perplexity Agent API

CiteScout uses `POST https://api.perplexity.ai/v1/agent` with bearer authentication and the current `fast` preset. The preset is the least-depth supported citation-oriented configuration selected for the MVP. The actual model returned by Perplexity, preset, usage, response ID, citations, and answer are stored. Re-check [models](https://docs.perplexity.ai/docs/agent-api/models) and [pricing](https://docs.perplexity.ai/docs/getting-started/pricing) before production launch because dynamic presets can change.

The stable instruction is neutral; tracked brands and competitors are never injected. Retries are bounded to timeout, 408, 429, and transient 5xx errors.

## Better Auth, Resend, and Turnstile

Better Auth uses the Drizzle adapter and D1 core tables. Magic links are hashed, single-use, and expire. Production cookies are Secure, HttpOnly, and SameSite Lax. Configure a verified Resend domain and use its address in `RESEND_FROM_EMAIL`.

Create a Turnstile widget for local and production hostnames. Login requests must be verified server-side through Siteverify; a client success state is never trusted. Production expected hostnames must not include localhost.

### Google sign-in locally and in production

The Google button is visible immediately. Clicking it starts the server-side OAuth flow;
missing credentials or a failed request show an error without removing email sign-in.
The initial public-config request is still needed for email verification, but does not gate Google.

Store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the ignored `.dev.vars` for local
development, and in Worker secrets for each deployed environment. Use `npm run dev` for
real local OAuth: `npm run preview` serves the secret-free build and does not load these
credentials. To use the same port as the UI review, run
`npm run dev -- --host 127.0.0.1 --port 4173 --strictPort` instead of preview.

In the Google Cloud Console, register the exact authorized redirect URIs for that OAuth client:

- `http://localhost:5173/api/auth/callback/google` (development)
- `http://localhost:4173/api/auth/callback/google` (local review)
- `https://staging.cite-scout.com/api/auth/callback/google` (staging client)
- `https://cite-scout.com/api/auth/callback/google` (production client)

If using `127.0.0.1` instead of `localhost`, register that exact URI too. Local development
accepts only those two loopback hosts on ports 5173 and 4173. Staging/production always
use their configured `APP_URL` and do not trust localhost. If the Google consent screen is
in Testing mode, add your Google account as a test user. A successful local login uses
local D1 data; it does not grant access to your staging project. Automated OAuth tests use
synthetic credentials and intercepted authorization pages, without calling Google.

### Website-first project setup

New accounts can set up a project without contacting the founder: enter a website first,
then review/edit suggested brand, one to three competitor candidates and three buyer questions.
Manual setup remains available when suggestions are disabled or the homepage cannot be read.
Questions do not need to have been checked in Perplexity beforehand. Unenrolled accounts
save setup without starting a check, enrolling in a trial, or enabling a daily schedule.
Monitoring still requires its existing access, provider configuration and quota. The existing
enrolled trial flow retains its explicit review and baseline action.

Automatic drafts use the existing server-side `OPENAI_API_KEY` and a separate
`ONBOARDING_SUGGESTIONS_DAILY_CAP` and `ONBOARDING_SUGGESTIONS_TOTAL_BUDGET_USD`,
which default to **0** in all environments. Apply
`0011_onboarding_suggestions.sql` to the intended D1 before enabling a positive cap.
The cap counts reserved attempts globally per UTC day, with an additional three-attempt
account limit. The total budget retains US$0.01 per reserved attempt across accounts and
UTC days, including failed attempts and deleted accounts; it does not reset daily.
Saved drafts remain available to their owner for the same website/parser version even
when new generation is disabled or its key is absent. Their original timestamp stays visible.
This is separate from GEO monitoring budgets and never enables a scan.
The active staging owner can open **Settings → Review onboarding** (or
`/app/onboarding?review=1`) with their existing account. It starts an empty review
form and uses a separate suggestions cache within the same allowance. **Finish review**
does not save/replace a project or start checks; **Start again** resets the form.
Both the UI and suggestions endpoint restrict review mode to the active staging owner.
See [suggestion methodology, limits and AI change review](docs/validation/2026-10-17-onboarding-suggestions.md).

## Lemon Squeezy setup

1. Activate a Lemon Squeezy store and choose test mode.
2. Create one recurring product variant at **$19 USD/month**, with no Lemon Squeezy free trial.
3. Copy store, product, and variant IDs into configuration.
4. Generate a test-mode API key and webhook signing secret.
5. Set webhook endpoint to `https://YOUR_APP/api/webhooks/lemonsqueezy`.
6. Subscribe to:
   - subscription created, updated, cancelled, resumed, expired, paused, unpaused
   - subscription payment success, failed, recovered
7. Configure Customer Portal back link to `https://YOUR_APP/app/billing`.
8. Test hosted checkout and signed webhooks before moving to live mode.

Test and live modes have separate products, IDs, keys, and webhooks. Replace all of them when going live. A checkout redirect only shows “Confirming your subscription”; it never grants access. Only verified webhook state grants entitlement. Cancelled subscriptions retain access until `ends_at`; expired, paused, past-due, and unpaid subscriptions are read-only.

Portal URLs are fetched on demand and never persisted because they expire.

## Billing reconciliation

Use the operator-protected reconciliation endpoint with `Authorization: Bearer $OPERATOR_SECRET` and either an internal user ID or Lemon Squeezy subscription ID. It retrieves current provider state, validates configured IDs/mode, and will not reassign ownership. Normal users cannot access it.

## Cost controls

- Legacy global provider calls: 150/day in both checked-in Wrangler configs
- Per user: 350/month
- Cron: 20 calls/invocation
- Legacy unpaid trial: maximum 3 prompt calls; V2 preserves a frozen three-question baseline and eligible follow-up with bounded attempts
- Paid project: maximum 10 prompt observations/UTC day
- One project, 10 enabled prompts, 3 competitors

These are legacy limits, not a four-engine GEO entitlement. GEO collector daily/global/monthly and processing daily caps are all zero by default. Usage reports distinguish reported collector cost, estimated classifier cost and attempts with unknown cost; no real live workload cost has been measured. Local maximum-scope acceptance now preserves forty items/reservations within fifty prepared statements. Full authenticated/cron maximum scope is not validated on live D1 Free; local no-cost tests do not establish a free production deployment.

Reservations and trial/manual gates are claimed in conditional D1 batches before provider calls. Failed/ambiguous attempts remain consumed; GEO ambiguous submission is never automatically reposted. Deleting prompts or accounts does not delete usage reservations. Apply the ordered migration chain through `0009`, preserving the `0001` nullable ownership/accounting migration and V2 frozen trial context; see GEO operations for retention and remote migration instructions. Usage deleted before the retention migration cannot be reconstructed, and migration never resets trial eligibility.

## Mention heuristics

Legacy detection is deterministic and uses Unicode-safe normalization, token boundaries, canonical domains and optional aliases. GEO analysis uses Clef Flash by default with native typed questions and probabilities. Probabilities are model outputs, not measured accuracy. Classification failure preserves the original capture; all diagnoses require review. Metrics use explicit eligible samples and coverage, with frozen context/cohorts; completion pins describe correlation, not causal uplift or financial ROI.

## Tests

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
```

Coverage includes deterministic normalization and mention matching, metric formulas and insufficient-data
behaviour, subscription entitlement transitions, provider prompt neutrality and bounded retries, webhook
signature verification over exact raw bytes, D1 constraint and cascade behaviour, one-observation-per-day
uniqueness, multi-tenant authorization guards, and public/mobile/accessibility browser flows.

### Continuous integration

[CI](.github/workflows/ci.yml) runs on pull requests to `master`, pushes to `master`, and manual dispatch. Its `Checks` job uses locked dependencies and Node 22 to run typecheck, lint, unit and local Worker integration tests, `check:v2`, migration metadata checks, build, and desktop/mobile Chromium tests. Browser failure evidence is retained for seven days.

CI leaves API credentials empty, generates disposable auth, Turnstile and webhook signing secrets, and uses fixture/mock providers; no production credentials or deployment steps are configured. A successful run validates application behavior, not live collector fidelity, classifier accuracy or provider cost. Review the `Checks` result before merging. Required-check enforcement depends on the repository's GitHub branch-protection entitlement; the current private account returns an upgrade-required response.

## Account deletion

Deletion requires sign-in within 15 minutes and explicit confirmation of permanent removal and forfeited remaining access. Provider-confirmed cancelled or expired subscriptions can be deleted immediately. Renewable, paused, or payment-problem subscriptions must first be cancelled in the portal. Product data and sessions are removed atomically with the local subscription; anonymous usage accounting and minimal retired billing identifiers remain.

## Collector contract

An additional GEO collector must preserve neutral prompting, identify engine/surface/collector, validate actual target answers and distinguish retrieved links from answer/element/verified inline references. Generic Serper SERP or Tavily search/extract cannot be relabeled target AI answers. These discovery options were audited and remain unwired in this bounded MVP; production never silently falls back to fixtures.

## Known limitations

- One project per account.
- Real GEO surface availability depends on configured collectors and completed live gates; DataForSEO is optional for local/MVP use.
- Directional observations, not exact rankings.
- No team accounts; original GEO parsed provider JSON is available through tenant-protected raw downloads.
- Real classifier quality, p50/p95 latency and workload cost remain unmeasured; no sub-50 ms claim.

## Real validation quotes

_Intentionally empty until genuine customer validation is collected._

## License

MIT — see [LICENSE](LICENSE).
