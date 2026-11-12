# Task237: disabled chat integration

Task: https://github.com/diamondideaco-svg/dir3com2/issues/237
Base: `00c5ab0419f8f87732f3fd411315cdcc030bdf5a`
Branch: `codex/dabra-successful-task-chat-integration`
Status: local synthetic integration; no live adapter, activation or publication.

## Scope and boundaries

The actual `/api/ai2/chat` POST now builds one canonical input lazily for either execution path. Its identity and trip come from the existing server resolvers; the continuity revision/generation are included only after the authenticated saved-trip check and only while that trip remains in the current topic. History sanitization, deterministic intent, currency handling, optional legacy classifier, attachment validation and live Core behavior are retained.

The new `successfulTaskChatResponse` seam returns `null` immediately when no dependencies are supplied. The actual route supplies none. It does not resolve input, read storage, consume quota or change routing in that state. There is no mutable registration hook, dependency singleton, new credential, URL or ENV flag. Explicit injected dependencies additionally require `NODE_ENV=test` and `dataScope=synthetic-only`.

With synthetic dependencies, the seam uses the existing lifecycle and real internal-agent handoff. It runs before legacy policy/classifier selection, preventing an extra legacy reservation or model stage. It renders only a verified saved answer, a known Core result with `saved=false`, or an honest non-success response. Pending/unknown/conflict responses are HTTP409; expired is HTTP410; unavailable is HTTP503. Every synthetic response is private/no-store with the private-context header. Current authority is rechecked before execution and after the allowance read. The existing stream byte-completeness contract and display-only allowance contract are reused.

The display-only allowance now projects only account-scoped counts and held cost, plus the server-calculated `costAvailable` boolean. The platform-wide `totalHeldCostMicros` remains validated server accounting input and still limits that boolean, but is excluded from both chat and replay headers/payloads. The strict client parser accepts the six-field account-only contract and rejects the old seven-field aggregate-bearing object. This fixes a latent privacy exposure while the runtime remains disabled; it does not change global accounting or budget enforcement.

The `/api/dabra/tasks` route source, all SQL, the migration registry, live funding, budgets, retention and both client components are unchanged. A request body or environment variable cannot install the adapter. No SQL or live provider operation is part of this stage.

## Verification design

The focused test fixture transpiles the actual POST source without altering it and substitutes synthetic IO at explicit module boundaries. The lifecycle, policy validation, provider-dispatch implementation, final-answer composition, transport consumer and ConversationSession are the real modules. Provider HTTP is replaced by the existing synthetic Task237 fixture, which rejects unknown URLs. Identity, currency and continuity reads are synthetic. The deployed route contains no test registration facility.

Coverage includes Arabic/English JSON and stream success/replay; one immutable cost admission and model attempt; input conflict; client role metadata rejection; lost-save recovery; lost-admission pending; denied admission with usable Core; authenticated continuity receipt/server-trip binding; revocation during allowance reading; default route staying disabled despite request/ENV values; missing request identity/non-test rejection; and interrupted JSON/multipart explicit retry with the original body and UUID. The JSON and multipart transport forms correspond to the floating and full chat surfaces. This is not visual browser or real-phone acceptance.

Two existing VM fixture allowlists add only the new direct server-module import. Their policy and safety assertions remain unchanged. Focused existing route compatibility, authority, continuity and transport cases are run because the common POST changed; the unaffected PostgreSQL and repository-wide suites are not repeated.

## Remaining operational decisions

The original 24-hour answer retention is still a synthetic assumption. Live storage needs an approved disclosure/consent and retention policy, revocation/account-deletion integration, verified physical purge including locked-row reconciliation, operational access controls and separate source/security/release approval.

Cross-refresh retrieval is not implemented or promised. A request UUID identifies a task, while the current replay contract also requires the original server input digest. That input cannot be reconstructed from its hash. A future stage must explicitly decide between authenticated owner-only retrieval by task ID with current authority/continuity fencing, or a separately approved minimal retained context. Current explicit retry keeps the body only in memory; changes to server-owned context can correctly conflict rather than trigger another model attempt.

FX expiry during an admitted execution remains an unresolved product boundary: even a valid paid model answer is discarded if the quote expires before successful finalization. The original attempt and cost remain counted, successful-task capacity is released for a known failure, and neither an automatic retry nor another model attempt for that request is permitted. A freshness margin or explicit quote-refresh policy requires a separate approved decision; neither is implemented here.

Any future Core-only degradation path must explicitly prevent provider dispatch, reservation and funding operations while validating current account, project and continuity authority. A generic fallback to the legacy execution path does not establish those guarantees and is not implemented or approved by this stage.

These decisions are not replaced by existing saved-trip consent. No approval from PR238 transfers to this new delta.


## Independent-review remediation

The first local candidate `5b6e2d6f2f7704c746ccfd1dddc82fbba62863c6` received functional FAIL_SOURCE and separate standard-security PASS_SOURCE. The follow-up delta addresses only those findings:

- Every successful-task authority check now settles within the existing one-second bounded-operation deadline even if its identity dependency ignores cancellation. Canonical input resolution has one pre-execution deadline; both final authority fences and allowance reading share one post-execution deadline. A timed-out check cannot release an answer or redispatch a model. The provider execution keeps its separate existing bound; it is not limited to the one-second storage/identity budget.
- The synthetic input digest becomes `task237-input-v2`. It binds FX base, provider, as-of date, currency-ordered rates, requested currency and whether the snapshot is currently fresh. It excludes only the local cache expiration timestamp itself, so equivalent fresh refetches do not conflict merely because they were fetched at different times. A stale snapshot, changed rate, changed as-of date or changed requested currency still conflicts. The unchanged execution input retains its actual `expiresAt`, and `displayPrice` continues enforcing it. Historical v1 synthetic digests are not migrated or silently reused; they fail closed as conflicting input. There is no live saved-answer state to migrate in this disabled scope.
- The interruption case for the floating interface now uses its nonstream JSON request shape and actual JSON parsing/approved-answer failure behavior. Multipart still uses the full chat's streaming contract. Both reuse the real ConversationSession original-body/UUID retry logic.

Focused regressions cover post-save identity hangs in both runner and delivery, an uncooperative allowance RPC, equivalent fresh FX refetch and changed/expired quote rejection, and both corrected transport shapes. No SQL, live adapter, client component or budget changed.


The second review closed the deadline and JSON findings but identified a clock-boundary mismatch in FX freshness. The runner now rechecks the same canonical digest after policy IO before any execution, after execution plus authority checking before successful finalization, and after saved-task lookup plus authority checking before replay. If expiry precedes execution, it returns unavailable with no admission. If expiry crosses an admitted execution, it finalizes a known failure with no answer, keeps its original attempt/cost, and releases successful-task capacity; a later equivalent fresh retry observes that failure without redispatch. An expiry during replay returns conflict. This is intentionally conservative if a quote expires after Core rendered it but before finalization. The actual display-price expiry check and clocks remain unchanged. The focused boundary tests control Date.now only in the synthetic fixture and cover policy, provider and saved-lookup boundaries.


A further pre-digest boundary is explicitly guarded: a present FX snapshot that is already expired or has a non-finite expiry when the runner captures its digest cannot start a new task. Existing-task lookup remains first to preserve conflict/replay identity semantics, but an absent task returns unavailable before policy, execution or admission. This also covers expiry during the adapter's first identity check. A missing snapshot remains eligible for the existing Core behavior without a converted quote. One actual-POST regression expires the snapshot in that first identity check, proves no model/admission/hold, then allows the original UUID's first attempt only after an equivalent fresh quote is supplied.

## Post-PR239 local transport preparation

Base: `c50dbdda802a51732f777941ff5f83cfaaa2dac4`.
Branch: `codex/dabra-successful-task-store-adapter`.
This stage is local and uninstalled, not a live-storage or activation readiness claim.

`createSyntheticSuccessfulTaskStoreAdapter` adds one server-only `FundingRpc`
boundary with a required injected synthetic transport and server-resolved input
and request ID. Both construction and calls require the test runtime; construction
also requires `synthetic-only`. No default client, credentials, URL, registration
hook, route/replay import or provider execution is added. The existing runner
alone maps public-dialogue policy/reserve names into successful-task RPC names.

The boundary accepts only successful-task policy, read, reserve, finish and
allowance names with exact top-level parameter keys. It binds actor/request/digest
to its server input, checks reserve UUID/scalar/execution-envelope shape and finish
answer/outcome shape, and snapshots arguments before waiting. It preserves the
original lease and other accepted values. Policy authority, pricing observations,
admission receipts and stored-answer interpretation remain validated by the
existing consumers and database; this adapter does not substitute new policy.

Each call shares the existing one-second bounded operation across pre-transport
authority/project checks, one transport invocation and post-transport checks.
Synchronous throws, hangs, cancellation and transport errors yield unavailable,
never a fabricated definite denial. There is no retry or legacy-funded fallback.
Finish uses its caller's independent completion signal, not a captured provider
signal. The original digest is retained so known-failure completion after input or
FX changes is not prevented by recomputing a new digest. Existing lifecycle
freshness checks still decide whether an answer can be saved or delivered.

Internal allowance usage retains the global budget total. Public delivery still
uses the existing six-field account-only projection. There is no purge adapter,
SQL change, retention/privacy decision, real-answer storage or live transport.
The database contract remains restricted to synthetic databases.

Focused verification selects only `store adapter` runtime cases, including all
five names, forbidden/extra parameters, identity/project changes before and after
waits, uncooperative identity/transport, cancellation and synchronous exceptions,
independent completion, lost admission with one hold and zero models, and public
allowance projection. Scoped ESLint covers both changed TypeScript files and the
repository typecheck covers their type dependencies. Full lint/build, repository
suites, PostgreSQL, browser and provider matrices are not repeated: no application
import graph, UI, build configuration, package, existing runtime or SQL changes.
Only the new module, selected test additions and this documentation change. These
focused checks do not claim those unrun gates or independent review have passed.

The fixed digest is distinct from the current identity fence: the adapter also
captures the original role and full task authority, and compares both before and
after asynchronous checks. Even a valid role change retaining the same actor ID
is rejected. Account revocation and project changes remain fenced through the
existing authority helper. Answer-affecting input changes can still complete a
known failure under the original digest; they cannot authorize a changed actor,
role or project. Focused cases cover this distinction explicitly.

### Independent-review corrections for the local adapter

The initial reviewed adapter was returned for correction, not approved. Parameter
validation now runs on the detached structured-clone snapshot that is actually
sent to transport. Enumerable getters are evaluated once during copying; their
later values cannot replace a validated actor or outcome. Required properties
lost during cloning, including non-enumerable keys, fail the snapshot contract.

The adapter pins the original context object and original authority/project
callbacks. Checks use those captured callbacks, with the original receiver, and
reject replacement of either callback or the input context before or after waits.
Role, full authority and current project checks remain independent from the fixed
completion digest. Focused regressions reproduce changing getters, hidden-key
substitution and callback/context replacement. Existing wait/hang/role tests set
up their intended callbacks before construction, preserving their timing coverage.
These changes do not install a transport or change privacy/accounting policy.

### Bounded PR240 coverage clarification

Focused integration now covers normal success and a committed finish whose
transport never returns: the real runner, adapter, handoff and synthetic fixture
save an answer, then replay the original request without another attempt, claim,
hold, cost or model dispatch. A lost finish receipt returns `unknown` initially;
if persistence succeeded, the next original-input request can recover that saved
answer. If persistence did not succeed, pending/unknown can remain. This test
models synthetic persistence; it is not database or live-provider acceptance.

The runner already wraps finish in its own one-second deadline, so increasing
only the adapter deadline would not increase the effective completion budget.
No deadline or authority fence changes here. Live latency measurement and deadline
policy belong to production preparation. The detached snapshot covers RPC
parameters, not the returned result; existing consumers validate result semantics.
The uninstalled guard checks four specific integration files, not the complete
application import graph. Current literal limits agree with existing contracts;
no constants refactor is needed for this correction. Internal diagnostic reasons
for a real transport also remain a production-design decision.
