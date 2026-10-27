# Task166 in-server current-state invocation

Local delta assigned in Task166 comment6437932535, after merged PR216, with
specific direct human approval for local source and synthetic tests only.
No SQL, credential, enrollment, runtime flag or recurring workflow change.

`POST /api/admin/drive-whatsapp/current-state` authenticates the canonical cookie
session using `auth.getUser()` and the existing fresh, pinned active CEO guard.
Strict same-origin JSON and optional Fetch Metadata checks precede authorization.
Anonymous, customer, partner, scoped staff and non-CEO admin actors cannot use it.
No email, submitted role or authorization header substitutes for the canonical
session. Responses are private/no-store, including errors.

The body is only the existing exact five-field dispatch selector returned by the
reviewed server preparation: requestId, outboxId, recipientUserId, category,
language. Only customer.current_state and operations.current_state are accepted.
Selectors are NOT approval or destination input. No phone, message body, provider
URL, template, sender, approval, bypass, expiry, flag or additional field is
accepted. The active database window must match the whole tuple. Shared claim
and begin still enforce request/version/status, consent, recipient,
template/sender, expiry, budget and atomic one-shot intent. A changed selector
cannot authorize another destination or revive a stale notice.

The adapter calls the reviewed dispatch-target handler in-process with the
existing server runtime credential, never fetching its public URL or exporting
the credential. It requires target_only/webhook mode and will not switch or stop
a functioning continuous service. It cannot prepare/open a notice/window,
manufacture an outbox, replay created, reset attempts, use provider_query,
automatically retry, or call stop/cleanup.

Only safe result codes leave this endpoint. ACCEPTED_NOT_DELIVERED is not
delivery proof. UNKNOWN_DO_NOT_RETRY or DISPATCH_UNCONFIRMED_DO_NOT_RETRY requires
inspection of durable intent and real receipts, never re-sending. An idle
response is not evidence of a new send or prior delivery. Database dedupe remains
authoritative for retries and concurrent operator calls.

No UI/navigation or closed Task199 trial change. Its private targets, old
approval and OFF cleanup are not reused. Manual invocation does not prove a
recurring continuous service. Live dispatch requires separate explicit authority
and an already-prepared eligible target. Local tests inject synthetic RPC and
HTTP boundaries only, not a real PostgreSQL/provider delivery proof.
