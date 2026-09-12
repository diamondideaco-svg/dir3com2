import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { summarizeCatalogAvailability, type CatalogAvailabilityRow } from '../lib/marketplace/catalog-availability';
import { normalizeMarketplaceServices } from '../lib/marketplace/data';
import { filterApprovedLaunchInventory } from '../lib/marketplace/launch-catalog';
import { fetchTravelProviderHotels } from '../lib/marketplace/travel-provider-integration';

const today = '2026-09-12';
const row: CatalogAvailabilityRow = {
  product_id: 'unit-product', date: today, available: true,
  capacity: 3, booked_count: 1, synthetic: false, environment: 'production',
};

test('availability and remaining count come from an authoritative row, not wrappers', () => {
  assert.deepEqual(summarizeCatalogAvailability([row], row.product_id, today), {
    availability_status: 'available', inventory_count: 2,
  });
  const [card] = normalizeMarketplaceServices([{
    id: row.product_id, products: [{ id: row.product_id }],
    ...summarizeCatalogAvailability([], row.product_id, today),
  }], false);
  assert.equal(card.availability, 'unknown');
  assert.equal(card.inventoryCount, 0);
});

test('expired, foreign-product, synthetic and sandbox rows never establish public availability', () => {
  for (const excluded of [
    { ...row, date: '2026-09-11' }, { ...row, product_id: 'another-product' },
    { ...row, synthetic: true }, { ...row, environment: 'sandbox' },
  ]) {
    assert.deepEqual(summarizeCatalogAvailability([excluded], row.product_id, today), {
      availability_status: 'unknown', inventory_count: 0,
    });
  }
});

test('sold out, blocked and exhausted capacity cannot become limited/requestable inventory', () => {
  for (const blocked of [
    { ...row, available: false }, { ...row, booked_count: 3 },
    { ...row, availability_status: 'sold-out' }, { ...row, availability_status: 'unavailable' },
    { ...row, availability_status: 'full' }, { ...row, availability_status: 'maintenance' },
    { ...row, availability_status: 'blackout' },
  ]) {
    assert.equal(summarizeCatalogAvailability([blocked], row.product_id, today).availability_status, 'sold-out');
  }
  assert.equal(summarizeCatalogAvailability([{ ...row, availability_status: 'partially_booked' }], row.product_id, today).availability_status, 'limited');
  assert.equal(summarizeCatalogAvailability([{ ...row, availability_status: 'unknown' }], row.product_id, today).availability_status, 'unknown');
});

test('daily capacities are not summed and missing quantities are not invented', () => {
  assert.equal(summarizeCatalogAvailability([row, { ...row, date: '2026-09-13', capacity: 10 }], row.product_id, today).inventory_count, 2);
  assert.deepEqual(summarizeCatalogAvailability([{ ...row, capacity: null }], row.product_id, today), {
    availability_status: 'available', inventory_count: 0,
  });
});

test('all thirteen approved products remain visible with unknown/sold-out availability and original prices', () => {
  const products = Array.from({ length: 13 }, (_, index) => ({
    id: `unit-drive-${index}`, marketplace_family: 'drive' as const,
    verified: true, supplier_verified: true, status: 'published', synthetic: false,
    marketplace_environment: 'production' as const, fulfilment_state: 'verified_requestable' as const,
    transaction_method: 'request_to_confirm' as const,
    base_price: index === 12 ? null : 100 + index, currency: ['SAR', 'USD', 'EGP'][index % 3],
    availability_status: index % 2 ? 'sold-out' : 'unknown', inventory_count: 0,
  }));
  const cards = filterApprovedLaunchInventory(normalizeMarketplaceServices(products, false));
  assert.equal(cards.length, 13);
  cards.forEach((card, index) => {
    assert.equal(card.supplierPriceAmount, products[index].base_price);
    assert.equal(card.supplierPriceCurrency, products[index].currency);
    assert.equal(card.availability, products[index].availability_status);
  });
  assert.equal(cards[12].pricingStatus, 'on_request');
});

test('adapter reads production availability scoped to selected products and fails unknown on read error', () => {
  const adapter = readFileSync('lib/marketplace/adapters.ts', 'utf8');
  assert.match(adapter, /from\('product_availability'\)/);
  assert.match(adapter, /\.in\('product_id', productIds\)[\s\S]*\.eq\('synthetic', false\)[\s\S]*\.gte\('date', today\)/);
  assert.match(adapter, /availabilityResult\.error \? \[\]/);
  assert.match(adapter, /summarizeCatalogAvailability\(availabilityRows, product\.id, today\)/);
  const card = readFileSync('components/shared/ServiceCard.tsx', 'utf8');
  assert.match(card, /marketplacePresentation && service\.availability === 'sold-out' \? 'unavailable'/);
  assert.match(card, /marketplacePresentation && service\.availability === 'unknown' \? 'view_details'/);
});

test('LiteAPI rejects missing child ages without calling the provider', async () => {
  const originalEnv = process.env.LITEAPI_ENV;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  process.env.LITEAPI_ENV = 'sandbox';
  globalThis.fetch = (async () => { calls++; throw new Error('No external call allowed'); }) as typeof fetch;
  try {
    const cards = await fetchTravelProviderHotels({ mode: 'PROVIDER_SANDBOX', proofMode: true,
      destination: 'Cairo', checkIn: '2026-10-12', checkOut: '2026-10-14', children: 1 });
    assert.deepEqual(cards, []);
    assert.equal(calls, 0);
  } finally {
    if (originalEnv === undefined) delete process.env.LITEAPI_ENV;
    else process.env.LITEAPI_ENV = originalEnv;
    globalThis.fetch = originalFetch;
  }
});
