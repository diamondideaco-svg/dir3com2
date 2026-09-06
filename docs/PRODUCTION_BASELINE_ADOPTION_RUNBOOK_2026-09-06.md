# Production baseline adoption — v16.0 review-only runbook

Owner: Codex Desktop / Engineer A. PR101 remains DRAFT.
Source HEAD: 8e8e30cf5db45c87688c0ec276c1dc6d2c7a6cfb.
No Production deployment, migration execution, history repair or ledger rewrite is authorized.

## Capture source and previous blocker

LegacyProjectNotLinkedError was a LOCAL CLI LINKAGE BLOCKER ONLY, not lack of
Production truth. It is superseded by direct read-only catalog capture from
ynupwivgvwcyrsdhtkcc via the authorized Supabase tool.
docs/production-schema-capture-2026-09-06.json contains schema metadata, no rows.
docs/production-ledger-capture-2026-09-06.json holds the separate 47-version ledger
with names and statement checksums, not executable history-repair instructions.
Queries are retained in scripts/baseline-catalog-queries.json.

Auth/storage metadata and managed roles are classified separately. Isolated replay
uses the captured auth.users structure and auth helper definitions as platform
prerequisites. Managed Supabase services/extensions are not reimplemented by this PR.
The old partial dump is not used to build the baseline.

## Toolchain and checkpoint

- Supabase CLI 2.111.0; PostgreSQL test server 17.11; capture server 17.6.
- Sandbox telemetry EPERM was resolved by approved external execution; not a schema defect.
- B = **20260903215959**, exactly one second before earliest pending version.
- B is a BASELINE ADOPTION CHECKPOINT, not a fabricated historical execution date.
- No collision in 45 local historical files or 47 captured remote versions.
- CLI migration list verified the ordered four-version filename fixture using a
  disposable local-only login. It did not execute any migration or touch Production.

Review-only file:
supabase/baseline/20260903215959_production_schema_baseline.sql

Proposed future active migration list:

1. 20260903215959_production_schema_baseline.sql
2. 20260903220000_reconcile_customer_documents_postgres17.sql
3. 20260904210623_harden_dabra_provider_attempt_acl.sql
4. 20260906034500_partner_trusted_activation.sql

Current supabase/migrations is UNCHANGED. Do not copy the review baseline there yet.

## Archive contract

Proposed path: supabase/migrations-history/.
The machine-readable cutover plan enumerates all 45 source files with original
filenames, Git blob IDs and SHA256 of immutable Git blob bytes. Checkout newline
conversion is not the archive format. Future archive creation must preserve those
bytes and configure Git attributes accordingly. No files moved or deleted here.
Both 20260808120000 migrations are preserved. Three pending files are explicitly
marked pending_after_baseline; they must remain in future active delivery as well.

## Fresh baseline proof

Run: node scripts/test-production-baseline-postgresql.mjs

The harness accepts only the named existing local container and PostgreSQL 17.11;
it creates a random disposable database. No remote URL or Production credentials.
It creates missing platform role names locally and removes only roles it created;
pre-existing roles are not altered. The local postgres superuser is a platform test
prerequisite, not a proposed change to Production postgres privileges.

Baseline contains no row inserts/backfills outside captured function bodies.
Tables start empty. Captured function bodies retain runtime DML intentionally.
It reconstructs current public objects, current provisioning trigger and exact ACLs.
The current unsafe DABRA grants are reproduced, not silently hardened.
The baseline is for FRESH DATABASE construction, never existing-environment adoption.

Normalized parity checks passed: 50 tables, 214 constraints, 155 indexes, 38 public
functions, 27 triggers, 99 policies, 916 ACL entries, six column ACL entries and 24
postgres-owned default ACL entries. Normalization is CRLF only plus JSON key order.
Managed auth/storage infrastructure parity is not claimed as a complete Supabase
service deployment; metadata is preserved and the app-required auth surface is tested.

Before forwards: customer_documents absent; trusted activation absent; DABRA
TRUNCATE present. Notifications service_role SELECT/INSERT and authenticated denial
are preserved. Synthetic local auth insertion proves profile provisioning; runtime
denials are checked without any Production business action.

All three forward migrations execute in exact order. Verify customer document
RLS/owner behavior, removal of DABRA excessive privileges, and trusted activation
function existence. No partner activation or live handoff is performed.

## Existing-environment adoption design — NOT EXECUTED

Precondition is the EXACT 47-row inventory, including version, name and statement
checksums. Count alone is insufficient. Before any future activation, obtain a full
private backup of the ledger (all fields/statements) and the schema, plus independent
schema parity approval. Recheck within the coordinated deployment freeze.
Any unexpected schema, row, checksum, baseline collision or pending effect = STOP.

The implemented pure model compares the exact expected inventory before returning
[B]. It rejects missing/changed records and an already-present baseline; it leaves
the input inventory unchanged. It models, but does NOT execute, ledger adoption.
The pre-pending expected active ledger is exactly [B]; after separately applying all
forwards it is [B, 20260903220000, 20260904210623, 20260906034500].
No pending migration may be recorded before its actual execution.

A future direct metadata adoption procedure requires its own explicit authorization:
one transaction with deployment coordination, exact-before check, durable backup,
schema fingerprint check, atomic ledger transition, exact-after check and commit.
Never execute baseline DDL or legacy SQL against the existing Production database.
CLI repair must not be presented as atomic multi-record adoption; the proposed
transaction is a distinct direct metadata method, not a supported CLI repair wrapper.
This PR does not provide an executable Production ledger-write script.

Before commit, any error must roll back to the complete old ledger. After commit,
recovery requires exact verification of the adopted state and no intervening forwards;
then a separately approved transaction may restore the backed-up ledger. Never
overwrite later delivery history. Crash/recovery transaction execution remains a
future adoption-activation gate, not a claimed result of the pure model.

## Dry-run equivalent and deployment gates

Pure version-set model after adoption returns exactly the three pending versions;
after all three, EMPTY. This is explicitly dry-run-equivalent, not a Production
db push invocation. CLI filename-order proof is separate from this model.

Unit tests enforce checkpoint uniqueness, archive Git hashes, preservation of both
duplicates and all pending entries, generated baseline/capture agreement, unchanged
active path, and exact-ledger mismatch rejection.
Existing CI duplicate guard remains strict and intentionally fails on the old active
directory. No allowlist or bypass was added. A future independently reviewed activation
must atomically switch the single authoritative delivery path and enable fresh replay,
archive-integrity and pending/dry-run checks before normal delivery is unblocked.

This package is ready only for independent CUTOVER DESIGN / ISOLATED PROOF review,
not merge, adoption execution or Production closure. Existing P0/P1/P2 remain open.
