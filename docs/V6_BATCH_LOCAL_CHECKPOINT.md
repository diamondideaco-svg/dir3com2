# Visual v6 batch — local checkpoint, not release evidence

Owner: Codex Desktop — Engineer A. PR #103 remains Draft.
Branch: `codex/visual-v6-register-v1`.
Committed starting HEAD: `8e250f6ce0ba83a5426580d77cbca8daff065cb0`.

## Decisions and scope

Register remains CEO-approved. Only its explicitly rejected implementation note was removed; its validated phone metadata remains unverified. No new visual Register redesign.
Wallet keeps five approved financial action labels in place, disabled with no transaction side effect. No temporary availability notes, fake balance, payment, refund or membership claim.
Seven v6 pages and the customer upload are implemented locally. Exact-head cloud gates and independent review remain separate from local evidence; CEO batch visual approval is pending.

## Customer document contract

The active customer-facing model is `verification_documents`, whose owner ID is the authenticated `profiles.id`. The CRM `customer_documents` model is not used because its customer relation has no authoritative profile association. No email-based ownership joins.
Reuse: existing core Supabase cookie/bearer auth, canonical profile checks, byte/MIME/filename validation, private document-path parsing, and existing owner-scoped document list.
No customer delegation to Admin-only verification or CRM upload actions.

New core endpoint: `/api/customer/documents`.
- Authenticated active Customer only; editable metadata never grants authority.
- Server validation before private upload; customer-session RLS INSERT RETURNING after Storage creation.
- Generated UUID path, no upsert, replay fingerprint, no replace/delete endpoint.
- Positive response only after committed row; safe cleanup after confirmed insertion failure; ambiguous commit is re-read without deleting a possibly committed object.
- Owner-authenticated signed view/download, 60 seconds, no permanent public URL.
- Supported PDF/JPG/PNG/WebP; 4MiB file limit, bounded multipart body. Uses approved validator; no antivirus claim.

## Forward migration — NOT applied to Production

`20260906183519_customer_private_document_upload.sql` adds nullable upload fingerprint/bucket fields to the canonical table and creates private `customer-documents`.
Customer record writes remain Pending and auth.uid-bound. Direct customer Storage upload/update/delete is denied, while signed read uses the customer client. Existing explicit Admin document policy is preserved; no new Admin Storage permission.
The migration rejects missing/incompatible schema, PK, security or bucket contracts. It is replayed only in disposable local PostgreSQL.
A separately hash-pinned post-cutover registry enables this forward migration without changing historical adoption metadata, baseline SQL, archive bytes or duplicate protection.

## Local evidence (not Production evidence)

Real disposable PostgreSQL 17.11 + Auth + PostgREST + Storage:
- Actual upload, committed row/object, same-payload replay, owner signed view/download, logout/login persistence: PASS on the locally tested migration version.
- Foreign customer read/signing/update/delete and anonymous access denied.
- Browser actual UI upload, refresh, signed view/download and direct-ID 404: observed PASS.
- Documents AR/EN, Desktop and 390×844: measured no page overflow, correct fonts/direction, keyboard modal/focus PASS.
- A screenshot-induced hydration warning was traced to Playwright's temporary caret style, not suppressed in application; rerun with caret unchanged is clean.
Evidence is private local test data only, outside repository.

Focused application tests: 24/24 PASS sequentially. Baseline/forward guard tests: 16/16 PASS. Restricted-runtime tsx startup hit host ENOMEM; the final elevated sequential run passed after closing this task's dev server. This was not an application assertion failure.
Final ESLint: zero errors, 20 existing warnings. Typecheck: PASS. Next.js 16.2.11 webpack production build: PASS; webpack was used because the existing dependency junction is outside the worktree.
Final disposable PostgreSQL 17.11/Auth/Storage replay: PASS, including incompatible bucket/column fail-closed rollback, idempotent migration replay, direct Storage write denial and owner/foreign/anonymous boundaries. The final harness receipt confirms its resources stopped and zero Production writes.
Final Documents browser layout evidence covers AR/EN at 1449x1086 and 390x844 with zero page-level horizontal overflow, correct language/font/direction, keyboard focus restoration, and no console/page errors. Separate earlier browser execution proved upload/refresh/view/download; the final layout receipt does not itself contain those upload steps.
Full batch visual/functional acceptance, exact-head CI/Sandbox, Preview and independent review remain pending. Local smoke is not pixel-close approval or evidence of actual email delivery.

## CEO-approved background exception

Email Verification's v6 reference (PDF page 15 / DOCX image10) shows a sunset skyline, black SUV and ornate curtain. The separately supplied runtime `dir3com-login-background-approved.png` is a different bright terrace/skyline image without the SUV. The approved web-page PNG includes already-flattened headings, OTP controls and footer; it is not a clean background for real responsive controls.
The DOCX also contains a small background thumbnail in the design board, but no matching independent full-resolution background was found among its embedded images or the inspected local assets. The remaining embedded images 17–20 are header/footer strips, not that background. Old ZIP packages were not used.
AUTH_BACKGROUND_SOURCE_EXCEPTION = CEO APPROVED — CLEAN STANDALONE SOURCE ASSET DOES NOT EXIST.
The latest CEO order authorizes the closest existing approved runtime background. It is used for the Auth family, with real responsive HTML controls. No generated artwork, flattened fake form, or customer-facing implementation note is introduced. This is no longer a blocker. CEO visual approval of the batch is still required.

## Remaining batch completion evidence

- Account now follows the approved skyline/data-card hierarchy. Documents are owner-scoped actual records, booking cards use actual bookings and never turn REQ into a confirmed booking. Identity, role/status and profile navigation remain real.
- Wallet includes the approved action row, spending summary and travel navigation. Spending uses only actual ledger debits with a compatible currency/period; missing data is unknown, not a fabricated zero or synthetic category allocation. Five finance actions remain disabled, without temporary labels or transactional side effects.
- Favorites uses the existing owner-keyed saved-state contract. Empty/nonempty, detail navigation, keyboard removal and reload persistence passed in all four locale/viewports using an explicitly isolated browser catalog fixture. This is contract/UI evidence, not a claim that synthetic inventory exists publicly.
- A real local anonymous verification check found `/auth/verify-email` missing from the proxy public allowlist. The exact route was added; protected siblings and Login Success remain guarded. Real local GoTrue OTP rejection, successful confirmation/session creation, Login Success and reload persistence passed. External email delivery is not tested or claimed.
- Local browser matrix covers all seven routes in Arabic/English at 1449×1086 and 390×844. Local evidence directory: `C:/Users/dell/AppData/Local/Temp/v6-customer-documents-DhCX6H`. Only safe reports/screenshots may be shared; local-runtime.json and environment files are private local test credentials and are never committed.
- Focused completion/boundary/localization/staff callback tests: 18/18 PASS. Proxy/completion/upload tests: 11/11 PASS (overlapping completion tests, not 29 unique tests). Migration cutover tests: 7/7 PASS; strict active/archive baseline guard PASS. Existing role/redirect assertions were retained when updating the test loader for the new account imports.
- Fresh isolated PostgreSQL 17.11/Auth/Storage run passed upload, owner/foreign/anonymous access, direct-write denial, replay and incompatible bucket/column rollback before browser testing. No Production or shared UAT writes.
- Final combined focused command (nine Register, batch, upload, wallet, proxy, localization and staff test files): 40/40 PASS. The 28-view run passed 27 immediately; its final English mobile Favorites case logged one `Invalid or unexpected token` and interaction timeout. A focused four-view Favorites rerun passed with no source change, correct keyboard focus and no console/5xx. The original failure report is preserved rather than relabeled PASS; exact-candidate cloud/browser verification remains required.
- Final local Next.js 16.2.11 webpack build: PASS, including TypeScript and route generation, using only the disposable backend. The workspace-root warning is due to the existing out-of-worktree dependency junction; no global configuration change was made. Staged secret-pattern scan: zero findings (not TAC coverage).

## Cloud environment boundary

The repository-root Vercel CLI link is stale and its CLI authorization is unavailable. The working Vercel connector resolves the actual `dir3com2` project and PR branch Preview. The root link has not been overwritten.
Before authenticated Preview upload QA, its actual Supabase backend must be identified and confirmed isolated, with the new migration applied only under appropriate isolated-environment authorization. Local Docker proof does not establish that Preview schema or application session readiness. No migration is applied to Production by this batch.

## Delivery boundary

No commit/push/Preview for individual pages. Freeze and publish one completed batch only.
No Production migration, deployment or business-data writes. No DABRA runtime or Drive inventory modifications.
