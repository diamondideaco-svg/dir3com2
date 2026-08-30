import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  buildUnavailablePreviewOffer,
  formatPreviewRetrievedAt,
  normalizeLiteApiPreviewStay,
  normalizeTicketmasterPreviewEvent,
  previewFamilies,
} from '../lib/marketplace/real-preview-contract';

const retrievedAt = '2026-08-30T10:00:00.000Z';
const hotel = {
  id: 'hotel_ruh_101',
  provider: 'liteapi',
  name: 'Provider Hotel Riyadh',
  address: 'Riyadh',
  rating: 4.4,
  imageUrl: 'https://images.liteapi.example/hotel.jpg',
  rooms: [{
    id: 'room_1',
    name: 'King Room',
    rates: [{
      id: 'rate_1',
      provider: 'liteapi',
      roomName: 'King Room',
      boardName: 'Breakfast',
      currency: 'USD',
      totalAmount: '120.00',
      refundable: true,
    }],
  }],
};
const rawEvent = {
  id: 'event_sa_1',
  name: 'Saudi Event',
  locale: 'en-us',
  url: 'https://events.tmtickets.sa/event/1',
  imageUrl: 'https://s1.ticketm.net/event.jpg',
  localDate: '2026-10-01',
  localTime: '20:00:00',
  timezone: 'Asia/Riyadh',
  salesStatus: 'onsale',
  venue: 'Riyadh Venue',
  city: 'Riyadh',
  countryCode: 'SA',
  priceMin: null,
  priceMax: null,
  currency: null,
};

test('LiteAPI stay preserves authoritative provider trace and sandbox truth', () => {
  const stay = normalizeLiteApiPreviewStay(hotel, {
    city: 'Riyadh',
    environment: 'sandbox',
    checkIn: '2026-09-29',
    checkOut: '2026-10-01',
    retrievedAt,
  });
  assert.ok(stay);
  assert.equal(stay.provider, 'liteapi');
  assert.equal(stay.providerItemId, hotel.id);
  assert.equal(stay.hotelId, hotel.id);
  assert.equal(stay.rateId, 'rate_1');
  assert.equal(stay.sourceUrl, null);
  assert.equal(stay.environment, 'sandbox');
  assert.equal(stay.fulfilmentState, 'test_sandbox');
  assert.equal(stay.transactionMethod, 'none');
  assert.equal(stay.priceState, 'provider_preview');
  assert.equal(stay.retrievedAt, retrievedAt);
  assert.equal(stay.imageUrl, hotel.imageUrl);
});

test('LiteAPI production search does not invent instant-booking capability', () => {
  const stay = normalizeLiteApiPreviewStay(hotel, {
    city: 'Riyadh',
    environment: 'production',
    checkIn: '2026-09-29',
    checkOut: '2026-10-01',
    retrievedAt,
  });
  assert.ok(stay);
  assert.equal(stay.priceState, 'live');
  assert.equal(stay.fulfilmentState, 'availability_unknown');
  assert.equal(stay.transactionMethod, 'none');
});

test('LiteAPI provider images fail closed when the URL is unsafe', () => {
  const stay = normalizeLiteApiPreviewStay({ ...hotel, imageUrl: 'http://localhost/private.jpg' }, {
    city: 'Riyadh',
    environment: 'sandbox',
    checkIn: '2026-09-29',
    checkOut: '2026-10-01',
    retrievedAt,
  });
  assert.ok(stay);
  assert.equal(stay.imageUrl, null);
});

test('Ticketmaster on-sale event uses only official provider checkout and source truth', () => {
  const event = normalizeTicketmasterPreviewEvent(rawEvent, retrievedAt);
  assert.equal(event.provider, 'ticketmaster');
  assert.equal(event.providerItemId, rawEvent.id);
  assert.equal(event.sourceUrl, rawEvent.url);
  assert.equal(event.environment, 'production');
  assert.equal(event.availability, 'available');
  assert.equal(event.transactionMethod, 'external_redirect');
  assert.equal(event.fulfilmentState, 'external_provider');
  assert.equal(event.priceState, 'not_supplied');
  assert.equal(event.retrievedAt, retrievedAt);
});

test('Ticketmaster unknown and sold-out states do not claim checkout availability', () => {
  const unknown = normalizeTicketmasterPreviewEvent({ ...rawEvent, salesStatus: 'offsale' }, retrievedAt);
  const soldOut = normalizeTicketmasterPreviewEvent({ ...rawEvent, salesStatus: 'soldout' }, retrievedAt);
  assert.equal(unknown.availability, 'unknown');
  assert.equal(unknown.transactionMethod, 'none');
  assert.equal(unknown.fulfilmentState, 'availability_unknown');
  assert.equal(soldOut.availability, 'sold_out');
  assert.equal(soldOut.transactionMethod, 'none');
  assert.equal(soldOut.fulfilmentState, 'unavailable');
});

test('PDP revalidation failures remain truthful and non-transactional', () => {
  const unavailable = buildUnavailablePreviewOffer({
    provider: 'liteapi',
    providerItemId: hotel.id,
    environment: 'sandbox',
    reason: 'unavailable',
    city: 'Riyadh',
    checkIn: '2026-09-29',
    checkOut: '2026-10-01',
  });
  assert.equal(unavailable.kind, 'unavailable');
  assert.equal(unavailable.transactionMethod, 'none');
  assert.equal(unavailable.fulfilmentState, 'availability_unknown');
  assert.equal(unavailable.providerItemId, hotel.id);
});

test('preview preserves exactly the five canonical marketplace families', () => {
  assert.deepEqual(previewFamilies, ['dir3-fly', 'dir3-stay', 'dir3-drive', 'dir3-concierge', 'dir3-vip']);
});

test('provider retrieval time is deterministic across server and browser time zones in AR and EN', () => {
  const originalTimeZone = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const serverArabic = formatPreviewRetrievedAt(retrievedAt, 'ar');
    const serverEnglish = formatPreviewRetrievedAt(retrievedAt, 'en');
    process.env.TZ = 'Asia/Riyadh';
    assert.equal(formatPreviewRetrievedAt(retrievedAt, 'ar'), serverArabic);
    assert.equal(formatPreviewRetrievedAt(retrievedAt, 'en'), serverEnglish);
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test('DIR-121 customer preview is scoped to Stay and Saudi Concierge', () => {
  const source = fs.readFileSync(new URL('../components/public/RealMarketplacePreviewClient.tsx', import.meta.url), 'utf8');
  assert.match(source, /name="city"/);
  assert.match(source, /value="Riyadh"/);
  assert.match(source, /value="Cairo"/);
  assert.match(source, /name="checkIn"/);
  assert.match(source, /name="checkOut"/);
  assert.match(source, /Ticketmaster · OFFICIAL API/);
  assert.match(source, /LiteAPI ·/);
  assert.match(source, /Provider Checkout/);
  assert.match(source, /Availability Unknown/);
  assert.doesNotMatch(source, /Duffel/);
  assert.doesNotMatch(source, /DABRA/);
});

test('provider cards and PDP preserve source traceability and image fallback', () => {
  const card = fs.readFileSync(new URL('../components/public/RealMarketplacePreviewClient.tsx', import.meta.url), 'utf8');
  const detail = fs.readFileSync(new URL('../components/public/RealMarketplacePreviewDetail.tsx', import.meta.url), 'utf8');
  for (const marker of ['data-provider-item-id', 'data-environment', 'data-transaction-method', 'data-fulfilment-state']) {
    assert.match(card, new RegExp(marker));
  }
  assert.match(card, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(detail, /Source traceability/);
  assert.match(detail, /Provider item ID/);
  assert.match(detail, /Preview only — no booking action/);
  assert.match(detail, /No stale price or availability is shown/);
  assert.match(detail, /noopener noreferrer sponsored/);
  assert.doesNotMatch(card, /[?&]rate=/);
  assert.doesNotMatch(fs.readFileSync(new URL('../lib/marketplace/real-preview.ts', import.meta.url), 'utf8'), /context\?\.rateId/);
  assert.match(fs.readFileSync(new URL('../lib/marketplace/real-preview.ts', import.meta.url), 'utf8'), /decodeURIComponent\(id\)/);
});

test('mobile family tabs preserve a 44px minimum touch target', () => {
  const source = fs.readFileSync(new URL('../components/public/RealMarketplacePreviewClient.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.equal((source.match(/real-preview-family-tab\b/g) || []).length, 2);
  assert.match(css, /\.real-preview-family-tab\s*\{[^}]*min-height:\s*44px/);
});

test('DIR-121 initial render and mobile DABRA spacing stay hydration-safe', () => {
  const preview = fs.readFileSync(new URL('../components/public/RealMarketplacePreviewClient.tsx', import.meta.url), 'utf8');
  const detail = fs.readFileSync(new URL('../components/public/RealMarketplacePreviewDetail.tsx', import.meta.url), 'utf8');
  const floatingDabra = fs.readFileSync(new URL('../components/layout/FloatingDibrah.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(preview, /formatPreviewRetrievedAt\(retrievedAt, language\)/);
  assert.doesNotMatch(preview, /new Intl\.DateTimeFormat/);
  assert.match(detail, /formatPreviewRetrievedAt\(offer\.retrievedAt, ar \? 'ar' : 'en'\)/);
  assert.doesNotMatch(detail, /new Intl\.DateTimeFormat/);
  assert.match(floatingDabra, /useState<\{ x: number; y: number \}>\(DEFAULT_DIBRAH_POSITION\)/);
  assert.doesNotMatch(floatingDabra, /useState<\{ x: number; y: number \}>\(\(\) => \{[\s\S]*typeof window/);
  assert.match(floatingDabra, /if \(dir121Mobile\) \{[\s\S]*setPosition\(clampPosition\(12, Number\.POSITIVE_INFINITY\)\);[\s\S]*return;/);
  assert.match(preview, /className="real-preview-hero-stage"/);
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*\.real-preview-hero-stage\s*\{\s*min-height:\s*calc\(100dvh - 7\.5rem\)/);
});
