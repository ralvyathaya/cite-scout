# Claude staging activation

## Final outcome

Claude is enabled on staging only. Access preflight recovered and passed before each deployment. Active Worker version: `fa84ef47-3663-4f19-a6f9-ad92ab500d0d`, deployment `5bf09970-2be4-493f-a489-cef7342ea250`. All deployments used an active settings snapshot and `--keep-vars`; comparison confirmed every binding outside the explicit Claude test variables, all secret bindings, runtime settings and the five-minute cron unchanged.

Exactly one Messages HTTP request reached Anthropic. It produced observation `67c19456-a2c6-46ef-a1b0-f9946d0282ff`, run `068cc40e-aa05-4221-acd2-b76d21283563`, request ID `req_011CgDBXfpkkVBNfwVEuMqt6`. Sonnet 5.5 performed one web search in approximately 17.5 seconds. Stored evidence contains nine unique URLs: nine retrieved records and seven answer references. They are not verified inline spans. Markdown and reference-strength labels were inspected in the authenticated staging UI.

The capture is **partial**, with `stop_reason: max_tokens`. Provider usage reports 14,623 input tokens, 1,749 output tokens and one search. Estimated cost is **$0.056736**, not an invoice. This exceeds the $0.05 application reservation by $0.006736: search-result input makes a reservation an imperfect forecast, not a vendor billing ceiling. The cap is consumed and no continuation, retry, classifier request or extra paid check was made. Review a more conservative reservation and the output limit before authorizing another test or a broader allowance; do not present this one partial answer as production-quality validation.

## Runtime defect found and fixed

The first app intent failed before HTTP because Workers does not implement `redirect: 'error'`. A local workerd probe using staging's compatibility date and flags reproduced the constructor TypeError with zero network calls. The collector now uses `manual`; non-success redirect responses are rejected without following their destination or forwarding the key. A Workers-runtime integration test failed against the old adapter and passed after the change, and a synthetic redirect case verifies one fetch only.

The original intent was retained as failed with `PROVIDER_REQUEST_NOT_SENT`; no request, observation or quota counter was deleted. Its ledger entry was reconciled to known pre-HTTP cost zero, with no reported invoice cost. An integration diagnostic records the runtime proof and failed Worker version. Its original $0.05 reservation was conservatively retained. This is a verified local construction failure, not an unknown provider response being assigned zero cost.

Final test variables are `GEO_CLAUDE_ENABLED=true`, `GEO_CLAUDE_MODEL=claude-sonnet-5-5`, Anthropic request cap `2`, per-request reservation `$0.05`, shared daily caps `2`, project monthly cap `26`, cumulative observation allowance `26`, and cumulative spend guard `$4.64`. Two admission records remain: one verified not sent and one actual Messages request. The cumulative spend guard accounts for $4.54 of historical reservations plus both retained test reservations; the returned estimate now also exceeds this guard. No unused allowance remains. Provider-specific OpenAI, Perplexity, SerpApi and classifier limits stay zero, as before.

The existing four engine choices were temporarily changed by swapping Bing for Claude to use normal monitoring admission with one selected prompt. They were restored with a conditional update that checked the exact temporary selection, revision, market, language, device and absence of active submissions. Only the settings revision and modification time advance. Daily monitoring remains off. Before/after database checks confirmed original engine choices, subscriptions and entitlements unchanged, and other provider counts still OpenAI 6, Perplexity 6, SerpApi 17 and Workers AI 20. Classifier and page-check flags and budgets were not changed.

Validation after the runtime fix: 16 Claude unit tests and 11 Claude integration tests passed, including native Workers Request construction, redirect refusal and isolated provider admission. Typecheck/build and changed-file lint/format passed. The earlier 35 focused unit and 10 integration checks also passed before activation. Live review covered saved Markdown, partial quality, breadcrumb and reference types; no classification or production rollout was performed.

References: [Workers Request redirect support](https://developers.cloudflare.com/workers/runtime-apis/request/), [Messages API](https://platform.claude.com/docs/en/api/messages/create), [Models API](https://platform.claude.com/docs/en/api/models/list). The non-generating model-metadata GET confirmed local-key access to Sonnet 5.5; it did not create another Messages request.

## Earlier blocked attempt

On 2026-10-20, Access application and application-list reads repeatedly returned HTTP 504 using both the scoped read token and Wrangler OAuth, including a separate curl request and the documented zone endpoint. Worker settings and D1 reads worked. The preflight was improved to distinguish bounded, redacted HTTP, timeout, transport and malformed-response failures while preserving all policy checks. No guard was bypassed.

That earlier attempt made no remote writes or Anthropic calls. Its snapshot contained 35 plain variables, 12 secret bindings and zero/off GEO budgets; the deployed version was still `77c6b8d6-023d-4f1e-a432-8b07e3587fce`, created when the owner installed the secret. The later successful deployment and test supersede that blocked status.
