# Task 172 — Drive prices and internal DABRA journeys

Date: 2026-09-28. Implementation: Codex — ChatGPT Work Mode.
Branch: `fix/drive-pricing-dabra-internal`.
Base: `f095853ca112e03c394af9b54ba2004500922a79`.
Task: https://github.com/diamondideaco-svg/dir3com2/issues/172

## Price contract

The latest CEO instruction reduces each CURRENT published car rate by 15%, once.
This is not removal of the earlier 10% markup. Source spreadsheets and historical
migrations remain unchanged. Daily and airport prices are reduced separately to
preserve the exact requested reduction, including the legacy Range Rover 2025
airport rate (250 -> 212.50 USD). No silent correction of its historical ratio.

Scope captured read-only: 30 managed offers, 13 published partner Drive products,
and 13 associated availability records (10 with price overrides; 3 null).
Currencies, availability, capacities, images, supplier approval and existing
requests/quotes are preserved. Partner display normalization retains cents.

The guarded forward migration checks exact IDs, old amounts/currencies/version
and availability overrides; locks only affected tables during the short update;
updates the RPC catalogue literal without replacing its authority/replay logic;
and records one append-only system event. Any drift or non-price mutation rolls
back the transaction. Reapplication fails before a second discount. App version
v4 and database v4 must be released together. An old request retry retains its
saved version and amount; a NEW stale-version submission fails closed.

No Production migration or price mutation has been executed by this change.
Before applying, recheck the captured baseline. A mismatch requires recapturing
and reviewing the delta, not weakening the guard. Existing commercial quotes are
not retroactively discounted.

## DABRA contract

Public `/api/ai2/chat` now uses an internal catalogue/service router. Chat and
travel-plan inputs return local answers with actual managed rates and allowlisted
links. This route no longer invokes provider/model/web fallback, even if the
legacy global-web flag is enabled. Historical AI provider/lab modules remain
unchanged; this change does not certify or activate seven AI providers.

Supported journeys: Egypt car/model/budget selection, bounded follow-up context,
current rates, selection linked to Marketplace, six-hour rule guidance, and
existing authenticated request/Operations flow. Public browsing stays anonymous;
chat cannot create, accept, cancel, pay or confirm requests. Account actions link
to their existing authenticated screens. The full DABRA view and floating widget
both render the local action links.

Stay links to the existing Sandbox form and carries explicit destination/dates/
adults/currency without auto-searching a provider. Stay prices only come from its
actual search response. Fly/Concierge remain Coming Soon; VIP links to existing
published inventory. No competitor referrals, fake availability or unsupported
commercial capability. This bounded catalogue router is not a general-purpose
LLM or complete autonomous booking agent; natural-language date extraction is
limited to explicit ISO dates/times and known city/model aliases.

## Verification and release

Focused suite: `tests/dabra-platform-assistant.test.ts`, Drive catalogue/request,
DABRA stream/locale/provider-observability and marketplace card regressions.
Local PostgreSQL fixture: `TASK172_PRICE_RELEASE=1` with existing PGlite harness.
It proves 30+13 prices, ten overrides, rollback on drift, no compounding, old/new
request replay and unchanged original quotes. CI's isolated PostgreSQL 17 harness
also invokes `verifyDrivePriceRelease`; no remote database credentials are used.

Independent functional/security review and exact Preview browser evidence remain
release gates. Implementation self-checks do not count as independent review.
Do not reuse prior independent approvals as coverage for this diff.
WhatsApp PR #171 and Google PR #164 are not changed or blocked by this branch.

## Selected currency correction

The CEO clarified that entered currency is the source price, not a forced customer
display currency. Header, Home search, managed Drive, partner Explorer, Stay form,
DABRA cards and chat now share SAR/USD/EGP/EUR/AED selection. Selection persists
locally and in the current URL; server and initial client markup both use the
same default before hydration. The original amount/currency remain authoritative.
Chat receives only the currency code, never a client-provided exchange rate.

The previous Frankfurter v1 basket required currencies outside ECB coverage, the
Home converter was explicitly disabled and /api/currency did not exist. Use the
existing Frankfurter provider's v2 daily reference basket, per
https://frankfurter.dev/ . There is no new subscription or key. Cache one verified
USD basket for ten minutes, share in-flight requests, and back off failures for
30 seconds. Missing/invalid/duplicate/future/older-than-seven-day rows fail closed.
Removed hardcoded fallback exchange rates. On failure the card remains visible
in its ORIGINAL currency with an explicit conversion-unavailable message. Never
relabel source amounts as converted. The displayed conversion is not a payment,
settlement, availability or final Operations quote. Currency changes alone do
not execute a Stay provider search.

Weather inspection found an invalid current-variable `time` in the existing
Open-Meteo request; time is already returned automatically. Removed that variable
and stopped null observations becoming zero. Maps remains the existing explicit
Google Maps link to Riyadh; there is no integrated pickup map/location lookup and
no claim of a completed maps API integration.

FX network calls are fixed-host numeric reference-data calls only. DABRA still
has no external web search, model web tools, or competitor referrals. Final
independent review must cover this added currency/weather delta too.

### Currency navigation follow-up

Display-only changes use `displayCurrency` in the URL, separately from the original provider/search `currency`. Drive/Stay details, back links, and family navigation retain that preference without changing provider search/filter semantics. Login handoff saves the current trip draft under the destination URL's draft key. The obsolete My Bookings launcher payload assertion now includes the approved currency preference; no auth/booking behavior was removed.

Actual Preview evidence on the currency implementation: T2 USD 140.25 rendered SAR 525.94 and EGP 7,264.67 using reference rates dated 2026-09-28. This is not a Production release or independent review.

### Destination map correction

The Home map no longer hardcodes Riyadh. It defaults to the runtime weather city, accepts a customer-entered destination, and opens the fixed Google Maps search URL only on an explicit link click. The UI identifies Google Maps; there is no automatic external search, geolocation permission, embedded map, Places autocomplete, routing estimate or booking capability. Existing weather Preview response was Cairo 32°C/clear.
