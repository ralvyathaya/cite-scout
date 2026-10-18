# Login and website setup: staging review

Date: 2026-10-18 (Asia/Bangkok). Scope: publish the reviewed Google sign-in and website-first onboarding changes to isolated staging. Production remains unchanged. Existing staging projects and monitoring evidence are retained.

## Deployment and recovery

The pre-change deployment was `b1bdfa29-b76d-4993-b1f4-f57edc55ac89`, serving Worker version `881f8333-abfc-45e0-a7b6-23e0a1e39fba` at 100%. Full staging isolation and owner-only Cloudflare Access preflight passed before changes.

The review deployment succeeded with Worker version `9f5484e9-e367-4ff1-961f-4c2074c9e64d`. The deploy hook repeated the full Access/isolation preflight successfully. Worker startup was 53 ms. Local secrets were stripped from the build artifacts before upload.

Migration `0011_onboarding_suggestions.sql` was applied to D1 `citescout-staging` only. It creates a separate suggestions/usage table and two indexes; it does not alter existing tables. Migration generation reports no further schema changes. Google credentials were added to the staging Worker's secrets using the existing configured OAuth client, without printing or committing their values.

Worker recovery command:

```powershell
npx wrangler rollback 881f8333-abfc-45e0-a7b6-23e0a1e39fba --config wrangler.staging.jsonc
```

Rollback restores Worker code/config, not D1 data. Leave the additive table and all usage reservations in place. No rollback was executed for this review deployment.

## Approved allowance transfer

The owner approved moving the remainder of the local US$0.10 onboarding-testing allowance to staging. Local generation is now disabled with both onboarding limits set to zero in the ignored `.dev.vars`; saved local drafts remain readable and its ledger is preserved.

Before transfer, local usage was one reservation (US$0.01 reserved, US$0.000149 estimated). The staging suggestions ledger was empty. Staging receives **US$0.09 total**, with a daily cap of nine reserved attempts and the existing three-attempt/account/UTC-day quota. Each attempt reserves US$0.01; failures retain that reservation. There is no daily reset of total budget. Cached drafts consume no new reservation. These are conservative allowances, not reported provider charges.

The committed staging defaults remain zero. The approved review deployment supplies only these overrides:

```powershell
npm run deploy:staging -- --var ONBOARDING_SUGGESTIONS_DAILY_CAP:9 --var ONBOARDING_SUGGESTIONS_TOTAL_BUDGET_USD:0.09
```

A deployment without those overrides disables new generation again. GEO capture, classification, page checks and their budgets remain disabled. Project schedules are not enabled and neither monitoring ledger is reset.

## Review procedure

Open [staging sign-in](https://staging.cite-scout.com/login), pass Cloudflare Access with the existing owner identity, then sign in to CiteScout. The Google button is present immediately and checks readiness when clicked. The OAuth client must allow `https://staging.cite-scout.com/api/auth/callback/google`; Google Cloud Console controls that registration.

Existing CiteScout accounts with a project return to their dashboard. To review onboarding from an empty account, use a new CiteScout account that the owner controls, while retaining the same outer Cloudflare Access identity. No existing project needs to be deleted. For example, the owner can use their own email alias with magic-link login. No account creation or email delivery is performed by the deployment.

The new-account path is website → suggestions/manual fallback → edit brand/competitors/questions → review → save project. Generation consumes the approved allowance; saving an unenrolled project does not run monitoring, enroll a trial or create a subscription. Competitor suggestions remain unverified candidates.

## Verification

Local checks before deployment: 234 unit tests and 172 Worker integration tests passed; typecheck and lint passed. The V2 migration/retention self-check passed after including the new migration in its isolated SQLite fixture. Dependency audit reports zero vulnerabilities. Build succeeded and its local-secret removal guard left no `.dev.vars` in deployable artifacts.

The full desktop/mobile browser suite passed 173 of 174 tests initially. One desktop health request received a local Vite/Miniflare `fetch failed` response; the same health test passed on desktop and mobile with a fresh preview server (two tests). No application assertion was weakened or retry added. The GitHub CI run provides a separate clean-environment check.

Deployed-page verification passed the outer Access login and confirmed the new staging login immediately exposes the Google button. Clicking it reached Google, which rejected the request with `redirect_uri_mismatch`: the OAuth client still needs the exact staging callback registered in Google Cloud Console. The owner was given that URI. Google callback completion and authenticated new-account onboarding remain pending owner review; no new account, magic-link email, project or paid generation was created during deployment verification.
