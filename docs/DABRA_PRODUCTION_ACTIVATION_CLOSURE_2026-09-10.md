# DABRA Production Activation Closure — 2026-09-10

Status: CANDIDATE — exact-head cloud and live verification required before merge.

## Source of truth

- Base production/master SHA: `82b7cd39862db181c20c77e5aa7e39e4993293f2`.
- Canonical public route: `/dabra`.
- Canonical chat route: `/api/ai2/chat`.
- Canonical voice route: `/api/dabra/voice`.
- DABRA remains one customer-facing agent on the shared DIR3COM Core.
- Human approval remains mandatory before booking, payment, cancellation, refund, or other sensitive irreversible action.

## Production capability matrix

| Capability | Code truth | Production target |
| --- | --- | --- |
| Character Bible v2 | Present | Active |
| AR/EN conversation | Present | Active |
| Session conversation context | Present | Active; session-only, not long-term memory |
| Five-service intelligence | Present | Active |
| Marketplace grounding | Present | Active against verified/non-synthetic truth only |
| Trip planning guidance | Present | Active; advisory only |
| Seven-provider routing/fallback | Present | Active when provider credentials are configured |
| Provider observability | Present | Active subject to deployed DB/runtime configuration |
| DABRA Commerce page | Present | Active |
| Compare/favorites/cart UI | Present | Active against current marketplace truth |
| Contextual WhatsApp handoff | Present | Active; opening handoff is not a booking/payment/message-delivery claim |
| Approved dynamic DABRA voice | Present | This candidate removes the redundant voice-ID environment dependency; the approved voice ID is pinned in source and only the server Mistral credential is required. Live endpoint verification remains mandatory. |
| Attachments | Present | Requires authenticated secure-session path; no unsupported success claim |
| Account-aware assistance | Present | Safe display-name context only; no fabricated bookings/favorites/wallet access |
| Travel Wallet intelligence | Contract only | Deferred until a real document/wallet data source is wired |
| Collaborative Trip | Visual architecture only | Deferred; UI remains Coming Soon until backend exists |
| Autonomous transaction execution | Intentionally absent | Must remain unavailable; human approval/server truth gates are authoritative |

## Voice activation correction

The approved voice identity is immutable in source:

- Engine: `mistral-voxtral-tts`
- Model: `voxtral-mini-tts-2603`
- Approved voice ID: `ae29537c-c796-4fb5-9f5b-da1e02176a5d`
- Approved reference fingerprint: `4AA9AFA4EDDF369FE79E8F597946766C6FBDD8C789DE199DE9A5253EBFE044FB`

Before this candidate, runtime required both `MISTRAL_API_KEY` and a duplicate `DABRA_MISTRAL_VOICE_ID` environment value equal to the already-pinned approved ID. Production `/api/dabra/voice` therefore reported unavailable when that duplicate variable was absent.

This candidate keeps fail-closed behavior but makes the source-pinned approved voice ID authoritative. `DABRA_MISTRAL_VOICE_ID`, when present, is treated only as an optional consistency guard: a mismatch fails closed. The browser still receives no provider credential or configurable voice identity.

## Non-negotiable truth boundaries

- No synthetic/fallback inventory may be represented as live supply.
- REQ is not BOOKING.
- No provider sandbox may be represented as production booking capability.
- No browser speech synthesis may substitute for the approved DABRA voice.
- No DABRA prompt/model output may grant authorization.
- No payment, booking, cancellation, refund, staff approval, or access-grant action may execute from model text alone.

## Required closure evidence

1. Focused DABRA voice/provider tests PASS.
2. Existing DABRA character/orchestration/locale/WhatsApp contracts PASS on exact head.
3. Typecheck/lint/build or canonical CI PASS on exact head.
4. Vercel Preview READY and exact SHA match.
5. Preview `GET /api/dabra/voice` reports the truthful configured state.
6. Production remains unchanged until merge authorization.
7. After merge: Production `/dabra` HTTP 200, `/api/dabra/voice` verified, runtime errors checked, and no regression to DABRA human-approval boundaries.

Deferred items are not relabeled PASS.
