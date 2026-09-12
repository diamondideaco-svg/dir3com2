import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { filterApprovedLaunchInventory, isComingSoonMarketplaceFamily } from '@/lib/marketplace/launch-catalog';
import { normalizeMarketplaceServices } from '@/lib/marketplace/data';
import { applyDisplayPricing } from '@/lib/marketplace/server';
import { clearCurrencyCacheForTests } from '@/lib/currency/service';

const read = (file: string) => readFileSync(file, 'utf8');

test('public launch catalog exposes only verified production Drive, Stay and VIP inventory', () => {
  const services = normalizeMarketplaceServices([
    { id: 'drive-ok', marketplace_family: 'drive', supplier_verified: true, verified: true, marketplace_environment: 'production', fulfilment_state: 'verified_requestable' },
    { id: 'stay-ok', marketplace_family: 'stay', supplier_verified: true, verified: true, marketplace_environment: 'production', fulfilment_state: 'catalog_only' },
    { id: 'vip-ok', marketplace_family: 'vip', supplier_verified: true, verified: true, marketplace_environment: 'production', fulfilment_state: 'verified_requestable' },
    { id: 'fly-blocked', marketplace_family: 'fly', supplier_verified: true, verified: true, marketplace_environment: 'production' },
    { id: 'concierge-blocked', marketplace_family: 'concierge', supplier_verified: true, verified: true, marketplace_environment: 'production' },
    { id: 'sandbox-blocked', marketplace_family: 'stay', supplier_verified: true, verified: true, marketplace_environment: 'sandbox' },
    { id: 'unverified-blocked', marketplace_family: 'drive', supplier_verified: false, verified: false, marketplace_environment: 'production' },
  ], false);

  assert.deepEqual(filterApprovedLaunchInventory(services).map((service) => service.id), ['drive-ok', 'stay-ok', 'vip-ok']);
  assert.equal(isComingSoonMarketplaceFamily('dir3-fly'), true);
  assert.equal(isComingSoonMarketplaceFamily('dir3-concierge'), true);
  assert.equal(isComingSoonMarketplaceFamily('dir3-drive'), false);
});

test('all thirteen published Abu Al-Hana Drive products remain visible with truthful request states', () => {
  const products = Array.from({ length: 13 }, (_, index) => {
    const quote = index >= 11;
    const currency = index === 10 ? 'EGP' : quote ? 'USD' : 'SAR';
    return {
      id: `alhana-drive-${index + 1}`,
      marketplace_family: 'drive' as const,
      supplier_name: 'Abu Al hana Drive',
      supplier_verified: true,
      verified: !quote,
      status: 'published',
      synthetic: false,
      marketplace_environment: 'production' as const,
      fulfilment_state: quote ? 'verified_quote' as const : 'verified_requestable' as const,
      transaction_method: quote ? 'request_quote' as const : 'request_to_confirm' as const,
      base_price: quote ? (index === 11 ? 250 : 400) : index === 0 ? 300 : 750,
      currency,
      products: [{ id: `inventory-${index + 1}`, price_per_unit: 1 }],
    };
  });

  const visible = filterApprovedLaunchInventory(normalizeMarketplaceServices(products, { includeFallback: false, source: 'supabase' }));
  assert.equal(visible.length, 13);
  assert.deepEqual(visible.map((service) => service.id), products.map((product) => product.id));
  assert.deepEqual(visible.slice(0, 11).map((service) => service.transactionMethod), Array(11).fill('request_to_confirm'));
  assert.deepEqual(visible.slice(11).map((service) => service.transactionMethod), ['request_quote', 'request_quote']);
  assert.deepEqual(visible.map((service) => service.supplierPriceCurrency), [
    ...Array(10).fill('SAR'), 'EGP', 'USD', 'USD',
  ]);
});

test('supplier pricing is preserved while display currency converts through the configured FX source', async () => {
  const [service] = normalizeMarketplaceServices([{
    id: 'usd-drive', marketplace_family: 'drive', supplier_name: 'Abu Al hana Drive', supplier_verified: true,
    verified: true, status: 'published', synthetic: false, marketplace_environment: 'production',
    fulfilment_state: 'verified_requestable', transaction_method: 'request_to_confirm', base_price: 250, currency: 'USD',
    products: [{ id: 'inventory-usd', price_per_unit: 250 }],
  }], { includeFallback: false, source: 'supabase' });
  const originalFetch = globalThis.fetch;
  try {
    clearCurrencyCacheForTests();
    globalThis.fetch = (async () => new Response(JSON.stringify({
      date: '2026-09-12', rates: { USD: 1, SAR: 3.75, EGP: 50, EUR: 0.9, AED: 3.67 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    const [converted] = await applyDisplayPricing([service], 'SAR');
    assert.equal(converted?.supplierPriceAmount, 250);
    assert.equal(converted?.supplierPriceCurrency, 'USD');
    assert.equal(converted?.displayCurrency, 'SAR');
    assert.equal(converted?.displayPriceAmount, 937.5);
    assert.equal(converted?.pricingStatus, 'converted');
  } finally {
    globalThis.fetch = originalFetch;
    clearCurrencyCacheForTests();
  }
});

test('missing FX or supplier price never hides an approved Drive card', async () => {
  const [usd, missing] = normalizeMarketplaceServices([
    {
      id: 'usd-drive', marketplace_family: 'drive', supplier_name: 'Abu Al hana Drive', supplier_verified: true,
      verified: true, status: 'published', synthetic: false, marketplace_environment: 'production',
      fulfilment_state: 'verified_requestable', transaction_method: 'request_to_confirm', base_price: 250, currency: 'USD',
      products: [{ id: 'inventory-usd', price_per_unit: 250 }],
    },
    {
      id: 'on-request-drive', marketplace_family: 'drive', supplier_name: 'Abu Al hana Drive', supplier_verified: true,
      verified: false, status: 'published', synthetic: false, marketplace_environment: 'production',
      fulfilment_state: 'verified_quote', transaction_method: 'request_quote', base_price: null, currency: null,
      products: [{ id: 'inventory-request', price_per_unit: 0 }],
    },
  ], { includeFallback: false, source: 'supabase' });
  const originalFetch = globalThis.fetch;
  try {
    clearCurrencyCacheForTests();
    globalThis.fetch = (async () => new Response('{}', { status: 503 })) as typeof fetch;
    const result = await applyDisplayPricing([usd, missing], 'SAR');
    assert.equal(result.length, 2);
    assert.equal(result[0]?.pricingStatus, 'conversion_unavailable');
    assert.equal(result[0]?.displayCurrency, 'USD');
    assert.equal(result[1]?.pricingStatus, 'on_request');
    assert.equal(result[1]?.displayPriceAmount, null);
  } finally {
    globalThis.fetch = originalFetch;
    clearCurrencyCacheForTests();
  }
});

test('Marketplace UI gates Coming Soon families and keeps customer cards truth-labelled', () => {
  const explorer = read('components/public/MarketplaceExplorer.tsx');
  const card = read('components/shared/ServiceCard.tsx');
  const route = read('app/api/services/route.ts');
  assert.match(explorer, /enabled: !comingSoonFamily/);
  assert.match(explorer, /comingSoonTitle/);
  assert.match(explorer, /comingSoonDescription/);
  assert.match(explorer, /onClick={retry}/);
  for (const label of ['Source', 'Status', 'Price', 'Location', 'Provider ID', 'Updated', 'Booking status', 'المصدر', 'الحالة', 'السعر', 'الموقع']) {
    assert.ok(card.includes(label), `missing truth label: ${label}`);
  }
  assert.match(explorer, /Display currency|عملة العرض/);
  assert.match(explorer, /currency: displayCurrency/);
  assert.match(route, /publicMarketplace:\s*true/);
  assert.match(read('lib/marketplace/travel-provider-integration.ts'), /Promise\.allSettled/);
  assert.match(read('components/public/useMarketplaceServices.ts'), /12_000/);
});
