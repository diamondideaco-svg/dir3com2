import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/marketplace/provider-checkout/route';
import { ProviderCheckoutError, resolveProviderCheckout } from '@/lib/marketplace/provider-checkout';
import { consumeProviderRequestBudget, resetProviderSearchProtection } from '@/lib/marketplace/provider-search-protection';
import type { TicketmasterDiscoveryEvent } from '@/lib/travel/ticketmaster/discovery';

const event: TicketmasterDiscoveryEvent = {
  id: 'evt_sa_1', name: 'Official event', locale: 'en-us', url: 'https://events.tmtickets.sa/event/1', imageUrl: null,
  localDate: '2026-10-01', localTime: '20:00:00', timezone: 'Asia/Riyadh', salesStatus: 'onsale', venue: 'Venue',
  city: 'Riyadh', countryCode: 'SA', priceMin: null, priceMax: null, currency: null,
};

const dependencies = {
  getTicketmasterEvent: async () => event,
  randomUUID: () => '12345678-1234-1234-1234-1234567890ab',
  now: () => new Date('2026-08-31T18:00:00.000Z'),
};

test('provider checkout revalidates the item and returns an internal handoff reference', async () => {
  const target = await resolveProviderCheckout({ provider: 'ticketmaster', providerItemId: event.id }, dependencies);
  assert.equal(target.checkoutUrl, event.url);
  assert.equal(target.sourceUrl, event.url);
  assert.equal(target.handoffReference, 'HOF-123456781234');
  assert.equal(target.transactionMethod, 'provider_checkout');
  assert.equal(target.fulfilmentState, 'external_provider');
});

test('provider checkout never accepts a customer-supplied URL or foreign provider', async () => {
  await assert.rejects(
    () => resolveProviderCheckout({ provider: 'evil', providerItemId: event.id, url: 'https://evil.example' } as never, dependencies),
    (error: unknown) => error instanceof ProviderCheckoutError && error.code === 'PROVIDER_BLOCKED',
  );
});

test('provider checkout rejects malformed IDs, off-sale items, and unsafe authoritative URLs', async () => {
  await assert.rejects(() => resolveProviderCheckout({ provider: 'ticketmaster', providerItemId: '../bad' }, dependencies));
  await assert.rejects(() => resolveProviderCheckout(
    { provider: 'ticketmaster', providerItemId: event.id },
    { ...dependencies, getTicketmasterEvent: async () => ({ ...event, salesStatus: 'offsale' }) },
  ), (error: unknown) => error instanceof ProviderCheckoutError && error.code === 'ITEM_UNAVAILABLE');
  await assert.rejects(() => resolveProviderCheckout(
    { provider: 'ticketmaster', providerItemId: event.id },
    { ...dependencies, getTicketmasterEvent: async () => ({ ...event, url: 'https://evil.example/checkout' }) },
  ), (error: unknown) => error instanceof ProviderCheckoutError && error.code === 'UNSAFE_PROVIDER_URL');
});

test('public provider checkout budget blocks repeated upstream-triggering requests', () => {
  resetProviderSearchProtection();
  for (let index = 0; index < 20; index += 1) {
    assert.equal(consumeProviderRequestBudget('provider-checkout:anonymous', 1_000), true);
  }
  assert.equal(consumeProviderRequestBudget('provider-checkout:anonymous', 1_000), false);
  assert.equal(consumeProviderRequestBudget('provider-checkout:anonymous', 61_001), true);
  resetProviderSearchProtection();
});

test('malformed checkout probes are rejected before consuming provider budget', async () => {
  resetProviderSearchProtection();
  for (let index = 0; index < 25; index += 1) {
    const response = await GET(new NextRequest('http://localhost/api/marketplace/provider-checkout?provider=evil&item=bad'));
    assert.equal(response.status, 409);
  }
  assert.equal(consumeProviderRequestBudget('provider-checkout:anonymous', 1_000), true);
  resetProviderSearchProtection();
});
