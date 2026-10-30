# Staging webhook preparation and checkout smoke — 30 October 2026

The owner authorized a Cloudflare Access exception only for the staging Lemon Squeezy webhook, a separate merchant test webhook, and Test-mode checkout verification. Other app/API routes must remain owner-only. Provider settings, budgets and existing entitlements must remain unchanged.

## Verified work

- Updated the deployment guard to recognize only `staging.cite-scout.com/api/webhooks/lemonsqueezy` with a single Everyone Bypass policy. Broad API/webhook wildcards, extra destinations, duplicate/unknown overlapping apps and unreviewed policies fail closed. The root app still requires its original owner-only policy.
- Because Access path policies can be inherited by descendants, require an owner-only `.../lemonsqueezy/*` application alongside the callback exception. The restricted child application must be installed first. Enabling the new billing catalog also requires the callback topology to pass remote validation. This does not bypass webhook HMAC/store/mode validation in the Worker.
- **84 tests across four relevant files passed**, plus targeted lint, typecheck, changed-file formatting, diff checks and the existing live owner-only Access preflight. No frontend or Worker source changed; a new application build/browser visual check was not needed for the deployment-script change.
- Exercised the existing app's Lemon Squeezy client against the real merchant API for all six plan/cadence combinations. All six checkout records are in Test mode, resolve to the verified store/variant IDs, lock the selected variant, have no custom-price override, and return to staging. The first response was recovered for continued verification after the harness incorrectly expected relationship resource data; its actual `store_id`/`variant_id` attributes were used. No checkout was purchased and no subscription was created.

This is **merchant API checkout smoke**, not an authenticated app-route/browser purchase or a billing lifecycle pass. Receipt payloads and checkout URLs remain private under `research/private/billing-webhook-2026-10-30/`.

## Current blocker

Cloudflare rejected creation of the callback application with **HTTP 403 / code 1010**. The available Access token permits inventory/preflight reads but not this write. The separate `STAGING_ACCESS_WRITE_TOKEN` has not been supplied. A scoped write token was requested through the owner-input workflow; its value must be placed in the ignored `.env.staging.access` file, never chat or Git.

**No Access application or policy was changed, no staging webhook was created, and checkout remains disabled.** Active Worker version is still `5c3b786b-53e7-4631-b68f-d2ec37316a2e` from the previous configuration-only release. No new Worker deployment, provider call, paid transaction or entitlement write occurred. The existing test webhook pointing to production remains untouched.

After the credential is supplied: create/verify the owner-only descendant app and callback exception, prove unsigned/invalid-signature rejection and protected neighboring paths, attach a separate Test-mode staging webhook with the installed signing secret, then enable only staging test checkout using the named active-version snapshot and inherited operational bindings. Inspect test-event delivery and an isolated customer's lifecycle before claiming U6 billing completion. Do not submit a test purchase that can unintentionally alter an existing account or reach an unreviewed production callback.

Rollback for the proposed routing change is removal of only the newly created callback/descendant applications and keeping `BILLING_PLANS_ENABLED=false`; preserve the original root owner-only app and original merchant webhook. No routing rollback is needed at this checkpoint because the write was denied.

## MVP status

The public MVP plan is still open. Even after billing connectivity succeeds, real G1–G3 capture/classifier evidence, G4's actual action and later comparable samples, invoice/capacity-based contribution margin of at least 60%, full merchant lifecycle and production recovery/rollout receipts remain required. Existing code, synthetic tests and checkout creation do not replace those release gates.

References: [Cloudflare path inheritance](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/), [scoped public endpoint policy and write permission](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/), [Lemon Squeezy webhook creation](https://docs.lemonsqueezy.com/api/webhooks/create-webhook).
