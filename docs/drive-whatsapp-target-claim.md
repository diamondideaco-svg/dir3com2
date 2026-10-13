# Single request WhatsApp dispatch

This server route supplements the existing worker. It does not activate WhatsApp,
process the old queue, enroll recipients, confirm a booking or enable payment.

POST /api/internal/drive-whatsapp/dispatch-target requires the existing worker
Bearer secret, enabled runtime configuration and application/json. The bounded
body contains exactly requestId, outboxId, recipientUserId, category and language.
UUIDs use their canonical lowercase form. Categories and languages use the
existing Kapso allowlist. Do not send phone numbers, credentials or customer notes
in the body. The database selects the stored verified recipient.

The service-only claim RPC matches all five identifiers and locks the existing
settings row before locking that outbox row. It never selects an alternative row
or updates expired leases elsewhere. Only a pending row with zero attempts, no
provider ID and no lease can be claimed. A missing/mismatched target yields idle.
A missing runtime template yields not_sent before the claim.

The dispatcher independently verifies the returned identifiers. It then calls
the shared begin_kapso_drive_whatsapp function, preserving current consent,
profile/EG grant, category, status, trip/quote expiry, 24-hour freshness, daily
budget and database kill-switch checks. The existing fixed Kapso template
transport and finish/receipt RPCs persist and correlate the WAMID.

HTTP acceptance is not delivery. Reuse the signed webhook evidence for delivery;
Rami's response, quote and customer acceptance still require real human actions.

If a claim response, network response or completion write is uncertain, inspect
the durable row under separately approved access. Do not repeat dispatch, invoke
the generic worker, reset leases or requeue sending/unknown/accepted rows.
The targeted claim never automatically reclaims even an expired claimed row.
This favors avoiding duplicates over automatic recovery.

## Local acceptance

The fixture creates and drops a uniquely named database, and accepts only the
explicit localhost fixture URL already checked by the PostgreSQL test runner.
It never loads production credentials. Supply DRIVE_WHATSAPP_TEST_DATABASE_URL
for the isolated fixture at localhost port 5432 or 54339, database dir3com_test.

Commands:

- node scripts/test-drive-whatsapp-postgresql.mjs
- node --import tsx --test tests/kapso-drive-whatsapp.test.ts tests/drive-whatsapp.test.ts tests/operations-notifications-contract.test.ts tests/server-binding-diagnostic.test.ts
- npm run lint
- npm run typecheck
- npm run build

The PostgreSQL runner invokes the target acceptance helper only with a real
local PostgreSQL fixture. Its PGlite-only mode reports the concurrent target
acceptance as SKIP. CI uses the real fixture and exercises both workers through
the actual dispatcher with a fake fetch transport.

Coverage includes unchanged older pending/expired claimed/expired sending and
accepted rows; missing and mismatched targets; one claim/send across independent
connections; accepted replay; response and persistence loss; revoked consent and
grant; stale event/trip/quote/status; exhausted budget; both kill switches;
post-claim consent/kill changes; wrong and duplicate receipts; monotonic status;
service-only execute privileges and retained RLS.

## Separate production gate

The forward migration is source-only until separately approved for application.
It creates one service-only RPC, without changing table grants, RLS policies,
settings, subscriptions or existing functions. Deploying code, applying this
migration, changing configuration and authorizing a live send are separate
actions. Existing production-access refusals remain effective.
