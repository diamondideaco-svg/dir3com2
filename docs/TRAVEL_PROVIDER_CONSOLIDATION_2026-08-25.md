# DIR3COM Travel Provider Consolidation — 2026-08-25

## Canonical baseline

- Branch: `feat/travel-provider-consolidation-final`
- UI baseline: inherited approved shared Web platform; no redesign or route replacement.
- Provider foundation: `lib/travel/contracts.ts`, `lib/travel/errors.ts`, and provider-scoped server adapters.
- Included: Duffel Fly, LiteAPI Stay (sandbox X-API-Key plus optional HMAC), CarTrawler Drive, Viator Basic Concierge, local Egypt VIP test adapter.
- DABRA orchestration remains deferred.

## Absorbed PASS branches

- `feat/travel-provider-final-hardening`
- `feat/travel-liteapi-hmac-auth`
- `feat/travel-cartrawler-drive`
- `feat/travel-viator-concierge`
- `feat/vip-local-egypt-partner-test-ready`

## Superseded feature checkpoints

The following feature branches remain in Git history but are superseded for future Travel integration work by the canonical branch above:

- `feat/travel-duffel-poc`
- `feat/travel-liteapi-stay-poc`
- the absorbed PASS branches listed above

No branch was deleted and no history was rewritten.

## Runtime/UI cleanup audit

No legacy runtime file or visual asset was removed. Existing root service routes are intentional compatibility redirects, and all provider adapters/tests are referenced by their contracts, health reporting, or regression gates. No file met the required standard of being both unreferenced and obsolete, so removal would have created unnecessary regression risk.

## External capability state

- CarTrawler local engineering is complete; real staging calls require vendor partner credentials and endpoints.
- Viator Basic local engineering is complete; API access/key entitlement remains vendor-controlled, and booking/cancellation are explicitly denied at the Basic capability boundary.
- VIP business values remain `UNVERIFIED` synthetic local-test placeholders pending partner replacement.
- No live booking, payment, production database write, merge, or deployment occurred.
