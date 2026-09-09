# Customer Documents Production migration parity

Owner: Codex Desktop — Engineer A. Branch: `codex/customer-documents-migration-parity-v1`.
Base: `935d0004aa67098a62976a26adfaf7a65772e524`.

## Already-applied release

Customer Documents DDL was separately applied successfully to Production as `20260909171237_customer_private_document_upload`. This change only renames the active repository file from `20260906183519_customer_private_document_upload.sql` to `20260909171237_customer_private_document_upload.sql`, updates exact references and guards, and corrects historical release-status documentation. No duplicate forward migration, Production DDL re-execution, migration-history mutation, business-data mutation, application or UI changes.

The SQL byte SHA-256 remains `43d3f2faa3609308f5a8535f37b27ecfd8ce7d84ac55571bcc66a0c661c9f5d3`. Production ledger SQL equals repository SQL after removing full-line comments and blank lines and normalizing line endings only. No SQL token or policy change is required. Frozen baseline/adoption metadata and all 45 archived migration blobs remain unchanged.

## Read-only precheck and safety decision

The Production ledger contains the new version exactly once and no `20260906183519` row. Catalog reads confirm private `customer-documents`, 4194304-byte limit, PDF/JPEG/PNG/WebP only, nullable text `upload_sha256` and `storage_bucket`, active customer owner-scoped SELECT/INSERT, restrictive Storage boundary/no-delete and owner read policies. RLS remains enabled; anon SELECT/INSERT and authenticated TRUNCATE are denied.

Independent functional precheck approved repository reconciliation over ledger mutation. Customer Documents depends on baseline profiles/verification tables and platform Auth/Storage. Partner hardening operates on separate tables; the new filename reflects actual Production order without dependency inversion. Aligning the sole active filename with the applied ledger prevents another Customer Documents execution while preserving the authoritative release history.

## Verification boundary

Required release evidence is recorded against the exact final SHA in the PR/handoff: hash/filename/order/duplicate guards, immutable baseline/archive and database-target guards, disposable PostgreSQL full-chain replay and actual CLI dry-run with the six applied versions, real local Auth/Storage upload/owner/foreign/anonymous/no-delete checks, full tests, typecheck, lint, build, independent functional/security reviews, CI, Sandbox and automatic Preview.

Production verification is read-only catalog/ledger and runtime inspection. Local Auth/Storage E2E does not claim live Production customer upload E2E. No Production or shared UAT business data is created or changed by this task. No blanket database push or migration-history repair is authorized by this document.
