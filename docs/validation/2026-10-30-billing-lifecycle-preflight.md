# Billing lifecycle preflight — 30 October 2026

## Obsolete Test-mode webhook retired

The owner authorized retiring the old Test-mode webhook that targeted production. Before deletion, merchant webhook `138902` was verified as Test mode, store `476459`, URL `https://cite-scout.com/api/webhooks/lemonsqueezy`. Its object was backed up privately. Only that resource was deleted.

Replacement webhook `147773` remains Test mode for the same store and targets `https://staging.cite-scout.com/api/webhooks/lemonsqueezy`. The remaining webhook inventory compared unchanged. No live webhook, production Worker, database or Access policy was changed. This supersedes the old-hook-pending note in the [connection receipt](2026-10-30-staging-billing-connected.md).

At 16:36 UTC, staging remained on `4b9f6a66-a781-4aac-acd5-6281b1d9b418`. All Worker bindings and schedules compared unchanged against the preflight snapshot. Monitoring/classification request counts, the existing owner's project and the owner's subscription rows also compared unchanged. No Worker deployment or paid provider request occurred during this preflight.

## Actual shared search capacity

At 16:26 UTC, the free SerpApi Account API reported an active Free Plan: **250 searches/month**, 16 used, 234 remaining, no extra credits, renewal 13 November. The response was filtered before storage because the Account API also returns credentials and personal account details. No search request was made.

One fully used customer account needs the following Google request capacity over 31 days, before retries, other accounts or operational headroom:

| Plan    | Active prompts | One request/check | Two requests/check |
| ------- | -------------: | ----------------: | -----------------: |
| Starter |              5 |               155 |                310 |
| Growth  |             15 |               465 |                930 |
| Pro     |             30 |               930 |              1,860 |

The current shared allowance cannot sustain one Growth or Pro account, or Starter at two requests per check. Verified free capacity can support bounded tests; it is not proof of sustainable package economics. The **60% contribution-margin gate remains unmet**: actual paid search capacity/allocation, capture and classification costs, payment fees and operational headroom still need a cost manifest. No price, provider plan, budget or package entitlement was changed.

Source: [SerpApi Account API](https://serpapi.com/account-api).

## Production recovery boundary

A SELECT-only production preflight found migrations `0000` and `0001`, 16 tables, two users and one active Test-mode subscription. No live subscription was found in the grouped subscription query. The second user's identity was not retrieved. The database is not an owner-only disposable dataset.

No production export, migration, restore or write was performed. Cloudflare documents that a running D1 export blocks other database requests, so an actual production-copy rehearsal needs a separately approved operational window and private data handling. The existing `npm run check:v2` passed its synthetic old-schema backup, additive upgrade and restore checks; that does not replace a production-copy rehearsal.

Source: [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

## Next lifecycle step and remaining gates

The existing owner's account must not be used for test subscription mutations. Cloudflare Access can retain the owner's identity while CiteScout uses a distinct email-alias account through its normal email/magic-link flow. At the last account check, that alias account did not yet exist. No checkout purchase or merchant lifecycle mutation was submitted.

After the separate account is verified, create a fresh Test-mode checkout bound to its user ID and email. Earlier checkout-smoke links belong to the main account and must not be purchased for this rehearsal. Verify actual merchant delivery and canonical subscription state, portal, cancellation/resume and available payment lifecycle events without modifying the main account. Clearly distinguish vendor simulations from actual lifecycle transitions and natural renewal.

U6 and the public MVP remain open. Existing outstanding G1/G2/G3 evidence and G4's real action/later comparable observations are not closed by billing setup or by editing already exposed review labels. Public paid activation also requires capacity/margin, live billing and production recovery evidence.

Private snapshots and scripts: `research/private/billing-lifecycle-2026-10-30/`. No credentials, checkout URLs, customer identities or raw database data are included in this receipt.
