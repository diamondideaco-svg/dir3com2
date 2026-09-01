import assert from 'node:assert/strict';
import test from 'node:test';
import { DIR3COM_CHECKOUT_ROUTE, resolveMarketplaceCheckoutRoute } from '@/lib/marketplace/checkout-router';
import type { MarketplaceTruth } from '@/lib/marketplace/truth';

const base: MarketplaceTruth = {
  family: 'concierge', environment: 'production', supplyType: 'global_travel_partner', supplierVerified: false,
  fulfilmentState: 'catalog_only', transactionMethod: 'none',
};

test('checkout router keeps inventory independent from each transaction rail', () => {
  assert.equal(resolveMarketplaceCheckoutRoute({ ...base, fulfilmentState: 'live_bookable', transactionMethod: 'instant_booking' })?.strategy, 'DIRECT_BOOKING');
  assert.equal(resolveMarketplaceCheckoutRoute({ ...base, fulfilmentState: 'external_provider', transactionMethod: 'provider_checkout' })?.strategy, 'PROVIDER_CHECKOUT');
  assert.equal(resolveMarketplaceCheckoutRoute({ ...base, fulfilmentState: 'verified_requestable', transactionMethod: 'request_to_confirm' })?.strategy, 'REQUEST_TO_CONFIRM');
  assert.equal(resolveMarketplaceCheckoutRoute({ ...base, fulfilmentState: 'catalog_only', transactionMethod: 'none' }), null);
});

test('DIR3COM checkout is reserved without claiming native payment support', () => {
  assert.equal(DIR3COM_CHECKOUT_ROUTE.strategy, 'DIR3COM_CHECKOUT');
  assert.equal(DIR3COM_CHECKOUT_ROUTE.enabled, false);
});
