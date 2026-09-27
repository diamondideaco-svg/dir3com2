# Task #167 — catalogue/data release record

Date: 2026-09-27. Implementation owner: Codex — ChatGPT Work Mode, directly authorized by the user. Independent reviewer: unassigned; no independent approval claimed.

Branch: `feat/drive-catalog-september27`. Starting HEAD: `f2c2b505cbd1e4f4674d734a49b05006903ca0c7`. Original base: `c8c91f33f3ea017bf09f0d4ee32747c0aae425b9`. Final SHA and PR are recorded in Task #167 after commit.

## Customer-visible result

- Twenty Drive offers: fourteen reconciled source rows (three repriced existing IDs and eleven new IDs), plus six unmatched legacy offers preserved unchanged.
- Daily USD price = higher source price × 1.10 once. Airport reception = half the marked-up daily price. Exact amounts, source years and withheld rows are in `drive-rates-2026-09-27.md` and its JSON/CSV register.
- New daily rates cover a 24-hour period, driver, fuel and 120km. Continuous driving, unspecified extras and automatic final trip totals are not promised. The six unchanged legacy rates are not assigned a new 24-hour service contract.
- New/repriced offers are coordinated by Egypt Operations. The source did not establish a supplier identity; they are not attributed to Safeerat. Abu Al-Hana product records are not edited.
- Public years are the source's eligible 2025+ years only. Thirteen ambiguous or pre-2025 rows remain withheld; they do not block the fourteen reconciled rows from review. No unknown capacity, luggage count, trim or live availability is invented.
- Eleven new transparent WebP images plus retained approved model assets. Full-size Range Rover 2025 has its separate green asset; Range Rover Sport has a separate red asset. Generation records and limits are in `drive-image-generation-2026-09-27.json` and `drive-image-provenance-2026-09-27.md`.

## Database and request integrity

`lib/drive/september-catalog.json` and `20260927223137_drive_september27_managed_catalog.sql` are generated from the same reconciled prices. The migration updates only three established offer rows, adds eleven offers, extends the allowed source and service-period metadata, and replaces the create-request RPC with a compatible optional catalogue-version argument.

The migration aborts if the three prior rates/version/source differ or new IDs already exist. It does not overwrite independent edits. Existing requests, context snapshots, events, products, partners, bookings and payments are not migrated or repriced.

An existing request is recovered before checking catalogue version. A new request based on stale catalogue pricing is rejected with `CATALOG_CHANGED`; the browser asks the customer to reload and review the price. Missing version remains compatible with unchanged legacy offers. Database permission restrictions remain in place. No booking, payment or supplier confirmation is introduced.

## Verification

- Focused catalogue, request/API, retry and public-entry suite: 37/37 PASS.
- In-memory PostgreSQL (PGlite) execution of the actual migration and RPC: PASS. Checked twenty offers, all fourteen exact daily/airport pairs, 24-hour metadata, stale version rejection, recovery of a request created before migration, one event per request, current-version retry, airport amount, Operations naming and function/table privileges.
- `npm run typecheck`, `npm run lint` (zero errors, 23 existing warnings), `npm run build`, `git diff --check`: PASS. Build uses a local-only inert Supabase URL/key for public UI rendering, not Production credentials or authenticated QA evidence.
- Existing Docker/PostgreSQL regression harness updated so this migration runs after its Drive dependencies and expects the new authoritative T2 rate. Full Docker/RLS integration is not rerun; the embedded test does not claim that coverage.
- Public browser results, details and image rendering are verified separately; evidence is recorded in Task #167. No authenticated request, external supplier search or commercial transaction is executed by this UI check.
- Independent functional/security review, exact-SHA cloud CI and Preview remain release gates. Self-checks are not independent approval.

## Coordinated publication and recovery

1. Obtain exact-SHA independent review and required cloud/Preview gates. The governance workflow currently accepts Desktop/VS Code implementation identities only; record the direct Work Mode assignment honestly rather than impersonating either surface or weakening the workflow.
2. In an authorized release window, record current catalogue rows and release version read-only. Confirm the migration baseline and its exact SQL against the reviewed commit. Preserve the snapshot securely for recovery.
3. Apply only this reviewed migration, then promote the matching application version. The database version check deliberately refuses repriced requests from an older browser during the short transition; it must not silently accept an unseen new price.
4. Verify the same fourteen price pairs, the six unchanged offers, source/currency/service-period fields, public images and Arabic/English desktop/mobile. Preserve the existing six-hour request rule and request-versus-booking boundary.
5. If recovery is needed, stop promotion. Do not delete offers referenced by requests or rewrite historical quotes. Use a separately reviewed forward recovery: retain additive schema/RPC compatibility, deactivate newly introduced offers, restore the recorded three prior catalogue rows/version, and restore the matching app release. Existing request snapshots remain immutable.

Production migration, commercial data update, merge and deployment have **not** been performed by this implementation. WhatsApp Task #166 and its branch are untouched.
