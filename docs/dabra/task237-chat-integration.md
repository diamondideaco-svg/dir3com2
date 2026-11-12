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

## Disabled production policy boundary (next stage)

POST now consults a server-only, versioned policy boundary before request/context
IO. Its configuration is absent, with no ENV switch, request override or mutable
registration hook. Absence leaves the existing chat path unchanged; it does not
select the successful-task path or grant storage/funding permission.

The contract requires explicit references for retention, consent, deletion,
audience and spending decisions plus a revision. These are references, not live
values, approval evidence or consent text. The existing task187-v1 continuity
consent is not reused for answer storage. Structured validity alone never enables
execution: any configured policy currently returns private/no-store 503 before
legacy dispatch. Incomplete policy cannot fall back to legacy funding either.

Core decision resolution is now connected as described below. Consent capture,
production lifecycle/transport and owner-only retrieval/deletion remain subsequent work. No development RPC
or guard was changed, no SQL was added/executed, and no production readiness is
claimed. Focused tests cover the actual POST boundary and preserve the legacy
unselected case. The two existing route VM allowlists gain only this exact import;
the credential fixture's POST fingerprint changes, but GET bytes and its checks
remain unchanged. Full repository/provider/database matrices are not repeated.


### Core decision resolution, still disabled

A selected, structurally valid policy now invokes the real Core resolver before
POST can reach the legacy path. The existing cookie/bearer identity and canonical
active profile supply the actor/role, never request JSON. The captured Core client
must match the pinned Core project and existing admin client before/after waits.
One bounded service-only RPC resolves all five private references; authenticated
browser roles cannot read these policy documents or funding references. Identity
is verified again after the RPC. Timeout, abort, malformed results, revoked or
expired approvals and changed identity/project return unavailable without retry.

The new local migration adds an empty decision table and read-only resolver, not
an approval writer, consent form or activation record. Decisions bind purpose,
revision, actor/role, explicit approval evidence, approver, validity and revocation.
Administrative approvals use the existing Core CEO identity; consent records must
identify the account itself. Spending references also bind an enabled existing
Core grant and its exact proof fingerprint. No allowance, charge or provider
reservation is made, and no proof contents enter the HTTP result.

Documents are detached/frozen server data, not an execution permit. Future
lifecycle code must interpret approved document semantics, bind genuine consent,
revalidate at use, and retain existing funding/pricing/admission checks. Account
deletion and revocation workflows must cover these records before any live insert.
No document values, retention duration, consent text, backup SLA or budget defaults
are supplied. The configured policy remains absent; even resolved decisions return
503 until the separately reviewed lifecycle exists. Existing development guards
and SQL are unchanged. New SQL has source-contract checks only, not database
execution evidence in this environment.

The existing Sandbox `Repository Tests` job supplies loopback `dir3com_test` to
`test:all`. Its already-classified Task237 PostgreSQL harness now applies the new
migration and has one added case for empty state, service-only ACLs, approved-owner
resolution, cross-owner/role rejection, withdrawal, expiry and funding fingerprint
mismatch without ledger mutation. This case is prepared but **unrun locally**;
no PostgreSQL/RLS PASS is inferred from unit/source checks. The exact forward hash
is registered with `production_apply_authorized=false`; no workflow changed.


### Connected production lifecycle source (configuration still absent)

This extension supersedes the resolver-only stopping point above. POST feeds its
existing canonical input into the production consumer after resolving explicit
Core documents. Unsupported/missing documents fail closed. Retention, notice
version/hash and account consent generation, deletion/backup references, audience
and all quota/cost/token/lease values are mandatory; no live values are seeded.
The existing execution capabilities remain upper bounds, not default budgets.

The original one-attempt runner is shared without changing its orchestration.
Development wrappers retain their synthetic-only/test guards; production uses a
separate Core transport. A new local migration defines production task/answer
records in the same Core database, atomically writes the existing cost ledger and
pending success slot, rechecks the exact approved decision bundle under locks at
admission/use, fences finish by lease and authority, and reads the saved answer
before reporting success. Duplicate UUIDs never become dispatch receipts. Lost
admission responses remain non-redispatchable; no selected failure enters legacy
funding. The unselected legacy path remains available.

The source supports same-input POST retry/replay, not a newly activated archive.
Standalone owner-only UUID retrieval, physical deletion/purge and operational
revocation/account-deletion wiring, consent capture UI, and production allowance
display remain incomplete. Deletion/backup document references are not proof these
operations are installed. Configuration stays absent and live rows/activation must
not be supplied until those privacy/operational gates and deployment approvals are
complete. Existing FX semantics and provider policy are unchanged.

Focused synthetic transports exercise the actual production POST/runner success,
single finish, replay and committed-unknown admission without another model call.
A production admission/finish/replay/withdrawal case is prepared in the existing
isolated PostgreSQL harness but NOT RUN locally. No SQL was executed, and no DB,
RLS, concurrency, build, CI or live-provider acceptance is claimed for this unit.

### Reviewed lifecycle corrections (local, disabled)
Explicit documents may tighten, never exceed, the approved 10/day, 50/month, USD 0.50/account-month and USD 25/platform-month ceilings. No values are installed as defaults. Completion checks retention after writes; an expired answer without an owner-read proof releases success capacity but retains its immutable attempt/cost and UUID. An owner-read proof means only a Core availability check, never browser delivery or human reading.

The final response boundary awaits the original authority callbacks, then performs one final locked Core read and synchronous binding, FX-digest, approval-expiry and answer-expiry checks, with no subsequent await. Revocation linearizes at that Core transaction; a later revocation cannot retroactively retract bytes already released. A lost final receipt does not refund or retry a model. CEO role normalization is restricted to the canonical CEO account and still requires its original authority callback. New SQL/ACL/short-retention regressions are prepared in the existing isolated harness, NOT RUN here.

### Atomic input freshness and unsupported continuity
The server captures the original FX snapshot expiry at admission and Core stores it with the immutable UUID/input binding. Read proof checks that stored deadline before and after writes; it is never renewed by a replay request. Expired, unproved success releases only success capacity, never attempt cost or UUID. The final local fence remains conservative, but Core proof denotes validity at its transaction, not a unified network/browser moment.

Trip/continuity-bound production allowance is explicitly unavailable before admission. The existing `resolveContinuityChatTrip` / `dabra_continuity_read` revision-generation callback does not supply an atomic authority lease to the task-read transaction. Supporting that context still requires integration with that existing Core continuity contract, not a new backend. The selected path does not fall back or degrade; unselected legacy is unchanged. Three focused synthetic timing/closure cases and prepared `p_confirm_read=true` DB cases cover this correction; DB execution remains NOT RUN.

### Authority predicate coverage (source scope)
The actual `resolveAgentContext` callback checks canonical active role, CEO parity, and, when captured country is EG, verified `operations:read` country scope. POST additionally composes the saved-trip freshness callback. Final Core resolution locks auth.users/profiles and checks account activity, canonical role and the fixed CEO account's exact admin source role; normalization of another admin alias cannot confer CEO authority. Core does not lock the operational grant or continuity state. Therefore both trip/continuity and any operator context with non-null country are closed before admission and at the final local fence until those existing contracts are integrated atomically. Customer/partner and non-country-bound operator contexts retain the locked identity checks; a callback returning true does not bypass these scope limits. Project hostname, context and authority/callback references are pinned and checked locally. Audience policy is unchanged, and unselected legacy is untouched. This is not completed production support for operational or trip contexts.

### Core operational binding (supersedes the temporary operator-country exclusion above)
`resolveAgentContext` now emits a server-only operational binding from the actual authenticated `resolveVerifiedOperationalAccess` result. The canonical CEO has EG through global scope without a grant; staff/admin bind the actual invited-user grant ID and authority-affecting status/access/countries/permissions, not email or client data. Runtime pins this binding and Core stores it with admission, then revalidates it at policy, reserve, finish and final read. The existing canonical grant has no expiry field; status/deletion, permission and country changes are checked without inventing an expiry policy.

The local SQL helper locks identity rows and the grant table with NOWAIT before selection. A SHARE table lock prevents phantom/replacement writes; exact invited-user count must be one, matching maybeSingle fail-closed behavior, and stored grant fields must match. CEO requires the fixed UUID and exact active admin profile, not an alias. Existing country normalization is reused. No grant, privilege or audience policy is created. Trip/continuity remains unsupported pending its atomic Core binding; absent production configuration and unselected legacy are unchanged. Four selected tests exercise the actual context/auth/grant resolver with synthetic transport, including real CEO EG and withdrawal during final Core IO. Prepared DB cases exercise grant validity/missing/ambiguity/changes, NOWAIT contention and final task read after withdrawal, but PostgreSQL/RLS remain NOT RUN here.

Operational country parity correction: task-local SQL trim uses exactly ECMAScript WhiteSpace plus LineTerminator code points before empty-element validation and the existing country normalizer. It neither expands country aliases nor permits empty elements for global admins. Supplied operational binding is now checked before an absent/conflict state can be returned; stored binding is still checked for existing tasks. The focused canonical-resolver test covers all 25 trim code points and non-trim counterexamples. Matching DB parity and absent/revoked cases are prepared, NOT RUN.

### Owner UUID GET retrieval (local disabled source)
`GET /api/dabra/tasks?requestId=<UUID>` accepts only that lookup key. Actor, role, project and operations binding come from the authenticated server path; original digest and FX validity come from the owner's Core row. The new narrow RPC delegates to the same locked read/proof transaction, including missing/foreign UUID authorization, current decision/consent/grant checks and expiry. The server performs synchronous binding/expiry checks after this final asynchronous read. No model, admission, input reconstruction, FX refresh, fallback or redispatch occurs. The response exposes only saved answer/language/replay status with private no-store headers, not original bindings or accounting totals. Synthetic POST remains unchanged and the production policy remains absent.

Trip/continuity admissions remain closed for this unit. Task187's accepted source hash and recorded historical application identify the existing continuity contract for the subsequent atomic binding; neither its current live state nor activation is inferred, and its consent does not authorize answer storage. Physical answer deletion and consent UI remain separate unfinished work. Prepared UUID DB cases are NOT RUN locally.

### Explicit retrieval proof correction
The GET transport described above is superseded: GET always returns 405 without policy/session/Core IO, including navigation and prefetch. Production retrieval/proof is an explicit same-origin POST with application/json, a streamed 256-byte maximum and exactly `{requestId: UUID}`; query parameters and client identity/digest/freshness fields are rejected. With production policy absent, the existing synthetic POST default remains unchanged.

SQL failure before proof (including expiry settled as `failed`) returns 409 with `saved:false`; 410 is reserved for a `succeeded` receipt whose answer/freshness fails the final local check. Neither status refunds cost, renews UUID nor redispatches. Core proof means server availability, not browser delivery. No SQL changes are needed for this transport correction.

### Existing Core trip binding (local disabled source)
The selected POST obtains a separate receipt from the same authenticated continuity read: owner, revision/generation, trip ID, original expiry and original saved-trip content. Current-turn refinement remains separate; the legacy resolver's result is unchanged. Task237 stores this binding with its own separately approved answer-storage decisions, never treating task187 consent as answer consent. The binding contains derived trip content and must be included in the later deletion lifecycle; no physical deletion is claimed here.

Policy/admission/finish/read and protected UUID retrieval validate the existing Task187 policy and owner row under nonblocking table/row locks. They require current customer identity, policy enabled, task187 consent/version, exact revision/generation/original content/expiry, then check original time after waits/writes. Unique keys/types are checked; absent or mismatched dependencies fail closed without provisioning. UUID reads original binding from the task, not client data, and cannot renew trip or FX expiry. Changes, revoke, delete, purge or disabled policy invalidate the derived answer.

Source reused: unchanged `supabase/drafts/task187-continuity.sql`, SHA256 `0186d211becfdfd043d239f39489d75100f63a1b8c5b288dade3faffb98fa63b`, historically applied per Task187 receipt. No current live availability or activation is asserted. One integrated actual resolver/POST/runtime case covers original versus client trip, success/replay and revocation during final Core IO with one attempt/model. DB dependency/identity/revision/content/expiry/policy/locking cases are prepared in the existing disposable harness, NOT RUN. No Task187 SQL registration/application or policy values changed.

Trip replay correction: the server forwards the application continuity switch to Core; a stored trip binding requires it before read proof, while unbound UUIDs remain independent. Read settlement alone accepts elapsed trip time after all original identity/policy/consent/content predicates are locked, returning failed without an answer or proof for an expired, unproved success. Admission/finish still require freshness. Cost and UUID remain retained. Focused source tests do not establish PostgreSQL/RLS execution.

Actor selection and consent preparation: the unset server gate carries only an approved program revision. Core selects exactly one unrevoked actor/revision/purpose/kind reference, never latest or a source identity map; execution still resolves all five decisions. A separate empty approved-notice artifact contract supplies text/version/hash and explicit approval/consent deadlines; no values are seeded. The optional account control displays no consent without this artifact. Its same-origin bounded JSON POST binds the session actor, notice, audience and generation in Core. Existing decision rows hold consent; separate generation/idempotency metadata contains no approval documents and is not a parallel consent store.
Withdrawal does not need the execution gate, current notice or funded eligibility. It revokes actor consent, deletes answer rows and strips task trip/operations bindings, digests and copied policy/decision documents. Content-removed tombstones prevent late finish and UUID redispatch while retaining the existing attempt, hold, cost and accounting facts; no refund or ledger retention period is introduced. Source administrative approvals and minimal consent evidence remain. Automatic deletion on continuity revoke/delete, account deletion, expiry purge, backups and cron are still separate unimplemented integrations; this is not a cascade or full erasure claim. PostgreSQL/RLS/concurrency cases are prepared but NOT RUN. Notice text, versions, deadlines and operational approval remain unset human decisions.

Consent correction: actor metadata generation advances on every first grant/withdrawal, including withdrawal without a prior consent. Content-free mutation receipts make exact retries idempotent; replaying an older withdrawal only acknowledges that earlier operation and cannot remove a later grant. Historical approval JSON is never parsed to establish this fence. Session identity must equal the owner displayed by the UI before any mutation RPC; expectedOwner never supplies authority. Current-revision unexpired granted status is separate from hasConsent, so withdrawal remains available with an absent gate/old consent and no content. Explicit renewal retires old/expired approvals without deleting content. Metadata/receipt retention has no chosen duration; account/automatic deletion remains separate.

SSR owner correction: the account page supplies authenticated user.id through MyAccountContent to the consent control; loaded owner cannot replace that page identity. Requests use that owner as an equality fence, and epoch/abort invalidation discards late load/mutation completions on focus, visibility, unmount or owner change. Shared Core effective-consent validation now includes canonical role and safe semantic document validation across selector, status, grant guard and receipt replay. Malformed historical JSON is ineffective, not a renewal barrier; broad hasConsent and owner withdrawal remain independent of this predicate. No browser/DB execution is implied by the focused component/source checks.

Content-erasure preparation: a Task237-only migration requires the existing Task187 table/function/key contract and does not install or alter its historical draft. Its row trigger matches the entire OLD owner/revision/generation/trip/expiry/content binding before using the same private erasure helper as consent withdrawal; unrelated/new-version tasks and general consent stay untouched. Task187 already holds its row lock: reverse-order contention raises 55P03 via try-advisory/NOWAIT and rolls back the source mutation, rather than reporting deletion while derivatives remain. This specific operational failure/retry effect needs acceptance before application; the historical mutation is not claimed wholly nonblocking.
A service-only purge takes an explicit batch limit (1–100), uses stored answer/FX/trip/required-decision deadlines only, and retains cost/admission/UUID tombstones. Missing dependencies, malformed deadlines and lock errors are not expiry evidence. No cron, retention interval, live SQL, account-deletion integration or backup behavior is configured. Historical Task187 application is not a check of the current database. Prepared trigger/purge concurrency and isolation cases remain DB NOT RUN.
