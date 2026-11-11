# Task237: disabled chat integration

Task: https://github.com/diamondideaco-svg/dir3com2/issues/237
Base: `00c5ab0419f8f87732f3fd411315cdcc030bdf5a`
Branch: `codex/dabra-successful-task-chat-integration`
Status: local synthetic integration; no live adapter, activation or publication.

## Scope and boundaries

The actual `/api/ai2/chat` POST now builds one canonical input lazily for either execution path. Its identity and trip come from the existing server resolvers; the continuity revision/generation are included only after the authenticated saved-trip check and only while that trip remains in the current topic. History sanitization, deterministic intent, currency handling, optional legacy classifier, attachment validation and live Core behavior are retained.

The new `successfulTaskChatResponse` seam returns `null` immediately when no dependencies are supplied. The actual route supplies none. It does not resolve input, read storage, consume quota or change routing in that state. There is no mutable registration hook, dependency singleton, new credential, URL or ENV flag. Explicit injected dependencies additionally require `NODE_ENV=test` and `dataScope=synthetic-only`.

With synthetic dependencies, the seam uses the existing lifecycle and real internal-agent handoff. It runs before legacy policy/classifier selection, preventing an extra legacy reservation or model stage. It renders only a verified saved answer, a known Core result with `saved=false`, or an honest non-success response. Pending/unknown/conflict responses are HTTP409; expired is HTTP410; unavailable is HTTP503. Every synthetic response is private/no-store with the private-context header. Current authority is rechecked before execution and after the allowance read. The existing stream byte-completeness contract and display-only allowance contract are reused.

`/api/dabra/tasks`, all SQL, the migration registry, live funding, budgets, retention and both client components are unchanged. A request body or environment variable cannot install the adapter. No SQL or live provider operation is part of this stage.

## Verification design

The focused test fixture transpiles the actual POST source without altering it and substitutes synthetic IO at explicit module boundaries. The lifecycle, policy validation, provider-dispatch implementation, final-answer composition, transport consumer and ConversationSession are the real modules. Provider HTTP is replaced by the existing synthetic Task237 fixture, which rejects unknown URLs. Identity, currency and continuity reads are synthetic. The deployed route contains no test registration facility.

Coverage includes Arabic/English JSON and stream success/replay; one immutable cost admission and model attempt; input conflict; client role metadata rejection; lost-save recovery; lost-admission pending; denied admission with usable Core; authenticated continuity receipt/server-trip binding; revocation during allowance reading; default route staying disabled despite request/ENV values; missing request identity/non-test rejection; and interrupted JSON/multipart explicit retry with the original body and UUID. The JSON and multipart transport forms correspond to the floating and full chat surfaces. This is not visual browser or real-phone acceptance.

Two existing VM fixture allowlists add only the new direct server-module import. Their policy and safety assertions remain unchanged. Focused existing route compatibility, authority, continuity and transport cases are run because the common POST changed; the unaffected PostgreSQL and repository-wide suites are not repeated.

## Remaining operational decisions

The original 24-hour answer retention is still a synthetic assumption. Live storage needs an approved disclosure/consent and retention policy, revocation/account-deletion integration, verified physical purge including locked-row reconciliation, operational access controls and separate source/security/release approval.

Cross-refresh retrieval is not implemented or promised. A request UUID identifies a task, while the current replay contract also requires the original server input digest. That input cannot be reconstructed from its hash. A future stage must explicitly decide between authenticated owner-only retrieval by task ID with current authority/continuity fencing, or a separately approved minimal retained context. Current explicit retry keeps the body only in memory; changes to server-owned context can correctly conflict rather than trigger another model attempt.

These decisions are not replaced by existing saved-trip consent. No approval from PR238 transfers to this new delta.


## Independent-review remediation

The first local candidate `5b6e2d6f2f7704c746ccfd1dddc82fbba62863c6` received functional FAIL_SOURCE and separate standard-security PASS_SOURCE. The follow-up delta addresses only those findings:

- Every successful-task authority check now settles within the existing one-second bounded-operation deadline even if its identity dependency ignores cancellation. Canonical input resolution has one pre-execution deadline; both final authority fences and allowance reading share one post-execution deadline. A timed-out check cannot release an answer or redispatch a model. The provider execution keeps its separate existing bound; it is not limited to the one-second storage/identity budget.
- The synthetic input digest becomes `task237-input-v2`. It binds FX base, provider, as-of date, currency-ordered rates, requested currency and whether the snapshot is currently fresh. It excludes only the local cache expiration timestamp itself, so equivalent fresh refetches do not conflict merely because they were fetched at different times. A stale snapshot, changed rate, changed as-of date or changed requested currency still conflicts. The unchanged execution input retains its actual `expiresAt`, and `displayPrice` continues enforcing it. Historical v1 synthetic digests are not migrated or silently reused; they fail closed as conflicting input. There is no live saved-answer state to migrate in this disabled scope.
- The interruption case for the floating interface now uses its nonstream JSON request shape and actual JSON parsing/approved-answer failure behavior. Multipart still uses the full chat's streaming contract. Both reuse the real ConversationSession original-body/UUID retry logic.

Focused regressions cover post-save identity hangs in both runner and delivery, an uncooperative allowance RPC, equivalent fresh FX refetch and changed/expired quote rejection, and both corrected transport shapes. No SQL, live adapter, client component or budget changed.


The second review closed the deadline and JSON findings but identified a clock-boundary mismatch in FX freshness. The runner now rechecks the same canonical digest after policy IO before any execution, after execution plus authority checking before successful finalization, and after saved-task lookup plus authority checking before replay. If expiry precedes execution, it returns unavailable with no admission. If expiry crosses an admitted execution, it finalizes a known failure with no answer, keeps its original attempt/cost, and releases successful-task capacity; a later equivalent fresh retry observes that failure without redispatch. An expiry during replay returns conflict. This is intentionally conservative if a quote expires after Core rendered it but before finalization. The actual display-price expiry check and clocks remain unchanged. The focused boundary tests control Date.now only in the synthetic fixture and cover policy, provider and saved-lookup boundaries.


A further pre-digest boundary is explicitly guarded: a present FX snapshot that is already expired or has a non-finite expiry when the runner captures its digest cannot start a new task. Existing-task lookup remains first to preserve conflict/replay identity semantics, but an absent task returns unavailable before policy, execution or admission. This also covers expiry during the adapter's first identity check. A missing snapshot remains eligible for the existing Core behavior without a converted quote. One actual-POST regression expires the snapshot in that first identity check, proves no model/admission/hold, then allows the original UUID's first attempt only after an equivalent fresh quote is supplied.
