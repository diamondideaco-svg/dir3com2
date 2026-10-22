# Task #174 — durable contact inbox

Implementation owner: Codex — ChatGPT Work Mode. Historical branch: `fix/contact-durable-inbox`.
Independent functional/security review and release completed as recorded below; self-checks are not approval.

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
The initial implementation did not apply code or the migration to Production. The subsequent
authorized release is recorded below; Task176 makes no migration or Production change.
No new credentials, providers or paid subscriptions are required for this inbox.

Global intake cap is 100/hour, sender cap 3/hour, serialized at database level. Sender
keys are HMACs, not logged raw email/IP. This is a conservative intake cap, not a claim
that CAPTCHA or sophisticated spam prevention is implemented. Global-limit exhaustion
fails truthfully and preserves user text. No contact payload is logged.

## Implementation-stage verification (historical)

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
dependency. Those embedded checks alone do not prove full Supabase Auth/PostgREST integration
or concurrent multi-process PostgreSQL behavior. They retain that coverage limit. The later
independent reviews, Preview/cloud checks and bounded browser observations are recorded below.

No SMTP, WhatsApp, SMS, Production data, historical request, or pricing changes were part of
the implementation-stage checks above.

## Accepted release on 2026-09-29

The [final rollout evidence](https://github.com/diamondideaco-svg/dir3com2/pull/175#issuecomment-5882455169)
supersedes the implementation-stage pending-review/Preview/release status.

- Reviewed head: `93705627deb93d87a9f0e7f3128565341054fadd`.
- Merge/Production SHA: `d76eb49529788add142314d00fed97a71f38a0d6`.
  Reviewed and merged trees matched.
- Automatic Production deployment `dpl_5QXx5rgodKjC5RsCbUCpZaxTsyP7` was READY.
- Exactly `20260928234244_contact_durable_inbox.sql` was applied, SHA256
  `e4423dea048f3e045c9dda94d88f57ab0615512c9e1ca89bab24985b88e4fec1`.
  The recorded ledger and privileges were verified; no unrelated migration or history repair.
- The bounded synthetic Production contact returned 201; an identical-key retry returned
  200 with the same receipt and one enquiry/audit event. An authorized global CEO session
  visibly retrieved that receipt in the inbox.
- Scoped-country behavior retained accepted authenticated isolated QA and a bounded
  Production query. This was not a new scoped-staff Production login.
- Independent functional and specialized security reviews passed on the reviewed head.
  Accepted local Browser/Auth AR/EN, desktop/390px and 24 runtime checks were retained;
  no new authenticated Preview browser run was claimed.
- CI36500180451, Governance36508760401, Sandbox36500180452 attempt3 and
  Preview `dpl_25L3FDPDvRneKWje9ZG6sAANfsRX` passed. Automatic post-merge
  CI36511826364 passed on the merge SHA.

These are historical accepted results, not new Task176 executions. Task176 is a separate
post-merge follow-up and does not reopen the accepted release or authorize another rollout.
No email/SMS/WhatsApp delivery was activated. No rollback was required; an application
rollback must not drop the inbox tables or erase their audit trail.
