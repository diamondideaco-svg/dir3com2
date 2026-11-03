# DABRA Agentic Travel Orchestration V1

DABRA remains one customer-facing agent on the shared DIR3COM Core. The implementation extends AI2 through `lib/ai2/orchestration` and the existing `/api/ai2/chat` route; it creates no parallel backend and exposes no internal agent personas.

## Flow

Intent parsing → user/tenant-scoped Travel Memory → normalized Trip Plan → capability orchestration → provider abstraction → option comparison/revalidation → explicit action confirmation → sandbox-only execution boundary → Trip Guardian guidance or context-preserving human handoff.

## Safety boundaries

- The ordinary chat route and canonical UI are unchanged. Authenticated callers may request `mode: "travel-plan"` on the same route.
- Fly and Stay adapters use the existing Duffel and LiteAPI normalized foundations when TEST credentials and complete criteria exist.
- Drive and Concierge fail closed when vendor access/entitlement is missing.
- VIP synthetic fixtures are explicitly blocked from public inventory.
- Booking/cancellation/modification/payment actions cannot execute before explicit confirmation. Execution is limited to `test`/`sandbox`; production mutations fail closed.
- Payment is an interface/preparation boundary only and never charges.
- Guardian events do not claim live monitoring.
- Provider errors and content are treated as untrusted and sanitized.
- Knowledge sources default to denied unless canonical, marked safe, and in an allowed authority class.

## Persistence note

`TravelMemoryStore` defines the inspect/update/revoke and ownership contract for request/session memory. It is an in-process implementation for V1 testing and dependency injection; durable long-term memory remains disabled under the existing AI2 memory policy and requires separate storage/retention/security approval.

## Task217 limited funding proposal

This source/local package extends the existing handler and funding ledger. It does not install grants or capability profiles, change provider flags/models, or authorize Production SQL, deployment, billing or customer data egress.

The optional server-stored `limitedOperation` record has exactly these fields: `schema=task217-limited-operation-v1`, `authorizationId`, `taskId=task217-text-pilot-2026-11-01`, `maxCostMicros=1000000`, `maxAttempts=28`, `dataScope=redacted-travel-or-server-units`, `providerRisk=overdraft-unknown`, `authorizedAtMs`, `expiresAtMs`. Its window lasts at most one hour and cannot be renewed or removed from its grant.

This explicit limited policy can admit existing-credit evidence for the seven existing provider IDs. Every provider still needs its own matching server account/project/credential/model, current reviewed tariff and all-in charge bound, quota, measured capability/language/environment, authenticated owner and current consent. Unknown providers and missing evidence fail closed. No seven-provider broadcast is introduced. The older ordinary existing-credit restriction to OpenAI/Anthropic and the five-provider hard-no-new-charge path remain unchanged.

The policy accepts truthful `overdraft=unknown`; it does not relabel it as blocked. Postpaid must remain blocked, auto-reload off and concurrent account use bounded. The risk is that a provider balance or account terms may have changed since observation. The USD1 limit bounds DABRA's ledger, not account use by other work or a provider-wide invoice.

All pilot and limited grants share the same permanent USD1/28 envelope, including the six retained admissions and61719microUSD already held. The ledger sums the greater of each grant's counter and admission costs across providers, grants and days, including disabled grants. Unknown outcomes retain their holds. Server-subject/request/stage dedup prevents repeated POSTs or provider switching from purchasing the same stage twice.

Saved financial observations require two additional fields in that same limited record: `sourceGrantId` and `financialSnapshotSha256`. The source must be the retained original pilot grant. The ordered financial binding includes its identity, credit, credential binding and true original observation/expiry timestamps. The new grant must preserve those financial values. This opt-in accepts their age; it does not create a new balance observation. The source, accepted observation and authorization are immutable and cannot be reallocated to another grant. Without this exact opt-in, expired financial evidence remains rejected. Independent prices, all-in fees and quotas keep their own expiry checks.

The actual handler uses a stable existing conversation job UUID, reserves before dispatch, and rechecks the server owner, grant, profile, source/credential binding and consent around awaited boundaries. A missing/late price receipt, revoked authority or unknown classifier outcome cannot cause another provider dispatch. Validated private attachments stay local. Funded Luna uses the already measured Standard transport recipe with one attempt, a pinned model and the bounded output profile; GPT5/PR172 behavior is unchanged.

Measurement results remain observations, never qualification. Blocked/stopped results add only a reason, fixed case ID and stage. They do not log proofs, credentials, evidence digests or arbitrary exception messages, and they do not add a resume path. These new diagnostics do not establish the cause of a historical stopped result.

### Evidence and remaining activation gates

- Historical provider observations are retained: three OpenAI cases received independent semantic review; Claude has three held admissions including an unknown outcome. There is no fourth OpenAI receipt or seven-provider qualification.
- No live capability profile was installed by this package. Historical benchmark evidence cannot be relabeled as Production evidence or another capability/language/model.
- Local synthetic eligibility for all seven IDs is not evidence that all seven accounts, balances, tariffs, models or profiles are currently eligible.
- Production provider flags/models remain unverified. Missing identity, tariff/all-in/quota evidence, profile or explicit live authorization remains a real activation blocker.
- The forward migration is registered with `production_apply_authorized=false`. Local results, exact-head functional/security review, CI/Sandbox/Preview and live release authorization remain separate gates.
