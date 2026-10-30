# Staging Access and test checkout connected — 30 October 2026

The owner supplied the scoped Access write token through the ignored local secret file after authorizing only a staging webhook exception. The token was used for Access management; it was not installed in a Worker, printed or committed.

## Access and webhook

- Original root application `15a901bd-1fdd-452f-bed8-385dfac960e3` and its owner-only policy compared exactly before/after. No production or unrelated Access application was changed.
- Added owner-only application `b356e30b-a238-49ed-a8f8-90b1761d14c4` at `staging.cite-scout.com/api/webhooks/lemonsqueezy/*` first, then the single callback Bypass application `274b0be0-d3e8-4918-bd79-9919fecdf618` at the exact webhook path. Descendants remain protected instead of inheriting public callback access.
- **14 live boundary probes passed:** unsigned/invalid signatures return 401; a correctly signed invalid payload returns 422; other-store and live-mode payloads return 422. The root, app, billing API, sibling webhook, similar path, trailing slash and nested descendants still redirect to Cloudflare Access. The valid signature probe also verifies the deployed signing secret without writing a subscription.
- Created **test webhook `147773`** for store `476459`, pointing to `https://staging.cite-scout.com/api/webhooks/lemonsqueezy` with the 11 subscription/payment events supported by the existing receiver. It uses the already installed signing secret. Existing webhook `138902`, which points to production, was left unchanged.

## Checkout verification and deployment

The six approved plan/cadence combinations were rechecked against current merchant products, variants and price objects. All remain published Test-mode subscriptions at $29/$290, $79/$790 and $149/$1,490, with monthly/yearly cadence respectively, standard pricing and no setup fee or metering. No merchant price or package limit changed.

All **six hosted checkout pages returned HTTP 200**, component `Web/Checkout`, with `cart.test_mode=true` and Test-mode product data. They retain the selected variant and staging return URL. Verification used a new anonymous HTTP cookie jar for each page, never a user's browser session. A first direct-fetch check returned 404 because it dropped Lemon Squeezy's cart/session cookies during the redirect to `/checkout`; following the normal cookie flow resolved it without an app change. One additional short-lived Test-mode checkout was created during that diagnosis. None was purchased.

Staging is active at **`4b9f6a66-a781-4aac-acd5-6281b1d9b418`**. The only changed Worker binding is **`BILLING_PLANS_ENABLED=false → true`**. The inactive upload used `--keep-vars` and the named active-version snapshot; the final candidate explicitly inherited every other binding, including encrypted secrets, from `5c3b786b-53e7-4631-b68f-d2ec37316a2e`. Application code/etag and Worker SHA-256 `f99f783fd4dc4a522d82fc8b0b7a549f445086fdb7683d85873da343d1c72968` are unchanged. Runtime, assets, schedules, provider request counts, subscription rows, engine selection and active prompts compared unchanged. No database migration, provider/model/budget/entitlement definition change or production deployment occurred.

Verification: **84 relevant tests passed**, together with typecheck, changed-file formatting, diff checks and live staging Access/isolation checks. Routing probes also passed after activation. No frontend/Worker code changed, so no new app bundle or browser screenshot comparison was needed. Private snapshots, probe details and merchant records are under `research/private/billing-webhook-2026-10-30/`.

## Remaining boundary

This completes Access routing, merchant webhook registration and checkout page smoke for staging. It does **not** certify an authenticated app-route browser checkout, completed Test-mode purchase, a delivered merchant subscription event, portal, renewal, cancellation/refund or payment-failure lifecycle. No purchase was submitted; subscription rows and provider calls remain unchanged. Use an isolated staging test account for the lifecycle rehearsal so existing entitlements remain intact. Review the pre-existing production-directed test webhook before any transaction that could also send an event there.

U6's full lifecycle/recovery gate and the public MVP are still open. G1–G3 need their outstanding real evidence, G4 needs an actual action and later comparable observations, and the at-least-60% contribution margin needs actual cost/capacity/fee evidence. Checkout setup is not a pass for those gates.

Rollback: activate `5c3b786b-53e7-4631-b68f-d2ec37316a2e` to disable the new catalog, then remove only the newly created staging callback/webhook resources if routing must also be reverted. Remove the public callback Access app before its owner-only descendant app. Preserve the original root app, original merchant webhook, stored evidence and subscription/accounting history.
