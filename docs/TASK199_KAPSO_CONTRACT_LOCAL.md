# Task199 unified Kapso contract repair, local only

Owner: Codex Desktop / Engineer A. Branch: codex/task199-kapso-contract-local.
Base: 3816dd47773aca963be18822aeb9ec35a02725ce. The saved ten-file parity record covers the relevant published 2ee60ee4b264d2f57cd325f5a9c819f6d09e23fd paths, not the entire tree.

Human approval relayed by Control Tower: question Sentinel_5dbd45db70b88191be122e9af123ebd6 at 2026-10-15 20:51:18 UTC, reply Sentinel_49d1b671695c819197974efd7adfa51d at 20:52:12 UTC. Scope: one isolated local implementation, fake provider, isolated database, fixed-SHA functional and standard security reviews. No push, merge, deployment, production migration, authenticated provider network, real message, secret access or human window.

The initial worktree was clean. The shared Desktop partner checkout is outside this implementation. Existing Task199 consumed and historical Unknown ledgers and the frozen v1/v2 packets stay unchanged. No old approval is renewed. Remote Task/PR governance remains unverified and must be synchronized before any publication; no remote operation is part of this approval.

## Design invariants

- Preserve shared server core, tenant ownership and service-only notification RPCs. No user/RLS privilege expansion.
- Explicit inactive kapso/v2 create body and strict allowlisted receipt. Bounded complete phone-webhook pagination. An independently documented project/phone/internal_id mapping is required; absent, expired or mismatched proof stops without creation. Live adoption is a later decision.
- Verified raw-byte HMAC before parsing. Normalize only delivery metadata. Durably retain a narrowly scoped unbound receipt, then correlate by exact WAMID plus sender and recipient; never attach by phone alone. Bound callback work below the provider deadline.
- A durable target-only execution window gates generic claim, target claim and final send intent. Expired/stopped/consumed windows cannot send; no queue housekeeping or old-row mutation in target-only mode. Ambiguous network outcomes remain non-retryable.
- Preserve semantic receipt deduplication and monotonic progress. Record no raw body, secret, content or other customer data. No message resend from a delivery callback.
- Explicit deadline/stop state disables outbound eligibility. Provider webhook deactivation remains a separately authorized human operation; no claim of cancellation of requests already in flight.
- Keep REQ-A66256DE90DF1824CB96 and its time unchanged. Use future synthetic fixtures only. Existing real-request eligibility requires a later decision.
- Pin the existing approved template contract and REST parameter format. No new template, secret or provider permission is invented.

## Local verification receipt, 16 October 2026 (Riyadh)

- `node --import tsx --test tests/kapso-drive-whatsapp.test.ts tests/kapso-bounded-contract.test.mjs`: 40 passed, no skips/failures. After final body-cancellation hardening, the affected bounded suite passed 10/10, including its added non-settling-cancel regression.
- `powershell.exe -NoProfile -File tools/kapso-webhook/Test-Contract.ps1 -ArtifactDirectory D:/DIR3COM-task199-local-validation/helper-20261016-01`: 10 scenarios / 138 assertions passed, zero provider calls, real marker access, secret reads or windows.
- Existing complete PostgreSQL 17.11 runtime and a fresh D cluster: `node scripts/test-drive-whatsapp-postgresql.mjs`, 357 assertions passed, including 73 target acceptance and 75 bounded contract assertions. Two independent connections and fake provider. The owned test server stopped after the run. Port 54339 belonged to another listener and was left untouched; the fresh fixture used 5432.
- `eslint .`: exit 0, zero errors / 23 warnings. `tsc --noEmit --incremental false`: exit 0. Logs/results under `D:/DIR3COM-task199-local-validation/gates-20261016-01`.
- `next build --webpack`: failed resolving an entry across the C source / D dependencies junction (`./D:/.../next/dist/client/next.js`). This is not a successful build. Further bounded D build-fixture verification is pending. No dependency download or source workaround was applied to product code.
- `git diff --check` and `node --check scripts/run-tests.mjs` passed. The all-tests runner explicitly includes the new bounded contract suite.

The native PostgreSQL run, compiler and gate artifacts use D. The earlier preflight stopped before creating a cluster because 54339 was occupied. No old service, cluster or global setting was changed. No file cleanup was performed. Test databases created and owned by the fixture are the only database objects its teardown removes.

See `TASK199_ACTIVATION_REVIEW_PACKET.md` for the migration SHA256, exact activation fields, genuine journey criteria and separate approvals. Fixed-SHA functional and standard security reviews are still required; old diagnostic-only reviews are not this candidate's approval. No remote governance, CI, Production migration/deployment, message, delivery, Rami reply or real customer acceptance is claimed.
