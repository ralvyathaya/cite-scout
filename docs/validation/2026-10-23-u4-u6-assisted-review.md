# U4–U6: assisted evidence review and billing preflight

Scope: continue the public MVP plan with existing staging evidence. No price, provider/model, active budget, entitlement, subscription, schedule, deployment or database content was changed. No paid inference, checkout transaction or merchant mutation was performed.

## U4: human review prepared, not completed

The existing private blind packet still contains 20 answers and 1,249 label slots. A loopback-only form (`npx tsx scripts/review-geo.ts`) presents the original prompt, brand context, answer, sources, checks, verified criteria, candidate quotes and allowed choices. It never reads the classifier export, generates judgments, defaults a selection or invokes a provider. Data stays in ignored `research/private/`.

The reviewer saves individual drafts with a name. The server validates exact field names/choices, guards stale/concurrent saves, retains an original backup, writes through a temporary file and refuses frozen reviews. Completing the review requires every answer field to be valid and an explicit human confirmation; it does not freeze or score automatically. Stop the single local review process before using the existing freeze/scoring CLI. Instructions remain in [the evaluation report](../../research/geo-evaluation-report.md).

Start with answer 1's five Answer labels, then Sources, Evidence, and Findings/Tasks. Repeat for all 20. Keep unknown/unclear/unavailable when the supplied facts cannot resolve a judgment. A found source is not automatically a citation, a named brand is not automatically recommended, and brand absence does not prove crawler failure. Do not inspect model predictions before freezing human labels.

This step does not close G3. G1 needs its complete OpenAI baseline; G2 needs a genuine complete buyer-relevant Copilot answer; G4 needs a real implemented action and comparable later samples under its existing gate. Their prior unmet receipts are not replaced by this helper. Missing paid captures/follow-ups need a separately bounded request/spend scope; no such work was dispatched here.

24 October checkpoint: the owner saved two primary Answer sections, confirmed locally as 10 non-null fields, two started records, zero fully labeled records, reviewer name present, and no completion timestamp/lock. Only progress metadata was inspected; model predictions were not opened. Continue primary labels first if helpful, then the remaining evidence/diagnosis fields. This ordering does not reduce the gate or promote AI-generated judgments into blind human labels.

## U5/U6: merchant read-only discovery

Authenticated GET requests to Lemon Squeezy stores, products and variants succeeded on 23 October. The available credential returned two stores, three products and seven subscription variants, all in test mode. Product names were `test`, `Vibe Docs Premium` and `Vibe Docs Pro`. The visible variant prices/cadences do not match the approved CiteScout six-offer catalog. Do not repurpose these unrelated variants or treat them as verified CiteScout billing.

No product/variant was created, repriced or mapped, and no credential or identifier was installed remotely. The previous staging snapshot still documents empty billing identifiers/mappings and absent merchant API/webhook secrets; this local discovery does not alter that snapshot. Local `.dev.vars` does not provision a Worker binding.

After evidence review, the owner must confirm the intended CiteScout store/product and prepare the approved three packages × two cadences in merchant **test mode**. Then configure environment-specific test identifiers and secrets through the established secret/config workflow. Do not send keys through chat. A separate billing-test run must demonstrate verified checkout/webhook/portal, renewal, cancel-through-period, failed payment/recovery, refund and upgrade/downgrade behavior. Synthetic rows and a checkout redirect do not establish payment verification. Live sales remain blocked.

## U6: retained-test subscription migration rehearsal

The isolated V2 self-check now seeds an active test subscription under schema 0000/0001 before backing up. It applies migrations through 0011, compares the complete retained subscription row, restores the old backup read-only and checks that the test subscription and original answer are still present. A live-mode workspace read explicitly proves that this retained test payment grants neither `canScan` nor a plan. No remote database or real customer row is used.

This extends the existing synthetic backup/upgrade/restore proof; it does not constitute a production-copy restore rehearsal, Cloudflare recovery proof or production rollout. A real data-copy recovery drill and environment-matched merchant lifecycle receipts remain required before public release.

## Verification and deployment boundary

Focused synthetic tests cover unauthorized/local-origin requests, malformed JSON, unknown fields/choices, incomplete completion, unchanged drafts on rejection, Unicode reviewer identity, independent answer saves, retained backup, stale version rejection and frozen labels. The original evaluation prepare/freeze/score tests remain separate and synthetic. `npm run check:v2` passed including the retained-subscription checks.

The retained test subscription also has a positive control: it grants its existing plan in matching test mode, while the same stored row grants no plan or scanning access in live mode. Denial is therefore not merely a broken or unmapped fixture.

Verification completed: 288 unit tests passed; the 11 focused review/evaluation tests passed again after final validation edits. Typecheck, full lint, changed-file formatting, whitespace checks, inline form JavaScript syntax and V2 self-check passed. The local form was opened in the browser with the original evidence visible and unreviewed selections blank; no human judgment was entered by the agent. A manual Ponytail review traced the CLI/state/save/freeze boundaries and migration reader controls. No independent cross-model review or new app build/remote integration/browser regression suite was run for these local-only changes. The helper assumes one local reviewer process; it is not a hosted multi-reviewer service.

No app runtime or deployment asset was changed in this follow-up. The previously deployed staging version remains `7b44c479-3a88-4b5e-a86c-d4ac071b923e`; no new deployment was needed for local review tooling and test/documentation changes. The production cost policy is not activated. The existing package economics still fail the all-offer 60% target under illustrative assumptions; verified tariffs/invoices and capacity remain owner inputs, not grounds to silently alter prices or allowances.
