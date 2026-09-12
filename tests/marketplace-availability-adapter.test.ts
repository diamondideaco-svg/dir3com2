import assert from 'node:assert/strict';
import test from 'node:test';

test('real Supabase query builder scopes availability and retains products when availability read fails', async () => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const oldFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://unit-test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-only-not-a-credential';
  let failAvailability = false;
  let availabilityReads = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.hostname, 'unit-test.invalid');
    const table = url.pathname.split('/').pop();
    if (table === 'products') return Response.json([{
      id: 'unit-product', status: 'published', synthetic: false, base_price: 80, currency: 'USD',
    }]);
    if (table === 'product_availability') {
      if (url.searchParams.get('select')?.includes('partner:partners')) return Response.json([]);
      availabilityReads++;
      assert.equal(url.searchParams.get('product_id'), 'in.(unit-product)');
      assert.equal(url.searchParams.get('synthetic'), 'eq.false');
      assert.match(url.searchParams.get('date') ?? '', /^gte\.\d{4}-\d{2}-\d{2}$/);
      if (failAvailability) return Response.json({ message: 'unit read failure' }, { status: 400 });
      return Response.json([{
        product_id: 'unit-product', date: new Date().toISOString().slice(0, 10), available: false,
        capacity: 2, booked_count: 2, synthetic: false, environment: 'production',
      }]);
    }
    return Response.json([]);
  }) as typeof fetch;
  try {
    const { supabaseMarketplaceAdapter } = await import('../lib/marketplace/adapters');
    const first = await supabaseMarketplaceAdapter.fetchServices();
    assert.equal(first?.services.length, 1);
    assert.equal(first?.services[0].availability_status, 'sold-out');
    assert.equal(first?.services[0].inventory_count, 0);
    failAvailability = true;
    const failed = await supabaseMarketplaceAdapter.fetchServices();
    assert.equal(failed?.services.length, 1);
    assert.equal(failed?.services[0].availability_status, 'unknown');
    assert.equal(failed?.services[0].base_price, 80);
    assert.equal(failed?.services[0].currency, 'USD');
    assert.equal(availabilityReads, 2);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
