# Task166: single-category Kapso Drive notification

Owner: Codex — ChatGPT Work Mode, session `01a10735-bdbf-7d63-b129-58c753b2f34f`. Existing branch `fix/drive-whatsapp-status-notifications`, PR171. Ordered master `61d0f1b59e1619c00829cc081f3f30d3df389d52` is locally integrated. Independent functional and distinct security review require a separate non-author session and the exact candidate SHA.

## Current scope and defaults

Only `operations.created` for a newly committed managed Egypt Drive request is in scope. Guest quotation chat does not create an authenticated saved request. `REQ != BOOKING != PAYMENT`. The existing core event/outbox, authority checks, consent records, lease tokens, durable send intent and UTC daily budget are reused. No second backend, backfill, enrollment, scheduler or customer-facing claim of automatic delivery is added.

The original registered outbox migration is immutable. Forward migration `20261004233934_drive_whatsapp_kapso_operations_created.sql` adds disabled category gating, one approved Operations recipient UUID and an explicit language allowlist. Both capture and claim require that recipient and language. Begin-send rechecks category, recipient, language, current consent/contact, active profile, EG grant, request state, freshness, kill switch and budget. It persists the Kapso phone-number ID before network access. This migration does not set a recipient or enable any switch. A later deployment must apply the original outbox migration before this forward, with separate approval; no remote application is included here.

The existing POST worker `/api/internal/drive-whatsapp/dispatch` now uses Kapso, with no Twilio fallback. Old Twilio helper tests and signed receipt route remain for historical compatibility; those are not the current worker transport or evidence of Kapso approval.

## Server configuration contract

| Binding | Meaning |
| --- | --- |
| `DIR3COM_WHATSAPP_ENABLED` | Exact `true` permits worker routing; otherwise 404 before database/provider access |
| `DIR3COM_WHATSAPP_CATEGORIES` | Must equal `operations.created` exactly; other categories fail closed |
| `DIR3COM_WHATSAPP_WORKER_SECRET` | Separate server bearer secret, at least 32 characters |
| `KAPSO_API_KEY` | Existing approved provider key, server secret only |
| `KAPSO_PHONE_NUMBER_ID` | Existing approved Egyptian sender identifier; captured in durable send intent |
| `KAPSO_WEBHOOK_SECRET` | Secret for the approved phone-number webhook, at least 32 characters; receipt verification remains active with outbound off |
| `DIR3COM_WHATSAPP_SITE_URL` | Approved HTTPS application origin, no credentials/path/query/fragment |
| `DIR3COM_WHATSAPP_KAPSO_TEMPLATES` | JSON map containing only `operations.created.ar` and/or `operations.created.en`, each `{ "name": "approved_template_name", "languageCode": "ar" }` or approved `en`/`en_US`/`en_GB` |

A single approved recipient language needs only its one template. Template names in configuration are not proof of provider approval. The approved template contract has two positional body text parameters: request reference and authenticated Operations link. No free-text fallback, private notes, quote price or booking/payment assertion is sent.

Database settings `capture_enabled`, `send_enabled` and `operations_created_enabled` must be separately approved. `operations_recipient_user_id` selects the privately verified Operations account, and `operations_template_languages` must match the deployed approved template languages. Empty defaults close the rollout. Subscriptions require verified contact and documented consent. The worker accepts no arbitrary recipient/message input.

## Transport and receipts

Kapso sends use the fixed documented proxy `https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages`, X-API-Key and approved template JSON. Successful HTTP acceptance requires one valid WAMID and a matching echoed recipient. HTTP acceptance is not delivery. Every ambiguous response, 429, 5xx, timeout or malformed/mismatched response becomes `unknown`; Twilio20429 retry assumptions do not apply to Kapso. A lost write leaves durable send intent; expired sending becomes unknown, never automatic resend.

Configure only an approved Kapso **phone-number v2 webhook** for sent/delivered/read/failed events at `/api/webhooks/kapso/drive-whatsapp`. Verification uses raw bounded JSON bytes and HMAC-SHA256 from `X-Webhook-Signature`, with timing-safe comparison. The event header is not signed and cannot choose delivery state; the state must come from the signed message body. Sender phone-number ID, outbound/non-passive direction, recipient and WAMID must all match. BSUID-only or missing-phone events fail closed for this explicitly verified phone rollout.

The receipt RPC correlates only a durably persisted WAMID plus captured sender and recipient, then reuses the existing token-checked monotonic receipt logic and database duplicate key. Unknown WAMIDs cannot be attached by phone alone. A callback racing HTTP acceptance returns409 for provider retry. If the HTTP response/WAMID was lost, the v2 callback cannot safely identify the outbox attempt and requires controlled provider reconciliation. This is an explicit limitation; automatic reconciliation or universal exactly-once network delivery is not claimed. Retain delivery callbacks and operational monitoring when outbound is switched off. Kill switches cannot recall an already submitted network request.

Official contracts checked on this continuation: [Kapso template send](https://docs.kapso.ai/docs/whatsapp/templates/simple-text), [signature verification](https://docs.kapso.ai/docs/platform/webhooks/security), [v2 message events](https://docs.kapso.ai/docs/platform/webhooks/message-events), [delivery retries](https://docs.kapso.ai/docs/platform/webhooks/advanced).

## Verification and remaining gates

Candidate TypeScript tests execute the actual adapter and Drive request/quote handlers with synthetic store/transport and all real sockets blocked. Migration-cutover checks verify registered forward hashes and unchanged archives. The SQL harness now applies the actual forward after historical baseline checks, and includes atomic rollback, single-category/recipient/language gates, current authority/consent revocation, WAMID/sender/recipient binding, monotonic duplicate receipts, unknown crash handling, budgets, RLS/privileges and two-connection claims/send intent when real PostgreSQL is available. Added assertions are unverified until that harness actually runs.

Local SQL currently BLOCKED: installed PostgreSQL17 lacks `share/postgres.bki`; initialization failed before a test database was created. No installed PGlite package was found in existing dependency/cache candidates; normal fallback exited ERR_MODULE_NOT_FOUND. One read-only Docker Server version probe timed out after6 seconds; only its client process was terminated. No Docker restoration, downloads, paid resources, remote database or unrelated deletion occurred. The CI test step is prepared, but this local-only candidate is not pushed and no hosted CI PASS is claimed. Typecheck and lint passed; 37 focused synthetic tests and 9 migration-cutover tests passed. Default npm build failed because Turbopack rejects the external dependency junction. The documented webpack fallback failed on blocked Google font downloads and ENOSPC. Its PowerShell process-tree stop overload was unsupported; the build then exited with compilation failure. Only this run's newly generated, verified non-symlink webpack cache was removed to restore space to343MB; no source/unrelated deletion. No build remains running. Both build attempts are non-PASS, and no further build is attempted in this low-disk environment. Independent review remains pending; static tests are not full Production PASS.

The smallest future activation bundle requires: exact-candidate isolated SQL/build/preview checks and independent functional/security review; verified current Rami EG operational grant, matching verified contact and documented opt-in subscription; the existing Egyptian Kapso sender/project and approved one-category template/parameter contract; secure secret/webhook binding on the approved deployment; explicit migration/configuration/scheduler/recipient authorization with both kill switches and a bounded budget; and separate immediate approval for one controlled real lifecycle send after a newly committed managed request. None of these private live facts is inferred from historical reports. No contact/credential values belong in git or task comments.
