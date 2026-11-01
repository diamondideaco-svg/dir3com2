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

## Visible CEO operator

/admin/drive-whatsapp/current-state renders only after server auth.getUser()
and the existing fresh isCeoActor check. GET/RSC rendering does not prepare a
notice, read provider configuration or send. The five selectors come from an
already-prepared target, with no real default IDs or query/storage autofill.
Interface language and prepared-target language are separate; selecting English
does not authorize an English notice outside the existing approved window.

One explicit submission posts JSON to the same existing relative API with
same-origin credentials, no-store and redirect rejection. Cookies stay in the
browser and privileged credentials stay in the server adapter. A synchronous
in-flight lock prevents rapid duplicates. Every HTTP attempt ends in a locked
terminal state. No retry, polling, batch or automatic second-recipient dispatch.
Timeout/lost response remains unconfirmed even when the browser aborts: inspect
durable state and real receipts rather than assuming the server did not send.
Loading/reloading never submits. Backend dedupe remains authoritative across
reloads and duplicated tabs.

After an attempt inspect durable intent/receipts before a separate recipient's
window is opened and a fresh page receives its actual selectors. Accepted and
idle are never displayed as delivered. The UI cannot prepare/open, reconcile,
stop or clean up a window. No navigation/global Operations/closed Task199 change.
Its private targets, old approval and OFF cleanup are not reused.

Manual invocation does not prove recurring service. Live dispatch needs separate
explicit authority, registered signed Kapso callback, approved template/cost and
an already-prepared eligible target. Synthetic UI/auth/HTTP checks are not real
Auth, PostgreSQL, provider delivery or Production evidence. This UI does not
authorize activation or replace actual AR/EN desktop/mobile browser acceptance.
