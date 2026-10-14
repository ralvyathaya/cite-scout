# Owner staging validation: second UTC day

The second real run completed on 2026-10-14. Both planned UTC days have been exercised within the request limits. Owned completion, audit history, the trend annotation and the linked comparison were verified live. A populated post-implementation comparison remains unvalidated because the second run started before the reported website change.

## Collection and fidelity

The same CiteScout project, three neutral prompts, US / English / desktop configuration, four engines and frozen model/output settings were used. Daily monitoring remains disabled. Staging still runs the reviewed application at `8155ec3` behind owner-only Cloudflare Access; production was not deployed.

Run `ab032cf1-18d1-4688-ae60-96ac4733c9e7` started at **00:21:50 UTC**, completed at **00:36:43 UTC**, and is terminal `partial`: 12 attempts, 11 saved observations and one failed Google attempt.

| Engine                           | Second-day saved observations | Result                                                                                                                                                                                                       |
| -------------------------------- | ----------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Perplexity Agent API             |                             3 | Complete answers retained. Returned search sources do not establish inline citation linkage.                                                                                                                 |
| OpenAI Web Search API            |                             3 | Actual text, model, usage and verified citation spans retained. Completed response envelopes contain an unfinished search item, so all three remain partial and are excluded from eligible visibility rates. |
| Google AI Overview via SerpApi   |                             2 | Actual AIO text and references retained. One other request timed out and was closed without resubmission.                                                                                                    |
| Bing Copilot Answers via SerpApi |                             3 | No Copilot block was returned. All three are `no_feature` observations with empty AI text; organic snippets remain returned sources only.                                                                    |

Across both days: **24 attempts, 20 saved observations, four failures**. Capture quality totals are nine complete, six partial and five absent AI features. None of the five Bing observations demonstrates a live Copilot answer. OpenAI capture completeness also remains a provider-fidelity gate; its parser was not relaxed to manufacture a successful sample.

## Classification and action record

All **20 Clef Flash classifications** completed: nine on the first day and eleven on the second. Application latency on day two was **1,409–2,083 ms**; this is not evidence of a sub-50 ms end-to-end classifier service. Inputs, usage, latency and provisional decisions are retained. The saved answers support investigation of possible retrieval problems, not a confirmed indexing defect. No classifier result establishes accuracy, causality or financial ROI from this sample.

The owner initially recorded a website comparison/FAQ update against the Earned Media task for moz.com. After the owner clarified that the work was on CiteScout's website, the Earned task was reopened with a correction reason. Its original completion and pin remain in the audit history; no third-party contribution is claimed.

The Owned page-inspection task was completed through the normal application UI with all four checklist steps and real findings for `https://cite-scout.com/`: HTTP 200, matching canonical, no observed noindex signal, and robots.txt allowing `/` while excluding `/app/` and `/api/`. Product metadata still emphasizes Perplexity. Index status remains unknown. FAQ content was not present in the initial HTML; the rendered FAQ and the exact changed page were not independently verified. The next task is to verify publicly readable comparison/FAQ content and accurate engine descriptions.

The Owned completion records the owner's reported change at **00:27 UTC**, separately from its actual completion-record time at **00:44 UTC**. The exact changed URL was not supplied, so the optional change-URL field remains empty; the inspected homepage URL is in the work notes. No publication, external website edit or completion timestamp was fabricated.

The dashboard shows the completion annotation on the affected frozen cohort. The linked Owned comparison retains five frozen scopes and eight supporting evidence records at completion. It shows six eligible before samples for brand presence and zero eligible after samples, correctly marked **inconclusive**, incomplete scope and limited data. Later analysis may add task evidence without rewriting the frozen completion record.

The second run's request time was 00:21:50 UTC, before the reported implementation at 00:27 UTC. Later capture timestamps therefore cannot become post-implementation samples. No third run was sent: the 24-attempt and six-call OpenAI/Perplexity limits are exhausted even though actual estimated spend is well below US$5. A further live comparison requires separately agreed scope and budget; keep the original ledger and cohorts.

## Cost reconciliation and isolation

The Google timeout temporarily made cost uncertain and paused provider admission. SerpApi's account API confirmed the active Free Plan and the consumed request. Its retained ledger entry was then given a zero estimate with explicit free-allowance verification; the attempt was closed without retry. Other engine results were preserved.

After collection, SerpApi reports **16 searches used, 234 remaining**. The local ledger retains **17 request reservations** across both days, including the first-day failure confirmed before dispatch. Google follow-up requests consume their own reservations. Free allowance is an estimate, not an invoice.

| Collector  | Retained request reservations | Reported USD | Estimated USD |
| ---------- | ----------------------------: | -----------: | ------------: |
| Perplexity |                             6 |      0.02136 |             — |
| OpenAI     |                             6 |            — |     0.0691305 |
| SerpApi    |                            17 |            — |             0 |
| Workers AI |                            20 |            — |   0.001968476 |

Reported plus estimated cost totals **US$0.092458976**, not a reconciled invoice. Conservative reservations total **US$4.54** against the US$5 ceiling. Unknown provider cost is zero, and no classification remains queued or failed. Request IDs, failed attempts and conservative cost reservations remain retained; no automatic paid retry or fallback occurred.

Seven configured local secrets were checked against saved capture/context/answer, provider reservation, processing and action-event payloads, and all 47 built client files. No configured credential value was found. The account grant, hostname boundary, isolated D1 and disabled daily schedule were preserved.

## Delivery and remaining gates

The application head already passed hosted `Checks`: 179 unit, 143 native Worker integration and 110 desktop/mobile browser tests, plus typecheck, lint, migration/retention checks, schema drift and build. This follow-up records live validation and changes no runtime behavior. It does not rerun paid provider requests.

Before a founder pilot: resolve OpenAI completeness and actual Copilot capture coverage, evaluate classifier accuracy against reviewed answers, prove a genuinely post-implementation sample, assess cost/quotas, and address the existing development-dependency security alerts. Production deployment, live billing and automatic publishing remain outside this stage.

See [first-day evidence](2026-10-13-four-engine-staging.md) and [the staging runbook](../four-engine-staging.md).
