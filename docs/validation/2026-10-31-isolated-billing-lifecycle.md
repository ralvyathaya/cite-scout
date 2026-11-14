# Isolated staging billing lifecycle — 31 October 2026

## Real Test-mode evidence

The owner authenticated a separate verified email-alias account through the normal login flow and personally completed the hosted Starter monthly checkout using an official dummy card. The browser's `/api/me` identity matched that account; it was distinct from the existing owner. No project, monitoring check or synthetic subscription row was created for this rehearsal.

The active merchant subscription, paid $29 order and processed `subscription_created` receipt matched store `476459`, product `1406363`, Starter monthly variant `2195435`, and the isolated account. Billing displayed the verified subscription. The initial `subscription_payment_success` delivery and invoice arrived later; the app recorded one `payment_verified` event. Initial absence during the first observation was delivery latency, not evidence of a missing handler.

| Case                                             | Actual result                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Authenticated app checkout and merchant callback | Paid Test-mode order; canonical subscription active; callback processed                                          |
| Cancel and resume                                | Merchant and staging rows changed to cancelled, then active; corresponding callbacks processed                   |
| Cancellation grace period                        | Billing status retained paid access through a future canonical `ends_at`                                         |
| Pause and unpause                                | Canonical/local states matched; paused status returned `canScan=false` and warning `paused`                      |
| Starter, Growth and Pro, monthly/yearly          | All six variant states matched the app's plan/cadence and allowance responses                                    |
| Full refund of initial invoice                   | Merchant refunded $29; callback processed; original payment event marked refunded without a second payment event |
| Plan-change invoices                             | `billing_reason=updated` invoices did not become new initial or renewal events                                   |
| Cleanup                                          | Returned to Starter monthly and cancelled renewal; retained Test-mode subscription, invoice and audit history    |

Limits verified through authenticated Billing status were **5/15**, **15/45**, and **30/90** active prompts/daily checks for Starter, Growth and Pro respectively. Annual had the same daily allowance as monthly. This verifies subscription mapping; it is not six separate hosted purchases, a real oversized-project downgrade rehearsal, or permission to dispatch checks beyond operational provider limits. Variant changes used documented subscription updates with proration disabled; catalog prices were not edited.

All observed callbacks came from actual merchant Test-mode actions. No locally fabricated signed events were used as real delivery evidence. Natural renewal, a real failed renewal/recovery, expiration after a real period, and actual duplicate/out-of-order merchant delivery were not demonstrated. Existing integration tests cover synthetic lifecycle and ordering cases separately.

Vendor references: [Test mode](https://docs.lemonsqueezy.com/help/getting-started/test-mode), [subscription updates](https://docs.lemonsqueezy.com/api/subscriptions/update-subscription), [invoice refund](https://docs.lemonsqueezy.com/api/subscription-invoices/issue-refund).

## Portal defect found during the rehearsal

A subscriber without a project could buy a plan but could not reach subscription management: Billing linked to Settings, and Settings redirected missing-project accounts to onboarding. Billing also made a project-only allowance request and showed a setup error.

Commit **`ae95f99`** lets that account use the existing authenticated, canonical-provider-validated portal endpoint directly. Project accounts retain their existing Settings shortcut. Missing-project usage now says setup is needed and makes no allowance request; it does not invent zero usage. No server access rule, price, provider, budget, subscription definition, schema or dependency changed.

A browser regression reproduced the redirect before repair. **26 related desktop/mobile browser tests and 41 billing integration tests pass**, together with build/typecheck, formatting and source lint (`research/private/**` excluded as operational scripts outside the TypeScript project). The new case also passes again at desktop width and 320px mobile width with no page overflow. It proves no monitoring request occurs when opening Billing or following the portal action.

Staging version **`53161085-5647-4c07-a1db-7c6b9c3af9c8`** is active at 100%. The upload used `--keep-vars` with a named active-version snapshot, and the final version explicitly inherited all 58 bindings, including encrypted secrets. Runtime, asset configuration, schedules, provider counts, subscription/project rows and monitoring configuration compared unchanged across deployment. The Worker SHA-256 remains `f99f783fd4dc4a522d82fc8b0b7a549f445086fdb7683d85873da343d1c72968`; only frontend assets changed.

The authenticated browser then opened the actual merchant portal directly from Billing without a project. The expected merchant host, Test-mode banner, Starter Monthly subscription and cancelled status were verified. The app now displays a setup-needed usage message with no failed allowance request. The tab was returned to staging Billing.

Code rollback: activate **`4dc9fc93-9b9b-4385-9057-280c23a019ac`**. Preserve subscription, payment, invoice and accounting history; no migration or data reset belongs in this rollback.

## Retained scope and release boundary

Before and after the merchant lifecycle, the active Worker resources, all bindings, schedules, provider request counts, existing subscriptions, existing projects and monitoring settings compared unchanged. Only the new isolated account's Test-mode subscription and associated merchant/payment records changed. There were **zero paid AI calls and zero production changes**. The obsolete production-directed Test-mode webhook remains absent; the staging webhook is the Test-mode receiver.

U6 is advanced, not fully passed. Remaining real renewal/failure/recovery and recovery/rollout evidence must stay distinct from synthetic tests. Public paid release also still needs the outstanding G1–G4 evidence, an approved capacity/cost manifest meeting the 60% contribution target, live billing validation, and production-copy migration/restore verification. The verified shared SerpApi Free allowance cannot sustain even one fully used Growth or Pro account. No provider upgrade, price, budget or entitlement change is authorized by this receipt.

Private account/merchant records, subscription state snapshots, screenshots and assertions are under `research/private/billing-lifecycle-2026-10-31/`; deployment snapshots are under `research/private/portal-2026-10-31/`. No credentials, checkout/portal signatures or customer identities are included here.
