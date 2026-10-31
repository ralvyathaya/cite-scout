# Staging logout repair — 31 October 2026

## Cause and fix

The owner could not sign out before switching to an isolated billing test account. The active workspace and older shell both sent `Content-Type: application/json` with no request body. At the HTTP/Worker boundary, an empty body stream reached Better Auth's JSON parser and returned HTTP 400, `BAD_REQUEST`, “Invalid JSON in request body”. The UI then displayed “Could not sign out.”

A browser regression using the real local auth endpoint reproduced that exact response before the fix. Both callers now send the valid empty JSON object `{}`. No auth handler, cookie policy, origin allowlist, session lifetime, billing rule or dependency changed.

## Verification

- **39 integration tests pass**, including revocation of the signed-out session, clearing its cookie, rejection of a foreign origin without revoking the session, and preservation of another account's session.
- **38 staging guard unit tests pass.**
- **8 browser tests pass:** logout through the real auth endpoint on desktop/mobile, plus keyboard/layout checks at 320, 390 and 1440 pixels in both browser projects.
- Build/typecheck, changed-file formatting and diff checks pass. Repository lint passes with `npm run lint -- --ignore-pattern "research/private/**"`. Unqualified lint also traverses ignored private operational scripts and reports project-service errors for those scripts; they were excluded from the source lint run rather than added to the app's TypeScript project.
- After deployment, the existing staging browser session successfully signed out to the public homepage. Reopening the protected Billing page redirected to `/login`, while Cloudflare Access remained authenticated. The alias email was prepared in the login form; the owner must complete the normal email-link login. No checkout purchase was submitted.

## Deployment and retained scope

Staging version **`4dc9fc93-9b9b-4385-9057-280c23a019ac`** is active at 100%. The upload used `--keep-vars` with a snapshot of the named active version. The final candidate inherited all operational bindings explicitly from that version, including encrypted secrets.

All **58 bindings**, runtime, asset configuration, schedules, provider request counts, project rows, subscription rows, selected engines and active prompts compared unchanged before/after deployment. Only frontend assets changed; Worker SHA-256 remains `f99f783fd4dc4a522d82fc8b0b7a549f445086fdb7683d85873da343d1c72968`. Staging isolation and owner-only Access checks passed. No price, provider, budget, existing entitlement, database schema or production resource changed. No paid AI request was made.

Rollback: activate **`4b9f6a66-a781-4aac-acd5-6281b1d9b418`**. Retain database/accounting history and Access policies; this fix needs no migration or data rollback.

Private snapshots, deployment assertions and login screenshot are under `research/private/signout-2026-10-31/`. The [separate-account billing lifecycle](2026-10-30-billing-lifecycle-preflight.md), capacity/margin and public release gates remain open; successful logout is not a billing/MVP gate pass.
