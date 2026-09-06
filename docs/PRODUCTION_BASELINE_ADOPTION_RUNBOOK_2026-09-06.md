# PR101 baseline cutover — v16.3 operator runbook

Owner: Codex Desktop / Engineer A. PR101 remains DRAFT pending exact-head CI and independent review.
Source lock: 8f834791accec62a7723662d7b3b5af1376c73ea.
**No Production connection, metadata write, migration execution or deployment is authorized by this PR.**

## Repository layout

Active scanning is only supabase/migrations/:
1. 20260903215959_production_schema_baseline.sql
2. 20260903220000_reconcile_customer_documents_postgres17.sql
3. 20260904210623_harden_dabra_provider_attempt_acl.sql
4. 20260906034500_partner_trusted_activation.sql

B is a baseline checkpoint, NOT a claim that historical SQL executed at that timestamp.
The baseline SQL builds a fresh platform-prepared database only. NEVER execute it on an
existing Production database. Existing environments must complete independently approved
metadata adoption before any normal migration delivery. Missing B is a hard stop.

supabase/migrations-archive/ contains 45 original immutable Git blobs, including both
20260808120000 files and evidence copies of the three pending files. The other 42 files
are no longer in the active directory. Original names, bytes, Git blob SHA1 and SHA256
are verified against the cutover plan. Git attributes disable archive newline conversion.
No historical SQL was modified or assigned a new timestamp. Historical tests read the
archive explicitly; current pending tests read active files. The archive is NEVER input
to normal db push. Do not configure schema_paths, symlinks or a delivery wrapper to scan it.

The guard rejects unknown/missing active files, duplicate active versions, malformed
names, wrong order, modified active SQL, missing/extra archive files and changed archive
bytes. Future forwards require an independently reviewed plan/guard update; no allowlist.

## Captured scope and pending truth

production-schema-capture-2026-09-06.json is metadata only, captured read-only in v16.0
from ynupwivgvwcyrsdhtkcc. This task does not refresh it from Production.
Auth/storage and managed role metadata are separated from app-owned public objects.
Replay reconstructs only the auth prerequisites needed by the app; this is not a full
Supabase service deployment. The app provisioning trigger is included.

Baseline parity checks: 50 tables, 214 constraints, 155 indexes, 38 functions, 27 triggers,
99 policies, 916 ACL entries, six column ACL entries, 24 postgres-owned default ACLs.
Only JSON key order and CRLF are normalized. Existing excessive DABRA ACLs remain in
the baseline, then the pending hardening migration removes them. No runtime changes.

Existing Production findings remain: customer_documents P0, observability ACL P1 and
trusted activation pending. The duplicate repository delivery P2 is SAFE_ARCHIVE_ONLY,
not proof of historical execution or authorization to modify Production history.

## Isolated execution evidence

Run node scripts/test-production-baseline-postgresql.mjs with the existing
dir3com-pr93-pg17 container (PostgreSQL 17.11) and Supabase CLI 2.111.0.
It uses only a random disposable local database at 127.0.0.1:55493. It does not accept
environment database URLs or Production credentials. It closes its database and only
the temporary roles it creates. Existing cluster roles are not modified.

Actual CLI commands inside the harness:
- supabase db push --db-url <disposable-loopback-url> --workdir <four-file-fixture> --yes --output-format json --dry-run
- same command without --dry-run, isolated database ONLY
- same command with --dry-run again

No --include-all, --linked, --include-seed or --include-roles is used.
The fixture contains the actual four active SQL files, not filename-only comments.
BEFORE: exactly 20260903220000, 20260904210623, 20260906034500.
APPLY: those three, in that order; no baseline or legacy execution.
AFTER: migrations=[], upToDate=true.
Forward contracts/RLS/ACLs and activation function are checked after actual CLI execution.
See PR101_CUTOVER_EXECUTION_EVIDENCE.md for sanitized output and local evidence location.

## Metadata adoption contract and crash proof

scripts/baseline-adoption-contract.mjs generates metadata SQL only; it opens no database.
The isolated harness uses the captured 47 version/name inventory with inert statement
fixtures, NOT private Production historical SQL. It checks fixture statement checksums
and full-row equality. This proves the mechanism, not a current Production backup.

The fixture full-row backup is created exclusively (wx), made read-only, hashed, and
reread. Production requires a genuinely durable immutable/WORM private backup; a local
read-only test file is not claimed to provide infrastructure-level immutability.
The compact public ledger capture does NOT replace a full Production ledger backup.

Inside one transaction: ACCESS EXCLUSIVE ledger lock; compare ALL rows/fields; remove
legacy metadata; insert B with a receipt containing backup/schema SHA256; verify result;
commit. No historical or baseline SQL is executed. B statements explain adoption rather
than pretending to contain historical execution. The three pending versions are absent.
Exact matching B receipt is an idempotent no-op. Extra/mismatched rows, names, statement
checksums or receipt are hard stops. No individual CLI repair calls emulate atomicity.

The authoritative ledger has exactly six columns: `version` (non-null text),
`name`, `created_by`, `idempotency_key` (nullable text), and `statements`, `rollback`
(nullable text arrays). None has a default, identity, or generated expression.
Both adoption and recovery validate that shape before changing rows or accepting
an idempotent no-op. The baseline marker explicitly contains `created_by: null`,
`idempotency_key: null`, and `rollback: null`; missing JSON keys are not SQL nulls.
Full-row JSON equality is retained, including all historical metadata during
precondition and recovery. Unknown columns, unexpected defaults, and mutated
marker metadata fail closed. Do not reuse SQL generated by the pre-fix three-key
marker contract; regenerate from the independently reviewed, merged correction.

Tests terminate the backend after DELETE and immediately before COMMIT. Both restore all
47 rows automatically. Tests also recover the exact committed B state to the full backup,
then adopt again; same-count mismatch aborts without partial writes. Recovery/adoption
after any pending forward has been applied is rejected. App catalog fingerprints before
and after adoption/crashes/recovery are equal.

## FUTURE Production operator sequence — separate authorization required

1. Freeze deployment and all schema/migration writers. Record owner, window and rollback approver.
2. Verify live Production deployment/master exact SHA and the approved PR101 release SHA.
3. Read ALL columns of schema_migrations; require the exact reviewed 47 version/name/statement
   checksum inventory. Verify ledger table structure too. Any new/changed/missing row = STOP.
4. Recapture using baseline-catalog-queries.json. Compare app-owned scope with the reviewed
   capture, including constraints, owners, defaults, triggers, policies, ACLs and role membership.
   Hash the canonical JSON evidence. Any drift = STOP; never substitute a new expected hash silently.
5. Save a complete private ledger backup (ALL fields/statements), schema backup, inventory and
   SHA256 in immutable storage. Verify restore/readability and obtain independent approval.
6. ONLY under separately granted metadata-adoption authority: use the reviewed transaction
   contract with that exact full backup/inventory/schema fingerprint. Retain deployment freeze.
   No baseline DDL, legacy SQL, pending application, or blanket repair.
7. Verify committed history is exactly B with the expected adoption receipt. Recheck app schema
   fingerprint and business safety evidence unchanged. Disconnect uncertainty => inspect, not retry blindly.
8. Run actual CLI 2.111.0 db push --dry-run against the approved target with protected credentials.
9. Require exactly the three pending filenames above, no seeds/roles/legacy/B execution.
10. STOP and request SEPARATE Production authorization for the three pending applications.
11. Only after that authorization apply the exact pending chain, stopping on first failure.
12. Require actual dry-run empty; verify migration history and schema/RLS/ACL/function contracts.
13. Read-only customer documents, operations and partner guards smoke; no automatic activation,
    booking, payment, handoff message or business fixture. Capture errors and preserve data.

Before commit, rollback restores the full ledger. After committed adoption but before
forwards, an independently authorized recovery may restore the exact backup only if B
and receipt still match. After forwards, NEVER restore the old ledger to conceal executed
schema changes; stop for forward-fix review. No automatic destructive schema rollback.

References: [Supabase CLI db push](https://supabase.com/docs/reference/cli/supabase-db-push).
Local CLI --help and actual version 2.111.0 are the tested command contract.
