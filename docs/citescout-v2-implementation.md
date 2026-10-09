# CiteScout v2 — implementation handoff

9 October 2026 · Branch `codex/citescout-v2` · Base `de78226773fb329f019014015895dbd4b3d6314e`

## Delivered locally

- Buyer-question homepage, pilot onboarding, Questions, observation comparison, and Settings. Legacy app URLs resolve to the new workspace/evidence; score dashboard API is retired behind authentication. Social metadata follows the API claim boundary; the old recommendation-themed social image is no longer advertised.
- Three-question frozen baseline, one follow-up 72 hours after baseline closes, 14-day expiry, bounded retries on different UTC days, durable run items, lease recovery, and daily paid monitoring. Existing reservations count toward all limits. New paid questions wait for the next daily intent.
- Immutable question/entity/provider context, original response envelope, exact text parts, safe source links, conservative citation linkage, persisted entity matches, compatible previous/baseline comparison, and preserved legacy evidence. Draft edits, replacement, pause/archive and configuration changes preserve history.
- Verified payment/renewal events with monotonic refund exclusion, bounded client event ingestion, operator qualification/decision tooling, cohort report and 90-day telemetry cleanup. Account deletion removes evidence/telemetry and scrubs retained anonymous usage reservations.
- Additive D1 migration and matching Drizzle snapshot/journal. No new dependencies or services. Existing browser fixtures now use v2 routes and outcomes.

Operator instructions: [Run the pilot](citescout-v2-operations.md).

## Checks performed

| Check | Result |
| --- | --- |
| TypeScript (`npm run typecheck`, also included in build) | Passed |
| Production client + Worker bundle (`npm run build`) | Passed; existing Vite `__dirname` future-loader warning remains |
| ESLint (`npm run lint`) | Passed |
| Synthetic self-check (`npm run check:v2`) | Passed |
| Whitespace diff (`git diff --check`) | Passed |

The self-check uses in-memory SQLite with synthetic responses. It covers additive preservation of legacy rows, duplicate/concurrent scan claims, trial baseline/follow-up/retries, usage cap deferral, paid upgrade/day boundaries, new-question scheduling, comparison/source evidence, ownership, telemetry key validation, exact-text highlighting, refund reordering, cohort SQL and account deletion. It does not contact a provider or change any real database.

## Review coverage

**Code review: skipped (ce-code-review unavailable)** — the full independent review terminated at the subagent account usage limit, without a completed receipt. One saved security finding was validated and fixed: arbitrary `sourceKey` text cannot be retained on other client event types; source keys must match the local numeric key format and an owned source record. The self-check covers rejection of a private-text key.

A manual diff pass covered ownership, SQL claim/finalization guards, historical context boundaries, raw-source handling, deletion, payment/refund ordering, API callers and spec dispositions. Simplification reused the existing paid-entitlement SQL and text highlighter, removed an unused response type, stopped completed-run polling, and removed raw answer envelopes from history comparisons. This is not a claim of completed independent review.

## Not executed / operational gates

- No push, PR, deployment, real enrollment, remote migration, paid provider call, or real billing transaction.
- Browser/E2E and the complete legacy suite were not run. Updated E2E fixtures pass compilation/lint only.
- Apply the migration to a backed-up dogfood copy and inspect an authorized real capture before opening the pilot. SQLite checks do not reproduce every D1/Workers runtime behavior.
- Production billing configuration still uses **test mode**. Live $19 checkout and matching webhooks must be configured before collecting real payments.
- Full independent review remains incomplete. The ten-user experiment has not run, so willingness to pay and retention remain unvalidated.

The pre-existing final spec, `.scratch/`, `research/`, and `business-learning/` are preserved separately from the implementation commit.
