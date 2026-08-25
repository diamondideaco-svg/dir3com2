import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMarketplaceCard,
  normalizeMarketplaceCards,
  resolveMarketplaceImage,
  type MarketplaceCard,
} from '@/lib/marketplace/cards';

test('provider data is normalized into a single marketplace card contract', () => {
  const card = normalizeMarketplaceCard({
    serviceType: 'stay',
    title: 'Riyadh Grand Hotel',
    subtitle: 'Downtown resort stay',
    location: 'Riyadh',
    provider: 'LiteAPI',
    image: 'https://images.example.com/hotel.jpg',
    imageSource: 'PROVIDER',
    priceFrom: 620,
    totalPrice: 620,
    currency: 'SAR',
    availabilityStatus: 'available',
    rating: 4.8,
    category: 'hotel',
    deepLink: '/stay/riyadh-grand-hotel',
    capabilityStatus: 'available',
    verified: true,
    synthetic: false,
    providerSandbox: false,
  });

  assert.ok(card);
  assert.equal(card?.serviceType, 'stay');
  assert.equal(card?.imageSource, 'PROVIDER');
  assert.equal(card?.priceFrom, 620);
  assert.equal(card?.totalPrice, 620);
  assert.equal(card?.verified, true);
});

test('missing images resolve to the canonical fallback for each service category', () => {
  const fallback = resolveMarketplaceImage({
    serviceType: 'drive',
    image: null,
    imageSource: 'NONE',
    synthetic: false,
    providerSandbox: false,
  });

  assert.ok(fallback);
  assert.equal(fallback, '/brand/runtime/1000467135.png');
});

test('blocked providers fail closed and do not leak fake inventory', () => {
  const card = normalizeMarketplaceCard({
    serviceType: 'concierge',
    title: 'Concierge activity',
    subtitle: 'Unavailable',
    location: 'Cairo',
    provider: 'Viator',
    image: 'https://images.example.com/concierge.jpg',
    imageSource: 'PROVIDER',
    priceFrom: 250,
    totalPrice: 250,
    currency: 'EGP',
    availabilityStatus: 'unavailable',
    capabilityStatus: 'blocked',
    verified: false,
    synthetic: false,
    providerSandbox: false,
  });

  assert.ok(card);
  assert.equal(card?.capabilityStatus, 'blocked');
  assert.equal(card?.availabilityStatus, 'unavailable');
});

test('synthetic VIP inventory is never surfaced as live public products', () => {
  const card = normalizeMarketplaceCard({
    serviceType: 'vip',
    title: 'VIP Arrival Lounge',
    subtitle: 'Sandbox test partner',
    location: 'Jeddah',
    provider: 'Test Partner',
    image: 'https://images.example.com/vip.jpg',
    imageSource: 'PARTNER',
    priceFrom: 150,
    totalPrice: 150,
    currency: 'SAR',
    availabilityStatus: 'available',
    capabilityStatus: 'available',
    verified: false,
    synthetic: true,
    providerSandbox: true,
  });

  assert.equal(card, null);
});

test('arrays of provider records are normalized without leaking invalid items', () => {
  const cards = normalizeMarketplaceCards([
    {
      serviceType: 'fly',
      title: 'CAI to JED',
      subtitle: 'Riyadh to Jeddah',
      location: 'Riyadh',
      provider: 'Duffel',
      image: null,
      imageSource: 'NONE',
      priceFrom: 420,
      totalPrice: 420,
      currency: 'SAR',
      availabilityStatus: 'available',
      capabilityStatus: 'available',
      verified: true,
      synthetic: false,
      providerSandbox: false,
    },
    {
      serviceType: 'vip',
      title: 'Synthetic VIP Test',
      subtitle: 'Not real',
      location: 'Riyadh',
      provider: 'Synthetic Test',
      image: null,
      imageSource: 'NONE',
      priceFrom: 0,
      totalPrice: 0,
      currency: 'SAR',
      availabilityStatus: 'available',
      capabilityStatus: 'available',
      verified: false,
      synthetic: true,
      providerSandbox: true,
    },
  ] as Array<MarketplaceCard>);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.serviceType, 'fly');
});
