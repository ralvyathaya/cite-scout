# MVP blocker follow-up — 23 October 2026

Scope: staging only. Prices, providers/models, active budgets, entitlements, schedules and database contents are unchanged. No paid AI request, checkout transaction, merchant-resource creation or production migration was run.

## Completed within this scope

- **B1 preparation:** the existing V2 self-check now takes a real SQLite backup of synthetic data under schema 0000/0001, applies the existing additive migrations through 0011, compares every original answer column, checks integrity/foreign keys, and reopens the old backup read-only to verify restoration. Run `npm run check:v2`. This is not a rehearsal on a production data export or proof of Cloudflare Time Travel recovery. The original production rollout remains blocked.
- **B4 accounting correction:** production SerpApi completion records unverified search costs as unknown with `serpapi-unpriced`. It cannot inherit an aggregate answer-provider charge or a presumed free-search price. The bounded staging free-search estimate remains as before; it is not a verified invoice. Existing ledger rows are not rewritten. An approved production dollar policy and invoice reconciliation remain required.
- **B6 synthetic billing verification:** authenticated portal tests verify the fresh subscription ID, store/product/variant, test/live mode and HTTPS store hostname. Downgrade tests verify replacement cannot bypass the active prompt cap; replacing a paused prompt stays paused and retains its predecessor. These tests use fake remote responses, not merchant transactions.
- **B7 data description:** Drizzle's observation status now matches stored `captured` rows. Complete/partial/no-feature stays in the capture quality envelope. No SQL migration or evidence-quality upgrade is involved. Human-label and real after-action gates remain open.

## The 60% margin gate

The calculator now reports `maximumServiceCostUsd` and `costReductionRequiredUsd` for every package/cadence; unknown service costs retain an unknown savings requirement. It also accepts a cohort with zero accounts in individual tiers, but rejects an empty cohort. Prices and entitlement limits come from the same unchanged catalog.

Reproduce the baseline with `npx tsx scripts/check-plan-economics.ts research/pricing-economics-scenario.json`. Exit 1 intentionally means sales remain blocked. This is contribution after modeled direct service and payment costs, not net company profit.

Baseline: 31 days, 5 Starter / 4 Growth / 1 Pro accounts, full daily usage, existing illustrative provider rates, $150 shared search plan, 25% cost reserve and $2 infrastructure per account. No invoice/complete-capture/billing evidence flags were changed.

| Package | Current modeled cost/month | Maximum cost for 60%, monthly | Savings needed, monthly | Maximum cost for 60%, annual | Savings needed, annual |
| ------- | -------------------------: | ----------------------------: | ----------------------: | ---------------------------: | ---------------------: |
| Starter |                     $13.13 |                         $9.51 |                   $3.63 |                        $8.30 |                  $4.84 |
| Growth  |                     $35.39 |                        $26.76 |                   $8.64 |                       $22.67 |                 $12.72 |
| Pro     |                     $68.79 |                        $50.91 |                  $17.88 |                       $42.80 |                 $25.99 |

Amounts are rounded for display; the gate evaluates unrounded values. Cost includes the reserve and infrastructure; the maximum deducts the modeled payment fee from 40% of monthly revenue (annual revenue and its one transaction are amortized over 12 months).

An additional **scenario only**, using the same rates and search plan with 10 Starter / 6 Growth / 2 Pro accounts, needs 12,400 searches or 14,880 capacity including 20% headroom. It nearly fills the 15,000-search account; no account was purchased or resized. Contributions become:

| Package | Monthly | Annual |
| ------- | ------: | -----: |
| Starter |   59.4% |  54.3% |
| Growth  |   62.2% |  56.5% |
| Pro     |   61.9% |  55.8% |

More customers sharing capacity alone does not establish 60% for all six offers under these assumptions. No price, quota, provider, output policy or budget is changed to manufacture a pass. Validate actual complete-answer usage, paid search allocation and payment fees first; then propose an explicit cost change with a quality regression check if the required savings remain necessary. New package sales stay disabled.

Primary references checked on 23 October: [SerpApi pricing](https://serpapi.com/pricing), [Lemon Squeezy fees](https://docs.lemonsqueezy.com/help/getting-started/fees), [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/). Listed tariffs are not this account's verified invoices; payment fees may additionally vary with international/PayPal/tax/currency conditions. Existing rates are historical proxies, including partial OpenAI captures; they do not certify sellable answer costs.

## Remaining release gates

Production clone/backup rehearsal and rollout; approved production spend policy; real merchant variant/pricing and billing lifecycle verification; human labels and complete real surface evidence; after-action evidence. Existing B2/B3/B5 fixes are recorded in the [pricing readiness receipt](2026-10-23-pricing-readiness.md). The product is not declared ready for public paid release.

## Verification and review

274 unit and 238 integration tests passed. `npm run check:v2` passed, including backup/upgrade/restore. Full build/typecheck, lint, changed-file formatting and whitespace checks passed. No UI layout or customer price was changed, so the existing browser pricing receipts remain applicable; this pass adds server tests instead of rerunning unrelated screenshots.

Code review: skipped (ce-code-review unavailable). The review invocation terminated at the account usage limit without a completed receipt; no harness-native local diff reviewer is available. A manual diff scan checked collector-specific cost assignment, unchanged staging handling, SQL bind order, catalog/fee arithmetic, synthetic backup boundaries and unchanged configuration. This is not an independent full review.

## Staging deployment

Version `73c90f48-b5cc-4a31-904d-680970eab093` is verified active at 100%, replacing `53cc1683-e988-4b7c-aed0-90ac6dcd4204`. Upload used `versions upload --keep-vars` with the active version's settings, then `versions deploy`; all 54 bindings and runtime settings compared exactly before activation. No trigger command, database migration or paid request was run. The first upload attempt failed on a network connection; retry succeeded. An unauthenticated HTTP check reached the protected staging edge (302); an authenticated live app smoke was not performed. Rollback is the previous version at 100% with unchanged settings. New package sales remain disabled.
