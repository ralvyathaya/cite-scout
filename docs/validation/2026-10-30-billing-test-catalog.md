# Verified merchant test catalog — 30 October 2026

The owner supplied the CiteScout product and six variant IDs. Read-only merchant API checks confirm product `1406363`, named CiteScout, belongs to **store `476459`** at `citescout.lemonsqueezy.com`. The supplied `47645` was a missing final digit; its store lookup returned 404. Product and all six variants are published in **test mode**.

| Plan    | Monthly variant / USD | Annual variant / USD per year |
| ------- | --------------------- | ----------------------------- |
| Starter | `2195435` / $29       | `2316256` / $290              |
| Growth  | `2316257` / $79       | `2316258` / $790              |
| Pro     | `2316261` / $149      | `2316262` / $1,490            |

Current price objects independently confirm standard subscription pricing, one month/year intervals, no metered usage, setup fee, trial or license keys. No merchant price was changed. Tax-code metadata differs: Starter uses `saas_business`; Growth/Pro use `saas`. These settings are retained for merchant review before live sales; this receipt does not establish tax treatment or actual payment fees.

## Staging configuration

Active version **`5c3b786b-53e7-4631-b68f-d2ec37316a2e`** contains the verified test store/product IDs, a test-only six-variant map and two encrypted billing secret bindings provisioned from the existing local secret file. No secret values were printed or committed. **`BILLING_PLANS_ENABLED=false`** intentionally keeps checkout unavailable. The legacy variant remains empty; Starter was not assigned to the legacy $19 identity. There are no staging subscription rows, and none were created or modified.

This is a configuration-only deployment: application code/etag and Worker SHA-256 `f99f783fd4dc4a522d82fc8b0b7a549f445086fdb7683d85873da343d1c72968` match the previous active version. All other bindings were inherited explicitly from that named version. Runtime, assets, schedules, provider request counts, prompt/engine selections and paused daily monitoring compare unchanged. Analysis stays disabled. No provider calls, billing transactions or production changes occurred. Rollback: **`50148678-c686-4e6a-a9c2-b2d7403094df`**. Private preflight, merchant checks and before/after receipts are retained under `research/private/billing-test-2026-10-30/`.

Verification: **46 existing billing/plan tests across three files passed**, along with changed-file formatting, diff checks and staging isolation/owner-only Access checks. No frontend code changed; browser checkout and payment lifecycle were not exercised.

## Callback blocker and next step

The store has one existing test webhook, `138902`, targeting **production** (`https://cite-scout.com/api/webhooks/lemonsqueezy`). It was not changed. An unauthenticated POST with no signature to the corresponding staging endpoint returns **302 to Cloudflare Access**, so a merchant callback cannot reach the application's HMAC check.

Do not enable checkout or register a knowingly blocked staging callback. The existing isolation guard in `scripts/check-staging.mjs` requires the entire staging hostname to remain owner-only and rejects overlapping path applications. A narrowly scoped exception for only `staging.cite-scout.com/api/webhooks/lemonsqueezy` requires explicit owner authorization and a reviewed guard update. Retain owner-only Access for every other app/API route, retain webhook signature/store/mode validation, and test unsigned rejection before attaching a separate test webhook. Do not point new staging transactions at the production callback or reuse live IDs.

Once routing and the separate test webhook are verified, enable only the staging test catalog and exercise authenticated checkout, verified subscription synchronization, portal and lifecycle behavior. No real purchase or artificial entitlement has been performed. U6 billing lifecycle, G1–G4, actual contribution margin and production recovery/release remain open; merchant catalog configuration does not complete the public MVP.
