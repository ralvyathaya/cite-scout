# G3 staging code release — 28 October 2026

**Staging deployed; G3 remains unmet.** This release contains the [versioned evidence guards and evaluation corrections](2026-10-28-g3-evidence-guards.md), not a public launch or paid-test activation.

- Active staging version: `42dcfe1c-eb56-4668-bf60-982431a0be89` at 100%, verified at `2026-10-28T14:41:13.550Z`.
- Previous version / rollback target: `7b44c479-3a88-4b5e-a86c-d4ac071b923e`.
- Code commits: `54020cd` (capture/analysis guards) and `637ad2a` (versioned evaluation and task cohorts).
- Frozen built Worker SHA-256: `1520c341ecef3d90a5cd9cb91b8e8fd1507541142cdb71a19a7170e0781bba7e`.

## Configuration preservation

The active Worker version, full settings and schedules were read before upload. A temporary ignored config copied the observed non-secret variables, bindings and runtime; local default provider/budget values were not substituted. `versions upload --keep-vars --strict` uploaded code without activating it. All 54 bindings and the complete script runtime matched the prior version before activation. The active version was checked again to reject a concurrent deployment change.

After `versions deploy` activated the uploaded version, control-plane reads confirmed 100% traffic and exact equality of all non-annotation Worker settings, including 39 plaintext bindings, 12 inherited secret bindings, AI/assets/D1, observability, compatibility settings and usage model. Worker secret values were neither retrieved nor written; existing secrets were inherited. CLI authentication was used in memory for the control-plane reads and was not saved in receipts.

The `*/5 * * * *` schedule, including its timestamps, matched exactly before and after. No trigger command, migration, database restore or merchant mutation ran. Prices, provider/model configuration, budgets, entitlement and project monitoring settings remain unchanged. Analysis stays disabled and the existing zero Perplexity/classifier test limits remain zero.

Read-only post-deployment checks retained 22 captures, 52 provider-request ledger entries, three active prompts and the original engine selection with daily monitoring off. D1 reported zero rows written by those checks. No new capture or inference was dispatched.

## Verification and remaining gate

- Passed: 313 unit tests, 53 targeted integration tests, 22 desktop/mobile Playwright tests, typecheck/build, lint, changed-file formatting, whitespace, staging-isolation checks and V2 self-check.
- The original real evaluation still replays exactly under scoring version 3 with native fetch blocked; all five frozen baseline byte hashes remain unchanged.
- The protected staging health URL returned HTTP 302. No authenticated staging UI smoke is claimed; the browser checks used the local build and synthetic transport.
- Existing large-client-chunk, dependency sourcemap, and local test-runtime warnings remain. No broad UI redesign or dependency update is included.

Fresh independent answers and human review are still required for G3. The proposal for at most three Perplexity captures plus three classifier calls, with a temporary additional reservation allowance of at most $1.51, remains **awaiting explicit owner approval**. No allowance, expiration window or provider limit was changed for this deployment. A successful test batch would still need to meet the declared evidence criteria; it does not automatically pass G3 or the other MVP gates.

Rollback restores the previous Worker version at 100% using version deployment, with processing kept paused and no database rollback or deletion of saved evidence. Private snapshots, logs, review packets and the unpaid test proposal remain under ignored `research/private/` and are outside the deployed asset directory.
