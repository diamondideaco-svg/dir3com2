import type { MarketplaceFamilyKey, MarketplaceService } from './data';

/**
 * Customer-facing launch inventory is intentionally narrower than the full
 * marketplace taxonomy. Only verified production partner inventory is shown
 * in the public Marketplace; provider proof and catalogue surfaces keep their
 * own explicit gates.
 */
export const APPROVED_LAUNCH_FAMILIES = ['dir3-drive', 'dir3-stay', 'dir3-vip'] as const satisfies readonly MarketplaceFamilyKey[];
export const COMING_SOON_FAMILIES = ['dir3-fly', 'dir3-concierge'] as const satisfies readonly MarketplaceFamilyKey[];

export function isComingSoonMarketplaceFamily(family?: MarketplaceFamilyKey): family is (typeof COMING_SOON_FAMILIES)[number] {
  return Boolean(family && COMING_SOON_FAMILIES.includes(family as (typeof COMING_SOON_FAMILIES)[number]));
}

export function isApprovedLaunchMarketplaceFamily(family: MarketplaceFamilyKey): family is (typeof APPROVED_LAUNCH_FAMILIES)[number] {
  return APPROVED_LAUNCH_FAMILIES.includes(family as (typeof APPROVED_LAUNCH_FAMILIES)[number]);
}

/** Approved ownership is server-derived from the product/partner relation. */
function isApprovedPartnerSupply(service: MarketplaceService) {
  return isApprovedLaunchMarketplaceFamily(service.family) &&
    service.partnerApproved === true &&
    service.status === 'published' &&
    service.supplierVerified === true &&
    service.marketplaceEnvironment === 'production' &&
    service.synthetic !== true &&
    service.source !== 'fallback' &&
    service.fulfilmentState !== 'test_sandbox' &&
    ((service.transactionMethod === 'request_to_confirm' && service.fulfilmentState === 'verified_requestable') ||
      (service.transactionMethod === 'request_quote' && service.fulfilmentState === 'verified_quote'));
}

export function isApprovedLaunchInventory(service: MarketplaceService) {
  const verifiedProductionInventory = isApprovedLaunchMarketplaceFamily(service.family) &&
    service.source !== 'fallback' &&
    service.provenance === 'PARTNER_VERIFIED' &&
    service.marketplaceEnvironment === 'production' &&
    service.synthetic !== true &&
    service.verified === true &&
    ['published', 'active', 'featured'].includes(service.status ?? '') &&
    service.supplierVerified === true &&
    service.fulfilmentState !== 'test_sandbox';

  return verifiedProductionInventory || isApprovedPartnerSupply(service);
}

export function filterApprovedLaunchInventory(services: MarketplaceService[]) {
  return services.filter(isApprovedLaunchInventory);
}
