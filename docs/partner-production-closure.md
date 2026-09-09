# Partner production candidate

Owner: Codex Desktop — Engineer A. Base: `fccfb84073596eeca375f80a15ce7f029fe5c354`.
Branch: `codex/partner-production-v1`. Draft PR only; CEO visual approval precedes any merge.

## Existing capability map

- `/partner-portal`: profile fields and save, private verification documents, product creation/editing/images, owned assets/media, contract associations (read-only), bookings, settlements, compliance.
- `/partner-portal/requests`: owner-scoped request list and timeline, explicitly confirmed WhatsApp handoff. Requests do not create or represent confirmed bookings.
- Identity: `requirePortalActor()` validates Auth user and the caller-visible active canonical profile. Pending/suspended business-partner onboarding remains governed by existing policy; operational request RPCs require an active business partner. The patch does not broaden these roles.
- APIs: existing `/api/partner-portal/*`; no new parallel backend or administrative routes.
- Review queue actions remain privileged. The Partner workspace no longer advertises those inaccessible controls.

## Scope and demonstrated repairs

Protected shared operational chrome is used only on the two Partner routes. It uses existing brand/DABRA assets, Tajawal/Montserrat, RTL/LTR, white/pearl surfaces and Gold controls. Existing operational sections and actions remain in place. Persistent form labels and explicit loading/error/retry/empty states replace ambiguous presentation; a failed read is not an empty business state.

The durable repository previously discarded physical owner/id columns and trusted the JSON `record`. Caller table grants allowed JSON to diverge from physical identity, potentially influencing a later privileged upsert. The repository now verifies physical identity and associations before accepting a record. The scoped forward migration removes direct untrusted writes, retains owner-scoped SELECT/RLS, and checks immutable ownership and association consistency on trusted writes. Partner input cannot grant verification approval.

Rejected upload-validation attempts retain their existing attempt UUID and truthful failed state without inventing a stored media row. Such attempts may not reference another owner's existing media or claim pending/successful review. No rows are rewritten or deleted by the migration.

The operational assets UI lets the server derive domain scope rather than always requesting Drive for every Partner domain. Upload association uses the returned asset scope; all server ownership checks remain authoritative.

Independent functional review identified that one failed section read could hide every section. Reads are now independently validated: failed/malformed/network responses show a section error and cannot expose stale/empty editable data, while healthy sections remain usable. Bookings use the canonical `partner_assignments` association and only the latest non-declined assignment across all partners; ties fail closed and unused guest details are omitted. No request is mapped into a booking. The canonical baseline does not contain `partner_settlements`; that finance dependency returns HTTP 503 rather than fake zero earnings or an empty-success ledger. No financial schema or policy has been invented.

## Verification and limits

- `npm run test:all`: executed with disposable local PostgreSQL 17; exact final counts are recorded in the PR/handoff after review fixes.
- `npm run test:admin-partner-lifecycle-postgresql`: lifecycle, tenant/actor binding, request handoff and append-only history passed in disposable databases.
- `node scripts/test-partner-durable-postgresql.mjs`: real local PostgreSQL verifies own read, cross-owner denial, direct-write denial, immutable owner/JSON, parent/media association, failed-upload audit compatibility, preserved rows and RLS. Added to the existing Sandbox workflow.
- `node scripts/check-migration-baseline.mjs`: frozen history and exact forward registration preserved.
- Browser evidence is outside Git: AR/EN, widths 1449/1280/390/430, six portal sections and request states. The browser runs unchanged application routes against a loopback-only fixture backend; it is NOT live Supabase Auth/Storage E2E or proof of real business activity. Populated visual request fixtures are explicitly labelled as isolated, not live requests.
- Fault injection checks loading, failed reads, retry, failed-save truth, inactive/customer denial, protected Admin/CEO 404, and public route smoke. Public/Customer page implementation files are unchanged.
- Lint retains 20 pre-existing warnings outside this patch. No dependency versions were changed.

## Release sequencing

`20260909064524_partner_durable_owner_boundary.sql` is an unapplied release migration in this PR, not evidence of a live database change. Production/UAT data and settings have not been mutated. Apply it only through the separately authorized release process before claiming deployed database hardening. Existing malformed durable rows fail closed and require evidence-led reconciliation, not automatic deletion or relaxed checks.

Cloud CI, exact-SHA Preview, Sandbox and independent fixed-SHA reviews are recorded in the PR/final handoff. This document does not pre-approve those gates or authorize merge. Live Partner account/storage mutation E2E is not claimed.
