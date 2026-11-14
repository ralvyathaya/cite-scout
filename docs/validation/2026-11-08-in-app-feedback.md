# In-app feedback — 8 November 2026

Replaced main-app mail links with an in-app feedback dialog, including the header, blocked-monitoring help and failed-check help. The owner selected **support@cite-scout.com** as the inbox. Public-site contact links retain their existing behavior.

## Behavior and scope

- Existing Switzer workspace dialog, 50% backdrop, 560px maximum width, fixed submit footer and scrollable body. Bug/Idea/Other uses native keyboard-accessible radios. The reply email is optional.
- Sending stays in the app. Pending submissions cannot be dismissed or double-submitted. Failure, rate limiting and uncertain network results retain the draft; success clears it and returns focus when closed. No auto-retry occurs.
- `POST /api/feedback` authenticates the existing session without requiring a project or subscription. It checks the app origin, JSON content type, a 16KiB body ceiling and a strict shared schema: 10–3,000 message characters, known category, UUID request ID, safe app path and optional valid email.
- The recipient and sender are server-controlled. Email uses the existing Resend account and sender, plain text only, with optional Reply-To. It includes the account ID and page path; query strings, fragments, cookies and browser logs are excluded. The form discloses what is sent. Message content is not stored in D1 or application logs.
- Existing D1 rate-limit buckets enforce five attempts per account per hour and fifty attempts across the app per UTC day. Provider work is bounded to ten seconds, the client to fifteen seconds. Resend's user-scoped idempotency key is reused for retries of unchanged content; changed submissions receive a new key.
- Local synthetic fixtures cannot send feedback. No dependency, schema, provider selection, AI budget, price, entitlement or schedule changes are required.

## Verification

- 57 API/integration cases passed across feedback and the existing API suite, including missing credentials, anonymous/cross-origin requests, invalid/oversized payloads, recipient/account overrides, optional Reply-To, limits, provider failure/timeout and retry keys. External email calls were mocked.
- 104 distinct related browser scenarios passed across the broad run and focused rerun. The initial run passed 100; two desktop/mobile pairs still expected mail links or tried to click the visually hidden native radio instead of its label. Updated semantic button/label interactions passed in the ten-case rerun. A further two-case check verifies the settled desktop modal width and responsive screenshots.
- The browser checks cover keyboard choices, focus return, optional email validation, pending Escape, retry without duplicate requests, editing after failure, URL redaction, no new tab, no AI mutations, fixture isolation, and 320/390/1440 widths.
- Build/typecheck, source lint, changed-file formatting and whitespace checks passed. The existing large-client-chunk warning remains. Private operational scripts are excluded from source lint.

Code commit: `62b4549` (`feat(feedback): send support feedback without leaving the app`). Private snapshots/logs and local synthetic screenshots live under `research/private/feedback-2026-11-08/` (test logs also use the `research/private/feedback-*` prefix).

## Delivery limits

An accepted send means Resend accepted the email; it does not prove the recipient read it or bypass mailbox filtering. Normal retries reuse the provider's 24-hour deduplication window. Drafts stay in memory while the form remains mounted; they are not persisted across a reload. A durable inbox, attachments and public anonymous feedback are outside this change.

References: [Resend sending](https://resend.com/docs/api-reference/emails/send-email), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [Hono body limit](https://hono.dev/docs/middleware/builtin/body-limit).

## Staging release and real delivery

Activated **8 November 2026, 01:41 UTC**, staging only. Active version: `451676cd-0239-4769-b55b-54184a2fb85c` (100%). Rollback: `0d58baa8-b82f-4b7f-82d3-47de54840dc3`.

The upload used the active configuration snapshot and `--keep-vars`; the final native candidate inherited all **58 bindings**, including secrets, from the named active version. Runtime, asset settings, schedules, original subscriptions/projects, prompt counts, engine selection and AI provider request counts compared unchanged. No production deployment or migration ran. Worker SHA-256: `ec9501458f6225eba535c6f44e235af7cdd78058e505c4b3cc2aa2eae9e5edc5`.

One clearly labelled feedback test was submitted through the normally authenticated staging UI, category Other, with optional email blank. The modal showed its success state. A read-only provider lookup matched the exact test text and recipient, verified the app-page context, and reported **`last_event: delivered`** at 01:43 UTC. Resend email ID: `01a1b8d2-7586-7bcd-ad98-87eddd918744`. This is delivery evidence to the support address, not proof that a human read the message or that forwarding reached another inbox. No extra emails were sent for verification.

Private receipts: `release-verified.json`, `delivery.json` and the authenticated `staging-feedback-form.png` screenshot in the release directory. The desktop/mobile synthetic screenshots remain separate. Pricing, provider/model choices, AI budgets, entitlements and schedules remain unchanged; **zero paid AI requests**.
