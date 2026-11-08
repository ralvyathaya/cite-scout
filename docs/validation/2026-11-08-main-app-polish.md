# Main app polish — 8 November 2026

Implemented the approved compact, light workspace direction across `/app`. Switzer is the interface family, including headings and portals. Public display typography retains Newsreader. Neutral surfaces, compact navigation and restrained brand accents preserve the current CiteScout identity.

Design guidance: **Unslop by Damir Sokolovsky** ([@heydamir](https://x.com/heydamir)), [source skill](https://github.com/heydamir/unslop/tree/main/skills/unslop), CC BY 4.0. This implementation adapts its spacing, neutral chrome, typography and focused-interaction guidance; it adds no generated imagery, font family or dependency.

## Delivered behavior

- Shared focused dialogs reuse Radix, a 50% black backdrop and white panels: 560px forms/filters, 960px evidence, 16px viewport insets and scrollable bodies with stable headers/footers. Long titles wrap and mobile controls retain touch space.
- Overview has four compact summaries, direct 7/14/30-day controls and advanced filters. Its view filters no longer silently narrow a new check: monitoring uses the configured engines and active prompts, with the actual prompt count visible. Action-specific measurement scopes remain explicit and unchanged.
- Prompts uses direct status buttons, draft group/grouping filters and a separate monitoring-scope dialog. Group management, history and CRUD use dialogs; overlapping memberships, inactive members, permission restrictions and original answers remain available.
- Answers and Trends retain their routes, periods, pagination and return context. Matrix, chart options, samples and methodology open focused dialogs; metric definitions, eligible samples and missing-day gaps are unchanged.
- Sources and Competitors share the compact filter pattern. Source evidence opens on demand, with the existing five-answer batches/cache and return links. Full answer and action-brief pages remain directly addressable.
- Diagnoses uses filter and finding-detail dialogs. Playbook has direct status choices and focused notes/completion/reopen editors. Settings shows configuration summaries with editors; Billing and onboarding retain the existing checkout/setup flows and move lengthy help into dialogs.
- Filters have draft Apply/Reset/Cancel behavior, removable applied chips and preserved unrelated URL parameters. Apply clears pagination; cancelling never changes the applied scope or starts a request.
- A pending form cannot be dismissed through Escape, backdrop or close-button while saving. Rejected submissions retain the draft and error for retry. Existing action revision and follow-up idempotency behavior are preserved.

The existing Action pins disclosure remains mounted because its measurement readers provide chart annotations. Small row-action menus, short tooltips and technical disclosures remain where useful; the change does not force every interaction into a modal.

## Verification boundary

Browser regressions cover keyboard/focus, dialog dismissal, deferred failed saves, Apply/Cancel/Reset, URL/back/pagination, scope separation, safe Markdown, five-answer source loading, locked/read-only accounts, loading/error/empty/partial/no-feature states and desktop/mobile layout. A new scope regression first failed against the prior build, which dispatched only the display-filtered engine, before passing with the configured scope.

Only UI code and its tests changed. No endpoint, database schema, pricing catalog, provider/model, budget, entitlement definition, schedule or classification/measurement method changed. Tests intercept mutations or use local synthetic fixtures; no paid provider validation is included. This work does not close the public-MVP evidence or economics gates.

Operational snapshots, browser logs and screenshots are kept privately under `research/private/app-polish-2026-11-08/`. The screenshots use clearly labelled synthetic data, not a customer account or live performance evidence.

## Checks

- 379 unit tests passed (32 files).
- 56 relevant integration tests passed: measurement, actions, billing plans and onboarding.
- 202 distinct desktop/mobile browser scenarios passed across the broad run and focused rerun. The final broad run passed 200; two close-target checks initially read the opening animation's scaled bounds. Those checks now wait for the actual 44px target, and the six-case rerun (prompt/group CRUD, fonts/portals and monitoring settings on both projects) passed.
- Build with TypeScript project checks, source lint, changed-file formatting and `git diff --check` passed. Private operational scripts were excluded from source lint. The existing large-client-chunk build warning remains.
- Desktop 1280/1440 × 720 and mobile 320/390 layouts passed the affected layout checks. A 390 × 520 monitoring-settings check failed against the prior build because Save was outside the viewport, then passed with the fixed footer. Prompt/group close controls are verified at 44 × 44 after the opening animation.
- The compiled Worker SHA-256 remains `f99f783fd4dc4a522d82fc8b0b7a549f445086fdb7683d85873da343d1c72968`; only client assets changed. Build output contains no `.env` or `.dev.vars` files.

Code commit: `464cb6d` (`fix(workspace): compact app controls and focus editing in dialogs`).

## Staging release

Activated on **8 November 2026, 00:34 UTC**, staging only:

- Active version: `0d58baa8-b82f-4b7f-82d3-47de54840dc3` (100%).
- Rollback version: `43abfdc6-f4a3-4c9d-8e28-8593d274f4ff`.
- Uploaded with `--keep-vars` and a snapshot of the named active version. The final candidate inherited all **58 operational bindings**, including encrypted secrets, from that version. Runtime, asset configuration and schedules matched before activation and after release.
- Provider request counts, subscriptions, projects, configured engines, daily-monitoring state and active prompt counts matched the preflight snapshot. **Zero paid provider calls and zero production changes.** No database migration or billing transaction ran.

The signed-in staging account loaded the exact built assets (`index-CzuZBCq6.js`, `index-B7FMQoa3.css`). At 1440 × 720, the rendered heading computed to Switzer/28px, the local Switzer face was loaded, and the document had no horizontal overflow. The Filters dialog computed to Switzer with a 560px-wide panel. Direct period buttons, the compact summaries, blocked-monitoring explanation, Prompts table, actual three-active-prompt summary and capture-quality labels were verified in the authenticated page.

Browser screenshot export for the authenticated tab was unavailable; saved visual comparison artifacts are the local synthetic Overview and Filters screenshots. Automated responsive/focus/interaction checks supply broader coverage than this account smoke check. No settings or content were saved during the account review. Public-MVP evidence and margin gates remain separate.

Private release receipt: `research/private/app-polish-2026-11-08/release-verified.json`. The variable-preservation procedure follows the current [Wrangler versions documentation](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
