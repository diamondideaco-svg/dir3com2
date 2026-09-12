import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { mapFlightOffers, mapHotelOffers, mapSabreItineraries } from '@/lib/marketplace/travel-provider-adapter';
import { normalizeMarketplaceCard } from '@/lib/marketplace/cards';
import { authorizeMarketplaceLiteApiProofRequest, authorizeProviderProofRequest, isProviderProofEnabled, providerEnvironmentAllowed, providerProofProviders } from '@/lib/marketplace/provider-proof-mode';
import { getProviderProofOffer, runProviderProofSearch } from '@/lib/marketplace/provider-proof';
import type { FlightSearchResult, StaySearchResult } from '@/lib/travel/contracts';
import type { SabreFlightSearchResult } from '@/lib/sabre/search';
import fs from 'node:fs';
import { proxy } from '../proxy';

const sandboxEnv = {
  NODE_ENV: 'development',
  DIR3COM_PROVIDER_PROOF_ENABLED: 'true',
  DIR3COM_PROVIDER_PROOF_LOCAL: 'true',
  DUFFEL_ENV: 'sandbox',
  LITEAPI_ENV: 'sandbox',
  DIR3COM_PROVIDER_PROOF_PROVIDERS: 'duffel,liteapi',
} satisfies NodeJS.ProcessEnv;

const sabreEnv = {
  ...sandboxEnv,
  DIR3COM_PROVIDER_PROOF_PROVIDERS: 'sabre',
  SABRE_PCC: 'S5OM',
  SABRE_USER_ID: 'fixture-user',
  SABRE_PASSWORD: 'fixture-password',
  SABRE_API_BASE_URL: 'https://api.cert.platform.sabre.com',
} satisfies NodeJS.ProcessEnv;

const flight: FlightSearchResult = {
  provider: 'duffel', status: 'ok', offers: [{
    id: 'off_sandbox_1', provider: 'duffel', origin: 'CAI', destination: 'RUH', departureDate: '2026-10-10T08:00:00Z',
    currency: 'SAR', totalAmount: '1200.00', expiresAt: '2026-10-09T00:00:00Z', slices: [{ origin: 'CAI', destination: 'RUH', segments: 1 }],
  }],
};

const stay: StaySearchResult = {
  provider: 'liteapi', status: 'ok', hotels: [{
    id: 'hotel_sandbox_1', provider: 'liteapi', name: 'Sandbox Hotel', address: 'Riyadh', rating: 4, imageUrl: null,
    rooms: [{ id: 'room_1', name: 'King Room', rates: [{ id: 'rate_sandbox_1', provider: 'liteapi', roomName: 'King Room', currency: 'SAR', totalAmount: '800.00', refundable: true }] }],
  }],
};

const sabre: SabreFlightSearchResult = {
  provider: 'sabre',
  environment: 'cert',
  itineraryCount: 1,
  itineraries: [{
    id: 'sabre-itinerary-1', origin: 'CAI', destination: 'RUH',
    departureDateTime: '2026-10-10T08:00:00', arrivalDateTime: '2026-10-10T10:00:00',
    totalDurationMinutes: 120, stopCount: 0, marketingCarrier: 'SV', flightNumber: '311',
    cabin: 'Y', baggage: '1 piece', totalFare: 250, currency: 'USD',
  }],
};

test('provider proof requires explicit non-production enablement and allowlisted path', () => {
  assert.equal(isProviderProofEnabled(sandboxEnv), true);
  assert.equal(isProviderProofEnabled({ ...sandboxEnv, NODE_ENV: 'production', VERCEL_ENV: 'preview' }), true);
  assert.equal(isProviderProofEnabled({ ...sandboxEnv, NODE_ENV: 'production', VERCEL_ENV: 'production' }), false);
  assert.deepEqual(providerProofProviders({ ...sandboxEnv, DIR3COM_PROVIDER_PROOF_PROVIDERS: 'duffel,unknown' }), ['duffel']);
  assert.equal(authorizeProviderProofRequest(new NextRequest('http://localhost/api/marketplace/provider-proof?environment=sandbox'), sandboxEnv), true);
  assert.equal(authorizeProviderProofRequest(new NextRequest('https://dir3com.com/api/marketplace/provider-proof?environment=sandbox'), { ...sandboxEnv, NODE_ENV: 'production' }), false);
  assert.equal(authorizeProviderProofRequest(new NextRequest('http://localhost/api/services?environment=sandbox'), sandboxEnv), false);
  assert.equal(authorizeProviderProofRequest(new NextRequest('http://localhost/api/marketplace/provider-proof?environment=sandbox&provider=viator'), sandboxEnv), false);
  assert.equal(providerEnvironmentAllowed('sabre', 'sandbox', sabreEnv), true);
  assert.equal(providerEnvironmentAllowed('sabre', 'live', sabreEnv), false);
  assert.equal(providerEnvironmentAllowed('sabre', 'sandbox', sandboxEnv), false);
  assert.equal(providerEnvironmentAllowed('sabre', 'sandbox', { ...sabreEnv, SABRE_AUTH_URL: 'https://evil.example/auth' }), false);
  assert.equal(providerEnvironmentAllowed('sabre', 'sandbox', { ...sabreEnv, SABRE_API_BASE_URL: 'https://evil.example' }), false);
  const proxy = fs.readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');
  assert.match(proxy, /['"]\/marketplace\/provider-proof['"]/);
});

test('customer Marketplace admits LiteAPI Sandbox only for the explicit Stay proof request', () => {
  const url = 'http://localhost/api/services?family=dir3-stay&providerProof=liteapi&destination=Cairo&checkIn=2026-10-10&checkOut=2026-10-12';
  assert.equal(authorizeMarketplaceLiteApiProofRequest(new NextRequest(url), sandboxEnv), true);
  assert.equal(authorizeMarketplaceLiteApiProofRequest(new NextRequest(url), { ...sandboxEnv, NODE_ENV: 'production', VERCEL_ENV: 'production' }), false);
  assert.equal(authorizeMarketplaceLiteApiProofRequest(new NextRequest(url.replace('dir3-stay', 'dir3-drive')), sandboxEnv), false);
  assert.equal(authorizeMarketplaceLiteApiProofRequest(new NextRequest(url.replace('providerProof=liteapi', 'providerProof=sabre')), sandboxEnv), false);
  assert.equal(authorizeMarketplaceLiteApiProofRequest(new NextRequest(url), { ...sandboxEnv, DIR3COM_PROVIDER_PROOF_PROVIDERS: 'duffel' }), false);
});

test('provider proof detail routes remain public for the detail boundary', () => {
  const response = proxy(new NextRequest('https://example.invalid/marketplace/provider-proof/liteapi/provider-item'));
  assert.equal(response.status, 200);
});

test('sandbox adapters remain blocked by default but render only in proof mode with sandbox truth', () => {
  assert.equal(mapFlightOffers(flight, { mode: 'PROVIDER_SANDBOX' }).length, 0);
  const cards = mapFlightOffers(flight, { mode: 'PROVIDER_SANDBOX', proofMode: true, language: 'en' });
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.providerSandbox, true);
  assert.equal(cards[0]?.marketplaceEnvironment, 'sandbox');
  assert.equal(cards[0]?.fulfilmentState, 'test_sandbox');
  assert.equal(cards[0]?.transactionMethod, 'none');
  assert.equal(cards[0]?.image, null);
  assert.match(cards[0]?.deepLink ?? '', /marketplace\/provider-proof\/duffel/);
  assert.equal(mapHotelOffers(stay, { mode: 'PROVIDER_SANDBOX', proofMode: true }).length, 1);
  const sandboxCard = normalizeMarketplaceCard({ serviceType: 'fly', providerSandbox: true, allowSandbox: true, provider: 'Duffel', title: 'x', providerItemId: 'x', currency: 'SAR', priceFrom: 1, marketplaceEnvironment: 'sandbox', fulfilmentState: 'test_sandbox' });
  assert.ok(sandboxCard);
  assert.equal(sandboxCard.marketplaceEnvironment, 'sandbox');
  const missingCurrency = mapFlightOffers({ ...flight, offers: [{ ...flight.offers[0], currency: '', totalAmount: '1200.00' }] }, { mode: 'PROVIDER_SANDBOX', proofMode: true });
  assert.equal(missingCurrency[0]?.totalPrice, null);
});

test('Sabre BFM itineraries map to proof cards without booking capability', () => {
  assert.equal(mapSabreItineraries(sabre, { mode: 'PROVIDER_SANDBOX' }).length, 0);
  const cards = mapSabreItineraries(sabre, { mode: 'PROVIDER_SANDBOX', proofMode: true, retrievedAt: '2026-09-12T00:00:00.000Z' });
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.provider, 'Sabre');
  assert.equal(cards[0]?.providerItemId, 'sabre-itinerary-1');
  assert.equal(cards[0]?.providerSandbox, true);
  assert.equal(cards[0]?.marketplaceEnvironment, 'sandbox');
  assert.equal(cards[0]?.fulfilmentState, 'test_sandbox');
  assert.equal(cards[0]?.transactionMethod, 'none');
  assert.equal(cards[0]?.totalPrice, 250);
  assert.match(cards[0]?.subtitle ?? '', /CAI → RUH/);
  assert.match(cards[0]?.subtitle ?? '', /1 piece/);
  assert.match(cards[0]?.deepLink ?? '', /marketplace\/provider-proof\/sabre/);
});

test('Sabre proof preserves unknown provider currency instead of defaulting it', () => {
  const cards = mapSabreItineraries({
    ...sabre,
    itineraries: [{ ...sabre.itineraries[0], currency: undefined, totalFare: undefined }],
  }, { mode: 'PROVIDER_SANDBOX', proofMode: true });
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.totalPrice, null);
  assert.equal(cards[0]?.currency, '');
});

test('provider proof search preserves real provider status and never adds cards on failure', async () => {
  const result = await runProviderProofSearch({ environment: 'sandbox', destination: 'Riyadh', departureFrom: 'Cairo', departureDate: '2026-10-10', checkIn: '2026-10-10', checkOut: '2026-10-12', language: 'en' }, {
    searchFlights: async () => flight,
    searchHotels: async () => stay,
  }, sandboxEnv);
  assert.equal(result.length, 2);
  assert.equal(result.find((entry) => entry.provider === 'duffel')?.cards[0]?.providerItemId, 'off_sandbox_1');
  assert.equal(result.find((entry) => entry.provider === 'liteapi')?.cards[0]?.providerItemId, 'rate_sandbox_1');
  const blocked = await runProviderProofSearch({ environment: 'sandbox', destination: 'Riyadh', departureDate: '2026-10-10', checkIn: '2026-10-10', checkOut: '2026-10-12' }, {
    searchFlights: async () => ({ provider: 'duffel', status: 'blocked', offers: [] }),
    searchHotels: async () => ({ provider: 'liteapi', status: 'unavailable', hotels: [] }),
  }, sandboxEnv);
  assert.deepEqual(blocked.map((entry) => [entry.status, entry.cards.length]), [['access_blocked', 0], ['unavailable', 0]]);
});

test('provider proof runs Sabre only with the existing cert configuration', async () => {
  const result = await runProviderProofSearch({
    environment: 'sandbox', destination: 'Riyadh', departureFrom: 'Cairo', departureDate: '2026-10-10', language: 'en', providers: ['sabre'],
  }, {
    searchFlights: async () => flight,
    searchHotels: async () => stay,
    searchSabreFlights: async () => sabre,
  }, sabreEnv);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.provider, 'sabre');
  assert.equal(result[0]?.status, 'ok');
  assert.equal(result[0]?.cards.length, 1);
});

test('a failed Sabre request does not hide a successful LiteAPI result', async () => {
  const result = await runProviderProofSearch({
    environment: 'sandbox', destination: 'Riyadh', departureFrom: 'Cairo', departureDate: '2026-10-10', checkIn: '2026-10-10', checkOut: '2026-10-12', language: 'en', providers: ['sabre', 'liteapi'],
  }, {
    searchFlights: async () => flight,
    searchHotels: async () => stay,
    searchSabreFlights: async () => { throw new Error('bounded provider failure'); },
  }, { ...sabreEnv, DIR3COM_PROVIDER_PROOF_PROVIDERS: 'sabre,liteapi' });
  assert.equal(result.find((entry) => entry.provider === 'sabre')?.status, 'unavailable');
  assert.equal(result.find((entry) => entry.provider === 'sabre')?.cards.length, 0);
  assert.equal(result.find((entry) => entry.provider === 'liteapi')?.status, 'ok');
  assert.equal(result.find((entry) => entry.provider === 'liteapi')?.cards.length, 1);
});

test('provider proof does not invent LiteAPI child ages', async () => {
  let called = false;
  const result = await runProviderProofSearch({ environment: 'sandbox', destination: 'Riyadh', checkIn: '2026-10-10', checkOut: '2026-10-12', children: 1 }, {
    searchFlights: async () => ({ provider: 'duffel', status: 'no_results', offers: [] }),
    searchHotels: async () => { called = true; return stay; },
  }, sandboxEnv);
  assert.equal(called, false);
  assert.deepEqual(result.find((entry) => entry.provider === 'liteapi'), {
    provider: 'liteapi', environment: 'sandbox', status: 'no_results', retrievedAt: result.find((entry) => entry.provider === 'liteapi')?.retrievedAt,
    cards: [], errorCode: 'CHILD_AGES_REQUIRED',
  });
});

test('provider proof UI protects traceability, bilingual labels, and pre-booking stop', () => {
  const source = fs.readFileSync(new URL('../components/public/ProviderProofClient.tsx', import.meta.url), 'utf8');
  const detail = fs.readFileSync(new URL('../components/public/ProviderProofDetail.tsx', import.meta.url), 'utf8');
  assert.match(source, /Provider item ID/);
  assert.match(source, /بيئة الاختبار/);
  assert.match(source, /data-provider-item-id/);
  assert.match(source, /data-environment/);
  assert.match(source, /booking\/payment is not enabled/);
  assert.match(detail, /No booking action in proof mode/);
  assert.match(detail, /الحجز والدفع غير مفعّلين/);
  assert.doesNotMatch(source + detail, /Book now|Confirm booking|Payment successful/);
});

test('customer Marketplace Stay carries LiteAPI proof gating and visible sandbox truth', () => {
  const page = fs.readFileSync(new URL('../app/marketplace/page.tsx', import.meta.url), 'utf8');
  const explorer = fs.readFileSync(new URL('../components/public/MarketplaceExplorer.tsx', import.meta.url), 'utf8');
  const hook = fs.readFileSync(new URL('../components/public/useMarketplaceServices.ts', import.meta.url), 'utf8');
  const card = fs.readFileSync(new URL('../components/shared/ServiceCard.tsx', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../lib/marketplace/server.ts', import.meta.url), 'utf8');
  assert.match(page, /family === 'dir3-stay' && query\.providerProof === 'liteapi'/);
  assert.match(explorer, /providerProof: liteApiSandboxProof && family === 'dir3-stay' \? 'liteapi' : undefined/);
  assert.match(hook, /providerProof/);
  assert.match(server, /context\.liteApiSandboxProof \? fetchTravelProviderHotels : fetchAllTravelProviderCards/);
  assert.match(server, /canonicalCity\(apiQuery\.destination\)\?\.slug/);
  assert.match(server, /href\.searchParams\.set\('checkIn'/);
  assert.match(card, /'Sandbox'/);
  assert.match(card, /Provider ID/);
  assert.match(card, /Updated/);
});

test('provider proof detail re-applies the configured provider allowlist', async () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    DIR3COM_PROVIDER_PROOF_ENABLED: process.env.DIR3COM_PROVIDER_PROOF_ENABLED,
    DIR3COM_PROVIDER_PROOF_LOCAL: process.env.DIR3COM_PROVIDER_PROOF_LOCAL,
    DIR3COM_PROVIDER_PROOF_PROVIDERS: process.env.DIR3COM_PROVIDER_PROOF_PROVIDERS,
    SABRE_PCC: process.env.SABRE_PCC,
    SABRE_USER_ID: process.env.SABRE_USER_ID,
    SABRE_PASSWORD: process.env.SABRE_PASSWORD,
    SABRE_API_BASE_URL: process.env.SABRE_API_BASE_URL,
  };
  Object.assign(process.env, {
    NODE_ENV: 'development',
    VERCEL_ENV: '',
    DIR3COM_PROVIDER_PROOF_ENABLED: 'true',
    DIR3COM_PROVIDER_PROOF_LOCAL: 'true',
    DIR3COM_PROVIDER_PROOF_PROVIDERS: 'liteapi',
    SABRE_PCC: 'configured',
    SABRE_USER_ID: 'configured',
    SABRE_PASSWORD: 'configured',
    SABRE_API_BASE_URL: 'https://api.cert.platform.sabre.com',
  });
  try {
    const result = await getProviderProofOffer({
      provider: 'sabre', providerItemId: 'unrequested', environment: 'sandbox',
      destination: 'Riyadh', departureFrom: 'Cairo', departureDate: '2026-10-10',
    });
    assert.equal(result, null);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
