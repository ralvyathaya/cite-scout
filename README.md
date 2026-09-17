# CiteScout

**Know when AI recommends your competitors instead of you.**

CiteScout records daily, web-grounded observations from the Perplexity Agent API, detects tracked brand and competitor mentions, and turns the archive into transparent visibility trends. It is a focused $19/month alternative to expensive GEO/AEO monitoring suites for founders and small teams.

> CiteScout does not monitor ChatGPT's consumer app, Claude's consumer app, Google AI Overviews, or deterministic rankings. API observations are nondeterministic and may differ from the Perplexity consumer application.

## Architecture

One TypeScript repository and one Cloudflare Worker deployment:

- React 19, Vite, React Router, Tailwind CSS
- Hono API routes and Worker handlers
- Workers Static Assets for the SPA
- D1 through the `DB` Worker binding
- Drizzle schema and generated SQL migrations
- Better Auth magic links, Resend, and Turnstile
- Perplexity Agent API behind `ObservationProvider`
- Lemon Squeezy hosted checkout, signed webhooks, and Customer Portal
- Hourly Cron Trigger for bounded daily scans
- Vitest, Cloudflare Vitest plugin, and Playwright

D1 was chosen instead of Supabase or Convex because it keeps authentication, product data, quotas, and scheduled coordination in the same Cloudflare deployment with no external database connection pool or additional platform.

See [docs/architecture.md](docs/architecture.md).

## Local development

Requirements: Node 22.12+ and npm.

```bash
npm install
copy .dev.vars.example .dev.vars
npm run cf:typegen
npm run db:migrate:local
npm run dev
```

Local development can run with `EXTERNAL_INTEGRATIONS_ENABLED=false`. The UI then renders the public
fixture and uses a local Turnstile placeholder token. Production fails closed when test authentication is
enabled.

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

Replace the placeholder D1 `database_id` in `wrangler.jsonc`, then:

```bash
npm run cf:typegen
npm run db:migrate:remote
npm run deploy
```

`npm run deploy` targets production via `wrangler.production.jsonc`
(`wrangler deploy --config wrangler.production.jsonc`), which attaches the
`cite-scout.com` custom domain, enables integrations, and schedules the hourly
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
on `cite-scout.com` (Turnstile rejects other hostnames), and preview URLs expose
no logs — debug locally.

Remote migrations are an explicit operator step. Review generated SQL and confirm a backup strategy before applying destructive changes. The Cron Trigger runs at `0 * * * *` UTC and processes no more than `MAX_PROVIDER_CALLS_PER_CRON_INVOCATION` reservations in deterministic order.

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

Set production values for `APP_URL`, Lemon Squeezy IDs and host, `RESEND_FROM_EMAIL`, `TURNSTILE_SITE_KEY`, and cost caps in the production Wrangler environment.

## Perplexity Agent API

CiteScout uses `POST https://api.perplexity.ai/v1/agent` with bearer authentication and the current `fast` preset. The preset is the least-depth supported citation-oriented configuration selected for the MVP. The actual model returned by Perplexity, preset, usage, response ID, citations, and answer are stored. Re-check [models](https://docs.perplexity.ai/docs/agent-api/models) and [pricing](https://docs.perplexity.ai/docs/getting-started/pricing) before production launch because dynamic presets can change.

The stable instruction is neutral; tracked brands and competitors are never injected. Retries are bounded to timeout, 408, 429, and transient 5xx errors.

## Better Auth, Resend, and Turnstile

Better Auth uses the Drizzle adapter and D1 core tables. Magic links are hashed, single-use, and expire. Production cookies are Secure, HttpOnly, and SameSite Lax. Configure a verified Resend domain and use its address in `RESEND_FROM_EMAIL`.

Create a Turnstile widget for local and production hostnames. Login requests must be verified server-side through Siteverify; a client success state is never trusted. Production expected hostnames must not include localhost.

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

- Global provider calls: 100/day
- Per user: 350/month
- Cron: 20 calls/invocation
- Unpaid lifetime trial: maximum 3 prompt calls
- Paid project: maximum 10 prompt observations/UTC day
- One project, 10 enabled prompts, 3 competitors

Reservations are written before provider calls with unique idempotency keys. Ambiguous interrupted calls are not automatically replayed.

## Mention heuristics

Detection is deterministic and does not make a second LLM call. It uses Unicode-safe normalization, token boundaries, exact brand names, canonical domains, and optional aliases. Recommendation and negative context require conservative nearby terms. Each entity counts at most once per response for share of voice. The UI labels metrics as directional.

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

## Account deletion

Deletion requires recent authentication. An active subscription must be managed or cancelled first. Product data and sessions are deleted; legally or operationally required minimal billing identifiers may be retained. CiteScout never stores card data.

## Add another AI provider

Implement `ObservationProvider.runObservation`, validate its response, preserve neutral prompting, return citations and usage, and add the provider to reservation uniqueness. Production must never silently fall back to fixtures.

## Known limitations

- One project per account.
- Perplexity Agent API only.
- Directional observations, not exact rankings.
- No team accounts or exports in the MVP.

## Real validation quotes

_Intentionally empty until genuine customer validation is collected._

## License

MIT — see [LICENSE](LICENSE).
