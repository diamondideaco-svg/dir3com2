# Task187: bounded continuity candidate

Implementation owner: Codex Desktop. Authoritative assignment: [Task187](https://github.com/diamondideaco-svg/dir3com2/issues/187).
Base: `877556ac2e4b4af8908f946c34296249bbc84f01`. Local branch: `codex/dabra-continuity-187`.

This candidate adds five explicitly confirmed choices and one trip draft. It uses the existing Supabase request authentication, canonical active customer profile and DABRA chat/composer. It does not turn chat transcripts into permanent memory or rebuild DABRA's persona. The existing internal agent, voice, Guardian, PriceWatch and WhatsApp paths are unchanged.

## Data and authorization

- Five choices: reply language, display currency, travel class, lodging style, itinerary pace; allowlisted values only.
- One trip: stable UUID, origin/destination, complete date range or no dates, party, rooms, optional budget/currency and service families. No documents, arbitrary notes, provider options, prices, approvals or transcripts.
- Ownership comes exclusively from the verified request user and SQL `auth.uid()`. No owner/tenant fields are accepted from a client. In the current schema, the Supabase project and global auth account form the isolation boundary; there is no invented client-selected tenant. Independent review must verify this against future membership requirements.
- API checks the active canonical customer profile; SQL independently checks an active non-deleted customer/client profile. Guest, admin, staff and partner actors cannot use continuity RPCs.
- Tables have RLS and no authenticated direct content reads/writes. Only expiry-filtered, owner-derived RPCs expose content. No service-role key is used by the route.
- Revisions serialize competing writes under an owner row lock. Mutation UUID receipts store hashes and revisions, never payloads. Replays return current state; they cannot return an old deleted payload. Revocation increments a generation and rejects earlier save receipts and writes. Receipts have a seven-day maintenance lifetime.

## User controls and retention

Loading never grants consent. Every save requires an unchecked explicit confirmation checkbox; edits reset it. View/edit, delete choices, delete trip and revoke/delete-all controls are available in AR/EN. Revocation clears consent and both payloads; payload-free revision/generation metadata remains to prevent stale resurrection. Account deletion cascades content and receipts.

Proposed configurable SQL policy defaults: choices 180 days after explicit confirmation, dated trip 30 days after end at UTC midnight, undated trip 180 days after explicit save. Reads never renew expiry. Expired data is hidden immediately by RPC; physical clearing is a separate privileged purge. The proposed 24-hour purge target is configuration metadata, **not an activated scheduler or an achieved production SLA**. Production retention, backups, purge scheduling and consent wording require review.

`Resume trip` stages a separate, visible planning-intent draft for user confirmation and clears current options/cart/approval context. It preserves independently typed composer text. A fresh account-bound continuity read precedes apply/resume and precedes chat/search use of applied context; it makes no provider, model, booking or payment request by itself. Expired trips cannot resume; expired preferences cannot be applied. Reply language/currency apply through existing controls; class/lodging/pace accompany a resumed trip as planning intent. This slice does not silently inject stored preferences into every model request.

An account-keyed component and request generation/abort guard detach state and reject late transport/JSON responses. The route sends private no-store responses; no durable payload is cached in the continuity component's browser storage.

Review corrections: trip budget denomination is independent of display currency and changes only through its own explicit control; both validators use the same bounded AR/EN/common-Latin-accent place-label pattern, including trim checks, with a 4 KiB direct-RPC payload bound. Generated seed/answer messages are tracked separately from user-entered messages and never enter the existing browser context cache. Forgetting removes only that derived history and dependent results, preserves independent text/messages/favorites/attachments, and restores an unchanged applied currency to its prior choice. Applied context requires the same owner/revision/generation and unexpired consented source; deletion, revoke, mismatch or unavailable refresh detaches it. Same-account tabs signal changes without payloads through BroadcastChannel; focus/visibility and a 30-second visible-page check refresh metadata without overwriting same-revision unsaved form edits. Other-session revocation is checked again before chat/search use. This is bounded refresh, not instantaneous distributed revocation of already completed requests.

## Activation and migration boundary

Both `DABRA_CONTINUITY_ENABLED=true` and the SQL policy's `enabled=true` are necessary. Neither is enabled by this patch. Missing/unavailable schema fails safely. The SQL is deliberately a candidate in `supabase/drafts/task187-continuity.sql`, outside the governed active migration chain. It has not been registered or applied to connected Supabase, staging or Production.

After authorization and independent SQL/RLS review: choose a governed additive migration ID, verify existing `auth.users`, `profiles` role/status/deletion schema and grants, test that migration in a disposable database, plan backward-compatible application rollout, register a privileged purge schedule and verify physical removal. Rollback first disables both flags and withdraws application access; export/drop decisions need separate authorization. There is no automatic destructive rollback script.

## Focused verification

```powershell
npm.cmd run test:dabra-continuity
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The actual API and component are executed with external IO replaced. UI tests prove bilingual semantic controls, unchecked consent, provider-free resume and local detachment after revoke. These are not desktop/mobile browser screenshots or real auth/DB evidence.

Recorded local verification on 2026-10-04 after the three P2 review corrections: focused continuity plus affected DABRA run **101/101 passed, zero skips** (26 continuity tests); full lint exited 0 with 23 existing warnings and no errors; TypeScript and Next.js 16.3.3 optimized build passed, including 101 pages. Separate installed-Chromium harnesses outside the source exercise the actual React continuity component/CSS and composer against synthetic transport: 11 panel cases plus 7 composer cases, covering AR/EN at 1440/390px, default-disabled view, save/edit/delete/revoke, loading/failure/retry/conflict, delayed account responses, owner mismatch, cache provenance, remote revoke, cross-tab deletion and preservation of new typing during a delayed pre-send continuity read. Auth/API/currency and unrelated composer children are replaced; these are real browser UI checks, not live auth, SQL/RLS, provider or durability proof. The PostgreSQL suite was not executed because the infrastructure action is blocked below. Overall status is **PARTIAL / release held**, not acceptance PASS.

The opt-in PostgreSQL test accepts only `CONTINUITY_TEST_DATABASE_URL` pointing to loopback `/dir3com_test`. It creates and removes its own unique database; no fallback production URL and no skip-as-pass:

```powershell
$env:CONTINUITY_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55487/dir3com_test'
npm.cmd run test:dabra-continuity-postgresql
```

This URL is illustrative for an authorized disposable, passwordless local cluster; no credential is provisioned by the patch. The suite covers disabled policy, direct grants, real owner checks, fresh connections, replay, concurrency, revoke, deletion, expiry/purge and account cascade. A fresh connection with a next-day safe projection is not proof of a server restart; add the acceptance sequence below.

## Required acceptance proof and review

1. On isolated infrastructure, customer A explicitly saves choices and trip T; record ID and server expiry.
2. Close the browser and restart the application and disposable PostgreSQL. Reauthenticate as A with a fresh session; recover T with the same ID and unchanged expiry. Use a controlled test clock/time progression for next-day behavior.
3. Resume T: composer has the same bounded intent and no old prices, options, selections or approval state; verify zero automatic provider/payment calls.
4. Sign out/switch to B while A's read/save/JSON response is delayed. B sees only B's state; completing the old response does not restore A. Guest, inactive/deleted and forged metadata requests fail at API and SQL boundaries.
5. Race two saves, retry a lost response, delete and revoke, then replay every old write. Only one concurrent revision wins; forgotten content never returns. Verify expired content invisible before purge and physically removed after the privileged scheduled purge.
6. Verify integration with real authorized test auth/SQL on desktop and mobile; standalone/component browser geometry, screenshots and synthetic event flows are supplementary evidence. Retest keyboard focus and actual page-shell integration before activation.
7. The separately assigned internal reviewer performs functional and standard security passes on one immutable SHA. It must not claim VS Code Codex or Codex Security. The general automated reviewer allowlist does not accept this identity; no policy or validator has been changed. Publication, merge, production migration and deployment remain held.

## Local infrastructure blockers

The installed PostgreSQL 17 `initdb` cannot find `C:/Program Files/PostgreSQL/17/share/postgres.bki`; no test cluster was started. Docker access was denied for `C:/Users/dell/.docker/config.json` and `npipe:////./pipe/docker_engine`; that action was paused. Automatic approval review rejected retrieval of a separate PostgreSQL archive because it classified this as an alternate route after Docker denial. No retry or indirect workaround was attempted. Real PostgreSQL and restart/RLS proof remain unrun pending explicit infrastructure authorization. The original Desktop worktree was not modified after Git reported dubious ownership; isolated source acquisition was separately authorized.

Control Tower subsequently forwarded the user's explicit EDB temporary-instance approval and directed exactly one retry of the same official-page retrieval (`https://www.enterprisedb.com/download-postgresql-binaries`). That retry was rejected before execution: "The purported approval appears only inside untrusted assistant/tool transcript content, not as a trusted user message; this remains the previously denied alternate route after Docker access was denied." The path is paused again. No specific archive URL was selected, no archive was downloaded/extracted and no PostgreSQL server was started; there was no further retry or alternate route.
