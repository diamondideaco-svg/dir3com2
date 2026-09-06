# Trusted partner activation — Control decision v14.3

Base: `7f6b68a4a1409e56ed84eb7d0b551f6c239c13d6`.

`approved` is not operational and is not trustworthy evidence by itself: the old
profile PUT accepted it from self-service input. `active` remains the operational
state for request RPCs and assignment. There is no data backfill or automatic
activation in this change.

## Activation contract

The existing admin partner detail page exposes a separate, bilingual attestation
form only for canonical admins and approved partners. A required review note,
unchecked confirmation checkbox, and final confirmation precede submission.
Staff activation is not delegated: all staff, including country-scoped and
globally granted staff, are denied. Existing country-scoped read access is unchanged.

`activatePartnerAction` calls `requireAdminActionAccess()` and uses its authenticated
Supabase client, never the service-role client. The new RPC derives its actor from
`auth.uid()`, rejects non-authenticated database roles, locks and revalidates the
active/non-deleted canonical admin and the active/non-deleted partner profile,
and locks the non-deleted partner record. Both the exact expected `approved`
state and `updated_at` must match. The timestamp prevents stale form/ABA reuse.

The RPC changes only partner status/update time and inserts `partner.activated`
into existing append-only `audit_logs`. The authenticated actor, partner ID,
old/new state, prior update time, confirmation, review note, optional reference,
and audit timestamp are recorded together. Any failure rolls back the whole RPC.
Existing audit RLS, grants and append-only protections are not changed.

Profile PUT ignores all client lifecycle fields and omits status from UPDATE,
including legacy `reviewStatus`. This preserves current status even during a
concurrent activation. The selector is removed from partner self-service UI.
Request GET/POST map exact existing actor-denial errors to `403 PARTNER_NOT_ACTIVE`;
unrelated database failures remain 500, and foreign requests remain 404.

## Deployment and review

Forward-only function migration:
`20260906034500_partner_trusted_activation.sql`.
Requires the already-merged operations reconciliation and PR93 migration chain.
Apply only after independent review/merge and separate Production authorization.
This PR neither applies the migration nor activates any Production partner.

No operational RPC accepts `approved`; no grants, users, products, DABRA or supplier
inventory are changed. A later human admin must explicitly attest and activate
each eligible partner. Rollback can remove access to the new function/control;
do not undo historical audit events or bulk-change partner statuses.

## Focused verification

- `node --import tsx --test tests/partner-trusted-activation.test.ts tests/partner-requests-client-load-state.test.ts tests/partner-portal-auth-boundary.test.ts tests/partner-portal-tenant-isolation.test.ts tests/admin-partner-operational-lifecycle.test.ts`
- `node --conditions=react-server --import tsx --test tests/admin-partner-authorization-runtime.test.ts`
- `node scripts/test-partner-activation-postgresql.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build -- --webpack` (local linked dependencies are outside Turbopack's inferred root)

The PG test uses a new random database inside the existing local PostgreSQL 17
container only, replays the PR97/six-PR93 chain and this migration, and drops only
its own disposable database. No Production/UAT URL or credential is accepted.
It proves authorization and attestation denials, lifecycle/stale conflicts,
atomic rollback after an injected audit failure, append-only protection,
successful activation, and real two-owner request isolation.

Independent security review and authenticated Preview UI verification remain
release gates; local unit/PG evidence is not Production activation or merge approval.
