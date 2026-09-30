# CiteScout architecture

The browser loads a React SPA from Workers Static Assets. `/api/*` routes execute Hono in the same Worker. Every private route resolves the Better Auth session and scopes SQL by the immutable user ID.

D1 is the system of record. Drizzle defines schema and generates SQL; Wrangler applies committed migrations. Correctness-sensitive concurrency uses unique constraints, conditional statements, and fixed D1 batches rather than interactive transactions.

Scan flow: validate owned enabled prompts → one transactional D1 batch creates the run, conditionally reserves calls within all budgets, and consumes trial/manual eligibility only if work was reserved → Perplexity adapter → deterministic mention analysis → persisted result and reservation completion. Manual and cron triggers share the same unique project/prompt/provider/UTC-date constraint. Failed and interrupted reservations remain consumed. Cron filters entitlement, reservations, and budgets before its invocation limit.

Billing flow: authenticated hosted-checkout creation → Lemon Squeezy redirect (UX only) → exact-body HMAC verification → payload/config validation → canonical subscription fetch → monotonic state update and processed receipt in one D1 batch. Invoice events resolve their subscription ID from invoice attributes. Operator reconciliation uses the same synchronization function. Replacement requires an ended prior subscription and newer provider creation date; retired IDs remain in the receipt ledger and cannot restore access. Scans read verified local entitlement state.

`src/domain/insights.ts` derives the same observation status for dashboard and response payloads, which the UI and copied report consume. Displacement takes precedence over brand sentiment and means first-mention order, never recommendation ranking. Historical context is re-evaluated from stored answer text and matched terms without rewriting records or making provider calls. Citation opportunities aggregate returned source domains once per displaced answer in the displayed calendar window; they make no source-to-brand attribution claim.

Metrics and share of voice use successful, nonempty answers on the latest successful UTC day; deltas compare the previous observed day. The trend includes every calendar day and nulls for gaps. Coverage uses persisted reservations, including failures and interrupted attempts. Reservation ownership becomes null when its parent is deleted, preserving anonymous global accounting and idempotency.

Account deletion requires a session created within 15 minutes, explicit deletion/forfeiture confirmation, and provider-confirmed cancellation or expiry if subscribed. One conditional batch retires the billing association, deletes the local subscription, and removes the user with cascading product/session data. A concurrent billing change prevents deletion and asks the user to review the new state.

External integrations are isolated under `src/integrations`. Deterministic fixtures are test-only and cannot be selected by a production environment.
