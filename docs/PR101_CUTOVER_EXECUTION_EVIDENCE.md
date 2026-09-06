# PR101 v16.3 isolated execution evidence

Run date: 2026-09-06. Production connections/writes: zero.
Local PostgreSQL 17.11, Supabase CLI 2.111.0.
Command: node scripts/test-production-baseline-postgresql.mjs

Sanitized first successful execution artifacts:
C:/Users/dell/AppData/Local/Temp/pr101-adoption-proof-PwAKbM

Repeat execution after full name/statement-checksum guards also passed:
C:/Users/dell/AppData/Local/Temp/pr101-adoption-proof-nmhtEv

Actual CLI BEFORE:
```json
{"upToDate":false,"dryRun":true,"migrations":["20260903220000_reconcile_customer_documents_postgres17.sql","20260904210623_harden_dabra_provider_attempt_acl.sql","20260906034500_partner_trusted_activation.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

Actual CLI APPLY (disposable database only): same ordered three migrations, dryRun=false.
Actual CLI AFTER:
```json
{"upToDate":true,"dryRun":true,"migrations":[],"seeds":[],"roles":[],"message":"Remote database is up to date."}
```

Baseline parity passed all nine app catalog sections. Transaction/crash/recovery:
exact 47-record inventory; write-once/read-only fixture backup; killed backend after
delete and before commit; complete rollback; same-count mismatch rejection; recovery
from exact B; idempotent repeat; forward-applied recovery refusal. App schema unchanged
through metadata adoption. Baseline SQL ran only for initial fresh reconstruction.

Historical statement bodies in the metadata fixture are inert checksum-labelled comments.
No claim of actual Production metadata adoption or durable Production WORM backup.
The SQL generator and harness remain independently reviewable. Final CI status must be
read on the new pushed SHA; this local evidence does not itself authorize readiness.

Local validation: baseline/archive/adoption unit tests 22/22 PASS; typecheck PASS;
lint zero errors (20 pre-existing warnings); webpack build 89/89 pages PASS.
Additional test:all primary tests 860/860 PASS, then the general assignment PostgreSQL
suite stops because TEST_DATABASE_URL/DATABASE_URL is unset. The full command is NOT
reported PASS. The dedicated disposable baseline/CLI/adoption PostgreSQL harness above
passed separately; it never reads those environment URLs.

Security scope: archive and pending SQL bytes verified unchanged; SQL literals escaped;
adoption contract has no connection path; test runner is fixed to disposable loopback;
temporary password error output is redacted; pending recovery refuses extra history.
This is owner-side review, not independent approval or a TAC scan.
