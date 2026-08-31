import type { MarketplaceTruth } from './truth';
import { marketplacePrimaryAction } from './truth';

export const MARKETPLACE_CHECKOUT_STRATEGIES = [
  'DIRECT_BOOKING',
  'PROVIDER_CHECKOUT',
  'REQUEST_TO_CONFIRM',
  'DIR3COM_CHECKOUT',
] as const;

export type MarketplaceCheckoutStrategy = (typeof MARKETPLACE_CHECKOUT_STRATEGIES)[number];

export type MarketplaceCheckoutRoute = {
  strategy: MarketplaceCheckoutStrategy;
  enabled: boolean;
  action: 'booking' | 'provider_handoff' | 'request' | 'reserved';
};

/**
 * Selects a transaction rail from canonical truth only. Provider adapters remain
 * inventory/content adapters and do not own payment strategy decisions.
 */
export function resolveMarketplaceCheckoutRoute(truth: MarketplaceTruth): MarketplaceCheckoutRoute | null {
  const action = marketplacePrimaryAction(truth);

  if (action === 'continue_to_booking') {
    return { strategy: 'DIRECT_BOOKING', enabled: true, action: 'booking' };
  }

  if (action === 'continue_to_provider') {
    return { strategy: 'PROVIDER_CHECKOUT', enabled: true, action: 'provider_handoff' };
  }

  if (action === 'request_to_confirm' || action === 'request_quote') {
    return { strategy: 'REQUEST_TO_CONFIRM', enabled: true, action: 'request' };
  }

  return null;
}

/** Reserved future rail; intentionally disabled until native payment is approved. */
export const DIR3COM_CHECKOUT_ROUTE: MarketplaceCheckoutRoute = Object.freeze({
  strategy: 'DIR3COM_CHECKOUT',
  enabled: false,
  action: 'reserved',
});
