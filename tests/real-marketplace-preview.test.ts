import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  buildPreviewDabraContext,
  normalizeDuffelPreviewOffer,
  normalizeLiteApiPreviewStay,
  normalizeTicketmasterPreviewEvent,
  previewFamilies,
} from '../lib/marketplace/real-preview-contract';

const offer = normalizeDuffelPreviewOffer({
  id: 'off_test', provider: 'duffel', origin: 'RUH', destination: 'JED', departureDate: '2026-10-01',
  currency: 'USD', totalAmount: '99.00', slices: [{ origin: 'RUH', destination: 'JED', segments: 1 }],
});

const event = normalizeTicketmasterPreviewEvent({
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
});

const stay = normalizeLiteApiPreviewStay({
  id: 'hotel_test', provider: 'liteapi', name: 'Riyadh Test Hotel', address: 'Riyadh', rating: 4,
  rooms: [{ id: 'room_test', name: 'King Room', rates: [{ id: 'rate_test', provider: 'liteapi', roomName: 'King Room', currency: 'USD', totalAmount: '120.00', refundable: true }] }],
});

test('preview maps provider truth without production or transaction claims', () => {
  assert.equal(offer.environment, 'sandbox');
  assert.equal(offer.fulfilmentState, 'test_sandbox');
  assert.equal(offer.transactionMethod, 'none');
  assert.equal(offer.supplierVerified, false);
  assert.equal(offer.availability, 'available');
});

test('DABRA context is grounded in the same offers and discloses sandbox limits', () => {
  assert.ok(stay);
  const ar = buildPreviewDabraContext([offer], [stay], [event], 'ar');
  const en = buildPreviewDabraContext([offer], [stay], [event], 'en');
  assert.match(ar, /RUH-JED 99.00 USD/);
  assert.match(ar, /Saudi Event/);
  assert.match(ar, /Riyadh Test Hotel/);
  assert.match(en, /Duffel's test environment/);
  assert.match(en, /Ticketmaster events/);
  assert.match(en, /LiteAPI test data/);
  assert.match(en, /external provider/);
});

test('LiteAPI stays remain sandbox-only and non-transactional', () => {
  assert.ok(stay);
  assert.equal(stay.environment, 'sandbox');
  assert.equal(stay.fulfilmentState, 'test_sandbox');
  assert.equal(stay.transactionMethod, 'none');
  assert.equal(stay.supplierVerified, false);
});

test('Ticketmaster event remains an external-provider transaction with check-price truth', () => {
  assert.equal(event.environment, 'production');
  assert.equal(event.family, 'dir3-concierge');
  assert.equal(event.transactionMethod, 'external_redirect');
  assert.equal(event.fulfilmentState, 'external_provider');
  assert.equal(event.priceState, 'check_price');
  assert.equal(event.supplierVerified, true);
});

test('preview preserves the five canonical marketplace families', () => {
  assert.deepEqual(previewFamilies, ['dir3-fly', 'dir3-stay', 'dir3-drive', 'dir3-concierge', 'dir3-vip']);
});

test('customer preview exposes all-family navigation, search, and truthful empty copy', () => {
  const source = fs.readFileSync(new URL('../components/public/RealMarketplacePreviewClient.tsx', import.meta.url), 'utf8');
  assert.match(source, /'الكل'\s*:\s*'All'|ar \? 'الكل' : 'All'/);
  assert.match(source, /name="from"/);
  assert.match(source, /name="to"/);
  assert.match(source, /name="date"/);
  assert.match(source, /name="country"/);
  assert.match(source, /Ticketmaster · LIVE DISCOVERY/);
  assert.match(source, /LiteAPI · TEST SANDBOX/);
  assert.match(source, /external provider/);
  assert.match(source, /No verified preview inventory/);
  assert.match(source, /لن أقترح خيارات غير موجودة/);
});

test('mobile family tabs preserve a 44px minimum touch target', () => {
  const source = fs.readFileSync(new URL('../components/public/RealMarketplacePreviewClient.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.equal((source.match(/real-preview-family-tab/g) || []).length, 2);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.real-preview-family-tab\s*\{[\s\S]*min-height:\s*44px/);
});
