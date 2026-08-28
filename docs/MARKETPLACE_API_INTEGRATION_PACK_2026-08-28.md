# DIR3COM Marketplace API Integration Pack

Research cutoff: 2026-08-28
Purpose: handoff to the implementation engineer. This document lists legitimate APIs / affiliate interfaces that can feed DIR3COM without scraping. Never commit real credentials.

## Integration policy
- Public Marketplace accepts only PROVIDER_LIVE or PARTNER_VERIFIED sources.
- Sandbox is Preview-only.
- Synthetic/mock/fallback inventory is never public.
- Provider redirects must be allowlisted and preserve attribution.
- Do not claim live availability when an affiliate tool only provides a redirect/check-price action.

## P0 — already present in repository

### Duffel — FLY
Official docs: https://duffel.com/docs/api
Auth: Bearer access token (server only).
Use: flight offer search / orders; existing DIR3COM provider module should remain canonical for Fly.
Status: existing code integration. Do not replace with affiliate inventory; affiliate can be fallback only.

### LiteAPI — STAY (and investigate Experiences)
Official docs: https://docs.liteapi.travel/
API docs/OpenAPI: https://api.liteapi.travel/docs
Auth: API key (server only; use provider's current documented header).
Use: hotel data/search/rates/prebook/book. Hotel content includes imagery where supplied under provider terms. Current DIR3COM code already calls `searchLiteApiHotels`.
Action: verify current key/environment; expose authorized real hotel cards in Preview according to truth mode. Investigate current Experiences API separately before enabling Concierge.

### ZentrumHub — STAY
Official docs: https://docs-hotel.prod.zentrumhub.com/
Use: hotel static content, availability/rates, booking lifecycle according to existing account entitlements.
Status: credentials/integration history exists in project context; engineer must verify actual environment variables and entitlement before enabling.

### Viator — CONCIERGE
Official Partner API docs: https://docs.viator.com/partner-api/
Affiliate resources: https://partnerresources.viator.com/
Use: products/activities when API entitlement exists; otherwise approved tracked affiliate links redirect to Viator checkout.
Status: current marketplace adapter intentionally fail-closed for Viator. Do not remove block until actual entitlement/affiliate configuration is verified.

### CarTrawler — DRIVE
Partner site: https://corporate.cartrawler.com/
Status: current marketplace adapter intentionally fail-closed. Enable only from verified partner configuration / approved microsite or API contract.

## P1 — fastest self-service additions

### Stay22 Allez — STAY fallback
Developer docs: https://docs.stay22.com/
Product: Allez monetized affiliate redirect.
Auth/config: affiliate AID; no secret backend API key is required for basic Allez URL generation once an AID exists.
Integration model: provider_redirect / check_price, not native live inventory.
Action:
1. Obtain DIR3COM Stay22 AID via self-service affiliate onboarding.
2. Implement a server-side canonical Allez URL builder using only documented parameters.
3. Preserve destination / dates only where supported by current docs.
4. Mark cards `checkoutMode=provider_redirect`, `priceState=check_price` unless a separate authorized feed supplies a current price.
5. Never scrape Booking.com/Expedia/etc. Stay22 handles the downstream routing/attribution.
Note: do not build against a paused/unavailable Direct Travel API signup; use currently available Stay22 affiliate products.

### Tiqets Essential Affiliate API — CONCIERGE
Affiliate portal: https://www.tiqets.com/affiliates/
Developer docs: https://developers.tiqets.dev/
Access: Affiliate Essential API token generated/issued through Tiqets affiliate onboarding/portal according to current entitlement.
Use: authorized product content, availability/pricing/reporting at the level enabled for the token.
Action:
1. Create/verify affiliate account.
2. Generate/obtain Essential API token.
3. Use only endpoints shown in the current Tiqets developer portal; do not hardcode guessed endpoint versions.
4. Store token server-side.
5. Map external ID, title, city, category, current price/availability, deeplink and source.
6. Images/reviews/recommendations are separate entitlements: no image reuse until enabled.
Initial QA: Cairo, Riyadh, Jeddah.

### Headout Affiliate API — CONCIERGE
Partner portal: https://www.headout.com/partners/
Developer docs: https://docs.headout.com/
Access: affiliate/API key after Headout partner signup/activation.
Use: products/cities/categories/collections and entitled availability/content.
Action:
1. Create/verify affiliate account and key.
2. Keep API key server-side.
3. Follow current Headout docs for base URL/version/auth; do not call provider API directly from browser.
4. Start with provider_redirect checkout unless booking entitlement is explicitly granted.
5. Map provider attribution and allowed media only.

### DiscoverCars Affiliate — DRIVE fallback
Affiliate signup: https://www.discovercars.com/affiliate
Access: self-service affiliate account for links/deep links/widgets/landing pages; advanced XML/API access may require account enablement.
Integration model P1: provider_redirect.
Action:
1. Obtain affiliate ID/account.
2. Generate documented deep links/widgets for Egypt/Saudi pickup locations.
3. Mark as `provider_redirect`; do not manufacture a native car quote from redirect-only data.
4. Upgrade to XML/API only if the dashboard/account explicitly grants it.

### Travelpayouts — broad fallback layer
Portal: https://www.travelpayouts.com/
Help/docs: https://support.travelpayouts.com/
Data API docs: https://travelpayouts.github.io/slate/
Public data API base documented by Travelpayouts includes `https://api.travelpayouts.com/` for supported data endpoints.
Auth: Travelpayouts token / marker as documented per tool/API; keep token server-side when required.
Use: programs/tools actually enabled in the DIR3COM Project (flights, accommodation, activities, cars, transfers, etc. vary by program).
Important: Travelpayouts API/data endpoints are not automatically booking inventory for every brand. Only use programs shown as connected/approved in the DIR3COM account and obey each program's allowed tools/content rules.
Action:
1. Create/verify DIR3COM Project.
2. Inventory My Programs and record status + permitted tools.
3. Use deep links/widgets/white-label/data APIs only where enabled.
4. Treat as fallback; do not overwrite native Duffel/LiteAPI/ZentrumHub results.

### Ticketmaster Discovery API — Saudi events discovery
Developer portal: https://developer.ticketmaster.com/
Discovery API docs: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
API base: `https://app.ticketmaster.com/discovery/v2/`
Auth: `apikey` query parameter using a Ticketmaster developer API key.
Useful documented resources include events, attractions, venues and classifications under Discovery v2.
Commercial boundary: Discovery API access is not the same as transactional Partner API distribution rights. Affiliate monetization/checkout must follow the applicable Ticketmaster affiliate market/account terms.
Action:
1. Create developer key.
2. Add server-side event discovery adapter for Saudi cities/geo.
3. Use event URLs only as permitted; preserve Ticketmaster source.
4. Affiliate tracking only after the relevant affiliate account/market is accepted/configured.

## P2 — useful, but advanced access may require approval/contact

### Omio
Partner portal: https://partner.omio.com/
Use: affiliate links/widgets/search capabilities according to account access. Do not assume production Search API credentials until portal grants them.

### Civitatis
Affiliate program: https://www.civitatis.com/en/affiliates/
Use: approved affiliate links/widgets initially. API access is a separate gate; do not scrape activity catalog.

### Klook
Affiliate portal: https://affiliate.klook.com/
Use: approved affiliate tools/deep links/widgets first. Advanced API/data-feed/white-label requires the level of partner access granted by Klook.

### Booking.com Demand API
Docs: https://developers.booking.com/demand/docs/open-api/demand-api
Gate: Managed Affiliate Partner/API credentials. Not self-service production inventory for an unapproved account.

### Expedia Rapid
Docs: https://developers.expediagroup.com/rapid
Gate: partner onboarding/approval and launch requirements.

### Agoda
Gate: partner credentials/certification for API production use.

### GetYourGuide Partner API
Partner/API information: https://partner.getyourguide.com/
Gate: API eligibility/partner approval. Affiliate links can be a separate lower-friction path where offered.

## Recommended environment variable names
These are DIR3COM-side names, not claims about provider-required names. Map them internally without committing values:

```
DUFFEL_ACCESS_TOKEN=
LITEAPI_API_KEY=
ZENTRUMHUB_API_KEY=
ZENTRUMHUB_API_SECRET=
VIATOR_API_KEY=
VIATOR_AFFILIATE_ID=
CARTRAWLER_PARTNER_ID=
STAY22_AID=
TIQETS_API_TOKEN=
HEADOUT_API_KEY=
DISCOVERCARS_AFFILIATE_ID=
TRAVELPAYOUTS_TOKEN=
TRAVELPAYOUTS_MARKER=
TICKETMASTER_API_KEY=
```

Do not add a variable merely because it appears above; first verify the provider/account actually uses it and map to existing project conventions.

## Marketplace adapter contract
Every external card/result should carry internally:
- provider
- providerProductId
- sourceMode
- checkoutMode: native | provider_redirect | request
- deepLink (validated/allowlisted)
- priceState: live | check_price | unavailable
- price/currency only when authorized/current
- availabilityStatus
- imageSource + rights state
- lastSyncedAt
- affiliate attribution/tracking metadata (internal where appropriate)

## Execution order for engineer
1. Audit existing env/config for Duffel, LiteAPI, ZentrumHub, Viator, CarTrawler; never print secrets.
2. Verify LiteAPI real hotel Preview first because code integration already exists.
3. Add Stay22 redirect adapter behind feature flag; activate when AID exists.
4. Add Ticketmaster Discovery adapter; developer key is the lowest-friction conventional API credential in this pack.
5. Add Tiqets adapter contract; activate on Essential API token.
6. Add Headout adapter contract; activate on affiliate key.
7. Add DiscoverCars redirect adapter; activate on affiliate ID.
8. Add Travelpayouts routing only for programs actually enabled in the account.
9. Keep CarTrawler/Viator fail-closed until entitlement is proven.
10. Run Cairo/Riyadh/Jeddah AR+EN mobile+desktop QA.

## PASS gate
- No scraped data.
- No secrets in repository/logs/client bundle.
- No mock/synthetic inventory public.
- At least 3 authorized provider sources active in Preview across at least 2 service families.
- Egypt and Saudi each tested against at least 2 authorized sources where inventory exists.
- Redirects are allowlisted and attribution is verified.
- Current price is labeled live only when returned by an authorized current-price source.
- Images shown only under provider/feed permission.
- Independent security + functional regression PASS before Production.
