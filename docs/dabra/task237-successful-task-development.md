# Task237: successful-task allowance development candidate

Task: https://github.com/diamondideaco-svg/dir3com2/issues/237
Base: `4f2cc1583f983523eb55e10e449c91ac2aa2bcd2`
Branch: `codex/dabra-successful-task-allowance`
Status: local synthetic development candidate, not a release or activation.

## Limits and definitions

- 10 successful AI tasks per account per Riyadh day; 50 per Riyadh month.
- USD0.50 per account per month. USD25 aggregate monthly liability remains unchanged.
- USD0.25 per attempt/profile remains independent. The distinct USD1 qualification envelope is untouched.
- Current execution remains exactly one attempt, no retry/fallback provider call and economy-only selection.
- One successful task is one completed request with a valid, composed answer saved privately and available for its authenticated owner to retrieve. HTTP200, stream completion and local Core completion do not prove this.
- Known failure releases potential-success capacity, never admitted cost or attempt history. Pending/unknown capacity is separate from consumed success. Unknown outcomes cannot redispatch the same request, even after lease expiry.

## Default-disabled boundary

The normal `/api/ai2/chat` route does not install the development runner. Existing v1 public admission behavior and its immutable history are preserved, rather than silently relabeling previous attempts as successes.

`/api/dabra/tasks` calls the replay handler without an adapter, so it returns private/no-store HTTP503 without reading an account or answer. A request field or environment variable cannot enable it. The development runner and replay dependencies require test runtime and explicit synthetic dependencies; they have no default credentials or live database transport.

The new SQL control has no installed row and defaults to disabled. Its RPCs additionally reject any database whose name is not the isolated `task237_synthetic_<32 hex characters>` test namespace. The migration registry explicitly records `production_apply_authorized: false`.

This is intentional source-level isolation pending the privacy decision. The synthetic runner and replay handler implement the feature; installing a real adapter or changing the database gate is a future, separately reviewed source change, not an undocumented feature flag.

## Durable accounting and lifecycle

The new parent row binds authenticated actor, request UUID, input/context SHA-256, child admission ID and random lease token. Input digests include server role/identity, canonical message/history, language, trip, continuity receipt, intent, pricing and attachment metadata. Trip-based execution requires a continuity receipt, and current authority/project checks run before and after reading answers. Changed inputs conflict.

`reserve_dabra_successful_task` holds the same shared advisory transaction lock used by existing public and qualification funding. It validates source, accepted profile, pricing observation, active actor, economy tier, quote and unchanged attempt limits. It inserts the existing immutable cost-ledger admission and the pending success slot in the same transaction. A duplicate request returns an existing state, never an admission/dispatch receipt.

The new success path does not apply the legacy v1 admission-count cap to the displayed successful-task allowance. Its cost budget remains independently enforced. The PostgreSQL regression makes 12 known failed attempts without consuming success quota; their entire held cost remains counted. Legacy v1, if selected separately, still has its original admission-based limits and must not advertise the new successful allowance.

The database clock chooses Asia/Riyadh periods. A lease is at most 12 seconds and ends no later than pricing expiry or the current day/month boundary. Fenced completion after expiry or a period change cannot consume success or store an answer. The four lifecycle/allowance RPCs use a nonblocking shared admission lock and explicit NOWAIT data/eligibility locks. Eligibility is checked before state-bearing returns, and time is sampled only after the required locks are acquired. An expired pending row reconciles to unknown, releases potential-success capacity by lease expiry, preserves accounting and remains non-redispatchable. No lease extension or automatic execution recovery is provided.

Finalization atomically stores only the validated final answer and language, then transitions the parent to succeeded with minimal hash/timestamp evidence. A repeated finalization cannot overwrite the answer or increment usage. The server verifies retrieval before returning a saved success. If a finalization response is lost, a transport retry retrieves that same request without a new call.

## Retention and privacy

**24 hours is a development assumption for synthetic answers only.** It is not real-user retention consent, a permanent chat archive or browser-delivery proof.

Content is in a separate private table. Immutable cost rows are not deleted with answers. Browser roles have no table/RPC grants; service-role RPCs accept an identity only from the server-resolved authenticated context. Reads require the same owner and input digest, recheck current authority, never cache, and do not reveal a different owner's task. Revocation/expired-content purging does not erase success/cost evidence.

The purge RPC deletes at most 1,000 expired or explicitly owner-revoked answers per call. Read-time expiry prevents returning stale content. No production purge scheduler is installed or claimed. Before any real-content adapter is installed, retention consent/disclosure, continuity revocation wiring, account deletion, bounded scheduled physical purge, operational access and privacy review must be resolved.

The code stores no raw provider response, credential, trace or original prompt/history in the answer tables. Only synthetic fixtures were used for verification.

## Clients

Both chat surfaces share in-memory transport identity. An explicit user retry of a failed/interrupted request with the same request key reuses the exact original body and UUID. There is no automatic retry and no browser-storage retry archive. A different key, successful completion, identity change or context forgetting clears the old retry binding. Attachment retries use stable in-memory selected-file identities and retain their original body; changing the selection changes the request key. Attachments remain outside the synthetic AI admission scope.

Remaining successful quota and pending counts are rendered separately in Arabic and English only when a validated allowance header is present. Budget availability is separate from task counts, and copy explicitly retains failed-attempt cost and saved-trip availability. Existing local Core and saved-trip paths remain available. In the disabled runtime no new quota is advertised.

## Verification and remaining gates

Focused synthetic tests exercise saved success, invalid final output, committed-unknown admission/save, no redispatch, owner isolation, input conflict, exact-body transport retry, independent last-slot race, monthly success and cost limits, shared liability, pricing tampering, lease/period fencing, 24-hour content expiry and physical purge preserving cost.

Run focused TypeScript tests with `node --conditions=react-server --import tsx --test` and the new PostgreSQL integration test with a loopback disposable `dir3com_test` connection in `CONTINUITY_TEST_DATABASE_URL`. The test creates and removes only its isolated synthetic database and applies the actual forward migration chain. No provider API is contacted: runtime fixtures replace network fetch before the handoff.

Required general gates: `npm run lint`, `npm run typecheck`, `npm run build`. Final results and exact artifact are recorded in the delivery report, not inferred from this document. Independent functional/security review is pending. Browser visual QA, preview/CI, source publication, merge, live SQL, real retention, provider activation and production operation are not performed or authorized.

### Transport completeness and compatibility

The existing `assistant-text-v1` header identifies the text format, not completion. The response producer now also sends `X-DABRA-Answer-Bytes`, the UTF-8 byte length of the already composed final answer. The reader compares the actual received length at EOF. A cleanly closed prefix, missing length, malformed body or interrupted read is unresolved delivery and preserves explicit-retry identity; none proves a saved task success. The response body and model-call count are unchanged. Older clients ignore the added header; a new client receiving an older server's stream without it fails safely rather than claiming completion. JSON responses retain their existing parsed-answer contract.

The synthetic replay deadline covers request parsing, identity resolution, subsequent authority checks and all reads as one bounded operation, including dependencies that ignore cancellation. Core fallback is returned only after a fresh account/project check. Provider body transport errors remain unknown; fully read invalid JSON remains a known failure. These changes do not alter live provider timeout or retry settings.

### Nonblocking lock and expiry fencing

Reserve, finish, replay and allowance use the same order: try the shared admission advisory lock; acquire the required task/data relation and row locks with NOWAIT; then acquire shared control/auth-user/profile locks through one private eligibility helper. All state-bearing branches, including absent, existing and conflict, follow that eligibility check. Reserve pins its source authority/grant and samples time afterward. Its final post-write expiry check rolls back a late uncommitted admission before returning a dispatch receipt.

Reserve additionally takes SHARE ROW EXCLUSIVE NOWAIT on the parent-task and admission tables before checking keys. This excludes an uncommitted privileged direct INSERT that could otherwise be invisible to EXISTS and block the later unique-index check. The combined mode also avoids an implicit write-lock upgrade. Concurrent direct INSERT/UPDATE/DELETE on either table causes a known reservation denial even for a different key; ordinary MVCC reads remain compatible. Cooperative RPC writers already share the admission lock. Finish also takes SHARE ROW EXCLUSIVE NOWAIT on answers before locking the task row. Writer-first would already fail at the parent FK lock, but the reverse order can create a unique-index/FK cycle: a direct writer inserts its answer key while waiting for the parent held by finish. The pre-parent answer-table lock excludes that insert. Both orderings were reproduced in isolated PostgreSQL 18.6, not PostgreSQL 17 or Production; the regression pauses only the synthetic finisher before index insertion and observes the direct writer waiting at the relation lock. A direct answer writer that starts later waits for finish, without a reverse dependency; a writer already active causes unavailable completion without changing cost or task state. This also covers unrelated answer writes and is intentionally conservative. Read and allowance are unchanged; ordinary MVCC reads remain compatible.

Contention is a known, fast rejection of a new reservation with no new hold. Finish, replay and allowance return unavailable, without revealing a task state or releasing any existing cost hold. A lock conflict rolls back the function subtransaction and releases acquired admission/eligibility locks even when the caller has not ended its outer transaction. No automatic retry is introduced. The protection is against SQL lock queuing in the current schema, not a bound on CPU, IO, arbitrary future triggers or total query execution.

A per-lock 750ms timeout was rejected: a local experiment waited first for the shared lock, then for a table; both individual waits were below 750ms but the shared lock remained held at the 1000ms application deadline. Function-local statement_timeout also did not arm a deadline for the already-running outer query. Neither setting is used as a safety guarantee or installed by this migration.

Finalization retains its post-write clock fence and atomic rollback of a late answer/success while preserving the original immutable cost admission. Replay does not delete answers, and checks the requested answer's expiry with fresh DB time. The existing explicit bounded purge is unchanged. Because purge uses SKIP LOCKED, future real-content revocation/deletion wiring must verify completion and handle a skipped locked row; that integration remains blocked pending privacy approval.

Streaming cancels immediately when received bytes exceed the advertised bound, before decoding/rendering that chunk, and never waits on an uncooperative cancellation promise. Mixed-version transport behavior remains as described above.
