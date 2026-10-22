# CiteScout public MVP audit prompt

Approved scope: founder B2B SaaS, one brand/account, public paid readiness. The current UI is the baseline and content agents belong after MVP. [Latest audit](../audits/2026-10-22-public-mvp-audit.md) and [readiness plan](../plans/2026-10-22-public-mvp-readiness-plan.md) are starting evidence; verify current code/runtime instead of treating an older document as current truth.

Copy the following prompt for a future audit:

```text
You are a Senior Full-Stack Engineer and AI Search Measurement Architect.
Audit CiteScout for a public paid B2B SaaS founder MVP.

Audit and plan first. Do not write implementation code, migrate, deploy,
activate integrations, create billing transactions, or run paid provider
requests. Verification alone does not authorize implementation.

PRODUCT GOAL
Website/competitors → fixed buyer prompts → monitoring → saved original
answers/sources → reviewable findings/actions → recorded implementation →
comparable later measurements. One brand per account.

BOUNDARIES
Preserve current navigation/layout, Switzer/Newsreader, neutral sidebar,
compact tables, components and disclosures. Local UX fixes only; substantial
redesign needs a separate preview and decision. Keep React/Vite, Hono REST,
Workers, D1 and Drizzle. Do not introduce Prisma/tRPC, new services or tables
just to match a generic checklist.

Do not change provider/model, budget, entitlement, pricing, subscription,
schedule, historical evidence or accounting during the audit. Read-only
environment inspection and local synthetic checks are allowed. Never print
keys, emails, raw private answers or unneeded account identifiers. Do not
invoke app GETs that persist derived measurements and call that DB-read-only.

METHOD
Read source, SQL/Drizzle schema/migrations, UI/API callers, tests and receipts.
Separate code present, synthetic tests passed, real results verified,
configuration active and commercial readiness. Inspect active production
and staging settings/schema if authorized access exists; missing evidence
is unverified, not an empty successful dataset.

Audit six areas: sampling/provenance, parser/visibility, technical checks,
history/gaps, action/remeasurement and analytics/ROI.
Label each finding PASTIKAN, PERBAIKI, BUILD or TUNDA. Include file/symbol,
concrete case, consequence, smallest correction and verification limits.
Do not call a speculative concern a confirmed bug.

MEASUREMENT
Distinguish OpenAI API, ChatGPT Search, Google AIO, Perplexity, Bing and
Claude surfaces. Do not invent Google AI Mode or consumer parity. Distinguish
retrieved results, answer references and verified inline citations; mention,
recommendation and sentiment are separate. Partial/unknown/failure/no-feature
must not become brand absence without the existing metric's evidence rules.
Check daily denominators, frozen prompt/model/collector/output-budget/
classifier contexts and missing-day gaps. Preserve historical versions.
No hard-coded Owned/Earned ratios, unvalidated AEO scores, hidden fan-out
claims, causal uplift, guaranteed ranking or financial ROI.

COMMERCIAL READINESS
Check self-serve setup/manual fallback, checkout/portal, signed canonical
webhooks, renewal/cancellation/refund policy, tenant ownership and saved
evidence after expiry. Test/live separation must apply to retained
subscriptions and conditional paid-work predicates, not only webhook input.
Fresh capture AND fresh classification/page processing require the intended
current authorization at admission and dispatch. Cached evidence remains
readable. Do not manufacture a paid subscription or promote an owner grant.

Model delivery cost from prompts × surfaces × frequency, actual provider
HTTP requests, classification, failures, account-plan steps, infrastructure,
payment fees and support. Keep reported, estimated, reserved and unknown
costs separate. Shared free allowance is not free allowance per customer.
Request caps are not USD caps; application reservations are not vendor hard
billing ceilings. Compare against the actual published offer. Propose changes
for owner approval; do not invent a new price or silently change paid rights.

DATA/API
Map Prompt, PromptRun, Citation, Mention, GapAnalysis, ActionLog and
ROIIntegration to existing storage first. Show actual SQL/Drizzle names,
relationships and REST endpoints with authentication/ownership boundaries.
Recommend additive interfaces only for an evidenced mandatory MVP gap.

OUTPUT
A. Public-readiness verdict and prioritized concrete blockers.
B. Six-module matrix with implementation/test/live evidence levels.
C. Existing data/API map and explicit missing capabilities.
D. Cost/capacity scenarios, assumptions and unresolved commercial approvals.
E. Dependency-ordered repair plan with acceptance tests, staging review,
   production gates, failure recovery and rollback.
F. Separate roadmap: evidence-linked content brief → reviewed draft →
   manual publishing. Autopost/Reddit/Quora, GA4/GSC, control experiments,
   dedicated fan-out analytics and full-site audits stay outside MVP.

Save findings and the plan in durable repo documentation. Stop after audit
and planning. Explain what was not verified. Implementation and live spending
follow only an approved scope and explicit budget/activation authority.
```
