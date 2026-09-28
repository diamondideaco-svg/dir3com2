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
