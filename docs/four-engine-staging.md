# Four-engine staging validation

Staging uses a separate Worker (`citescout-staging`), D1 database (`citescout-staging`), and hostname (`staging.cite-scout.com`). Production data and accounts are not copied. `APP_ENV=production` enables real authentication and secure cookies; `DEPLOYMENT_ENV=staging` permits a temporary grant for one authenticated account.

The committed configuration keeps GEO collection, analysis, page checks, and budget caps disabled. New projects keep daily monitoring off. The five-minute cron drains requested jobs; it does not enable a project's daily schedule. Fixtures stay local and synthetic.

## 1. Provision the isolated database

The database in the committed config has already been provisioned as `citescout-staging` (`35be5adc-b1c8-48ab-86d8-debb1f131551`), with migrations `0000`–`0010` applied. Reuse it in this account. The creation steps below apply only if setting up a different account; never create a second database just to reset the test budget.

Use the existing authenticated Wrangler session; these commands name the staging config explicitly:

```powershell
npx wrangler whoami
npx wrangler d1 list
npx wrangler d1 create citescout-staging --config wrangler.staging.jsonc
```

When provisioning a different account, replace only the staging database UUID with its returned ID. Confirm its name and ID differ from production, then apply the additive migrations:

```powershell
npx wrangler d1 info citescout-staging --config wrangler.staging.jsonc
npx wrangler d1 migrations apply DB --remote --config wrangler.staging.jsonc
```

Do not use the generic remote-migration command or the former production version preview for staging. The latter uses production resources.

## 2. Protect the entire hostname before deploying

In Cloudflare Zero Trust → Access controls → Applications, create a **Self-hosted and private** application for the public hostname `staging.cite-scout.com`, with no path restriction. Create exactly one **Allow** policy whose only Include rule is **Emails → your exact owner email**. Use One-time PIN or your configured identity provider. Do not add an Everyone, email-domain, Bypass, or Service Auth policy, and do not create a second application for a staging subpath. Access authenticates the outer boundary; CiteScout still requires its own authenticated session.

Create a separate account-scoped API token with **Access: Apps and Policies Read**. The existing Wrangler OAuth session lacks the Access permissions needed to verify this policy. Creation of the Access app/policy requires dashboard access or a token with write permission; the preflight does not create it.

Supply these local process environment variables securely through your local environment manager, or fill the ignored `.env.staging.access` file. The full preflight loads that file automatically; existing environment variables take precedence. Static CI checks skip it.

| Name                            | Purpose                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`         | The account containing the Worker, database, and Access application |
| `STAGING_ACCESS_APPLICATION_ID` | The Access application's ID                                         |
| `STAGING_ACCESS_OWNER_EMAIL`    | The exact owner email used by its policy                            |
| `STAGING_ACCESS_READ_TOKEN`     | Read-only token for Access verification; never a Worker secret      |

The preflight reads the live application, policies, and application list. It rejects incomplete/paginated verification, a policy granting anyone else access, an unprotected staging path, an overlapping staging application, production resources, authentication bypass, and workers.dev/version preview URLs. The token and API responses are not printed.

This account already has a separate managed Turnstile widget that allows **only `staging.cite-scout.com`**, configured in `wrangler.staging.jsonc`. Its secret is stored in the ignored `.env.staging.bootstrap` alongside separate generated staging authentication/operator secrets. For another account, create your own widget and configure its public key and secret. Google login is optional; if enabled, use a staging OAuth client and allow `https://staging.cite-scout.com/api/auth/callback/google` as its redirect URL.

```powershell
node scripts/check-staging.mjs
```

This command must pass before any Worker is deployed. CI uses `node scripts/check-staging.mjs --allow-unprovisioned` for static isolation checks only; it does not verify remote Access and is not a deployment command. The staging config also runs the full preflight as Wrangler's build hook. Do not bypass it with `--no-bundle`, custom scripts, or alternate configs.

## 3. Bootstrap authentication secrets, then configure providers

The first deployment needs a private secrets file because Wrangler cannot inherit required secrets from a Worker that does not exist yet. This account's ignored `.env.staging.bootstrap` already contains independent staging authentication/operator/Turnstile secrets, a newly created sending-only Resend key, and the existing Perplexity key. Add OpenAI and SerpApi keys locally. The Resend creation requested the verified sender domain, but the key-list response does not expose that restriction; actual staging login email delivery remains unverified. For another account, create the file in a local editor with these four authentication values:

```dotenv
BETTER_AUTH_SECRET=
OPERATOR_SECRET=
RESEND_API_KEY=
TURNSTILE_SECRET_KEY=
```

Use at least 32 random characters for `OPERATOR_SECRET` and `BETTER_AUTH_SECRET`. The Resend key must be able to send from the verified sender configured in staging; magic-link login sends a real email. Never commit, print, or paste the secrets file into chat. `.env.*` is ignored by Git. Confirm that fact before adding values:

```powershell
git check-ignore .env.staging.bootstrap
npm run deploy:staging -- --secrets-file .env.staging.bootstrap
```

Delete the private bootstrap file after a successful deployment. For all subsequent secret setup/rotation, use Wrangler's interactive prompt with the staging config. Do not put values in command arguments:

```powershell
npx wrangler secret put OPENAI_API_KEY --config wrangler.staging.jsonc
npx wrangler secret put PERPLEXITY_API_KEY --config wrangler.staging.jsonc
npx wrangler secret put SERPAPI_API_KEY --config wrangler.staging.jsonc
```

Clef Flash uses the `AI` binding and needs no separate API key. Confirm Workers AI access and billing in the Cloudflare account before inference. SerpApi must have sufficient free queries; do not enable a paid overage plan for this test. DataForSEO and TypeSafe credentials remain optional and are not used as automatic fallbacks. No test request or model-list ping is required to store credentials.

Verify the public boundary after deployment: a browser without an Access session must receive the Access login flow on both `/` and `/api/v2/geo/capabilities`; another email must be denied. The Worker settings must show workers.dev and preview URLs disabled. Only then sign in to CiteScout at the staging hostname using your real email.

## 4. Grant one account and set the bounded test budget

Find the owner account's ID in the staging D1 console after login. Do not use an ID from production. Set the account ID and a UTC ISO timestamp no more than 14 days in the future through interactive prompts:

```powershell
npx wrangler secret put GEO_INTERNAL_TEST_USER_ID --config wrangler.staging.jsonc
npx wrangler secret put GEO_INTERNAL_TEST_EXPIRES_AT --config wrangler.staging.jsonc
```

This grants GEO access to that authenticated account only; it does not disable authentication, enroll other users, or change their trials/billing. The grant is rejected in the production deployment. Removing the grant or passing its expiry stops new internal test work.

Before enabling collection, verify the current provider tariffs and access to the requested OpenAI model. Set conservative **per-call USD ceilings** in `GEO_INTERNAL_TEST_OPENAI_MAX_COST_USD`, `GEO_INTERNAL_TEST_PERPLEXITY_MAX_COST_USD`, and `GEO_INTERNAL_TEST_PROCESSING_MAX_COST_USD`. All three default to zero, so paid work stays blocked until reviewed. Include the OpenAI search tool and token budget in its ceiling. Treat free allowances as a provider-side limit, not unlimited usage.

For the maximum test, require:

```text
6 × OpenAI ceiling + 6 × Perplexity ceiling + 24 × classifier ceiling ≤ US$5
```

Set these non-secret vars in `wrangler.staging.jsonc` only after the ceilings are confirmed:

| Variable                           | Test value    |
| ---------------------------------- | ------------- |
| `GEO_INTERNAL_TEST_SPEND_CAP_USD`  | `5` (or less) |
| `GEO_GLOBAL_DAILY_CALL_CAP`        | `12`          |
| `GEO_PROJECT_DAILY_CALL_CAP`       | `12`          |
| `GEO_PROJECT_MONTHLY_CALL_CAP`     | `24`          |
| `GEO_SERPAPI_MONTHLY_REQUEST_CAP`  | `18`          |
| `GEO_PROCESSING_PROJECT_DAILY_CAP` | `12`          |
| `GEO_PROCESSING_GLOBAL_DAILY_CAP`  | `12`          |
| `GEO_SCANS_ENABLED`                | `true`        |
| `GEO_ANALYSIS_ENABLED`             | `true`        |

Keep page checks off, `GEO_SERP_COLLECTOR=serpapi`, `GEO_CLASSIFIER_MODEL=clef-flash`, and the project's daily schedule off. `GEO_OPENAI_MODEL` defaults to `gpt-6-luna`; changing it creates a new measurement cohort. Deploy the reviewed configuration with `npm run deploy:staging`. Counts and the cumulative spend cap apply to actual provider requests/reservations, not just successful observations. An unknown cost pauses further internal testing until the operator checks the provider usage.

## 5. Validate the action loop on two UTC days

Create one real staging project and three neutral prompts with the same context for both runs: **US / English / desktop** for engines supporting those controls. Select exactly **Perplexity**, **OpenAI Web Search API**, **Google AI Overview**, and **Bing Copilot Answers**. OpenAI and Perplexity are API surfaces; do not present them as the consumer ChatGPT or Perplexity UI.

1. On the first UTC day, use **Monitor Prompts** once. This is also the adapter validation run, with no extra paid probes.
2. Inspect the actual prompt, timestamp, answer, clickable citations, raw sanitized payload, and cost status for each observation. A missing AI Overview/Copilot block is a real no-answer state, not an organic search snippet used as a replacement.
3. Review Clef's classifications against the raw answers. Follow an Owned Web or Earned Media task, record the external change, and mark it complete; confirm the trend pin appears at completion time.
4. On a different UTC day, run the same prompt/context/engine set once more and inspect the linked before/after view. Keep the small-sample warning. A visibility increase is not required to prove the workflow, and a pin does not establish causality or financial ROI.

Maximum across both runs: **24 observations, 6 OpenAI calls, 6 Perplexity calls, up to 18 SerpApi requests, and 24 classifications**, within the cumulative US$5 ceiling. These staging validation limits are cumulative across UTC month boundaries and account deletion; Clef and optional Jev share one classification allowance. Monthly SerpApi quota remains a separate account-wide calendar-month limit. Google may use two SerpApi requests for one observation. If a provider fails or returns an ambiguous timeout, preserve the other results and inspect the ledger before deciding whether a manual retry fits the remaining budget.

Stop by disabling GEO collection/analysis and redeploying staging, then deleting the two internal-grant secrets. Preserve captured evidence and accounting rows; never reset the ledger to obtain more budget. No production deployment, billing activation, automatic publication, or provider-funded validation is implied by these setup instructions.

## References

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers secrets and first deployment](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Create an Access application](https://developers.cloudflare.com/learning-paths/clientless-access/access-application/create-access-app/)
- [Access policies API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/subresources/policies/methods/list/)

## Inspect and reconcile unknown costs

Provider usage lists observations separately from actual requests. The retained `geo_provider_requests` ledger contains request IDs, reserved ceilings, reported costs, estimates, and unresolved requests. The SerpApi zero estimate assumes a verified free account with enough remaining allowance; it is not an invoice. Verify the free account and remaining queries before enabling capture. Perplexity responses without reported billing cost remain unknown and pause the next request.

After verifying the individual request in the provider billing dashboard, submit its `operationKey` and `reportedCostUsd` to `POST /api/operator/geo/cost`, authenticated with the staging operator secret in an Authorization header. Reconciliation records the verified cost; it never repeats collection or deletes a reservation. Close ambiguous submissions through `/api/operator/geo/reconcile` with `taskId:null`; only historical DataForSEO tasks can recover a saved task ID. Do not label an unknown request free to continue testing.

Legacy V1/V2 Perplexity collectors are disabled on staging so they cannot spend outside this ledger. Existing production trials and historical evidence retain their original behavior.
