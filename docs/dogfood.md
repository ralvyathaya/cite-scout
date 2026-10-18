# Closed dogfood testing (pre-launch)

Production (`cite-scout.com`) stays closed until the launch gate below is green.
Polish happens in three layers; each layer has a different job.

## Golden rules

1. Never share preview URLs publicly. They are unlisted, not private.
2. Staging preview and production share the same D1 database and secrets.
   Anything you do on staging (trial scan, account deletion) affects production data
   and can spend real Perplexity credits.
3. Full login can only be tested on `cite-scout.com`, never on a preview URL:
   the server rejects Turnstile tokens whose hostname is not the configured `APP_URL`.
4. There are no logs on preview URLs (no Workers Logs, no tail). Debug locally,
   verify on staging, confirm on production.

## Prerequisites (all must hold before dogfooding)

- [ ] All 5 production secrets set (`wrangler secret list --config wrangler.production.jsonc`
      shows `PERPLEXITY_API_KEY`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`,
      `TURNSTILE_SECRET_KEY`, `OPERATOR_SECRET`)
- [ ] `cite-scout.com` verified in Resend (Domains) and `RESEND_FROM_EMAIL` matches it
- [ ] Turnstile widget lists `cite-scout.com` (+ `localhost`/`127.0.0.1` for local dev)
- [ ] WAF closed-testing rule active, tester IP allowlisted (or Cloudflare Access on top)
- [ ] Remote D1 migrated (`npm run db:migrate:remote` reports nothing to apply)

## Layer 1 — local (`npm run dev`)

Fast iteration: UI, copy, layout, form validation. Login here uses the
`local-development` Turnstile bypass and never touches real providers.

## Layer 2 — staging preview (shareable, unlisted)

```bash
npm run deploy:preview
```

This uploads a version WITHOUT touching production traffic. Open the stable alias
(`staging-citescout.<account>.workers.dev`, visible under dashboard → Workers &
Pages → citescout → Deployments) and check:

- [ ] Landing, pricing, demo, privacy, terms render (desktop + 390px mobile)
- [ ] No horizontal overflow, no console errors
- [ ] `/api/health` returns 200 with the service name
- [ ] Login page renders the real Turnstile widget (do NOT complete login here —
      hostname check fails by design, see rule 3)

Each upload moves the alias to the newest version. Production keeps serving the
last `npm run deploy` version.

## Layer 3 — production closed dogfood (on `cite-scout.com`, allowlisted IP only)

Run through as a real user, in order. Every step proves one integration:

1. [ ] Landing + demo load over HTTPS with valid certificate
2. [ ] Login with a real inbox → magic-link email arrives from `noreply@cite-scout.com`
       (proves Resend + domain + sender). Check spam folder once, then it should land in inbox.
3. [ ] Click link → session works, onboarding creates project (proves Better Auth + D1)
4. [ ] Run trial scan → 3 genuine observations with citations (proves Perplexity key,
       quota reservations, mention detection). This spends a few cents.
5. [ ] Overview shows metrics derived from YOUR results, not demo data
6. [ ] Responses archive opens raw answers + citations; prompt CRUD works
7. [ ] Billing page shows unpaid state; checkout button does nothing harmful
       (Lemon Squeezy is intentionally not connected yet)
8. [ ] Logout kills the session; protected routes refuse anonymous access
9. [ ] Repeat 2–8 in a mobile viewport
10. [ ] Delete the test account from settings (proves deletion; also cleans prod DB)

## Reporting issues

One issue = one note with: page, viewport (desktop/390px), steps, expected vs actual,
screenshot, and any console error text. Fix locally → gates green
(`format:check`, `lint`, `typecheck`, `test`, `build`, `test:e2e`) → new preview →
retest → commit.

## Launch gate (open to public only when ALL green)

### Finalization delivery boundary

The finalization pass provides local code, migration, and automated verification only. It does not deploy a Worker, apply remote migrations, configure live payments, or open the launch gate. Browser fixtures verify authenticated UI behavior with local API responses; they do not prove real login, payment delivery, or Perplexity availability.

Local verification on 2026-09-30: formatting, lint, type checking, production build, 63 unit tests, 63 integration tests, and 86 browser tests passed. Overview screenshots were reviewed at 320px, 390px, and 1440px. Authenticated checks also cover narrow layouts across prompts, responses, billing, and settings; exact-answer navigation, archive pagination, clipboard failures, delayed mutations, scan outcomes, and keyboard focus restoration. The populated migration test verifies copied reservations, retained indexes, and nullable references after account deletion. Build output retains non-blocking Vite configuration/chunk-size warnings.

- [ ] Back up/export D1, then apply `0001_sticky_the_hand.sql` to the intended environment before deploying the matching code. Verify reservation row counts, idempotency keys, indexes, and `foreign_key_check`. The migration copies retained rows; it does not reconstruct already-deleted usage or reopen old trials.
- [ ] Confirm all local gates below pass on the exact release commit; review Overview at 320px, 390px, and desktop, including the navigation dialog's Tab/Escape/focus return and reduced-motion behavior.
- [ ] Run the existing real-provider checks below. Exercise trial failure, deferred quotas, manual eligibility, scheduled scans, and returned-source evidence using controlled accounts.
- [ ] In Lemon Squeezy test mode, prove signed subscription and invoice payment events, duplicate/stale delivery, portal navigation, cancellation, expiry, and replacement after expiry. Verify redirect alone never enables scans.
- [ ] Verify cancellation-confirmed account deletion with fresh sign-in and forfeiture confirmation; late webhooks must not recreate entitlement, and anonymous usage accounting must remain.
- [ ] Configure and verify live store/product/variant, keys, signing secret, and mode separately. Google login stays visible and reports unavailability only after a click; keep unconfigured checkout disabled.
- [ ] Keep production closed until the existing launch checks are complete. Local tests are not production billing certification.

### Existing real-provider launch checks

- [ ] Dogfood script above passes twice in a row, desktop + mobile
- [ ] First hourly cron ran clean (dashboard → Triggers → Past Cron Events, no errors)
- [ ] Lemon Squeezy test-mode end-to-end: checkout → webhook → entitlement → portal
- [ ] Turnstile secret proven by a real login (an `invalid-input-secret` failure means
      `TURNSTILE_SECRET_KEY` holds the wrong widget's secret — re-put it)
- [ ] WAF closed-testing rule removed (or replaced with Cloudflare Access)
- [ ] `workers.dev` subdomain decision made (disable it or leave it)
