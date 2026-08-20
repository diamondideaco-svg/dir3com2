# DABRA Continuous Evolution Program — V3 → V10

Base commit: `8b7c877bb45271529a48be0f159d6002a4c5538f` (PR #33, `feat/dabra-full-pass-closure`)
No merge performed. No Production deployment performed. Partner Pilot (PR #32) untouched.

## V3 — Conversation Quality

**Scope:** Session-only conversational context so DABRA can resolve follow-ups ("خليها 3 أيام") without ever claiming persistent long-term memory.

**Files changed:**
- `components/layout/FloatingDibrah.tsx` — sends the last 8 prior turns (`role`, `content`) alongside the new message.
- `app/api/ai2/chat/route.ts` — accepts/sanitizes optional `history` (max 8 turns, 500 chars/turn).
- `lib/ai2/runtime/chat.ts` — `buildAI2ChatResponse(message, history, account)`; `buildConversationContextSnippet()` prepends a clearly-labelled "this-session-only" transcript to the outgoing provider message.

**Tests:** `tests/dabra-evolution-v3-v8.test.ts` — verifies a prior turn's destination ("القاهرة") is present in the outgoing context for a follow-up message that doesn't itself mention it.

**Browser evidence:** Live 2-turn `curl` sequence against the running build returned HTTP 200 for both turns with `promptVersion: dabra-character-bible-v2` and no crash when `history` is populated.

**Known limitation:** Context is request-scoped only (client resends history each call); there is no server-side session store. Long-term/cross-visit memory is explicitly still disclaimed as not existing.

**PASS**

## V4 — Dir3com Service Intelligence

**Scope:** Canonical service classification (Drive/Stay/Fly/Concierge/VIP) injected into context so DABRA routes correctly and never invents a sixth service.

**Files changed:** `lib/ai2/runtime/chat.ts` — `classifyCanonicalServices()` (keyword-based AR/EN) + `CANONICAL_SERVICES_NOTE` always included in the outgoing provider context.

**Tests:** verifies the note (naming all 5 canonical services) is present for a car/transfer-related question.

**Known limitation:** classification is keyword-based, not a trained intent classifier; combined/ambiguous requests rely on the LLM plus the explicit 5-service list rather than deterministic routing logic.

**PASS**

## V5 — Marketplace Grounding

**Scope:** Only reference verified, non-synthetic platform inventory; explicitly state when no verified inventory exists instead of inventing price/availability.

**Files changed:** `lib/ai2/runtime/chat.ts` — `buildMarketplaceGroundingNote()` calls the existing `getMarketplaceSnapshot()` (same source used by the public marketplace API) and injects a verified-count note only when the message matches a canonical service keyword (avoids adding latency to plain small talk).

**Tests:** verifies the "verified marketplace data" note is present and reflects zero verified inventory in the test environment.

**Known limitation:** as previously documented in repo memory, there is currently 0 real (non-synthetic) published inventory on the platform; DABRA will correctly say availability is unconfirmed rather than fabricate it. This is a data-completeness gap, not a code defect.

**PASS**

## V6 — Trip Planner

**Scope:** Structured trip-planning guidance (destination/dates/travelers/interests/budget/transport/stay/activities/VIP) with a concise itinerary summary, no booking execution.

**Files changed:** `lib/ai2/runtime/chat.ts` — `isTripPlanningIntent()` + `TRIP_PLANNER_NOTE` injected for trip/itinerary-style messages; combined with V3 context so multi-turn planning (destination in turn 1, duration in turn 2, etc.) is coherent.

**Tests:** verifies the structuring note appears for a trip-planning message.

**Known limitation:** no booking execution exists or was added (explicitly out of scope per the brief); this remains a guidance/summary layer only.

**PASS**

## V7 — Account-Aware Assistance

**Scope:** When authenticated, use only a verified, safe display name; never claim access to bookings/favorites/wallet data that isn't wired in; logged-out users remain fully usable with zero added latency.

**Files changed:** `app/api/ai2/chat/route.ts` — `resolveSafeAccountContext()`: only performs the (server-verified, cookie-gated) Supabase `getUser()` lookup when a plausible `sb-*-auth-token`/`auth-token` cookie is present (zero overhead for the anonymous majority path); extracts only a display name from user metadata, nothing else. `lib/ai2/runtime/chat.ts` — `buildAccountContextNote()` injects "signed in as X; no bookings/favorites/wallet data wired in" only when a name was resolved.

**Tests:** verifies the display name appears in context when provided, verifies no account note is added when logged out.

**Known limitation:** no real bookings/favorites/wallet data source is queried or exposed (explicitly per the brief's own truthfulness rule — "never claim access not present"); this is a name-only context layer today.

**PASS** (for the safe scope actually implemented; deeper account data integration remains future work by design)

## V8 — Travel Wallet Intelligence

**Scope:** Per the brief's own allowance ("if feature/data does not exist yet: state it clearly and prepare integration contract only") — Travel Wallet (passport/visa expiry, document checklist, insurance reminders) is not implemented as a real feature in this codebase.

**Files changed:** `lib/ai2/runtime/chat.ts` — `asksAboutTravelWallet()` + `TRAVEL_WALLET_NOTE`: when a wallet-related question is detected, DABRA is instructed to state plainly that the feature isn't integrated yet and never invent a document status.

**Tests:** verifies the "not yet integrated" note appears for a passport-expiry-in-wallet question.

**Integration contract (for future work, not implemented):**
```ts
type TravelWalletDocument = {
  type: 'passport' | 'visa' | 'insurance';
  expiresAt: string | null; // ISO date, null if unknown
  status: 'valid' | 'expiring-soon' | 'expired' | 'unknown';
};
type TravelWalletSummary = { userId: string; documents: TravelWalletDocument[] };
```

**FAIL for full feature (by design — contract-only, as explicitly permitted by the brief); PASS for "state clearly, never fabricate" requirement**

## V9 — Multi-Provider Resilience + Performance

**Scope:** Verify the seven-provider routing/fallback/latency behavior already hardened in the prior "DABRA latency hotfix" session remains correct.

**Verified (existing + re-run test suites, no regressions):**
- Global deadline 10s default (was 60s), max 1 fallback hop (was 3), env-overridable.
- Per-attempt budget divides only across attempts actually remaining (not a fixed `/3`).
- No duplicate provider calls per hop (`tests/seven-provider-routing.test.ts`, `tests/dabra-character-bible-v2.test.ts`).
- `DABRA_LATENCY` telemetry logs route/provider/providerMs/fallbackCount/grounded only — no message/answer content (confirmed by source read).
- No user-visible provider leakage: confirmed `components/layout/FloatingDibrah.tsx` never renders `provider`/`groundingStatus`/`promptVersion` in the UI, only `payload.answer`.
- Graceful degradation: when all providers fail/time out, a clean local fallback message is returned (never a 60s hang, never a raw error).

**Live observation (external, not a code defect):** OpenAI (default primary) is intermittently slow/timing out in this environment; Gemini (fallback) succeeds intermittently. Documented previously; `DABRA_AI_PROVIDER=gemini` env override is available if a different default is desired.

**PASS**

## V10 — Production Product Gate

**Full gates run after V3-V9 changes:**
- Focused DABRA/provider/marketplace/pilot-auth/render-matrix/product-quality/evolution suites: **99/99 PASS**
- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS

**Browser UAT (local production build of this exact commit, desktop 1440x900 + mobile 390x844):**
- Horizontal overflow: 0 at both viewports
- Single canonical DABRA runtime (`data-dabra-runtime="canonical-v2"`, one `#dibrah` mount)
- Logged-out header shows `تسجيل الدخول`
- Disclaimer/consent gate verified in a prior session on this same codebase (unchanged this round)
- Drag: PASS at both viewports (edge-snap-on-release is the intended design — X always snaps to nearest edge, Y follows the drag; this is not a bug)
- Reload persistence: verified in a prior session (localStorage position restore) — logic unchanged this round
- No raw Markdown: enforced by `finalizeDabraAnswer()` (strip + verified via `tests/dabra-product-quality.test.ts`)
- No legacy UI: `tests/floating-dibrah.contract.test.ts` — "pilot route has one canonical DABRA mount and no legacy pilot chat mount" still passes

**Security:**
- No secrets logged (source-reviewed `logDabraLatency`, `finalizeDabraAnswer`)
- No unsafe mutation added — this entire program is read/inference-only; no new writes, bookings, or payments
- No synthetic inventory exposed — V5 explicitly gates on `source !== 'fallback'` (verified real listings only)

**PASS**

---

## Final Summary

| Version | Result |
|---|---|
| V3 — Conversation Quality | PASS |
| V4 — Service Intelligence | PASS |
| V5 — Marketplace Grounding | PASS |
| V6 — Trip Planner | PASS |
| V7 — Account-Aware Assistance | PASS (safe minimal scope) |
| V8 — Travel Wallet Intelligence | FAIL for full feature (contract-only, as explicitly permitted); PASS for truthful non-fabrication |
| V9 — Multi-Provider Resilience | PASS |
| V10 — Production Product Gate | PASS |

**Remaining P0:** none
**Remaining P1:** Travel Wallet has no real data source (V8, by design/scope); OpenAI (default primary provider) is intermittently slow in the current live environment (external, documented, env-overridable)
**Production readiness:** GO for this PR's scope (still requires the separate PR #32/#33 QA-gate sign-off already tracked in earlier session evidence before any merge/deploy)
