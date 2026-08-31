export const MARKETPLACE_FAMILIES = ['drive', 'stay', 'fly', 'concierge', 'vip'] as const;

export type MarketplaceFamily = (typeof MARKETPLACE_FAMILIES)[number];
export type MarketplaceFulfilmentState =
  | 'catalog_only'
  | 'verified_requestable'
  | 'verified_quote'
  | 'live_bookable'
  | 'unavailable'
  | 'availability_unknown'
  | 'test_sandbox';
export type MarketplaceTransactionMethod = 'none' | 'instant_booking' | 'request_to_confirm' | 'request_quote';
export type MarketplaceEnvironment = 'production' | 'sandbox' | 'test' | 'synthetic' | 'fallback';
export type MarketplaceSupplyType = 'verified_local_partner' | 'global_travel_partner' | 'dir3com_managed' | 'unknown';

export type MarketplaceTruth = {
  family: MarketplaceFamily;
  fulfilmentState: MarketplaceFulfilmentState;
  transactionMethod: MarketplaceTransactionMethod;
  environment: MarketplaceEnvironment;
  supplyType: MarketplaceSupplyType;
  supplierVerified: boolean;
};

export type MarketplacePrimaryAction =
  | 'continue_to_booking'
  | 'request_to_confirm'
  | 'request_quote'
  | 'view_details'
  | 'unavailable'
  | 'none';

export function isCanonicalMarketplaceFamily(value: unknown): value is MarketplaceFamily {
  return MARKETPLACE_FAMILIES.includes(value as MarketplaceFamily);
}

export function isCustomerSafeMarketplaceTruth(truth: MarketplaceTruth) {
  return truth.environment === 'production' && truth.fulfilmentState !== 'test_sandbox';
}

export function marketplacePrimaryAction(truth: MarketplaceTruth): MarketplacePrimaryAction {
  if (!isCustomerSafeMarketplaceTruth(truth)) return 'none';
  if (truth.fulfilmentState === 'live_bookable' && truth.transactionMethod === 'instant_booking') {
    return 'continue_to_booking';
  }
  if (truth.fulfilmentState === 'verified_requestable' && truth.transactionMethod === 'request_to_confirm') {
    return 'request_to_confirm';
  }
  if (truth.fulfilmentState === 'verified_quote' && truth.transactionMethod === 'request_quote') {
    return 'request_quote';
  }
  if (truth.fulfilmentState === 'catalog_only') return 'view_details';
  if (truth.fulfilmentState === 'unavailable') return 'unavailable';
  return 'none';
}

export function canEnterMarketplaceTransaction(truth: MarketplaceTruth) {
  const action = marketplacePrimaryAction(truth);
  return action === 'continue_to_booking' || action === 'request_to_confirm' || action === 'request_quote';
}

export function assertMarketplaceTruth(truth: MarketplaceTruth) {
  if (!isCanonicalMarketplaceFamily(truth.family)) throw new Error('Invalid marketplace family');
  const action = marketplacePrimaryAction(truth);
  if (truth.fulfilmentState === 'live_bookable' && action !== 'continue_to_booking') {
    throw new Error('Live-bookable supply must use instant booking');
  }
  if (truth.fulfilmentState === 'verified_requestable' && action !== 'request_to_confirm') {
    throw new Error('Requestable supply must use request-to-confirm');
  }
  if (truth.fulfilmentState === 'verified_quote' && action !== 'request_quote') {
    throw new Error('Quote supply must use request-quote');
  }
  return truth;
}
