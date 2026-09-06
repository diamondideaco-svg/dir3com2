# Notifications permissions reconciliation

Base: `1cec8f4d5998ef0bc6967ad7fe6da06216bc27a0`.
Migration: `20260906025749_notifications_production_grants.sql`.
This PR does not authorize Production application or the pending PR93 chain.

## Evidence and minimum runtime contract

Read-only Production preflight found service_role SELECT/INSERT denied and
TRUNCATE granted to anon/authenticated/service_role. A read-only SELECT under
service_role reproduced PostgreSQL 42501. Existing RLS does not supply table
privileges. No Production write or migration was performed.

- `lib/actions/operations-actions.ts:getOperationsSummary` calls the guarded
  server client and reads notifications: service_role SELECT is required.
- `createNotification` calls `requireAdminReadAccess`, which first requires a
  canonical administrator and then returns `supabaseAdmin`.
- `lib/operations/operations-engine.ts:createNotificationRecord` validates the
  payload, resolves an active undeleted recipient, and does INSERT RETURNING:
  service_role INSERT and SELECT are required. This is in-app creation, not
  evidence of external delivery. The existing admin guard is unchanged.
- Repository-wide current-runtime search found no notification UPDATE/DELETE
  consumer and no authenticated/anonymous direct read/write consumer. No new
  grants are justified for those roles. Historical migrations and old RLS test
  fixtures are not evidence of current runtime privilege requirements.

Only service_role receives SELECT/INSERT. PUBLIC and the three application-role
table grants are revoked, including TRUNCATE, REFERENCES and TRIGGER. No
UPDATE/DELETE/TRUNCATE privilege is added. Effective inherited privileges are
checked; incompatible role inheritance or column ACLs abort without changing
roles or silently repairing unrelated objects.

The transaction uses a bounded exclusive lock and validates the observed
ordinary-table shape, owner, RLS flags, columns/nullability/defaults, PK/FK/checks,
indexes, exact policy expressions and trigger contract before any grant. Unknown
contracts raise `NOTIFICATIONS_GRANTS_*_CONFLICT`. The migration creates no
table/function/policy and changes no rows, columns, indexes, policies or triggers.

## Focused verification

```
node --import tsx --test tests/operations-notifications-contract.test.ts
node scripts/test-notifications-grants-postgresql.mjs
node_modules/.bin/eslint.cmd scripts/test-notifications-grants-postgresql.mjs
git diff --check
```

The PostgreSQL runner deliberately requires the existing local Docker container
`dir3com-pr93-pg17` and PostgreSQL 17. It accepts no remote connection URL or
credentials, creates a uniquely named disposable database, and removes only
that database in finally. It does not start Docker or modify existing users.
Run this focused replay explicitly; it is not part of `test:all`.

The runner reproduces missing SELECT and INSERT before migration, exercises the
actual summary/notification functions through a PostgreSQL-backed query adapter,
and verifies required SELECT/INSERT RETURNING after migration. Other summary
relations are local empty fixtures: this proves the notification ACL blocker is
removed, not that Production's still-pending operations relations are present.

It covers twelve rollback/fail-closed cases (missing relation/PK/id default,
nullable title, extra column, disabled RLS, changed policy, extra constraint,
extra index, disabled trigger, column grant, inherited privilege), an idempotent
replay, admin-guard denial, exact effective privilege matrix, actual forbidden
TRUNCATE/UPDATE/DELETE/INSERT/SELECT statements and preservation of a nonempty
baseline row, schema, policies and trigger. No destructive probe runs remotely.

Production permissions remain unchanged until a separately approved release.
After approval, apply this migration before rechecking the PR97 reconciliation
and six PR93 migrations; never use blanket db push or the legacy operations
migration. Do not reverse this fix by restoring TRUNCATE. Unexpected conflicts
require investigation and a reviewed forward fix.

Reference: [PostgreSQL 17 GRANT](https://www.postgresql.org/docs/17/sql-grant.html)
and [Supabase database roles](https://supabase.com/docs/guides/database/postgres/roles).
