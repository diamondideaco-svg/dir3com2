# DABRA current-state audit — post-checkpoint slice

Date: 2026-10-01 (Asia/Riyadh). Owner: Codex Desktop. Task #182, PR #183.
Audit baseline: `d28787e033dde0f1f61e2c141e59e99519068152`.
Authority: Task comment 5920697439. Previous slice checkpoint: comment 5920765378.
Final commit, CI and independent decisions belong to the Task/PR record.

## Source precedence and bounded correction

Read current `/api/ai2/chat`, internal agent, approved voice, orchestration modules,
memory policy, channel handoff and collaboration UI before changing anything.
Task 172 deliberately replaced legacy `travel-plan` orchestration with the safe
catalogue/internal-tools path. The earlier orchestration reference is historical,
not authority to reconnect its supplier adapters. In particular, its defaults do
not represent current Drive supply and must not silently reactivate Fly.

The fresh audit found an obsolete voice identity in `lib/ai2/prompt/contract.ts`.
The bounded correction derives the identity from `lib/dabra/approved-voice.ts`.
It does not change the approved fingerprint, saved voice, transport, credentials,
availability, UI, or Production. Regression checks both canonical prompts,
conditional availability and absence of a voice-ID disclosure.

## Requirement disposition

Status is scoped to the exact capability named, not the presence of a file.

| Requirement | Status | Implementation/test/runtime evidence and remaining boundary |
| --- | --- | --- |
| Canonical product route / truthful catalogue guidance | PASS | `/api/ai2/chat` -> `runInternalAgent`; actual POST tests and exact-baseline Preview AR/EN compound/follow-up/handoff. Chat executes no transaction. |
| Seven-provider intent selection / bounded fallback | PASS | `agent-planner.ts`, existing transports; fourteen real AR/EN actual-handler integration cells plus adversarial POST tests in prior checkpoint. Only a read-tool enum is model-produced; not seven autonomous personas or Production activation. |
| Seven-provider authenticated browser deployment | FAIL | Not established by isolated authenticated handler fixtures or guest Preview. Requires exact deployment configuration and authenticated product-path evidence; no claim that direct connectivity closes this gap. |
| Session travel context | PASS | `platform-assistant.ts`, `conversation-locale.ts`; validated context/reset tests and Preview locale/family refinements retain dates, party, room and currency. No durable-memory claim. |
| Durable cross-device Travel Memory | PARTIAL — EXTERNAL BLOCKER | `lib/ai2/memory/design.ts` explicitly disables long-term storage and requires dedicated DGR, retention-policy and security approval. `TravelMemoryStore` is an in-process Map, not persistence. No new retention/storage policy inferred. |
| Planning / comparison / Marketplace handoff | PASS | Current managed catalogue, validated handoff URLs, human-confirmation boundaries and bounded comparison; prior Preview evidence retained. Applies to guidance, not reserved availability or a cross-provider itinerary execution engine. |
| Persisted multi-service orchestration / live revalidation | FAIL | Legacy `DabraTravelOrchestrator` is not called by the current chat route; method existence and test fixtures are not current product proof. Do not reconnect legacy default adapters or execution rails over current launch policy. |
| Trip Guardian live monitoring | PARTIAL — EXTERNAL BLOCKER | `guardian.ts` returns `liveMonitoringActive:false`; no approved live event ingestion connected to the product path was found. Requires verified event source and monitoring/retention contract. Guidance-only module is not live monitoring. |
| Customer, Egypt Operations, CEO request truth | PASS | `agent-context.ts` / `agent.ts`, authorization-runtime tests and retained same-reference TEST/QA customer/Rami/CEO evidence. Country/owner checks stay server-side. CEO output is bounded request-state summary, not finance or revenue. |
| Concierge / Call Center assistance | PASS | Existing discovery and record-backed drafts; tests enforce no sent message/phone call. Commercial Concierge remains Coming Soon. This status does not certify telephony. |
| Live phone, WhatsApp delivery/callbacks | PARTIAL — EXTERNAL BLOCKER | `whatsapp-handoff.ts` creates an explicit manual URL, not delivery. No approved sender/callback proof in this path. Outbound communication is excluded from this QA authorization; #166/#171 is not overwritten. |
| Human handoff continuity | PASS | Current Marketplace links preserve validated public trip context; request views keep authorized reference. Manual support/WhatsApp links do not imply an agent received a case or a message was delivered. |
| Approved voice identity / safety contract | PASS | Pinned `DABRA_APPROVED_VOICE`; new identity regression plus voice transport/cancellation/auth tests. Runtime speech availability and speech response evidence are recorded separately in Task #182. Speaker-identity listening approval is not invented. |
| Booking / payment / supplier safety | PASS | Chat mutation count zero; existing TEST/QA request remains distinct from booked/paid; no supplier contact or payment in this slice. |
| Collaborative-trip backend / shared membership | FAIL | `CollaborativeTripCapabilities.tsx` is explicitly a Coming Soon informational dialog. No membership/sharing backend or accepted persistence/retention contract is present; UI controls are not implementation proof. |
| Price Watch / proactive alerts | FAIL | No active product path, approved scheduling/cadence/consent/retention contract, or runtime subscription proof found. Cannot declare live monitoring from guidance. |
| Creative Studio / HeyGen | PARTIAL — EXTERNAL BLOCKER | No approved connected implementation/entitlement or runtime proof found. No vendor account, terms, subscription or media identity is created by this release correction. |
| Notifications / action-required | FAIL | Existing Operations notification code is not proof of a DABRA proactive event-to-user delivery path. No new delivery integration or outbound message was exercised. |
| Supplier capability boundaries | PASS | Drive catalogue/request path retained; Stay explicit Sandbox; Fly/Concierge Coming Soon. No legacy provider activation, synthetic inventory or invented supplier confirmation. Exact Preview Stay had zero results; retained Production 20-card proof is separate. |

## Verification and release boundary

Focused voice/persona tests: 30/30. Canonical suite ordinary group: 1347/1347;
then `assignment-schema-postgres.integration.test.ts` failed because
`TEST_DATABASE_URL or DATABASE_URL is required`. The remaining database groups
were not run. Non-database server-only group run separately: 95/95.
These test groups do not constitute full PostgreSQL PASS; focused tests overlap
the canonical groups and are not added again to totals.

Docker reports `Docker Desktop is unable to start`. CI Sandbox independently
failed twice downloading the Supabase Auth image with `toomanyrequests: Data limit
exceeded`. No Production database is used as an integration-test substitute.

The existing reviewer is active, but governance's allowed reviewer identities
exclude that literal identity. Do not rename the reviewer or bypass the check.
Independent approval for the previous SHA does not automatically cover this
voice delta. No merge, deploy, environment change, migration or new REQ here.

Overall brief verdict: **PARTIAL**, not launch GO. Missing engineering features
above remain FAIL, not disguised as vendor failures. Approved decisions needed
for persistence, collaborative access and proactive delivery must be reconciled
with the explicit current policies before implementing those boundaries.
