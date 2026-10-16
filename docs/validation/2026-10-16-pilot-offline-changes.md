# Founder-gates offline implementation

Scope: U1–U5 of the [approved plan](../plans/2026-10-16-0804-fix-founder-pilot-gates-plan.md). U6, deployment, provider spending and pilot invitations remain unapproved.

## AI change log

**Date:** 2026-10-16. **Class:** collector/parser configuration. **Verdict:** go for offline implementation; live candidate requires separate scope and budget approval.

OpenAI keeps `gpt-6-luna`, required `web_search`, one tool call, `reasoning:none` and `store:false`. New captures increase its output ceiling from 700 to 1,600 and use `geo-collector-3`. The parser recognizes documented `find_in_page`. Bing through SerpApi also advances to `geo-collector-3` for tabbed answers and answer-level references; Google and Perplexity retain their versions and output budgets. Historical captures and contexts are immutable.

The intended improvement is fewer output-limit truncations; the live measure remains three complete buyer answers on the final configuration. Six local historical replays remain partial, including unfinished searches. A larger output limit has not proved that problem solved. Risks are higher output cost, latency and continued partial results. Conservative per-request reservations and strict response/item/citation checks remain in place. The owner reviews saved envelopes before authorizing the next live request.

The output-budget change affects newly requested OpenAI observations only. The Bing parser change affects new Bing captures; replay of five stored Bing results found no Copilot block and does not change their historical no-feature outcome. Reverting code requires a Worker deployment; stored results keep their original cohort. The owner is informed through this receipt and PR. No classifier/model/rubric change is justified by synthetic tests or unfilled human labels.

References: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [historical replay](2026-10-16-openai-offline-replay.md).

## Live gate status

G1 OpenAI, G2 positive Bing answer, G3 human-reviewed diagnosis and G4 genuine post-action measurement remain **unmet**. Offline regression tests and prepared review packets are not live success receipts.

## Implemented offline

- U1: validated cumulative owner-test ceilings shared by admission, provider reservations and staging checks. Staging defaults stay paused with zero caps. No ledger reset, migrations or remote settings changes.
- U2–U3: strict OpenAI completion remains enforced; prospective contexts carry the changed output budget and Bing parser version. Historical replay explanations and the bounded Bing canary bank are recorded separately.
- U4: local-only prepare/freeze/score evaluation with grouped calibration/holdout separation and explicit abstention denominators. Twenty saved observations are represented once; the private blind packet has 1,249 unanswered human-label slots. No human judgment or accuracy result is fabricated.
- U5: authenticated, idempotent Owned follow-up creation validates selected evidence against the current cohort and preserves source history/pins. Accepted scope stays fixed across sync, completion and reopen. The dialog reviews included/excluded records and retains drafts and request identity after a failed save. Multi-engine validation loads the current configuration once.

No provider transport exists in the evaluation script. Private exports, labels and packets remain under ignored `research/private/`; fixture results remain synthetic and isolated from real monitoring.

## Verification

The final local browser run passed all 158 desktop/mobile tests with one Windows worker. Manual synthetic review at 1440×900 and 320×720 verified explicit baseline selection, included/excluded counts, successful follow-up creation, its source-history link and no horizontal page overflow. The save-failure regression preserves the draft and request ID, then saves exactly once on retry. The configuration-read regression first observed three repeated D1 context reads for three engines, then passed with one shared read.

Typecheck, lint, unit tests (221), Worker integration tests (151), `check:v2`, the static staging-isolation guard, migration generation/no-diff check, build and dependency audit passed. Audit reported zero vulnerabilities; generated build outputs contain no local secret files. The build retains the existing large-client-chunk warning.

Parallel Windows browser runs intermittently received a local-preview 500 on the existing desktop health check. Diagnostic output identified an Undici fetch failure in the Miniflare/Vite proxy before the Worker handler. Three direct checks, the isolated health test, all 31 public desktop tests and an earlier full browser run returned the expected result. The test includes the response body on a status failure; no retry or relaxed assertion was added. CI retains two workers on Linux as an independent check before merge.

No live Access verification, deployment, paid provider call, classification inference, real task completion or staging data mutation was performed. The original evidence/pins and exhausted experiment ledger remain unchanged. Live readiness still requires the separately authorized U6 experiment and genuine human review.

## Review follow-up

The completed review `20261016-151726-final` retained three P2 findings. All were applied inline and verified with regressions observed failing before the fixes:

1. A closed pagination request no longer overwrites a reopened follow-up review; generation checks discard stale success, error and loading updates, and unmount invalidates pending work.
2. Staging classification with a zero request ceiling is explicitly unavailable; a positive-ceiling control remains available without making an inference call.
3. Runtime and fixture context builders share the prospective collector/output-budget policy. Synthetic OpenAI uses collector-3/1,600 and Bing/SerpApi uses collector-3; prior saved contexts remain unchanged.

The evaluator CLI coverage gap was also closed through a real subprocess/file-I/O test for public-path rejection, packet/label-lock non-overwrite and synthetic prepare/freeze/score. The unrelated pre-existing competitor browser assertion still exercises an empty-analysis state rather than independently proving quality filtering; this review did not establish a runtime defect there. Native review covered correctness, security, testing, maintainability, performance, API contracts, reliability, adversarial cases and frontend races. External model inference was excluded by the offline scope.
