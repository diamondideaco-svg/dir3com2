# Production migration provenance review — 2026-09-06

Owner: Codex Desktop / Engineer A. Repository-only v15.3.
Base: `8a4a17a1e8ce3bf8899f93a78595ce3d060f8afe`.
Target reference for read-only evidence: `ynupwivgvwcyrsdhtkcc`.

## Decision: BLOCKED for deployment, ready for provenance review

This is a review manifest, **not an executable repair plan**. No Production SQL,
history repair, linked push, user activation, or business mutation was performed.
Do not feed this manifest into a deployment tool. `PAIRED_REPAIR` means a candidate
requiring independent approval and fresh object-contract verification, not permission.
The declared previous audit PASS was not treated as proof: evidence was reconstructed.

The inventory contains 47 remote records and 45 local files: 42 remote-only versions,
40 local-only files / 39 distinct versions, and five shared versions. Four shared
versions contain different SQL. The JSON has 87 records: one per remote record plus
one per local-only file. Mapped pairs intentionally appear on both sides; do not count
these as two proposed repairs. SQL comparison changes CRLF to LF and trims only outer
whitespace; it does not remove comments or whitespace inside SQL/string literals.

## Evidence and limitations

Production history was saved before this task in a private local backup:
`C:/Users/dell/Desktop/dir3com2/.tmp/production-history-v151/migration-history-before.json`.
SHA256: `CA14AC2BF248013C48320ECA38689723FA62078DB0F711EB6739FE28A76A7ED2`.
The complete backup is deliberately not committed. It contains historical SQL,
not just public provenance metadata. The manifest contains no business rows or secrets.
Catalog presence observations are explicitly **not** equivalence or authorization proof.
Names extracted from SQL can reference removed objects, columns, or dynamic objects;
`unresolved_reference` is not automatically a missing-table defect.

Legend (defined here because the task supplied codes without definitions):

- E: same version and exact normalized SQL.
- V: exact normalized SQL under a different version.
- H: recorded historical SQL; no exact current local counterpart proven.
- M: version/name mapping exists but SQL differs; do not repair away differences.
- U: unresolved provenance; preserve.
- PENDING: canonical schema/hardening application not recorded and target evidence absent.

## Duplicate 20260808120000 — no rename without proof

There is **no remote record** with this version in the 47-row snapshot. Neither local
file can be declared its match. Current absence does not prove that a record was never
applied and later removed by a historical repair. No audit trail proving that negative
was available; therefore neither file is renamed in this change.

| File suffix | Original addition commit |
| --- | --- |
| dgr055_canonical_profile_provisioning.sql | `9e539b10b28627d700fd11c5c123f307352d70cc` |
| dgr059_partner_documents_runtime_grants_and_owner_policies.sql | `a4e66b83d2f565e92637cd4f4d6079ed28d36721` |

Both also appear as additions in `b32cc8278612135907a8df8255ee56e18aea688b`.
`git log --all --name-status` and `git log --all --follow` found no alternate timestamp
for the DGR059 file. DGR055 provisions profiles/backfills and installs its auth trigger;
DGR059 grants partner-document access and owner policies. They are not duplicates in
meaning. Existing profiles/partner_documents and later hardening do not prove either
original transaction executed. Full replacement/supersession is not claimed.

The CI guard intentionally fails on this existing duplicate. There is no allowlist,
baseline exemption, or SQL rewrite to manufacture PASS. A later narrowly authorized,
provenance-backed filename decision is required before this PR can be merge-ready.

## Unknown four

`20260804153000`, `20260804171000`, `20260804173000`, `20260804194000` remain U/PRESERVE.
The first three have null recorded statements; the fourth has an empty statement array.
Searches across available local/all Git refs (including deleted migration paths), exact
timestamps, exact remote migration names, and current docs/scripts/tests found no SQL.
Unavailable/deleted remote-only branches are not claimed to have been exhaustively
recovered. Current table shape is not reconstructed into invented historical SQL.

## Shared-version SQL divergences

| Version | Proven difference; DO_NOT_REPAIR |
| --- | --- |
| 20260827152245 | Remote grants authenticated document UPDATE/DELETE and creates owner mutation policies; local revokes those mutations. |
| 20260827155608 | Local adds least-privilege revokes and conditional optional-table grants absent from recorded remote SQL. |
| 20260827155935 | Remote grants authenticated SELECT on partners/partner_users; local limits authenticated SELECT to partner_documents and handles optional tables conditionally. |
| 20260827160824 | Remote additionally grants authenticated SELECT on partner_users; local does not. |

Later policies/grants may supersede parts of these statements. A migration record is
not a current permission proof. No historical file is edited to match the remote SQL.

## Future pending schema plan — NOT applied

Prerequisites for every step: independent baseline approval, fresh exact master/target
lock, history backup, verified dependencies/ACLs, explicitly authorized execution, and
a deployment plan that excludes all unrelated history. Ordinary linked dry-run currently
fails `LegacyDbPushMissingLocalError`; repairing eight recent versions alone is insufficient.
Never use include-all or mark a pending migration applied without executing it.

1. `20260903220000_reconcile_customer_documents_postgres17.sql` (PR #89):
   customers.id UUID/non-null with valid referenced uniqueness; is_admin_actor();
   approved table/FK/RLS/index contracts; customer_documents currently absent.
   Verify id UUID PK default gen_random_uuid(), customer_id FK ON DELETE RESTRICT,
   uploaded_at default now(), expected policies/grants, and no customer data rewrite.
2. `20260906034500_partner_trusted_activation.sql` (PR #100):
   applied operations/audit foundation and enabled operations_append_only trigger;
   compatible profiles/partners; activation RPC currently absent. Verify authenticated
   admin-only attestation and audit atomicity. Do not activate any real partner.
3. Separate security gate: `20260904210623_harden_dabra_provider_attempt_acl.sql`:
   provider attempts/metrics objects, exact columns/PK/logical unique index, table owner,
   role-membership and ACL preconditions, and PostgreSQL 17 MAINTAIN support. The hardening
   evidence function is absent. History and ACL status must both be checked; function
   presence alone is not application proof. No DABRA runtime or ACL changes in this PR.

The above is a proposed explicit operational order, not filename-sort replay. The third
file sorts before PR #100; a future deployment plan must resolve that ordering explicitly
without changing SQL or silently using blanket push. Stop on any unexpected conflict.

## Validation

`node scripts/check-migration-baseline.mjs` validates coverage and rejects duplicate
timestamps with exit code 1. `node --test tests/migration-baseline.test.mjs` tests the
validator and negative contracts separately. The guard's existing-duplicate failure
must remain visible in CI. No green Production closure is claimed by these tests.
