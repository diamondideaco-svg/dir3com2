# Task #166: Drive WhatsApp delivery

Owner: Codex — ChatGPT Work Mode. Branch: `fix/drive-whatsapp-status-notifications`.
Base: `f095853ca112e03c394af9b54ba2004500922a79`. Independent review is required; owner checks are not independent approval.

## Release state

This is disabled-by-default implementation, not live-delivery proof. No provider requests, account changes, migrations on a remote project or real messages were performed during development. No paid dependency or new subscription is introduced. The existing Operations UI still truthfully says automatic WhatsApp is unavailable. Keep that wording until an authorized activation with real delivery evidence.

The last provider inspection, recorded in Task #166 comment 5858917089 on 27 September, found no WhatsApp sender or templates and Twilio compliance rejection 18602/18603/18604. Correct company registration, address and representative evidence is the external onboarding gate. A linked WhatsApp Web session does not replace an approved API sender.

## What is implemented

- An AFTER INSERT trigger on authoritative `drive_request_events` captures eligible recipients in the same transaction. No historical backfill. The migration leaves capture and sending off and creates no subscriptions.
- Recipient subscriptions require documented opt-in and verified E.164 contact. The service provisioning process, not an unauthenticated form, is responsible for that evidence. Do not infer consent from `acknowledged` or a supplied phone number. National-format numbers must be explicitly verified/normalized before enrollment; no guessed country prefix.
- Customer identity and contact are checked against the saved request. Operations eligibility is checked against active profile and explicit regional grants at capture and again before sending. Background delivery deliberately requires an explicit grant even for a CEO. Disabled contacts, reassignment, revoked roles, different countries, stale states, expired quotes and past pickups cannot dispatch.
- Unique event/channel/recipient keys; claim token and send-intent transition; three attempts maximum; global UTC daily budget, initially 20 and capped at 100. The budget counts attempts, not claims of successful delivery.
- Claim expiry before send can be reclaimed. Expiry after send intent becomes `unknown`. A timeout, 5xx, malformed response or failed result write never triggers a blind resend. Only a documented 429/20429 response without a message SID permits bounded exponential retries.
- Twilio ContentSid templates only, no free-text fallback. Payload variables contain request reference and authenticated account link, not private Operations notes or claimed payment/booking.
- Signature-verified status callbacks bind the configured account, sender, recipient, provider SID and opaque attempt token. All form fields enter the HMAC; duplicate fields and oversized bodies fail. Callbacks may reconcile an unknown outcome. Duplicate and out-of-order callbacks do not downgrade delivered/read evidence. Callbacks continue when the outbound environment switch is off.
- `get_drive_whatsapp_delivery(request_id)` exposes state, attempts and error code to authorized regional Operations only, without phone numbers. It does not add a new UI panel. Failed/unknown entries remain available for controlled reconciliation; no automatic unknown-resend endpoint exists.

## Configuration contract, server-side only

| Name | Meaning |
| --- | --- |
| `DIR3COM_WHATSAPP_ENABLED` | Exact `true` permits the worker endpoint; absent/false returns 404 before database/provider access |
| `DIR3COM_WHATSAPP_WORKER_SECRET` | Separate random bearer secret of at least 32 characters for the POST worker endpoint |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Existing approved account, secured server-side; token also verifies callbacks |
| `TWILIO_MESSAGING_SERVICE_SID` | Messaging service with the approved WhatsApp sender |
| `DIR3COM_WHATSAPP_FROM` | Verified E.164 sender, without the `whatsapp:` prefix |
| `DIR3COM_WHATSAPP_CALLBACK_URL` | Fixed HTTPS URL ending `/api/webhooks/twilio/whatsapp`, no credentials/query/fragment |
| `DIR3COM_WHATSAPP_SITE_URL` | Approved HTTPS application origin, no extra path/query |
| `DIR3COM_WHATSAPP_TEMPLATE_SIDS` | JSON map from the keys below to approved HX content SIDs |

Use approved local/server secrets, never source files, issue comments or client variables. Preview testing must use an isolated database and explicit non-production sender authorization. Do not copy Production credentials into Preview. No scheduler or automatic cron is enabled by this PR. A separately approved scheduler calls POST `/api/internal/drive-whatsapp/dispatch`, processing at most one item per invocation. The route accepts no recipient or message input.

Both the database `settings.send_enabled` and environment switch must permit dispatch. Database `capture_enabled` governs only newly created events. Turn off database `send_enabled` for an immediate check at the next begin-send; turning off the environment switch may also require the hosting platform's environment rollout. Neither switch can recall a request already sent to Twilio. Keep callback verification configured to record in-flight deliveries.

## Approved-template drafts

Each key requires `.ar` and `.en`. These are drafts, not claims of Twilio approval. `{{1}}` is the request reference; `{{2}}` is the account link. No quote amount is embedded, so the authenticated current request remains the source of price truth.

| Key | Arabic text | English text |
| --- | --- | --- |
| `customer.created` | استلمنا طلب النقل {{1}}. ستراجعه عمليات مصر. لم يتم حجز أو دفع. متابعة الطلب: {{2}} | We received transport request {{1}}. Egypt Operations will review it. No booking or payment has occurred. View request: {{2}} |
| `customer.review` | طلب النقل {{1}} قيد المراجعة لدى عمليات مصر. متابعة الطلب: {{2}} | Transport request {{1}} is under review by Egypt Operations. View request: {{2}} |
| `customer.confirm` | عرض السعر لطلب {{1}} جاهز لمراجعتك وموافقتك في حسابك. لم يتم حجز أو دفع. عرض التفاصيل: {{2}} | The offer for request {{1}} is ready for your review and acceptance in your account. No booking or payment has occurred. View details: {{2}} |
| `customer.decline` | تعذّر قبول طلب النقل {{1}}. راجع حالة الطلب في حسابك: {{2}} | Transport request {{1}} could not be accepted. View its status in your account: {{2}} |
| `customer.customer_accept` | سُجّلت موافقتك على عرض الطلب {{1}}. لم يتم حجز أو دفع أو تأكيد مورد. متابعة الطلب: {{2}} | Your acceptance of the offer for request {{1}} was recorded. No booking, payment or supplier confirmation has occurred. View request: {{2}} |
| `operations.created` | وصل طلب نقل جديد {{1}} إلى عمليات مصر للمراجعة. افتح الطلب من حساب العمليات: {{2}} | New transport request {{1}} requires Egypt Operations review. Open your Operations account: {{2}} |
| `operations.customer_accept` | وافق العميل على عرض الطلب {{1}}. يلزم استكمال التنسيق؛ لا حجز أو دفع مسجّل. افتح حساب العمليات: {{2}} | The customer accepted the offer for request {{1}}. Coordination remains required; no booking or payment is recorded. Open Operations: {{2}} |

## Verification and activation boundary

Local tests execute the real TypeScript worker/webhook with isolated transport and actual SQL functions in disposable PostgreSQL fixtures. The CI outbox step uses a new database on its loopback PostgreSQL17 service and tests two-connection claims/send intent. The in-memory fallback uses PGlite and does not claim concurrent-connection coverage.

1. Complete exact-SHA independent functional and security reviews and release gates.
2. Verify sender, messaging service and all template approvals in the existing provider account; finish required compliance evidence.
3. Provision approved opted-in subscriptions through restricted database administration. Do not enroll historical customers merely because their phone appears in a request. No PII belongs in git.
4. Obtain concrete release/migration/configuration authorization, apply this one registered forward once, and initially keep both switches off.
5. Verify the callback endpoint on the approved deployment. Enable a bounded isolated test with only approved recipients, then observe provider acceptance and actual delivered status. Test duplicate callbacks and kill switch without repeated real messages.
6. Preserve `REQ != BOOKING != PAYMENT`. Do not claim live PASS until delivery is independently observed. Do not replay old events or turn `unknown` into a fresh send without provider reconciliation.

References: [Twilio signatures](https://www.twilio.com/docs/usage/security), [approved WhatsApp templates](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates), [out-of-order status callbacks](https://www.twilio.com/docs/messaging/guides/track-outbound-message-status), [safe 20429 retries](https://www.twilio.com/docs/api/errors/20429). Checked 28 September 2026.
