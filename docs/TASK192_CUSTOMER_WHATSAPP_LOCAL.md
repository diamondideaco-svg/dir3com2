# Task192: local customer WhatsApp completion linked to Task166

Implementation owner: Codex Desktop / Engineer A, delegated from source task `01a1185c-259c-77e9-b73c-6d53ddd290d7`.
Task: https://github.com/diamondideaco-svg/dir3com2/issues/192 . Base: `4ed9374d07bf466e0eb1db330ae7d7dcad94a994`.
Branch: `codex/task166-customer-whatsapp-local`; worktree: `D:/DIR3COM-task166-customer/2026-10-08/dir3com2`.
PR: none. Independent reviewer: unassigned. Author checks are not independent review or security approval.
PR191 and its separate acceptance owner/branch are untouched.

## Existing boundary completed

Task166's original subscription, consent/contact eligibility, atomic event capture, outbox, lease fencing, shared daily budget and WAMID/monotonic receipt pipeline are reused. The later operations-only adapter/SQL gate is extended to explicit customer categories. No lifecycle, second queue, backend, enrollment, scheduler, free-text message or historical event backfill is added. No price, contact details, private notes or acceptance token is placed in the template parameters.

The forward source `20261008115500_drive_whatsapp_customer_categories.sql` adds empty `customer_actions` and `customer_template_languages` allowlists. Existing `capture_enabled` and `send_enabled` remain required. The shared private category predicate preserves the operations recipient/language gate and is checked at capture, claim and begin-send. Existing `eligible` derives customers from the authoritative request owner, active profile, matching verified contact and enabled documented-consent subscription. Begin rechecks ownership, consent, captured contact/language, current request status, quote validity, freshness, lease, kill switch and budget. Existing unique event/channel/recipient/phone constraints and signed WAMID receipts remain unchanged. Historical migrations are immutable; the new file has a separate registered hash and `production_apply_authorized: false`.

No SQL is applied by this local task. A separately authorized future deployment must apply the registered original outbox, operations forward and this customer forward in order. The source files do not activate any switch or create a subscription.

## Explicit runtime/template contract

`DIR3COM_WHATSAPP_CATEGORIES` is now an exact comma-separated subset of `operations.created`, `customer.created`, `customer.review`, `customer.confirm`, `customer.decline`, `customer.customer_accept`. Empty, duplicate, whitespace-padded or unknown values fail closed. Every selected category requires at least one valid approved language template; undeclared template categories and mismatched language codes fail closed. Existing operations-only configuration still works. New customer categories are absent by default.

`DIR3COM_WHATSAPP_KAPSO_TEMPLATES` keys are `<category>.ar` / `<category>.en`, each containing only `name` and `languageCode`. Arabic requires `ar`; English requires `en`, `en_US` or `en_GB`. A customer row uses only its exact category/language, never an operations or other-status template. Configured names do not prove provider approval. No remote templates are created or submitted.

Each approved provider template uses exactly two body text parameters: `{{1}}` request reference and `{{2}}` the authenticated customer link `/my-requests/<reference>/drive?language=<ar|en>`. The existing destination enforces session authentication plus an explicit request-owner predicate and RLS. Operations retains its Operations link. The worker accepts no recipient/message overrides.

Required AR/EN template meaning for later provider approval (copy contract, not sent free text):

| Category | Authoritative state | Arabic | English |
| --- | --- | --- | --- |
| customer.created | request_submitted | تم استلام طلبك {{1}} وهو بانتظار المراجعة. الطلب ليس حجزًا مؤكدًا. التفاصيل: {{2}} | We received request {{1}} for review. This is not a confirmed booking. Details: {{2}} |
| customer.review | under_review | طلبك {{1}} قيد المراجعة. الطلب ليس حجزًا مؤكدًا. التفاصيل: {{2}} | Request {{1}} is under review. This is not a confirmed booking. Details: {{2}} |
| customer.confirm | awaiting_customer_acceptance | عرض السعر لطلبك {{1}} جاهز وبانتظار موافقتك ضمن مدة صلاحيته. هذا ليس تأكيد حجز. راجع العرض: {{2}} | The quote for request {{1}} is ready for your acceptance within its validity period. This is not a booking confirmation. Review: {{2}} |
| customer.decline | declined | تعذّر المضي في طلبك {{1}}. راجع التفاصيل: {{2}} | We could not proceed with request {{1}}. Details: {{2}} |
| customer.customer_accept | awaiting_payment | سُجّلت موافقتك على عرض الطلب {{1}}. الدفع غير مفعّل ولم يتأكد الحجز. التفاصيل: {{2}} | Your acceptance of the quote for request {{1}} was recorded. Payment is not enabled and the booking is not confirmed. Details: {{2}} |

`confirm` is the existing quote event name, not supplier confirmation. Provider HTTP acceptance is not customer delivery. Ambiguous HTTP outcomes stay unknown; no blind resend or phone-only WAMID association is introduced. Signed receipt verification remains available when outbound is disabled, with unchanged sender/recipient/WAMID matching and monotonic states. Runtime/template and private DB allowlists must match in a future approved activation; misalignment fails closed and can leave a claim unsent until its lease expires.

## Review and verification limits

The TypeScript tests execute actual adapters/API/UI modules with synthetic RPC/HTTP boundaries. Their failed-network guard prevents real provider calls. They cover all five customer actions in AR/EN, exact category templates/links/recipients, off/authorization gates, invalid claims, RPC rejection before transport, durable send intent/duplicate worker rejection, WAMID acceptance and ambiguous response handling. Existing request and quote tests cover auth/payload/status handling. These mocks do not prove SQL ownership, consent, RLS, concurrency or WhatsApp delivery.

The actual PostgreSQL harness extension tests customer defaults, ownership (including another customer sharing the same phone), consent/contact/profile checks at capture and begin, unauthorized reviews/acceptance, request/acceptance dedup, truthful review/quote/decline/acceptance transitions, stale status and expired quote suppression, category/language revocation, WAMID/sender/recipient matching, monotonic/deduplicated receipts, crash handling, private helper privileges, retained RLS and two-worker fencing when PostgreSQL is supplied. It is source-ready and syntax-checked, not executed here: PGlite is unavailable and no migrations, database startup, Docker restart or remote database operation is authorized. Independent functional/security review and real isolated PostgreSQL execution remain required before any release recommendation.

No push, PR, Actions rerun, merge, deployment, settings/secrets/permissions/subscription/billing changes or real sends occur. Precise local command results and final SHA are in the external handoff/verification folder so the committed source does not claim later evidence in advance.
