# Task #174 — durable contact inbox

Owner: Codex — ChatGPT Work Mode. Branch: `fix/contact-durable-inbox`.
Independent functional/security reviewers: not yet assigned; self-checks are not approval.

## Behavior

`POST /api/contact` accepts bounded JSON, validated country/subject/text and a UUID v4
Idempotency-Key. A service-role-only RPC atomically stores the enquiry and receipt
history. Only then does the route return 201 (`status=received`, `externalDelivery=false`).
An identical retry returns the existing receipt (200), even when the intake limit is
reached. Changed content with the same key returns 409. Invalid input returns 400/413,
foreign browser origins 403, throttling 429, and missing schema/backend 503.

The AR/EN form retains fields on failure. Retry identity persists while this form remains
mounted, not across refresh/device changes. Success clears fields only after a receipt.
Unverified 24-hour/phone/email availability promises were removed from this page.
This is a contact enquiry, not a booking, REQ, payment, or outbound message.

`/admin/operations/contact` uses existing fresh canonical role/team-grant checks.
Operations read permission is required; country filtering occurs before retrieval.
Global administrators can also see OTHER/general enquiries. Selecting a service
country only routes a message; it never grants the submitter authority or access.
Operations write permission is separately required for received → in_progress → closed.
Updates and internal-note audit events commit atomically and repeats create no event.
Internal notes are visible only in the scoped staff inbox; they are not sent externally.
The UI shows the latest 100 enquiries; database read failure is not rendered as empty.

## Migration and release

CLI-created `20260928234244_contact_durable_inbox.sql` is registered with its exact hash.
RLS is enabled; anon/authenticated have no table access or RPC execution. Server-only
service_role privileges allow bounded intake and authorized Operations operations.
Neither migration nor code is applied to Production by this task's implementation.
No new credentials, providers or paid subscriptions are required for this inbox.

Global intake cap is 100/hour, sender cap 3/hour, serialized at database level. Sender
keys are HMACs, not logged raw email/IP. This is a conservative intake cap, not a claim
that CAPTCHA or sophisticated spam prevention is implemented. Global-limit exhaustion
fails truthfully and preserves user text. No contact payload is logged.

## Verification

- Contact HTTP contract: 8/8 tests PASS.
- Existing navigation/admin authority regressions: 26/26 PASS.
- Isolated embedded PostgreSQL (PGlite): 117 assertions PASS: real migration, storage,
  retry/conflict, deny anon/authenticated access, country mismatch, stale transitions,
  audit count, sender/global limits, and append-only event privilege.
- Typecheck PASS; full lint PASS (0 errors, 23 pre-existing warnings); build PASS.
- Migration registry/hash and diff checks PASS.

Reproduce isolated database checks without a remote database:

    CONTACT_QA_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node scripts/test-contact-inbox-isolated.mjs

PGlite was installed only in a temporary QA folder at version 0.3.14, not as an application
dependency. This is not evidence of full Supabase Auth/PostgREST integration or concurrent
multi-process PostgreSQL behavior. Those gates and authenticated inbox Browser QA remain
open, together with independent exact-SHA reviews and Preview/cloud checks.

No SMTP, WhatsApp, SMS, Production data, historical request, or pricing changes.
