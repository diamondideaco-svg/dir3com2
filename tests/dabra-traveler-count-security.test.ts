import assert from 'node:assert/strict';
import test from 'node:test';

import { createDuffelCapabilityAdapter, createLiteApiCapabilityAdapter, parseTravelIntent } from '@/lib/ai2/orchestration';
import type { CapabilitySearchContext, TravelIntent, TripPlan } from '@/lib/ai2/orchestration';
import { searchDuffelFlights } from '@/lib/travel/duffel/search';
import { TravelProviderError } from '@/lib/travel/errors';
import { searchLiteApiHotels } from '@/lib/travel/liteapi/stays';
import {
  MAX_TRAVEL_ADULTS,
  MAX_TRAVEL_CHILDREN,
  MAX_TRAVEL_PARTY,
  validateTravelerCounts,
} from '@/lib/travel/traveler-counts';

const originalFetch = global.fetch;

function isTravelerCountError(error: unknown): boolean {
  return error instanceof TravelProviderError
    && error.code === 'INVALID_TRAVELER_COUNT'
    && error.message === 'Traveler counts are invalid.';
}

function context(adults: number, children: number, capability: 'fly' | 'stay'): CapabilitySearchContext {
  const intent: TravelIntent = {
    language: 'en', kind: 'new_trip', origin: 'Riyadh', destination: 'Cairo',
    startDate: '2026-09-10', endDate: '2026-09-15', travelers: { adults, children },
    preferences: {}, requestedCapabilities: [capability], constraints: [], modifications: [], missingRequired: [], confidence: 1,
  };
  const plan: TripPlan = {
    id: 'plan-security-test', ownerId: 'user-1', tenantId: 'tenant-1', revision: 1,
    language: 'en', destination: 'Cairo', travelers: { adults, children },
    segments: [{ id: 'segment-1', origin: 'Riyadh', destination: 'Cairo', startDate: intent.startDate, endDate: intent.endDate }],
    services: [{ capability, status: 'pending', options: [] }], status: 'searching', approvalState: 'NOT_REQUESTED',
    createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z',
  };
  return { ownerId: plan.ownerId, tenantId: plan.tenantId, plan, intent };
}

test.afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.DUFFEL_TEST_TOKEN;
  delete process.env.DUFFEL_ENV;
  delete process.env.LITEAPI_TEST_API_KEY;
  delete process.env.LITEAPI_ENV;
});

for (const [label, adults, children] of [
  ['NaN', Number.NaN, 0],
  ['Infinity', Number.POSITIVE_INFINITY, 0],
  ['negative adults', -1, 0],
  ['negative children', 1, -1],
  ['decimal adults', 1.5, 0],
  ['decimal children', 1, 0.5],
  ['unsafe integers', Number.MAX_SAFE_INTEGER + 1, 0],
  ['extreme adults', MAX_TRAVEL_ADULTS + 1, 0],
  ['extreme children', 1, MAX_TRAVEL_CHILDREN + 1],
  ['extreme total party', MAX_TRAVEL_PARTY, 1],
] as const) {
  test(`canonical validation rejects ${label}`, () => {
    assert.throws(() => validateTravelerCounts(adults, children), isTravelerCountError);
  });
}

test('canonical validation accepts boundary values and a normal family', () => {
  assert.deepEqual(validateTravelerCounts(MAX_TRAVEL_ADULTS, 0), { adults: MAX_TRAVEL_ADULTS, children: 0 });
  assert.deepEqual(validateTravelerCounts(1, MAX_TRAVEL_CHILDREN), { adults: 1, children: MAX_TRAVEL_CHILDREN });
  assert.deepEqual(validateTravelerCounts(2, 2), { adults: 2, children: 2 });
});

for (const value of ['NaN', 'Infinity', '-1', '1.5', '9007199254740992', '10']) {
  test(`intent normalization rejects invalid adult token ${value}`, () => {
    assert.throws(
      () => parseTravelIntent(`Flight from Riyadh to Cairo 2026-09-10 to 2026-09-15 for ${value} adults`),
      isTravelerCountError,
    );
  });
}

test('intent normalization preserves a valid normal family', () => {
  assert.deepEqual(
    parseTravelIntent('Flight and hotel from Riyadh to Cairo 2026-09-10 to 2026-09-15 for 2 adults 2 children').travelers,
    { adults: 2, children: 2 },
  );
});

for (const message of [
  'Flight and hotel from Riyadh to Cairo 2026-09-10 to 2026-09-15 for 2 adults,2 children',
  'Flight and hotel from Riyadh to Cairo 2026-09-10 to 2026-09-15 for (2 adults/2 children)',
  'طيران وفندق من الرياض إلى القاهرة 2026-09-10 إلى 2026-09-15 لعدد 2 بالغين،2 أطفال',
]) {
  test('intent normalization preserves punctuation-separated family counts', () => {
    assert.deepEqual(parseTravelIntent(message).travelers, { adults: 2, children: 2 });
  });
}

test('Duffel provider boundary rejects before fetch', async () => {
  process.env.DUFFEL_TEST_TOKEN = 'test-token-not-real';
  process.env.DUFFEL_ENV = 'test';
  let providerCalls = 0;
  global.fetch = (async () => { providerCalls += 1; return new Response('{}'); }) as typeof fetch;

  await assert.rejects(
    searchDuffelFlights({ from: 'RUH', to: 'CAI', departureDate: '2026-09-10', adults: Number.POSITIVE_INFINITY }),
    isTravelerCountError,
  );
  assert.equal(providerCalls, 0);
});

test('LiteAPI provider boundary rejects before fetch', async () => {
  process.env.LITEAPI_TEST_API_KEY = 'sand_test-only-not-real';
  process.env.LITEAPI_ENV = 'sandbox';
  let providerCalls = 0;
  global.fetch = (async () => { providerCalls += 1; return new Response('{}'); }) as typeof fetch;

  await assert.rejects(
    searchLiteApiHotels({ cityName: 'Cairo', countryCode: 'EG', checkIn: '2026-09-10', checkOut: '2026-09-15', occupancies: [{ adults: 5 }, { adults: 5 }], currency: 'USD', guestNationality: 'EG' }),
    isTravelerCountError,
  );
  assert.equal(providerCalls, 0);
});

test('capability boundaries reject invalid plans before allocation or provider fetch', async () => {
  process.env.DUFFEL_TEST_TOKEN = 'test-token-not-real';
  process.env.DUFFEL_ENV = 'test';
  process.env.LITEAPI_TEST_API_KEY = 'sand_test-only-not-real';
  process.env.LITEAPI_ENV = 'sandbox';
  let providerCalls = 0;
  global.fetch = (async () => { providerCalls += 1; return new Response('{}'); }) as typeof fetch;

  const fly = await createDuffelCapabilityAdapter().search(context(Number.POSITIVE_INFINITY, 0, 'fly'));
  const stay = await createLiteApiCapabilityAdapter().search(context(1, Number.POSITIVE_INFINITY, 'stay'));

  assert.equal(fly.status, 'unavailable');
  assert.equal(stay.status, 'unavailable');
  assert.equal(fly.userMessage, 'The supplier request could not be completed safely.');
  assert.equal(stay.userMessage, 'The supplier request could not be completed safely.');
  assert.equal(providerCalls, 0);
});
