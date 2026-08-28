# Global Travel Supply Onboarding Status — 2026-08-28

This report contains no credentials or secret values. All provider probes were performed against sandbox or read-only endpoints and must not be represented as production-live supply.

## Verified providers

| Provider | Family | Account/access | Verified capability | Environment | Current blocker | Next action | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Duffel | Fly | Existing test credential recovered locally | RUH → CAI search returned 106 offers | Test/sandbox | Live mode requires account verification/KYC and funded billing/balance | Keep Preview sandbox-only; CEO completes live activation when commercially approved | CEO / business owner |
| LiteAPI / Nuitee | Stay | Existing sandbox credential recovered from current process | Nine Saudi/Egypt destination searches passed; Riyadh prebook, booking, replay, retrieval and cancellation passed | Sandbox | Production requires payment card, production key and wallet funding | Keep Preview sandbox-only; CEO approves production payment setup | CEO / business owner |
| ZentrumHub | Stay | Existing credentials recovered locally | Authentication, autosuggest and location details pass | Read-only vendor environment | Hotel Content returns HTTP 403; inventory entitlement/supplier assignment is absent | Vendor enables Hotel Content and Availability scope for the existing account | ZentrumHub |
| Travelport | Fly / Stay | Existing credentials recovered locally | OAuth authentication passes | Vendor test environment | Air entitlement rejected with provider code 1012100; Stay unavailable | Travelport enables Air and Hotel entitlements for the existing access group/PCC | Travelport |
| CarTrawler | Drive | Adapter exists; no credential recovered | Not tested live | None | Partner ID/token absent; commercial/vendor activation required | Business owner supplies approved partner account or authorizes application | CEO / vendor |
| Viator | Concierge | Fail-closed adapter exists; no credential recovered | Not tested live | None | Partner qualification and API access not established | Business owner completes/approves affiliate qualification | CEO / Viator |
| Ticketmaster Discovery | Concierge | Existing approved developer application | Saudi event discovery returned 12 normalized listings with images and official detail URLs; Egypt returned a truthful no-results state | Production read-only discovery / external checkout | Native DIR3COM booking is not part of this provider contract | Keep provider-visible external checkout and server-only credential handling | Engineering |

## Ticketmaster activation closure

The existing approved Ticketmaster developer application was verified through the authorized account. Its Discovery credential was used only from a server-side local process and was not printed, committed, documented, or exposed to the client.

Saudi event search returned 12 valid current listings with provider-hosted images and allowlisted official Saudi checkout URLs. Egypt returned zero listings and the Preview preserved a truthful empty state. The integration does not claim DIR3COM booking or payment; those actions complete with Ticketmaster.

Travelpayouts, Stay22, DiscoverCars, Tiqets, Headout, Omio, Civitatis, Klook, Booking.com Demand, Expedia Rapid, Agoda, and GetYourGuide remain inactive: no existing authorized credential was recovered, and no commercial application or legal agreement was submitted as part of this engineering closure.

## Preview gate

- Active verified Preview sources: 3 (Duffel Fly, LiteAPI Stay, Ticketmaster Concierge).
- Active canonical families: Fly, Stay, Concierge.
- Target of 3 legitimate sources across at least 2 families: met.
- Public production activation: not authorized and not performed.
- Marketplace truth remains explicit: Duffel and LiteAPI are sandbox/preview-only; Ticketmaster is production read-only discovery with external-provider checkout.

## Production follow-up

No human approval is required for this Preview closure. Any future Duffel/LiteAPI live activation, paid plan, wallet funding, commercial supplier agreement, or native Ticketmaster transaction expansion remains a separate CEO/vendor-approved production scope.
