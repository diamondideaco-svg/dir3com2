import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { isProductBookable } from '@/lib/marketplace/booking-gate';
import { requestTypeMatchesProduct } from '@/lib/marketplace/request-gate';
import { isPublicMarketplaceProduct } from '@/lib/marketplace/public-filters';

const product = (overrides: Record<string, unknown> = {}) => ({
  status: 'published',
  deleted_at: null,
  synthetic: false,
  marketplace_environment: 'production',
  fulfilment_state: 'verified_requestable',
  transaction_method: 'request_to_confirm',
  ...overrides,
});

test('production product contract uses status and deleted_at without is_active', () => {
  const requestRoute = fs.readFileSync(path.resolve('app/api/marketplace/requests/route.ts'), 'utf8');
  const bookingRoute = fs.readFileSync(path.resolve('app/api/bookings/route.ts'), 'utf8');
  const publicFilters = fs.readFileSync(path.resolve('lib/marketplace/public-filters.ts'), 'utf8');
  assert.doesNotMatch(`${requestRoute}\n${bookingRoute}\n${publicFilters}`, /\bis_active\b/);
  assert.match(requestRoute, /status, deleted_at, synthetic, marketplace_environment, fulfilment_state, transaction_method/);
  assert.match(publicFilters, /\.is\('deleted_at', null\)/);
});

test('request, quote and booking gates accept only their matching production truth', () => {
  assert.equal(requestTypeMatchesProduct('request_to_confirm', product()), true);
  assert.equal(requestTypeMatchesProduct('request_quote', product({ fulfilment_state: 'verified_quote', transaction_method: 'request_quote' })), true);
  assert.equal(isProductBookable(product({ fulfilment_state: 'live_bookable', transaction_method: 'instant_booking' })), true);
});

test('all customer paths fail closed for non-public and non-production records', () => {
  const denied = [
    { status: 'draft' },
    { status: 'inactive' },
    { status: 'disabled' },
    { status: 'hidden' },
    { deleted_at: '2026-08-28T00:00:00.000Z' },
    { synthetic: true },
    { marketplace_environment: 'sandbox' },
    { marketplace_environment: 'test' },
    { marketplace_environment: 'fallback' },
    { fulfilment_state: 'test_sandbox', transaction_method: 'none' },
    { fulfilment_state: 'catalog_only', transaction_method: 'none' },
  ];

  for (const override of denied) {
    const candidate = product(override);
    const transactionIneligibleOnly = override.fulfilment_state === 'catalog_only';
    assert.equal(isPublicMarketplaceProduct(candidate), transactionIneligibleOnly, JSON.stringify(override));
    assert.equal(requestTypeMatchesProduct('request_to_confirm', candidate), false, JSON.stringify(override));
    assert.equal(requestTypeMatchesProduct('request_quote', product({ ...override, fulfilment_state: override.fulfilment_state ?? 'verified_quote', transaction_method: override.transaction_method ?? 'request_quote' })), false, JSON.stringify(override));
    assert.equal(isProductBookable(product({ ...override, fulfilment_state: override.fulfilment_state ?? 'live_bookable', transaction_method: override.transaction_method ?? 'instant_booking' })), false, JSON.stringify(override));
  }
});

test('a known UUID cannot bypass hidden status', () => {
  const hidden = product({ id: '00000000-0000-4000-8000-000000000001', status: 'hidden' });
  assert.equal(requestTypeMatchesProduct('request_to_confirm', hidden), false);
  assert.equal(isProductBookable({ ...hidden, fulfilment_state: 'live_bookable', transaction_method: 'instant_booking' }), false);
});
