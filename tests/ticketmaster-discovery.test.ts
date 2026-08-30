import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAllowedTicketmasterCheckoutUrl,
  normalizeTicketmasterEvent,
  searchTicketmasterEvents,
} from '@/lib/travel/ticketmaster/discovery';

const originalFetch = globalThis.fetch;
const originalKey = process.env.TICKETMASTER_API_KEY;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.TICKETMASTER_API_KEY;
  else process.env.TICKETMASTER_API_KEY = originalKey;
});

const rawEvent = {
  id: 'Z4qgVMyxjZzJPJiIdvd6Z71',
  name: 'Saudi Arabia vs Kuwait',
  locale: 'en-us',
  url: 'https://agc2026.tmtickets.sa/EDP/Event/Index/39',
  images: [{ url: 'https://s1.ticketm.net/dam/event.jpg', width: 1024, height: 576, ratio: '16_9' }],
  dates: {
    start: { localDate: '2026-09-23', localTime: '21:00:00' },
    status: { code: 'onsale' },
    timezone: 'Asia/Riyadh',
  },
  _embedded: {
    venues: [{ name: 'King Abdullah Sports City Stadium', city: { name: 'Jeddah' }, country: { countryCode: 'SA' } }],
  },
};

test('normalizes an official Ticketmaster event without inventing price data', () => {
  const event = normalizeTicketmasterEvent(rawEvent);
  assert.ok(event);
  assert.equal(event.id, rawEvent.id);
  assert.equal(event.city, 'Jeddah');
  assert.equal(event.countryCode, 'SA');
  assert.equal(event.salesStatus, 'onsale');
  assert.equal(event.priceMin, null);
  assert.equal(event.currency, null);
  assert.match(event.imageUrl ?? '', /^https:\/\/s1\.ticketm\.net\//);
});

test('checkout allowlist accepts official Saudi hosts and rejects open redirects', () => {
  assert.equal(isAllowedTicketmasterCheckoutUrl('https://agc2026.tmtickets.sa/EDP/Event/Index/39'), true);
  assert.equal(isAllowedTicketmasterCheckoutUrl('https://www.ticketmaster.com/event/1'), true);
  assert.equal(isAllowedTicketmasterCheckoutUrl('https://ticketmaster.com.evil.example/event/1'), false);
  assert.equal(isAllowedTicketmasterCheckoutUrl('http://ticketmaster.com/event/1'), false);
  assert.equal(isAllowedTicketmasterCheckoutUrl('https://user:pass@ticketmaster.com/event/1'), false);
});

test('rejects malformed provider events and hostile checkout hosts', () => {
  assert.equal(normalizeTicketmasterEvent({ ...rawEvent, url: 'https://evil.example/event/1' }), null);
  assert.equal(normalizeTicketmasterEvent({ ...rawEvent, id: '../secret' }), null);
  assert.equal(normalizeTicketmasterEvent({ ...rawEvent, name: '' }), null);
});

test('search uses server credential and returns normalized official events', async () => {
  process.env.TICKETMASTER_API_KEY = 'test-key-not-real';
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'app.ticketmaster.com');
    assert.equal(url.pathname, '/discovery/v2/events.json');
    assert.equal(url.searchParams.get('countryCode'), 'SA');
    assert.equal(url.searchParams.get('apikey'), 'test-key-not-real');
    return Response.json({
      _embedded: { events: [rawEvent] },
      page: { totalElements: 1 },
    });
  };

  const result = await searchTicketmasterEvents({ countryCode: 'SA', size: 20 });
  assert.equal(result.status, 'ok');
  assert.equal(result.total, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].url, rawEvent.url);
});

test('Saudi discovery drops provider rows whose authoritative venue country does not match', async () => {
  process.env.TICKETMASTER_API_KEY = 'test-key-not-real';
  globalThis.fetch = async () => Response.json({
    _embedded: {
      events: [
        rawEvent,
        {
          ...rawEvent,
          id: 'event_wrong_market',
          _embedded: {
            venues: [{ name: 'Cairo Venue', city: { name: 'Cairo' }, country: { countryCode: 'EG' } }],
          },
        },
      ],
    },
    page: { totalElements: 2 },
  });

  const result = await searchTicketmasterEvents({ countryCode: 'SA', size: 20 });
  assert.equal(result.status, 'ok');
  assert.equal(result.total, 2);
  assert.deepEqual(result.events.map((event) => event.id), [rawEvent.id]);
});

test('search fails closed when credential is absent or rejected', async () => {
  delete process.env.TICKETMASTER_API_KEY;
  const absent = await searchTicketmasterEvents({ countryCode: 'SA' });
  assert.equal(absent.status, 'access_blocked');
  assert.deepEqual(absent.events, []);

  process.env.TICKETMASTER_API_KEY = 'test-key-not-real';
  globalThis.fetch = async () => new Response('{}', { status: 401 });
  const rejected = await searchTicketmasterEvents({ countryCode: 'SA' });
  assert.equal(rejected.status, 'access_blocked');
  assert.deepEqual(rejected.events, []);
});

test('no-results response stays truthful for markets without current inventory', async () => {
  process.env.TICKETMASTER_API_KEY = 'test-key-not-real';
  globalThis.fetch = async () => Response.json({ page: { totalElements: 0 } });
  const result = await searchTicketmasterEvents({ countryCode: 'EG' });
  assert.equal(result.status, 'no_results');
  assert.equal(result.total, 0);
  assert.deepEqual(result.events, []);
});
