# Task 153 — public Stay Sandbox Demo

Owner: Codex Desktop — Engineer A. Base: `a21ce8000612c4d57eed6b87ed6abfb4f78b764f`.
Branch: `codex/public-stay-sandbox`. Release requires independent exact-SHA functional/security review and CEO authorization. No merge or Production deployment is authorized by this document.

## Boundary and configuration

Default OFF. Anonymous `/marketplace?family=dir3-stay` uses the new Demo only when all server flags pass:

- `DIR3COM_STAY_SANDBOX_ENABLED=true`
- `DIR3COM_STAY_SANDBOX_PROVIDERS=liteapi` (exact allowlist)
- `LITEAPI_ENV=sandbox` and an existing server-only `LITEAPI_TEST_API_KEY` Sandbox credential
- Recognized Vercel `preview`/`production`, or explicit local `DIR3COM_STAY_SANDBOX_LOCAL=true` without `VERCEL_ENV`.

This change permits a separately authorized future public Sandbox Demo; it does not turn on any Production flag. Preview verification must scope variables to this branch only. Never expose the key via `NEXT_PUBLIC_*`, URLs, reports, logs or committed files. Existing Preview provider-proof restrictions remain unchanged.

`inventory=partners` is the separate published partner Stay catalogue. Drive, VIP, Fly/Concierge launch behavior, authentication, requests, payments, migrations and partner data are untouched.

## Data truth and search

Reuse the existing LiteAPI `/hotels/rates` search and official API origin. Only a successful response explicitly marked `sandbox: true` can render cards. At most 20 unique hotel IDs; no fixture inventory, fallback photos, fabricated prices or availability. The permanent bilingual Sandbox Demo warning is shown on search, each card and detail. No prebook/book/payment/request handler or action is connected.

Cards/details retain provider hotel and offer IDs, original returned currency, timestamp, room/name/location/photo/rating when supplied. A zero/unset rating is not represented as a genuine review score. Public price prefers provider `suggestedSellingPrice`, then aggregate `offerRetailRate`; a room price is usable only for a one-room search. No multiplied or invented multi-room price. Price filters apply only to their selected currency; sorting groups unlike currencies instead of pretending FX equivalence.

Destination allowlist reuses the existing approved region/city scope. Search is explicitly adults-only: 1–9 adults across 1–4 rooms, allocated evenly with remainder to the first rooms; no invented child ages. Valid future dates, maximum 30 nights and 365-day arrival horizon. URL retains all search/sort/filter state; details re-resolve the same search and hotel ID, and explicitly report if a hotel no longer appears.

## Resource/abuse controls and threat model

Assets at risk: server credential, provider quota, availability/price truth, separation from transaction paths. Anonymous callers may alter URL parameters and repeatedly request searches; provider data is untrusted display input.

- Validate input before provider access; exact server allowlist and default-off flags.
- Read-only provider operation, one attempt, 12-second abort including body read; 18-second client abort and explicit manual retry only.
- Coalesce identical in-flight queries; one active search and at most one new provider request/second per process.
- 60-second result cache preserving the ORIGINAL retrieved timestamp; max 64 entries. Controlled unavailable state; no stale/fabricated fallback. HTTP 429 with Retry-After when locally busy.
- Official LiteAPI FAQ specifies Sandbox 5 requests/second. These process-local controls are NOT an account-wide distributed limiter. Before any public Production activation, the release owner must confirm account entitlement/limits and apply a deployment-wide ingress/rate policy suitable for the expected worker count. Vendor 429 remains unavailable/busy, never fake inventory.
- React escapes text, image URLs require HTTPS without userinfo, images are not server-proxied; errors never serialize provider exception bodies or environment.
- Detail route is narrowly public; existing authentication/RBAC/RLS and transaction endpoints are not weakened. Public API is GET-only, no writes.

Sources: [LiteAPI FAQ](https://docs.liteapi.travel/docs/faq), [rates structure](https://docs.liteapi.travel/docs/hotel-rates-api-json-data-structure).

## Verification evidence

Local browser on loopback port 3027, anonymous (Sign in visible): Cairo, 2026-10-12 to 2026-10-14, 2 adults, 1 room, SAR returned 20 real Sandbox hotel cards. Indiana Hotel (`lp655b592f`) opened with actual provider metadata and disabled booking boundary. Representative retrieved timestamp: `2026-09-18T21:57:25.066Z`. This is Sandbox evidence, not Live availability or a reservation.

AR RTL / EN LTR at 1449 and 390: no horizontal overflow (document width 1434/375 including scrollbar vs viewport 1449/390). Search, ascending/descending price order, hotel-name filter, detail, Back and Refresh preserve URL context. Screenshots remain local, excluded from Git. Final exact-SHA CI, Preview and independent review results belong in the PR/Task evidence rather than being preclaimed here.

Focused command: `node --import tsx --test tests/stay-sandbox.test.ts tests/liteapi-provider.test.ts tests/liteapi-hmac-auth.test.ts tests/liteapi-preview-truth.test.ts tests/marketplace-provider-proof.test.ts` — 62/62 pass. Provider unit tests use transport doubles only, never runtime inventory.

## Final-Preview regression correction

Control Tower reproduced zero cards on the exact Preview URL containing `providerProof=liteapi` at SHA `3ec3c6538226d32262118c02f9ba3c6ded0f5117`. The SSR boolean selected the legacy catalogue client, which fetched `/api/services`; it did not invoke the provider-proof API. The deployment had the new Stay flags/key, not the separate legacy proof flags. Previous browser evidence covered the new Stay path and must not be treated as proof of this query variant.

The legacy URL now selects the same Stay client and preserves submitted dates/search intent. Its Preview/local request reaches `/api/marketplace/provider-proof?surface=stay-sandbox` and delegates to the existing validated/cached Stay handler, never a second provider integration. This alias requires exactly LiteAPI, Sandbox and Stay; it denies Production even if Stay flags are set. The normal Stay endpoint and separate partner catalogue remain unchanged. No environment changes are needed. Search forms, filter URLs and detail links preserve the proof context.

`tests/stay-sandbox-flow.test.ts` executes the real page selection, client effect, API dispatch, provider search/cache and card/detail rendering with only an isolated transport double. It covers the reported URL in AR/EN, 20-card cap, unavailable-without-fallback, closed gates, other-provider denial and unaffected ordinary Stay/Drive routing. Real-provider evidence still requires the final Preview browser, not these doubles.

## Rollback procedure

Disable only `DIR3COM_STAY_SANDBOX_ENABLED` in the affected environment under normal release authority. This returns Stay to its existing partner path and denies the Demo API/detail. No database rollback, inventory repair, migration or transaction reversal is necessary. No environment change or deployment should be inferred as approved from CI PASS.
