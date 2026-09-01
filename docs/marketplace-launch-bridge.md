# DIR3COM Marketplace Launch Bridge

## Transaction architecture

Inventory and checkout remain separate:

`Provider → provider adapter → canonical Marketplace model → Marketplace UI → checkout router`

The router currently supports direct booking, provider checkout, and request-to-confirm. `DIR3COM_CHECKOUT` is reserved and disabled; adding it later does not require rebuilding provider inventory adapters.

## Launch source decisions

| Provider/source | Family | Launch state | Checkout | Evidence boundary |
| --- | --- | --- | --- | --- |
| Duffel | Fly | Production results only when an explicit production environment and server token are configured | None until production booking authority is proven | Test/sandbox results never enter the public Marketplace; bearer requests are restricted to the official Duffel origin |
| LiteAPI | Stay | Production HMAC search only; sandbox stays remain preview-only | None until production transaction authority is proven | Provider name/ID/image/rate truth is preserved |
| Verified local partners | Drive | Active published production inventory | Request to Confirm | Existing ownership and request audit remain authoritative |
| CarTrawler | Drive | Blocked unless existing authorized credentials and commercial access are proven | None | No scrape, substitute car, price, or availability |
| Ticketmaster Discovery | Concierge | Official Saudi event results when the existing server key is authorized | Provider Checkout | Every click revalidates the provider item and allowlisted official URL |
| Viator Basic | Concierge | Commercial/API entitlement blocker | None | Basic/search code is not treated as booking authority |
| Verified local/manual partners | VIP | Published verified records only | Request to Confirm | Synthetic local-test fixtures remain isolated |

### Verified external activation blockers (2026-09-01)

- **CarTrawler / Drive:** the repository expects `CARTRAWLER_PARTNER_TOKEN`, `CARTRAWLER_PARTNER_ID`, and a vendor-issued `CARTRAWLER_API_BASE_URL`. None is configured in DIR3COM Preview or Production. A CarTrawler B2B partner agreement, approved endpoint, credentials, and confirmed Saudi/Egypt coverage are required before search can be enabled; Production checkout authority remains separate.
- **Travelpayouts / Drive alternative:** no DIR3COM Travelpayouts project, connected/approved car-rental program, or issued link/widget/API tool is evidenced. Travelpayouts tools are program-specific, so no generic link or widget may be invented. The exact next step is program connection/approval in the affiliate dashboard, followed by recording the issued tool, tracking identity, allowed domains, coverage, and terms before implementation.
- **Ticketmaster Discovery / Concierge:** the existing server adapter requires a developer-application Consumer Key through `TICKETMASTER_API_KEY` or `TICKETMASTER_CONSUMER_KEY`; neither exists in Preview or Production. Discovery content and official event URLs can be activated after that key is added server-side. Commission tracking additionally requires separate Ticketmaster affiliate approval and publisher tracking.
- **Viator / Concierge alternative:** `VIATOR_API_KEY` is absent and no affiliate/content API partnership is proven. Affiliate approval authorizes content plus provider-site checkout; merchant booking endpoints require a separate merchant entitlement and remain disabled.

No external Drive or Concierge inventory is rendered until one of these authorization paths is completed and runtime-validated. This is a vendor/account blocker, not a payment dependency.

The live Admin Operations matrix derives credential *presence* only and never returns credential values.

Public provider-backed endpoints use bounded request budgets before issuing upstream calls. Ticketmaster handoffs reject malformed input before budget consumption and revalidate current sale state plus the official checkout destination. Deployment-wide distributed rate enforcement remains an infrastructure responsibility in addition to these application controls.

## External blocker outreach drafts — not sent

### Drive affiliate/API access

Subject: DIR3COM authorized car-rental inventory and provider-checkout access

Please confirm the account, commercial approval, Saudi/Egypt coverage, official API/feed/widget/deep-link capability, allowed checkout domains, attribution requirements, and commission model available to DIR3COM. No integration should be activated until the provider confirms authorized use.

Owner: Commercial / Travel Supply. CEO approval is required before sending.

### Viator commercial entitlement

Subject: DIR3COM Viator inventory and checkout entitlement

Please confirm the account tier, API/search entitlement, affiliate/deep-link rights, booking capability, Saudi/Egypt coverage, attribution requirements, and commission model. Existing Basic integration code must remain non-transactional until written entitlement is verified.

Owner: Commercial / Travel Supply. CEO approval is required before sending.
