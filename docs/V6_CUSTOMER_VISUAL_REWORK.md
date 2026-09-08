# v6 Customer visual correction

Owner: Codex Desktop — Engineer A. PR #103 remains Draft. This is the CEO-authorized visual delta from `a0e993e8bb423ea827677768d498c0b08fd8a7a7`; it is not a Production release or CEO visual approval.

## Sources and scope

The authoritative Constitution is **CEO Final Approved for Lounge(6) - CODEX FINAL PRODUCTION CONSTITUTION**:

- DOCX SHA256: `b983f0cff1e80fb2e5ed57ad3476d40ad6498c3f85bab0554ddfcc441a8ed8a2`.
- PDF SHA256: `290dbbe22883c2a9d457ffe36b0e45e461365286fd8b4bc4eeb319b1b7bc1df1`.
- Full DABRA family: PDF pages 6–12, DOCX `word/media/image1.png` through `image7.png`, in order CEO, Admin, Partner, Concierge, Travel Agent, Customer Service, Mall Center.
- Compact family: PDF page 13, DOCX `word/media/image8.png`. CSS displays the original compact atlas cells at 56/64/88px. No face, clothing, color or image bytes are changed.
- Welcome: PDF page 16, existing unmodified `login-success-reference.png`. The responsive image window retains the approved character and scene; live text and links remain HTML.
- Account, bookings, wallet, documents, favorites: PDF pages 17–21. The subsequent CEO instruction explicitly requires lighter customer chrome while preserving controlled Navy wallet art.

All eight family files are original media bytes. `tests/v6-customer-visual-identity.test.ts` pins every SHA256. Full badges are not used as compact icons. Customer surfaces display only contextual customer-service, travel-agent or mall-center artwork; storing the complete approved family does not expose executive functionality.

## Functional boundary

Register source and styles, OTP, account queries, booking status logic, wallet ledger/actions, upload handlers, signed-document endpoints, storage/RLS, migrations and the Sandbox Node 24 configuration remain unchanged. Documents gain responsive labelled rows without changing their owner-bound action URLs. Favorites only replaces the decorative heading artwork; persistence/filtering/sorting/removal are unchanged.

The customer shell lazy-loads the existing FloatingDibrah, passing an optional presentation-only `launcherIdentity` React node. Existing callers retain the original default. Chat requests, approval policy, provider routing, speech, locale-remount/history cancellation and collision-aware placement are unchanged. The launcher starts AR-left/EN-right and yields space to actual controls. No financial or booking action is introduced.

## Verification and remaining gates

Focused checks cover original asset hashes, light chrome/controlled Navy, compact-vs-full artwork, locale/collision rules, canonical chat reuse, owner-bound document actions and functional welcome destinations. Existing Register, v6 boundaries, wallet, customer-document, DABRA family, locale and floating-layout suites remain required.

Actual browser evidence is captured against the isolated UAT backend `rcrdjhoicbxiwgtyrift`, never Production. No upload, payment, booking, reset, fixture change or business mutation is required for this visual pass. Final exact-SHA CI/Sandbox and independent delta review must be recorded separately after the one authorized push. Final CEO visual approval is pending.

The existing `/favicon.ico` 404 remains a tracked P2: no approved favicon file was found, and no replacement icon is invented.

## Final closure correction from b78c1a26

- The staff account VM test explicitly mocks the presentation-only DABRA introduction, as it already mocks the request panel. All canonical role, badge, redirect and scope assertions remain intact.
- Documents marks its heading/banner as an optional launcher obstacle. A scoped 96px mobile gap reserves space for the existing 74px launcher and clearance. The asset, locale side, chat behavior, text and document actions do not change. Other routes have no new obstacle marker or spacing rule.
- Sandbox run `34067701376` passed its socket `SELECT 1` probe but lost that socket before initial schema setup. The [official PostgreSQL image entrypoint](https://github.com/docker-library/postgres/blob/master/17/alpine3.23/docker-entrypoint.sh) starts a socket-only bootstrap server and then stops it before starting the final TCP server. The old probe could accept that temporary server. Readiness and all fixture SQL now use authenticated loopback TCP inside the same disposable container. A bounded read-only probe must pass before any schema or upload test starts; DDL/DML is never retried by the readiness helper. Password expansion stays inside the container, not in command arguments or diagnostics.
- Focused readiness tests model bootstrap/restart/final-server phases and verify stable timeout failure with no dependent work. These tests supplement, not replace, the real disposable Auth/Storage/PostgreSQL 17 upload suite in Sandbox. No migration, runtime upload logic, Node version or database security assertion changes.
- Local Docker was unavailable (`Docker Desktop is unable to start`); real PostgreSQL execution must be evidenced by the final exact-head Sandbox run. Existing 32-view evidence is retained; only Documents and protected-shell regression views need recapture.

Final cloud and independent review results belong to the exact-head closure receipt, not this pre-push implementation note. PR stays Draft; Production and UAT business data remain untouched.
