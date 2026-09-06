# PR101 duplicate resolution evidence / proposed baseline cutover

## v16.3 current status — repository cutover implemented

The approved archive-only resolution is implemented without changing historical SQL.
All 45 Git blobs are preserved under supabase/migrations-archive; the active path has
only B and the three pending forwards. Archive-aware guards, actual isolated CLI
dry-run/application, and transactional adoption crash/recovery have execution evidence.
See the current adoption runbook. Production and Production history remain untouched.
Earlier sections below are chronological evidence, not the current implementation state.

## v16.0 current status — supersedes the v15.9 capture stop below

Direct authorized read-only Production catalog capture is now stored in
production-schema-capture-2026-09-06.json; local CLI linkage is not required for this
source. Both named indexes are VERIFIED_PRESENT. The review-only baseline checkpoint
is 20260903215959; see the updated adoption runbook and cutover plan for isolated
parity/forward proof. Active migrations and historical SQL remain unchanged.
The v15.9 section below is retained as historical task evidence, not a current blocker.

## v15.9 source qualification update

Option A design is authorized, but activation and implementation readiness remain NO.
Read-only Production checks confirmed 47 history rows, 50 public tables, absent
customer_documents and trusted activation, and service_role TRUNCATE still present
on dabra_provider_attempts. The old public-only dump below is incomplete for today's
baseline: it lacks current operations/product-audit/handoff tables. Its containing
workspace is now linked to UAT, so the filename alone does not certify its source.
Its earlier object comparisons remain preserved-snapshot observations only.
See PRODUCTION_BASELINE_ADOPTION_RUNBOOK_2026-09-06.md for the Phase 4 hard stop.

Owner: Codex Desktop, v15.7, 2026-09-06. Target:
`8e8e30cf5db45c87688c0ec276c1dc6d2c7a6cfb`.
Decision: **SAFE RENAME NOT PROVEN**. Keep PR101 DRAFT and both SQL files unchanged.
This document proposes a separate mechanism; it does not activate it or authorize repair.

## Provenance

Available local/remote Git refs were searched with `git log --all --follow` and
path/pickaxe searches. Neither path has a subsequent edit or rename in that history.

| File | Original creation | Current and original Git blob | Original PR |
| --- | --- | --- | --- |
| 20260808120000_dgr055_canonical_profile_provisioning.sql | 9e539b10b28627d700fd11c5c123f307352d70cc | bd771a97db5f463c830fd9b6fa11b77c3dcefdca | #8 |
| 20260808120000_dgr059_partner_documents_runtime_grants_and_owner_policies.sql | a4e66b83d2f565e92637cd4f4d6079ed28d36721 | eff1b48c7e5e4e35f193541bd62dde714dfbc2e9 | #13 |

Both also appear as additions in `b32cc8278612135907a8df8255ee56e18aea688b`.
[PR8](https://github.com/diamondideaco-svg/dir3com2/pull/8) reports staging trigger,
missing-profile backfill and disposable-user validation, with no Production writes.
That is historical staging execution testimony, not timestamp/history proof for Production.
[PR13](https://github.com/diamondideaco-svg/dir3com2/pull/13) has no body/evidence of execution.
Repository runbook searches find the existing PR101 provenance report; the local QA
bootstrap also recreates owner insert policy, which is not evidence of remote execution.

The preserved 47-row Production history has neither version 20260808120000 nor an
exact normalized body match for either file. No recorded statement mentions either
provision_profile_for_auth_user or partner_documents_owner_insert. Four historical
records have unavailable/empty SQL. Manual execution and deleted history therefore
remain UNKNOWN, not disproven. No complete independent UAT migration-history export
was established from the known local schema/QA artifact directories.

## Snapshot equivalence, not live verification

Preserved schema: `C:/Users/dell/AppData/Local/Temp/dir3com-pr93-schema-2aafc9adb0154f708abd2592917f6a21/prod-public-schema.sql`.
SHA256: `5A5C01262A013794949091A857C778D76E4665C3967EE5C2EC89353C2574AAAF`.
The separate history backup/hash is documented in the main reconciliation report.

- DGR055: **UNKNOWN overall**. Function body is exactly equal after CRLF normalization
  and outer trimming. Owner profile policy uses id=auth.uid() in both predicates.
  The public-only dump cannot establish the trigger on auth.users. It contains no
  row data, so the missing-profile count/backfill consequence remains unknown.
- DGR059: **SUPERSEDED grants / CURRENTLY REPRESENTED owner policies in this snapshot**.
  Owner SELECT and INSERT predicates equal partner_id=auth.uid(). Snapshot grants
  authenticated SELECT only and service_role ALL. Canonical 20260827155608 explicitly
  revokes all authenticated document privileges then grants SELECT. Reapplying DGR059
  grants authenticated column INSERT, including status/verified/verified_at, again.
  A surviving INSERT policy alone is not effective INSERT permission.

These are preserved-snapshot conclusions, not a fresh Production certification.

## PostgreSQL 17 experiments

Harness: `C:/Users/dell/AppData/Local/Temp/pr101-v157-probe.mjs`.
Existing local container only: dir3com-pr93-pg17. Ten unique disposable databases
were created and dropped by the harness; no remote credentials or data were used.
Neither repository migration was renamed or edited.

A models DGR055 followed by DGR059; B models the reverse, with a hypothetical unique
adjacent ordering slot rather than inventing an authoritative timestamp.

| Case | Strategy A | Strategy B |
| --- | --- | --- |
| Exact full canonical replay from fresh PostgreSQL 17 | BLOCKED at first migration | Same |
| Focused schema: neither historical effect | SQL executes; safety REJECTED | Same |
| Focused schema: both historical effects | SQL executes; safety REJECTED | Same |
| Focused schema: only DGR055 effect | SQL executes; safety REJECTED | Same |
| Focused schema: only DGR059 effect | SQL executes; safety REJECTED | Same |

Full replay stops in 20260730120000_create_core_schema.sql at CREATE POLICY IF NOT EXISTS:
PostgreSQL reports syntax error at or near NOT. No historical SQL was rewritten to pass.
Later full-chain behavior is untested, not PASS.

Focused fixtures use exact canonical table definitions plus explicit later-schema
document columns; they are counterexamples, not a claimed complete canonical replay.
Each state receives the current canonical hardening boundary and one synthetic auth
user without a profile. Applying the candidate SQL order changes profile count 0→1
and authenticated INSERT(status) false→true in all eight cases. A second application
preserves the existing profile row and has no duplicate-object error. This proves
syntactic idempotence is insufficient: backfill DML and ACL regrant remain effects.
No destructive row rewrite was observed in these fixtures; comprehensive trigger/
policy parity for the full chain is blocked. A late timestamp is particularly unsafe
because it would run the grant after its revocation. An early slot also lacks full
replay proof and can rerun backfill against partially represented environments.

## History consequence

[Supabase db push documentation](https://supabase.com/docs/reference/cli/supabase-db-push)
describes version-based tracking in schema_migrations and applying untracked migrations.
A rename does not prove SQL equivalence or transfer execution history to the new version.
When the remote lacks 20260808120000, both candidate versions remain unrecorded;
older unrecorded migrations may require explicit include-all rather than default push.
If one body ran manually, absent history still cannot distinguish it from unexecuted SQL.
If the original version is recorded, a new version can still run the moved body again.
No push, repair, or history manipulation was attempted.

## Proposed next PR / mechanism — separate approval required

1. Create a dedicated **migration baseline cutover** PR after Control Tower authorization.
   Archive the entire ambiguous legacy chain byte-for-byte with checksums, original
   filenames, commit provenance and per-environment evidence; do not delete evidence.
2. Build a reviewed, unique-version fresh-install baseline reflecting the authoritative
   current schema/RLS/grants. Keep fresh-install and existing-environment adoption paths
   separate. Do not execute legacy backfill or grants merely to populate history.
3. Provide an existing-environment adoption verifier that checks full object definitions,
   auth triggers, indexes, ACLs and row invariants, fails on unknown/mismatch, and proposes
   only explicitly approved forward reconciliation for gaps. Recording a baseline requires
   a separately approved truthful adoption procedure, never fabricated historical rows.
4. Change delivery tooling atomically to consume only the new active baseline/forward
   chain, with strict uniqueness checks on every active migration and immutable archive
   checksum checks. This must be a real baseline transition, not a duplicate allowlist.
5. Prove fresh replay and represented/partial-state upgrades on isolated PostgreSQL 17,
   privacy/RBAC regression, backup/restore and abort procedures; independent review first.
6. Obtain explicit per-environment activation approval. Until then current normal migration
   delivery remains blocked and the current duplicate guard must continue to fail.

Existing customer_documents P0, observability ACL P1, duplicate P2 and PR100 pending
schema remain unchanged. No implementation cutover, rename, Production access,
history write, application/DABRA/Drive modification or merge occurred in this audit.
