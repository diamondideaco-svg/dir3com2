import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MARKETPLACE_FAMILIES,
  canEnterMarketplaceTransaction,
  isCustomerSafeMarketplaceTruth,
  marketplacePrimaryAction,
  type MarketplaceTruth,
} from '@/lib/marketplace/truth';
import { filterCustomerMarketplaceServices } from '@/lib/marketplace/server';
import { isPublicMarketplaceProduct } from '@/lib/marketplace/public-filters';
import { normalizeMarketplaceServices } from '@/lib/marketplace/data';

const truth = (overrides: Partial<MarketplaceTruth> = {}): MarketplaceTruth => ({
  family: 'stay',
  fulfilmentState: 'availability_unknown',
  transactionMethod: 'none',
  environment: 'production',
  supplyType: 'unknown',
  supplierVerified: false,
  ...overrides,
});

test('the public taxonomy contains exactly five canonical families', () => {
  assert.deepEqual(MARKETPLACE_FAMILIES, ['drive', 'stay', 'fly', 'concierge', 'vip']);
});

test('sandbox, test, synthetic and fallback records never enter customer inventory', () => {
  for (const environment of ['sandbox', 'test', 'synthetic', 'fallback'] as const) {
    const item = truth({ environment, fulfilmentState: 'live_bookable', transactionMethod: 'instant_booking' });
    assert.equal(isCustomerSafeMarketplaceTruth(item), false);
    assert.equal(marketplacePrimaryAction(item), 'none');
    assert.equal(canEnterMarketplaceTransaction(item), false);
  }
});

test('catalogue-only and unknown availability never become bookable', () => {
  assert.equal(marketplacePrimaryAction(truth({ fulfilmentState: 'catalog_only' })), 'view_details');
  assert.equal(marketplacePrimaryAction(truth({ fulfilmentState: 'availability_unknown' })), 'none');
});

test('each transactional CTA is gated by matching fulfilment truth', () => {
  assert.equal(marketplacePrimaryAction(truth({ fulfilmentState: 'live_bookable', transactionMethod: 'instant_booking' })), 'continue_to_booking');
  assert.equal(marketplacePrimaryAction(truth({ fulfilmentState: 'verified_requestable', transactionMethod: 'request_to_confirm' })), 'request_to_confirm');
  assert.equal(marketplacePrimaryAction(truth({ fulfilmentState: 'verified_quote', transactionMethod: 'request_quote' })), 'request_quote');
  assert.equal(marketplacePrimaryAction(truth({ fulfilmentState: 'unavailable', transactionMethod: 'instant_booking' })), 'unavailable');
});

test('public exposure gate rejects all non-production provenance', () => {
  const records = ['PARTNER_VERIFIED', 'PROVIDER_LIVE', 'FALLBACK', 'SYNTHETIC_TEST', 'PROVIDER_SANDBOX']
    .map((provenance) => ({ source: provenance === 'FALLBACK' ? 'fallback' : 'api', provenance, marketplaceEnvironment: 'production', fulfilmentState: 'catalog_only' }));
  assert.deepEqual(
    filterCustomerMarketplaceServices(records as never).map((record) => record.provenance),
    ['PARTNER_VERIFIED', 'PROVIDER_LIVE'],
  );
});

test('published status alone is not public marketplace availability', () => {
  assert.equal(isPublicMarketplaceProduct({ status: 'active', synthetic: false }), false);
  assert.equal(isPublicMarketplaceProduct({ status: 'active', synthetic: false, marketplace_environment: 'production', fulfilment_state: 'test_sandbox' }), false);
  assert.equal(isPublicMarketplaceProduct({ status: 'active', synthetic: false, marketplace_environment: 'production', fulfilment_state: 'catalog_only' }), true);
});

test('stored canonical family and supplier verification survive normalization', () => {
  const [unverified] = normalizeMarketplaceServices([{
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'stored-family',
    marketplace_family: 'vip',
    supplier_verified: false,
    marketplace_environment: 'production',
    fulfilment_state: 'catalog_only',
    transaction_method: 'none',
  }], false);
  assert.equal(unverified.family, 'dir3-vip');
  assert.equal(unverified.provenance, 'PROVIDER_LIVE');
  assert.equal(unverified.supplierVerified, false);

  const [verified] = normalizeMarketplaceServices([{
    id: '00000000-0000-4000-8000-000000000002',
    marketplace_family: 'stay',
    supplier_verified: true,
  }], false);
  assert.equal(verified.family, 'dir3-stay');
  assert.equal(verified.provenance, 'PARTNER_VERIFIED');
});

test('airport ground transport maps to Drive while VIP handling and air travel retain their canonical families', () => {
  const normalizeFamily = (name_en: string, overrides: Record<string, unknown> = {}) => normalizeMarketplaceServices([{
    id: `item-${name_en}`,
    slug: name_en.toLowerCase().replaceAll(' ', '-'),
    name_en,
    status: 'active',
    marketplace_environment: 'production',
    synthetic: false,
    ...overrides,
  }], false)[0].family;

  assert.equal(normalizeFamily('Airport transfer'), 'dir3-drive');
  assert.equal(normalizeFamily('Airport chauffeur'), 'dir3-drive');
  assert.equal(normalizeFamily('Airport pickup and drop-off'), 'dir3-drive');
  assert.equal(normalizeFamily('Airport VIP handling', { marketplace_family: 'fly' }), 'dir3-vip');
  assert.equal(normalizeFamily('International flight booking', { marketplace_family: 'fly' }), 'dir3-fly');
  assert.equal(normalizeFamily('International flight airport connection', { marketplace_category: 'airport-transfers' }), 'dir3-fly');
  assert.equal(normalizeFamily('Airline itinerary from the airport', { marketplace_category: 'airport-transfers' }), 'dir3-fly');
});
