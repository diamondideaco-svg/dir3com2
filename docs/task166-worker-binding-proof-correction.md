# Task166 existing-worker proof correction — source preparation only

Target: Task217 / PR231. This forward corrects the inherited direct-RPC proof gap;
it does not activate notifications, issue a permit, replace a worker or reset state.

## Approved source changes and separate live boundary

- New forward: `supabase/migrations/20261106161631_task166_worker_binding_fingerprint.sql`.
- Original `20261105081501_task166_existing_worker_binding.sql` is immutable.
- Live history uses version `20261105192436` with the original migration name;
  do not replay it because its filename timestamp differs from the live version.
- Applying the new forward to Production requires separate specific authorization.
  This document does not authorize migration, proof preparation against real ENV,
  permit issuance, credential reads/copies, deployment or any WhatsApp message.

## Trusted preparation and binding

1. The authorized server-side permit issuer verifies the exact project, current
   deployment/source and existing runtime worker through the approved protected
   execution path. It calls `prepareExistingWorkerBindingProof()` from
   `lib/admin/drive-worker-binding-proof.ts` in that same runtime. The helper
   has no caller-controlled worker or proof argument and performs no network or
   database request. Never print, publish, log or return the worker or private proof.
2. With separately approved existing owner-only issuance, insert a new bounded
   permit using parameterized SQL and put the helper's `expectedWorkerSha256`
   into `expected_worker_sha256`. All existing CEO/source/deployment/project,
   one-time and five-minute constraints remain. There is no new public issuer RPC
   and no new table/schema/EXECUTE grant.
3. The existing browser request still contains only `approvalId`; the public bind
   RPC still has exactly its original four parameters. It cannot set the proof.
   The private table remains inaccessible to authenticated/anon/service_role.
4. The definer RPC locks and checks the permit and active canonical CEO, then
   compares the supplied worker against the pre-pinned proof before entering Vault.
   The formula is SHA-256 over UTF-8 `task166-existing-worker-v1:` followed by the
   exact worker, lowercase hex, with no trimming or normalization.

The helper prepares metadata only; it does not itself issue or authorize a permit.
The trusted issuer remains a privileged boundary and must not accept a fingerprint
from the browser or derive the approved proof from the bind request being checked.

## Existing rows, ACLs and failure behavior

No rows are backfilled, renewed, reset, deleted or consumed by the forward. New
column values are NULL for old rows. An unfinished NULL-proof permit returns
`WORKER_BINDING_PROOF_REQUIRED`; a different worker returns
`WORKER_IDENTITY_MISMATCH`. Neither path enters Vault or consumes the permit.
A completed legacy binding retains its existing BOUND/ALREADY_BOUND reconciliation,
including missing-reference fail-closed behavior; no value is adopted or overwritten.

The forward asserts the reviewed live function definitions before replacement and
fails transactionally on drift. It keeps the same function signatures, owners,
security-definer/search_path settings, OIDs and ACLs using CREATE OR REPLACE.
There are no GRANT/REVOKE statements, secret reads or external calls. The private
column adds a constraint, not a new client-visible field. Do not deploy a consumer
that depends on this forward before its authorized application/readback.

## Focused verification

The owned network-none disposable PostgreSQL fixture first reproduces the old
wrong-worker acceptance inside a rollback, then applies the forward. New cases
cover wrong-worker rejection before Vault, correct-worker success, inability of
the authenticated caller to replace/supply the proof, unchanged unpinned unfinished
rows, completed legacy compatibility, malformed proof constraints, and exact OID/
ACL preservation. Original authority, race, expiry and rollback tests remain.
The proof-helper unit cases use synthetic ENV only. No live worker, provider,
customer or WhatsApp call is used.
