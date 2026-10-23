# Starter, Growth and Pro pricing readiness

Approved contract: one brand/account; 5/15/30 active prompts; Perplexity, OpenAI Web Search API and Google AI Overviews; 15/45/90 checks/day; $29/$79/$149 monthly or $290/$790/$1,490 annually. Annual is billed upfront and saves 16.7%. Existing $19 Perplexity subscriptions retain their existing price and rights. Claude and roadmap features are excluded from the public bundle.

## Cost gate: blocked, not a price change

Run `npx tsx scripts/check-plan-economics.ts research/pricing-economics-scenario.json`. Exit 1 means the scenario is **not ready for public sale**, not a failed implementation test. Unknown costs remain unknown. The calculator never calls a provider or changes a budget.

The checked-in scenario is an explicit conservative illustration, **not a verified forecast or an approved provider budget**:

- 31-day month, 10 accounts: five Starter, four Growth, one Pro; all use their full daily allowance.
- Two Google HTTP searches per monitoring check: 7,130 monthly searches, plus 20% capacity headroom = 8,556 searches. One shared $150/15,000-search SerpApi account is allocated once across accounts, proportional to prompt volume. No per-customer free allocation is assumed.
- Historical staging proxies from the [MVP audit](../audits/2026-10-22-public-mvp-audit.md): Perplexity $0.00356/check, OpenAI $0.01152175/check, classifier $0.0000984238/check. OpenAI's historical captures were partial; these rates do not establish the cost of complete, sellable answers.
- Assumed infrastructure $2/account/month, plus 25% provider/search cost reserve. Payment illustration uses 5.5% + $0.50/transaction; annual incurs one such transaction/year. Taxes, international/PayPal additions, currency conversion, payout fees and founder support time are not verified and may reduce contribution further.
- Provider invoice/rates, complete capture quality and billing lifecycle evidence are all marked unverified.

| Package         | Monthly revenue equivalent | Service cost/month | Payment fee/month | Contribution |
| --------------- | -------------------------: | -----------------: | ----------------: | -----------: |
| Starter monthly |                     $29.00 |             $13.13 |             $2.10 |        47.5% |
| Starter annual  |                     $24.17 |             $13.13 |             $1.37 |        40.0% |
| Growth monthly  |                     $79.00 |             $35.39 |             $4.85 |        49.1% |
| Growth annual   |                     $65.83 |             $35.39 |             $3.66 |        40.7% |
| Pro monthly     |                    $149.00 |             $68.79 |             $8.70 |        48.0% |
| Pro annual      |                    $124.17 |             $68.79 |             $6.87 |        39.1% |

All six miss the approved minimum 60% contribution in this scenario. Do not enable new sales, silently reduce allowances, switch collectors/models, or treat an annual prepayment as surplus cash. Re-evaluate with verified complete-answer usage, actual purchased search capacity, real fees, actual infrastructure and an explicit account cohort. A favorable simulated scenario alone does not satisfy the evidence gate.

Sources checked for planning: [SerpApi account pricing](https://serpapi.com/pricing), [Lemon Squeezy fees](https://docs.lemonsqueezy.com/help/getting-started/fees). They are reference tariffs, not this store's invoices.

## Environment-specific variants

The application uses the existing product/store and six new variants; the old variant remains valid for existing subscriptions. Configure actual merchant-created IDs in `BILLING_PLAN_VARIANTS`, never placeholder IDs:

```json
{
  "test": {
    "starter": { "month": "TEST_STARTER_MONTH", "year": "TEST_STARTER_YEAR" },
    "growth": { "month": "TEST_GROWTH_MONTH", "year": "TEST_GROWTH_YEAR" },
    "pro": { "month": "TEST_PRO_MONTH", "year": "TEST_PRO_YEAR" }
  },
  "live": {
    "starter": { "month": "LIVE_STARTER_MONTH", "year": "LIVE_STARTER_YEAR" },
    "growth": { "month": "LIVE_GROWTH_MONTH", "year": "LIVE_GROWTH_YEAR" },
    "pro": { "month": "LIVE_PRO_MONTH", "year": "LIVE_PRO_YEAR" }
  }
}
```

This example is documentation only: replace the labels with real positive numeric variant IDs before configuration. IDs must be unique across modes and cadences and must not equal the legacy ID. Never fall back from a missing test mapping to a live variant or vice versa. All variants must use the approved USD price, subscription interval and existing configured product/store. Operator verification must include these merchant attributes before enabling checkout; application tests cannot prove remote prices are correct.

`BILLING_PLANS_ENABLED` defaults to `false`. Enabling it requires the six variants in the current billing mode, configured billing credentials and the completed cost/quality/billing gates. Recognizing an existing verified subscription remains independent of the new-sales flag, so rollback never deletes rights or history. Existing subscribers use the existing portal; a checkout redirect is not proof of payment.

Test/live identities, subscription status and approved plan limits apply to new work at CRUD, admission, scheduling and dispatch. Annual has the same daily capacity, no yearly balance or rollover. Manual and scheduled runs share the daily prompt–engine slot; a confirmed pre-dispatch failure can release it, but sent/uncertain work consumes it. Downgrades retain evidence and require the user to reduce active prompts before new monitoring.

## Staging and release

### Implementation verification and MVP audit follow-up

- 272 unit and 228 integration tests passed; the final legacy endpoint regression also passed in the focused 18-test plan suite. Pricing browser coverage passed 22 desktop/mobile cases, including annual totals, downgrade handling and legacy monitoring. Earlier workspace/customer-presentation browser coverage passed 96 cases. Lint, build/typecheck, changed-file formatting and the V2 self-check passed. Local screenshots confirmed the existing design and 320px annual pricing layout.
- Audit B2: paid predicates now verify configured store, product, variant and test/live mode. Retained test subscriptions do not grant live access.
- Audit B3: fresh analysis admission and dispatch now require eligible paid GEO access; cached evidence remains readable after expiry.
- Audit B5: the approved catalog separates new GEO packages from the existing $19 Perplexity subscription. Both its manual and scheduled legacy paths remain available even with previously saved GEO settings. New public plans do not run through the legacy scheduler.
- Manual and scheduled GEO checks share UTC-day slots. Scheduled work excludes pairs already consumed manually while retaining idempotency. Released pre-dispatch slots do not inflate customer usage; provider ledger reservations retain their existing safeguards.
- Audit B1 remains a production rollout gate: this change performs no production migration or deployment. B4 still requires an explicitly approved production dollar policy and verified paid search costs; no budget is changed here. B6 needs actual merchant variants and test/live lifecycle receipts. B7 needs human labels, complete real surface evidence and an eligible after-action series; synthetic tests do not satisfy it.
- Seven local review lenses produced findings; scheduling, usage and legacy UI/API findings were corrected and regression-tested. The formal review workflow did not complete: the peer CLI lacked `jq`, and automatic approval rejected its required temporary-job cleanup. Review artifacts remain outside the repository. No completed external-review receipt or verified merchant pricing is claimed.

Do not deploy from local default provider/budget values. Snapshot the active staging settings, bindings, schedules and runtime, then deploy with `--keep-vars` using a temporary config whose non-secret settings are the observed active values. Compare before/after; provider/model/budget/entitlement settings and schedules must remain identical. No migration or new paid provider test is needed for pricing preparation.

Staging must remain in billing test mode. The code and synthetic checkout tests can be reviewed while new sales remain off. Real merchant test variants, actual checkout/portal lifecycle and the separate public MVP readiness gates remain required before enabling public payments. No live merchant resource creation or real charge is authorized by passing a fixture test.

Deployed staging version `53cc1683-e988-4b7c-aed0-90ac6dcd4204` at 100% on 23 October 2026, replacing `0bbff4e8-6b52-4bc3-ab4b-481c34eb8683`. Upload used `versions upload --keep-vars` and a temporary config generated from the active version. All 54 bindings and `script_runtime` compared exactly before deployment; new sales remain off by the server default. Version deployment does not update triggers; no schedule command was run. A fresh direct schedule read timed out, so this is preservation by operation, not a newly verified schedule receipt. Rollback is the previous version at 100%, with the same unchanged configuration and no database migration.
