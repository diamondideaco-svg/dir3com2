# Twilio WhatsApp request handoff

## Scope and truth

This dormant integration sends an approved Twilio Content Template from authorized DIR3COM operations to the single server-resolved partner attached to a marketplace request. It never creates or confirms a booking, changes request status, moves money, or treats an API attempt as delivery.

The production feature flag is `TWILIO_WHATSAPP_ENABLED=false` by default. Live E2E remains blocked until Twilio compliance approval and explicit release authorization.

## Trust boundaries and threats

- Browser input supplies only a request UUID. The server re-reads the request, product-to-partner association, partner status, country, and phone.
- Authorization requires a fresh authenticated CEO or active grant with `operations:write`; country-scoped actors must match the partner country.
- Provider credentials and sender identity are server-only. Logs contain request/notification IDs, not credentials or phone numbers.
- A deterministic idempotency key and one-time provider claim prevent accidental duplicate sends.
- Callback requests are untrusted until the official Twilio SDK validates `X-Twilio-Signature` against the configured canonical HTTPS callback URL.
- Unknown message SIDs, duplicate callbacks, invalid statuses, and backward transitions are rejected.
- Notification events are append-only. `queued`, `sent`, `delivered`, and `read` are distinct evidence states.

## Required server environment

- `TWILIO_WHATSAPP_ENABLED` (must remain `false` until release approval)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_WHATSAPP_CONTENT_SID`
- existing canonical `NEXT_PUBLIC_SITE_URL` for the status callback URL

Never place these values in source, screenshots, logs, or PR comments.

## Rollback

1. Set `TWILIO_WHATSAPP_ENABLED=false` and redeploy the exact approved SHA.
2. Do not delete notification/audit rows; retain evidence.
3. If provider delivery was queued, reconcile its Message SID in Twilio before any retry.
4. Roll back application code only through a reviewed forward commit. The additive database tables can remain dormant; do not drop audit evidence.

## Post-KYC activation

1. Confirm Twilio compliance is Approved and the approved WhatsApp Content SID is active.
2. Enter the five Twilio variables in Vercel through secure environment controls; never paste values into chat or logs. Keep the flag false.
3. Execute the Abu Al Hana phone repair runbook as dry-run, obtain authorization, then apply exactly one guarded update with before/after evidence.
4. Join the Twilio Sandbox recipient according to Twilio Console instructions.
5. Deploy the exact reviewed SHA to Preview/Sandbox and verify SHA match.
6. Enable the flag only in the authorized non-production environment and send one request-linked notification.
7. Verify the ledger progresses from prepared to queued, then only callback evidence advances sent/delivered/read or failed.
8. Confirm the marketplace request remains a request and no booking/payment row is created.
9. For rollback, disable the flag immediately and reconcile the Message SID; never retry an uncertain attempt.
