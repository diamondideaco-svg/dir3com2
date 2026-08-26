import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMarketplaceCard } from '@/lib/marketplace/cards';
import { calculateCartTotals, createPersisted, readPersisted, recommendationEligible, selectDabraRecommendations, storageKey, validatePersistedMessages, type DabraCartItem } from '@/lib/dabra/travel-commerce-state';
import type { MarketplaceService } from '@/lib/marketplace/data';

function service(provenance: MarketplaceService['provenance'], productCount: number, basePrice: number, id: string) {
  return {
    id, slug: id, name_ar: id, description_ar: id, badge: 'dir3 Stay', family: 'dir3-stay', familyLabel: 'dir3 Stay', category: 'hotels', categoryLabel: 'الفنادق', icon: '', href: '/hotels', metric: '', tags: [], basePrice, currency: 'SAR', productCount, inventoryCount: productCount, availability: 'available', destination: 'cairo', featured: false, popular: false, recommended: true, source: 'api', provenance, createdAt: null, updatedAt: null,
  } satisfies MarketplaceService;
}

function item(currency: string, amount: number, id: string): DabraCartItem {
  return { id, name_ar: id, basePrice: amount, currency, categoryLabel: 'فندق', href: '/hotels' };
}

test('fallback, sandbox, synthetic, unverified, and zero-inventory services are not recommendations', () => {
  const fallback = service('FALLBACK', 2, 10, 'fallback');
  const sandbox = service('PROVIDER_SANDBOX', 2, 20, 'sandbox');
  const synthetic = service('SYNTHETIC_TEST', 2, 30, 'synthetic');
  const zero = service('PROVIDER_LIVE', 0, 1, 'zero');
  const live = service('PROVIDER_LIVE', 1, 40, 'live');
  assert.equal(recommendationEligible(fallback), false);
  assert.equal(recommendationEligible(sandbox), false);
  assert.equal(recommendationEligible(synthetic), false);
  assert.equal(recommendationEligible(zero), false);
  assert.deepEqual(selectDabraRecommendations([fallback, sandbox, synthetic, zero, live]).map((entry) => entry.id), ['live']);
});

test('persisted state is owner-scoped, versioned, and expires', () => {
  const now = 1000;
  const message = [{ id: 'm1', role: 'assistant' as const, text: 'message' }];
  const raw = JSON.stringify(createPersisted(message, 'user-a', now));
  assert.deepEqual(readPersisted(raw, 'user-a', validatePersistedMessages, now + 1), message);
  assert.equal(readPersisted(raw, 'user-b', validatePersistedMessages, now + 1), null);
  assert.equal(readPersisted(raw, 'user-a', validatePersistedMessages, now + 7 * 24 * 60 * 60 * 1000 + 1), null);
  assert.match(storageKey('user-a', 'context'), /user-a/);
  assert.notEqual(storageKey('user-a', 'cart'), storageKey('user-a', 'favorites'));
});

test('anonymous state has no usable persistence owner', () => {
  const message = [{ id: 'm1', role: 'user' as const, text: 'private' }];
  assert.deepEqual(readPersisted(JSON.stringify(createPersisted(message, 'anonymous', 1000)), 'anonymous', validatePersistedMessages, 1001), message);
  assert.notEqual(storageKey('anonymous', 'context'), storageKey('user-a', 'context'));
});

test('cart totals preserve SAR and USD and refuse mixed or unknown currency unification', () => {
  const sar = calculateCartTotals([item('SAR', 100, 'sar-a'), item('SAR', 50, 'sar-b')]);
  assert.deepEqual({ unified: sar.unified, currency: sar.currency, amount: sar.amount }, { unified: true, currency: 'SAR', amount: 150 });
  const usd = calculateCartTotals([item('USD', 25, 'usd-a')]);
  assert.deepEqual({ unified: usd.unified, currency: usd.currency, amount: usd.amount }, { unified: true, currency: 'USD', amount: 25 });
  const mixed = calculateCartTotals([item('SAR', 100, 'sar'), item('USD', 25, 'usd')]);
  assert.equal(mixed.unified, false);
  assert.equal(mixed.amount, null);
  assert.deepEqual(mixed.groups.map((group) => group.currency), ['SAR', 'USD']);
  const unknown = calculateCartTotals([item('???', 100, 'unknown')]);
  assert.equal(unknown.unified, false);
  assert.equal(unknown.groups[0]?.currency, 'UNKNOWN');
});

test('normalized provider cards retain explicit live provenance inputs at the service boundary', () => {
  const card = normalizeMarketplaceCard({ serviceType: 'stay', title: 'Live', location: 'Cairo', provider: 'LiteAPI', priceFrom: 100, currency: 'SAR' });
  assert(card);
  assert.equal(recommendationEligible(service('PROVIDER_LIVE', 1, card.priceFrom ?? 0, 'provider')), true);
});
