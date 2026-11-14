# AI change: resume Claude in staging

**Date:** 13 November 2026. **Class:** existing provider/capability activation. **Verdict:** ready for a bounded test after allowance approval; not enabled for public paid packages.

The owner requested Claude as an additional engine. Reuse `claude_web_search` / `anthropic_messages`; no SDK, dependency, schema, parser or model change is needed. The current integration uses `claude-sonnet-5-5`, basic `web_search_20250305`, one search, 4,096 output tokens, a 30-second timeout and no automatic retry/continuation. These are API captures, not the consumer Claude app.

## Read-only preflight

Named active staging version: `451676cd-0239-4769-b55b-54184a2fb85c`, with 58 bindings. Claude's flag is already true and its encrypted key binding exists, but the Anthropic admission allowance is exhausted (3/3) and no owner test window is active. Installing another key alone cannot reopen admission.

A non-generating Models API GET using the local key returned HTTP 200, listed Sonnet 5.5 and reported web-search support. This verifies that local credential's model access, not a fresh Messages call with the encrypted staging credential. The [official model documentation](https://platform.claude.com/docs/en/models/overview) and [web-search contract](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool) support the existing integration.

There are two historical Claude answers and three retained Anthropic admissions, including a pre-HTTP failure. Both answers remain partial: the first hit its old 1,600-token limit; the second ended normally at the current limit but also returned a search-tool limit error. Do not relabel either as complete or hide tool errors to pass validation.

Synthetic parser/accounting coverage: 28 tests passed across `geo-anthropic` unit and integration suites. Eight desktop/mobile browser checks passed: disabled/legacy capabilities, enabled Claude sharing four slots, cancelling settings without saving, retained evidence across app pages, local logo/Markdown/source rendering and the synthetic-data banner. These are fixtures, not fresh live captures. Private snapshots/logs are under `research/private/claude-readiness-2026-11-13/`; never commit credentials or full operational binding snapshots.

TypeScript project checks, lint for the changed browser spec, changed-file formatting and `git diff --check` passed. No application code changed, so no new build or deployment was required.

## Prepared activation manifest — NOT APPLIED

Proposed incremental allowance: **at most $1 of new Anthropic reservations, four requests maximum**, including one explicit smoke request. No retries, automatic monitoring, classifier dispatch or other-provider work. Leave three calls for manual owner testing if the smoke consumes one admission.

| Setting                              | Before                                   | Proposed                                               |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------ |
| Anthropic cumulative request cap     | 3                                        | 7                                                      |
| Anthropic reservation/request        | $0.25                                    | $0.25, unchanged                                       |
| Cumulative observation admission cap | 27; 33 retained admissions already exist | 37                                                     |
| Shared cumulative reservation guard  | $4.90                                    | $8.91                                                  |
| Owner test access                    | inactive                                 | existing owner, staging only, expires after seven days |
| Selected engines / daily schedule    | existing four / disabled                 | unchanged                                              |

The guard increase does **not** authorize $8.91 of new charges: retained exposure is $7.908736 (sum of each row's highest reserved/reported/estimated amount), with zero unresolved rows. $8.91 covers that history plus a $1 increment rounded up to cents. Anthropic's request cap and $0.25 reservation enforce the four-request bound; existing other-provider allowances stay zero. Re-read exposure/counts immediately before any activation and stop on drift, unresolved cost or a changed active version. Do not clear ledger rows.

Preserve all bindings except the explicitly approved owner-window, observation and Anthropic/shared-guard fields. Inherit the named active version's code, assets, secrets and runtime; verify schedules and protected values before/after. No code deploy is required for a configuration-only activation. Do not bundle the user's unrelated OG-image edit.

## Benefit, risk and acceptance

Benefit: the owner can select Claude in one of the existing four engine slots and inspect its saved answer/sources. It stays outside Starter/Growth/Pro and cannot grant production rights. Existing engine selections remain unchanged until explicitly edited by the owner or temporarily selected for the single smoke and restored.

Risk: output can still be partial, time out, refuse or reach the one-search limit; the reservation is an admission estimate, not an invoice guarantee. Usage/search metadata must remain inspectable, and unknown cost stops further dispatch. Do not promise that this activation closes capture-quality, classifier or margin gates.

Acceptance after approval: exactly one explicit one-prompt Claude run, no retry; inspect stop reason, tool/search usage, citations, original text, request ID and cost; restore temporary selection and verify no other provider or classifier calls. A partial result is a failed completeness check, not permission for more runs. Roll back access/configuration to the snapshot if needed, preserving all spent/uncertain ledger entries and saved answers. Further testing must account for retained exposure.

**Owner decision pending:** approve the specific $1/four-request staging allowance and seven-day owner window. No paid AI call or remote configuration mutation has occurred during this preparation.
