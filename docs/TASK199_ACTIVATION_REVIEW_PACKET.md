# Task199 local repair: review and separate approval packet

This is a review packet, not an execution instruction or live authorization. Owner: Codex Desktop / Engineer A. Branch: `codex/task199-kapso-contract-local`. Base: `3816dd47773aca963be18822aeb9ec35a02725ce`. No new PR, push, merge or Production change is part of this local task. Exact candidate commit and independent review receipts accompany the handoff.

## What the candidate changes

The existing server sender and target route remain the delivery path. A database execution window now binds one request UUID, outbox UUID, recipient UUID, category, language and sending phone ID. Claim and final send intent serialize through settings/window/outbox locks. The intent is durable before provider I/O; ambiguous results never regain send eligibility. The generic queue and capture trigger return without changing old rows in the default `target_only` mode. There is no enrollment or backfill in the migration.

Raw-byte HMAC verification precedes callback parsing. Only normalized WAMID/status/delivery-key hash metadata is retained, scoped to the active started window and exact sender/recipient. An early receipt can be acknowledged after durable ingestion, but it is not attributed to an order until the persisted provider response supplies the same WAMID. Duplicate processing is idempotent and delivery progress is monotonic. Callback body/RPC work has a maximum six-second application deadline, with database lock and statement limits. No message content, raw header, secret or conversation record is stored.

The helper is reviewable library source with no human window or executable entry point. Its fake-only test binary is distinct. It uses explicit inactive `kapso` / `v2` creation metadata, bounded complete pagination, and a separately approved project/phone/internal-ID identity record. A hash pins that record; it does not prove its truth. No real identity map or new creation authorization is supplied. Historical Unknown and consumed approval ledgers remain unchanged and still block reuse.

## Local evidence

| Check | Evidence and scope |
|---|---|
| Current sender/receipt tests | 40 passed before the final cancellation hardening; the affected bounded callback suite then passed all 10 tests, including a non-settling stream cancel. No provider network. |
| Helper contract | 10 scenarios / 138 assertions passed; zero provider calls, real marker access, secret reads or windows. Artifacts: `D:/DIR3COM-task199-local-validation/helper-20261016-01`. |
| PostgreSQL | 357 assertions passed, including 73 existing target and 75 new bounded assertions; two real PostgreSQL connections, fake provider. `D:/DIR3COM-task199-local-validation/pg-20261016-02/acceptance.log` and `result.json`. |
| PostgreSQL fixture | Existing 17.11 runtime, fresh D cluster, loopback port 5432; no Windows service, old cluster or occupied 54339 listener changed. Owned test server stopped. |
| Domain transition | Synthetic future request, separate synthetic operations/customer actors: review, quote, customer acceptance, `awaiting_payment` / `payment_not_enabled`. No booking/payment or real Rami action. |
| Repository gates | Final lint/typecheck/build receipts are recorded separately in the handoff; uncompleted gates are not PASS. Build uses synthetic environment, blocked external networking and local font fixture, so it is not live deployment QA. |

The new PostgreSQL suite is invoked by `scripts/test-drive-whatsapp-postgresql.mjs` when the strictly allowlisted local database URL is provided. The all-tests runner now explicitly includes the bounded callback suite alongside its existing TypeScript tests. Reproduce the focused checks without real credentials:

```text
node --import tsx --test tests/kapso-drive-whatsapp.test.ts tests/kapso-bounded-contract.test.mjs
powershell.exe -NoProfile -File tools/kapso-webhook/Test-Contract.ps1 -ArtifactDirectory D:/DIR3COM-task199-local-validation/<new-helper-artifact-directory>
node scripts/test-drive-whatsapp-postgresql.mjs
```

The last command requires an explicitly isolated localhost PostgreSQL fixture via `DRIVE_WHATSAPP_TEST_DATABASE_URL`; it must never receive a Production URL. Without that fixture, it does not provide concurrent acceptance. Test setup owns only its fresh random database. Do not run fixture SQL against existing data.

## Separate approvals and prerequisites

| Stage | Exact action / prerequisites | Current evidence boundary |
|---|---|---|
| Restricted Production read | Resolve the existing access refusal using its actual tool approval surface; bounded request/account/settings/recipient/template/outbox inspection only. | No tool/refusal identifier has been established here. No retry or alternative channel is authorized by this packet. No demonstrated approval path currently. |
| Identity policy | Independently verify Kapso project `5414ecf3-199f-4b66-9fac-9ea5233b98ce`, phone `1205896545944230`, and its internal UUID; approve the exact record hash and policy reference. | Parser/fake proof only. A Task URI, phone GET or locally calculated hash alone does not establish project membership. |
| Source publication | Synchronize authoritative Task199 owner/review/branch/exact SHA and required governance, then separately authorize publication. | Remote governance and new PR state unverified. Prior PR200 approvals do not cover this candidate. |
| Production SQL | Apply only `supabase/migrations/20261015212723_task199_bounded_whatsapp_execution.sql` after exact-SHA review, prerequisite-function/schema parity, backups/forward recovery and separate SQL approval. | Local file SHA256: `9784f06bd873048efd725dee78549198ac5330c245b0047d80874c244b04a247`. Never applied to Production here. |
| Provider webhook | Reconcile the historical Unknown create outcome and consumed successor; establish resource identity/exact v2 receipt and separately authorize any new provider operation. | No reset, fresh approval marker, GUI, secret input or provider call supplied by this patch. |
| Bounded activation | Confirm current recipient authority/explicit WhatsApp consent, approved template metadata, budget and future request eligibility. Approve exact tuple/window and expiry (maximum ten minutes), webhook ID and approval reference. | The real request is now past its requested time. It was not retimed, renewed, replaced or enrolled. |
| One target row | Separately approve creation of exactly one missing outbox row from the verified original event, if needed; preserve original event/outbox age and uniqueness. Existing pending row must be reused. | No runtime function manufactures a fresh event or refreshes an expired row. No broad capture or old-queue dispatch. |
| Runtime / DB activation | Runtime: `DIR3COM_WHATSAPP_ENABLED`, categories exactly `operations.created`, exact approved `operations.created.ar` template and actual REST parameter names if named. DB: `dispatch_mode='target_only'`, selected `active_window_id`, `operations_recipient_user_id`, approved language/category switch, `send_enabled`, existing limits. Sender ID and three existing secrets must already match; do not expose/recreate them. Keep capture off; never set `general` for this trial. | No flag or secret changed. Opening a window does not enable sending/category/capture. Any category/recipient/consent changes need their own concrete approval. |
| Stop / deactivate | Authenticated stop route and `expire_kapso_drive_whatsapp_window()` close outbound eligibility. Assign a separately approved watchdog/operator and exact provider webhook deactivation action; verify its result. | Deadline gates prevent new send intents after expiry. No scheduler installed. `deactivation_required` is pending provider work, not proof of deactivation or cancellation of in-flight sends. |
| One real journey | After all gates, invoke only the exact target route once; ambiguous result means reconcile, never resend. Record WAMID and matching durable delivery, real Rami reply/quote, then real owner acceptance/domain state. | No real WAMID, delivery, Rami response, quote or customer acceptance exists in this local evidence. Payment remains prohibited. |

Supabase Production identity remains `ynupwivgvwcyrsdhtkcc`. It is separate from the Kapso project UUID above. The selected real request remains `REQ-A66256DE90DF1824CB96` / `9127ab7c-2d1f-4279-9c61-d5d97260e14f`. This packet does not infer present eligibility from saved identity evidence.

## Whole-solution Kapso review handoff

Control Tower owns vendor coordination. Review this candidate and its source/tests, rather than the superseded diagnostic-only helper. Confirm the explicit `whatsapp_webhook` v2 inactive body and exact receipt fields; phone/list envelopes and pagination; the acceptability and source of the separately pinned identity record; unbuffered signed callback shape and opaque delivery-key semantics; the early-callback/exact-WAMID reconciliation model; actual approved template parameter naming; and the concrete authenticated webhook deactivation contract and delivery timing. Do not infer idempotent create from an empty GET, and do not retry a creation with an unknown outcome.

Acceptance of source, local tests or vendor contract review does not authorize Production reads, SQL, flags, provider resource mutation or a new creation attempt. Those remain distinct decisions with bounded targets and evidence.
