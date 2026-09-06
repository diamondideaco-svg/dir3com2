# PR #93 operations / notifications reconciliation

Baseline: `e45d64266c4003a1ce6394d1fe6cdd8d2312bfe9`.
This patch does **not** authorize Production application, merge, or deployment.

## Existing notifications contract remains authoritative

Production inspection found `id`, `profile_id`, required `title`, nullable `body`,
`kind` (info/booking/promotion/system), `read_at`, `status`
(active/read/archived), `deleted_at`, `created_at`, `updated_at`.
RLS is enabled with recipient-owned access and existing service-role access.
The new migration performs no operation on this table, its ACLs, policies,
indexes, constraints or data. The replay includes a preserved nonempty row,
not just the currently empty Production table.

`createNotification` still requires canonical admin authorization. Only then
does it use the existing server client, resolve an active undeleted recipient
profile, and insert an in-app notification with required title and active state.
`profileId` denotes an admin-selected recipient, never actor authority.
Unknown delivery fields are not stored. The unused provider registry is removed.
`sendNotification` remains guarded and returns `NOTIFICATION_DELIVERY_UNAVAILABLE`
without DB/provider activity. Creating an in-app notification is not delivery.
The admin list uses title. The executive failed-delivery metric is unavailable,
not an invented zero. No live delivery channel is activated by this work.

Neither notification_templates nor notification_logs has a remaining runtime
consumer; neither is created. Historical migrations remain immutable and are
not proof that current code requires their obsolete delivery contract.

## Operations contracts and access

- audit_logs: UUID id, required text entity_type/entity_id/action, JSONB
  old_values/new_values, text performed_by/ip_address, required timestamp.
- activity_timeline: UUID id, required text entity_type/entity_id/event_type,
  nullable summary, JSONB metadata, text performed_by, required created_at.
- system_events: UUID id, required event_name, optional entity_type/entity_id,
  JSONB payload, source, required created_at.

All three have RLS + FORCE RLS. Inherited table privileges are revoked first.
Authenticated SELECT/INSERT is intentional: current operations-actions uses
the authenticated client and INSERT RETURNING. Policies require an active,
undeleted canonical admin (including the existing super_admin alias).
Audit/timeline inserts additionally require performed_by = auth.uid().
Customer, partner, scoped staff, inactive and deleted admin access is denied.
The existing guarded server summary requires service-role SELECT only; it gets
no INSERT/UPDATE/DELETE/TRUNCATE. No new service actor attribution path exists.
Update/delete/truncate triggers protect the append-only operations records.
No policy or grant is added to any existing business relation.

## Future operator order — independent approval required

Do not run the legacy `20260730210000_create_operations_engine.sql` wholesale:
its notifications contract conflicts with Production. Do not use blanket
`db push --include-all`, fabricate history entries, or change old SQL files.
On a separately authorized release, inspect pending history and schema first:

1. `20260906013832_reconcile_pr93_operations_notifications.sql`
2. `20260903234500_admin_product_lifecycle_and_request_handoff.sql`
3. `20260903234600_partner_request_handoff.sql`
4. `20260903234700_drop_legacy_admin_handoff_rpc.sql`
5. `20260904004000_harden_admin_partner_authorization.sql`
6. `20260905160435_reconcile_admin_partner_lifecycle_safety.sql`
7. `20260905161554_reconcile_phase0_lifecycle_insert.sql`

The new timestamp is not backdated. This is an explicitly selected prerequisite
followed by all six canonical PR93 migrations in their original order, not a
claim that the entire historical repository chain is Production-compatible.
Unexpected existing operations column or policy contracts abort the transaction.
Do not retry an already-applied reconciliation: inspect migration history.
No destructive rollback is supplied; later corrections require a reviewed
forward migration preserving newly collected events.

## Evidence commands

- `node --import tsx --test tests/operations-notifications-contract.test.ts`
- `npm run test:admin-partner-lifecycle-postgresql` using only the existing
  localhost disposable test database contract.
- `npm run typecheck`, `npm run lint`, repository CI.

The PostgreSQL runner creates its own temporary database. It replays the new
prerequisite, all six PR93 migrations and existing lifecycle/tenant/atomicity
assertions; then verifies notifications schema/ACL/policy/data preservation,
all three operations insert/read shapes, admin actor binding, nonadmin denial,
service-role read-only grants and append-only protections. Production and the
shared UAT backend are never replay targets. No DABRA implementation is changed.
