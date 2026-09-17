# CiteScout architecture

The browser loads a React SPA from Workers Static Assets. `/api/*` routes execute Hono in the same Worker. Every private route resolves the Better Auth session and scopes SQL by the immutable user ID.

D1 is the system of record. Drizzle defines schema and generates SQL; Wrangler applies committed migrations. Correctness-sensitive concurrency uses unique constraints, conditional statements, and fixed D1 batches rather than interactive transactions.

Scan flow: entitlement check → scan-run creation → atomic reservation and quota gate → Perplexity adapter → deterministic mention analysis → persisted result → aggregate metrics. Manual and cron triggers share the same unique project/prompt/provider/UTC-date constraint.

Billing flow: authenticated hosted-checkout creation → Lemon Squeezy redirect (UX only) → exact-body HMAC verification → payload/config validation → fingerprint claim → immutable subscription ownership and state synchronization. Scans read verified local entitlement state.

External integrations are isolated under `src/integrations`. Deterministic fixtures are test-only and cannot be selected by a production environment.
