# MVP evidence and economics checkpoint — 31 October 2026

**Public paid release remains blocked.** The owner requested staging-only progress on G1–G4 and at least 60% contribution, while keeping prices, providers, budgets and entitlements unchanged. This checkpoint does not authorize more paid captures, provider upgrades, production changes or live sales. Completed human reviews stay closed.

## Evidence checked

The named active staging version before this work was `53161085-5647-4c07-a1db-7c6b9c3af9c8`. Read-only inspection found 28 saved observations: six partial OpenAI, five Bing no-feature, four historically labelled complete Google, eleven complete Perplexity and two partial Claude. Google's old database label is not new proof: the [same-search archive and adjudication](2026-10-28-g3-adjudication-and-google-capture.md) establish missing answer content. Keep those historical records intact and their adjudicated limitation visible.

The classifier ledger contains 20 policy-1, three policy-2 and three policy-3 completed analyses; there is no prospective policy-4 analysis. The [policy-4 fix](2026-10-30-g3-grounded-entity-guard.md) and its exposed development replay remain separate from independent release evidence.

Operational analysis is disabled. OpenAI, Perplexity, SerpApi and classifier test allowances are zero; the OpenAI, Perplexity and processing cost ceilings are also zero. The operational cumulative spend ceiling is $4.90, below retained historical reservation exposure. Positive count limits or an unrelated Anthropic allowance do not authorize another provider. Do not reset accounting or change a budget to make this preflight pass.

| Gate              | Current evidence                                                                                                                                   | Remaining acceptance                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 — OpenAI       | All six historical captures remain partial; unfinished searches and the truncated response retain their original status.                           | Three complete real buyer answers under the final versioned configuration, with search, citations and usage verified.                                                 |
| G2 — Copilot      | Five saved no-feature responses; organic results are not AI answers.                                                                               | At least one complete relevant AI answer with traceable answer references and Bing/SerpApi provenance.                                                                |
| G3 — Diagnosis    | All prior labels and adjudication worklists are complete; policy 4 is staged and offline-tested.                                                   | A fresh prospective held-out cohort, frozen before dispatch and reviewed independently of classifier outputs. Do not relabel old development answers as new evidence. |
| G4 — After action | The owner explicitly confirmed **no public website change has been implemented**. The old action pin is historical, not a new eligible comparison. | Eligible baseline, an actual public change with URL/time, and two distinct later UTC follow-up days within seven days, under comparable contexts.                     |

The [original gate contract](../plans/2026-10-16-0804-fix-founder-pilot-gates-plan.md) is unchanged. Passing tests, a staging deployment or a useful-looking answer cannot replace these real receipts. Google complete-capture coverage also remains a condition for selling the approved three-surface offer, independently of the Copilot gate.

## Actual shared search capacity

The free SerpApi Account API was read at **2026-10-31 03:25:15 UTC**, without a search request. It reported Active, Free Plan, $0/month, 250 searches/month, 16 used, 234 remaining, zero extra credits and renewal on 13 November. The credential and raw response are private. Current [published account tariffs](https://serpapi.com/pricing) agree with the 250-search Free capacity; this is one shared account, not a free allowance for every customer.

Full daily Google use in a 31-day month requires:

| Package             | One request/check | Two requests/check | Capacity needed at two requests plus 20% headroom |
| ------------------- | ----------------: | -----------------: | ------------------------------------------------: |
| Starter — 5 prompts |               155 |                310 |                                               372 |
| Growth — 15 prompts |               465 |                930 |                                             1,116 |
| Pro — 30 prompts    |               930 |              1,860 |                                             2,232 |

Two requests are the existing possible Google collection path, not two customer checks. Free capacity cannot sustain Growth or Pro even at one request/check, nor guarantee full Starter usage at two. Bing tests and other shared searches would consume additional capacity. No paid search plan or early renewal was purchased or enabled.

## Reproducible contribution checks

Use the existing calculator; neither input file is a runtime setting, provider budget or account forecast:

```text
npx tsx scripts/check-plan-economics.ts research/pricing-current-capacity-2026-10-31.json
npx tsx scripts/check-plan-economics.ts research/pricing-reference-fees-2026-10-31.json
```

Both return `ready: false` and exit 1 intentionally. The first assumes **one hypothetical Starter** using the actual shared Free capacity, with unverified provider and infrastructure costs left `null`. It requires 372 searches including headroom; contribution remains unknown, not zero. The 234 remaining searches are a point-in-time balance, not next month's guaranteed allocation.

The second retains the [original illustrative scenario](2026-10-23-pricing-readiness.md): five Starter, four Growth and one Pro at full allowance, 31 days, two Google requests/check, a hypothetical $150/15,000 search account, 20% capacity headroom, historical provider-cost proxies, $2 infrastructure/account and a 25% service-cost reserve. Only the payment reference changes to **7% + $0.50** for an international card subscription: standard 5%, subscription 0.5%, international 1.5%. [Lemon Squeezy's fee documentation](https://docs.lemonsqueezy.com/help/getting-started/fees) also applies fees to the order total including tax and lists additional PayPal/payout fees. Those are not included here; the actual store fee basis and payout method remain unverified. Test invoices do not establish actual merchant fees.

| Package         | Service cost/month | Contribution | Maximum service cost for 60% | Required monthly cost reduction |
| --------------- | -----------------: | -----------: | ---------------------------: | ------------------------------: |
| Starter monthly |             $13.13 |        46.0% |                        $9.07 |                           $4.06 |
| Starter annual  |             $13.13 |        38.5% |                        $7.93 |                           $5.20 |
| Growth monthly  |             $35.39 |        47.6% |                       $25.57 |                           $9.82 |
| Growth annual   |             $35.39 |        39.2% |                       $21.68 |                          $13.71 |
| Pro monthly     |             $68.79 |        46.5% |                       $48.67 |                          $20.12 |
| Pro annual      |             $68.79 |        37.6% |                       $40.93 |                          $27.86 |

Annual amounts are monthly equivalents of one annual payment; usage remains the same as monthly. The search bill is allocated once across the specified cohort. Total Google requests are 7,130, or 8,556 including capacity headroom. OpenAI's historical cost proxy came from partial answers and does not establish the cost of complete production answers. The scenario therefore cannot certify actual margins even if a later simulation becomes profitable. All three evidence flags remain false; the [completed Test-mode lifecycle](2026-10-31-isolated-billing-lifecycle.md) does not establish natural renewal/failure recovery, live fees or production billing readiness.

**No approved package/cadence reaches 60% in this reference scenario.** Do not alter prices, allowances, provider choice or verification flags to force a pass. First obtain complete-answer usage and fee/infrastructure evidence, then review an explicit shared-capacity and cost manifest. An annual prepayment does not remove twelve months of service cost.

## Prepared G4 work, not an implementation record

The public root currently returns HTTP 200 with the old static title “CiteScout — Buyer questions on Perplexity”. Its returned HTML has no server-rendered H1; this observation does not prove crawler blocking or diagnose how a search service renders the page. The current repository also retained the legacy $19 offer in all three static description tags despite the new catalog. The bounded staging correction reuses the existing product description in `index.html`, without changing prices, legacy rights, UI layout or provider configuration.

This metadata correction is a **candidate** for a later identity/positioning improvement, not a promise of search visibility or proof that a same-name product has been resolved. Staging is Access-protected and is not a public implementation. Do not complete an action, invent a baseline, or backdate publication for this change.

Execution order for G4:

1. Finish the relevant capture/analysis preflight and agree the bounded measurement scope before any paid request. Current zero allowances prevent this execution; no new paid test is authorized by the present unchanged-budget instruction.
2. Collect eligible baseline evidence using the final versions. Freeze selected prompt/engine cohorts and the primary metric before implementation; explicitly review exclusions and missing coverage rather than silently dropping failed cohorts.
3. Review a concrete public-page change and the separate production rollout/rollback scope. Only after actual publication record the real URL, implementation time and change description in a new follow-up action. Preserve the old pin.
4. Collect two explicitly bounded follow-ups on distinct later UTC days, for example near +72 hours and day 6, inside the seven-day window. Request start times must be after implementation and contexts must match the frozen baseline.
5. Review the saved comparison. Unchanged or worse results are valid; unknown, missing or incompatible samples stay inconclusive. This is descriptive measurement, not proof of causality or revenue uplift.

There is no new review form to fill now. The owner supplied an initial target of **5–10 paying users** and asked to prioritize finishing the product, without further business-planning questions. That range is sufficient for this preparation; the checked-in ten-account mix remains an illustration, not a forecast or a prerequisite to fixing the product. Any later provider-funded verification needs its own exact request/spend scope because the current operating allowances are zero.

## Verification and staging delivery

**9 economics unit tests, 53 integration tests and 14 desktop/mobile browser tests passed**, together with build/typecheck, source lint and changed-file formatting. Integration coverage exercised onboarding, collector contracts, classification, action transitions and frozen measurements. Browser coverage exercised metadata, first setup without provider calls, explicit monitoring confirmation, the synthetic evidence/action loop and partial/quota recovery. These are local synthetic regressions, not new real provider evidence or a G1–G4 pass. The existing large-client-chunk build warning remains.

An artifact check confirmed all three static descriptions match the existing product description and contain no default legacy-price claim. Local secret files are absent from the deployment artifacts. There is no layout, app workflow, pricing, API, schema, provider/model, classifier, budget or entitlement-definition change.

Staging version **`43abfdc6-f4a3-4c9d-8e28-8593d274f4ff`** is active at 100%; rollback is `53161085-5647-4c07-a1db-7c6b9c3af9c8`. The `--keep-vars` upload used the named active-version snapshot, and the final version inherited all **58 bindings**, including encrypted secrets. Runtime, asset configuration, schedules, provider request counts, subscription/project rows and saved engine/prompt selection compared unchanged before and after activation. Worker SHA-256 remains `f99f783fd4dc4a522d82fc8b0b7a549f445086fdb7683d85873da343d1c72968`; only static HTML metadata changed.

The authenticated staging browser confirmed the old descriptions before activation. Its later reload/inspection timed out in the browser connection, so no successful post-deployment DOM reading is claimed. Deployment/asset checks and local browser tests are verified separately. Private operational snapshots and the activation receipt are under `research/private/mvp-gates-2026-10-31/`.

There were **zero new paid provider calls and zero production changes**. No public implementation time or completed-action pin was created. Public sales and the remaining evidence, actual contribution, billing renewal/recovery and production recovery gates remain open.
