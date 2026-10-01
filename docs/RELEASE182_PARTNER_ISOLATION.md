# Release 182: partner request boundary correction

Owner: Codex Desktop. Task #182 / PR #183. Date: 2026-10-01.
Reproduced against `8e11abbed33d8ac76f2dc61df7278441610c7dcf`.
Final SHA and independent decisions are recorded in the Task/PR, not inferred here.

## Historical findings

**P0 confirmed locally:** the baseline protected request read and handoff RPCs
authorize using only a current `product_availability` association. Two active
partners mapped to one product can read the same customer requests. Before a
handoff exists, either can claim it. The newer durable asset ownership migration
does not replace these two request RPCs. No Production exploit was attempted.

The forward migration adds immutable `partner_owner_id`, derived server-side at
request insertion only when exactly one mapped, active, non-deleted partner and
profile exist. Client-supplied ownership is rejected. Both RPCs now require this
binding AND the existing active actor/product association. Profile or partner
deactivation/deletion fails closed. Caller identity is still derived by the API
from authenticated server context; RPC execution remains service-role-only.

Shared/unmapped products and old requests remain unassigned and unavailable to
partners. **No historical backfill is inferred from mutable mappings or prior
handoff events.** This intentionally restricts legacy partner visibility pending
an explicitly reviewed assignment process; no automatic reassignment is added.
Operations/customer access contracts are unchanged. Managed Drive requests with
NULL product_id remain Operations-only, including the accepted Release182 QA
request, which was neither replayed nor modified.

**Handoff truth finding not reproduced in the current UI:** recording a handoff
is distinct from opening a manual WhatsApp link and from actual delivery. The
existing handler retains a recoverable canonical link and surfaces popup, refresh,
network and unrecoverable legacy errors. It makes no WhatsApp send request.
The new runtime tests execute that exact handler extracted from its TypeScript
AST, with network/window mocks only inside tests. No user-facing fixture or
replacement inventory is introduced. No application UI change was necessary.

## Verification

- Native PostgreSQL 17.11, loopback-only disposable databases, no Production URL.
- New isolation harness: 43 checks, including red reproduction before applying
  the forward, cross-partner/customer owners, ambiguous and forged ownership,
  mapping revocation, deleted/inactive actors, role grants, simultaneous claims,
  immutable replay, one event and rollback on audit insertion failure.
- Real UI handler: 14 AR/EN tests; existing request-load tests: 8. All pass.
- Existing authorization-runtime tests: 3 pass.
- Migration cutover: 9 pass; manifest and migration safety pass.
- Previously blocked database test files now pass: 64 tests across assignment,
  CEO identity/RLS, customer activity/documents, DABRA observability, Marketplace
  schema and schema compatibility. DIR120: 20 cases pass. Existing durable owner
  and historical Admin/Partner lifecycle runners also pass. The historical runner
  is not substituted for the new forward-specific harness.
- Existing 1442 non-database tests retained; focused counts overlap and are not
  added to that total. New handler tests are additive. No accepted Drive QA repeat.
- CI now explicitly runs the new PostgreSQL harness; no existing check removed.

## Release boundaries

Migration `20260930232429_partner_request_owner_boundary.sql` is **not applied to
Production**. It is a new forward, not an edit to an applied migration. Registered
hash is in `docs/post-cutover-migrations.json`, authorization remains false.
Historical rows, catalogue, prices, booking/payment and supplier state are not
rewritten. Rollback is transactional on failure; do not restore vulnerable RPCs
as an automatic rollback or assign legacy ownership without approval.

The previous sealed security scans do not cover this delta. Exact-final-SHA
functional/security review, Sandbox, Preview and governance are separate gates.
The ChatGPT reviewer identity must not be aliased to bypass policy. Authenticated
deployed seven-provider proof remains separate from isolated handler evidence.
