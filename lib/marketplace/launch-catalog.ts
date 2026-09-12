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

function normalizeSupplierName(value?: string) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() ?? '';
}

/**
 * Abu Al-Hana's 13 published Drive records are authoritative partner inventory.
 * Two approved quote records predate the product-level `verified` bit, so the
 * partner approval/publication contract is the source of truth for this known
 * supplier while their quote/request state remains visible to customers.
 */
function isApprovedAbuAlHanaDrive(service: MarketplaceService) {
  return service.family === 'dir3-drive' &&
    normalizeSupplierName(service.supplierName) === 'abu al hana drive' &&
    service.status === 'published' &&
    service.supplierVerified === true &&
    service.marketplaceEnvironment === 'production' &&
    service.synthetic !== true &&
    service.source !== 'fallback' &&
    service.fulfilmentState !== 'test_sandbox' &&
    (service.transactionMethod === 'request_to_confirm' || service.transactionMethod === 'request_quote');
}

export function isApprovedLaunchInventory(service: MarketplaceService) {
  const verifiedProductionInventory = isApprovedLaunchMarketplaceFamily(service.family) &&
    service.source !== 'fallback' &&
    service.provenance === 'PARTNER_VERIFIED' &&
    service.marketplaceEnvironment === 'production' &&
    service.synthetic !== true &&
    service.verified === true &&
    service.supplierVerified === true &&
    service.fulfilmentState !== 'test_sandbox';

  return verifiedProductionInventory || isApprovedAbuAlHanaDrive(service);
}

export function filterApprovedLaunchInventory(services: MarketplaceService[]) {
  return services.filter(isApprovedLaunchInventory);
}
