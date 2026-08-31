import assert from 'node:assert/strict';
import test from 'node:test';
import { queryMarketplace } from '@/lib/marketplace/server';
import { resetProviderSearchProtection } from '@/lib/marketplace/provider-search-protection';

const originalFetch = globalThis.fetch;
const originalKey = process.env.TICKETMASTER_API_KEY;
const originalConsumerKey = process.env.TICKETMASTER_CONSUMER_KEY;

test.afterEach(() => {
  resetProviderSearchProtection();
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.TICKETMASTER_API_KEY;
  else process.env.TICKETMASTER_API_KEY = originalKey;
  if (originalConsumerKey === undefined) delete process.env.TICKETMASTER_CONSUMER_KEY;
  else process.env.TICKETMASTER_CONSUMER_KEY = originalConsumerKey;
});

test('authorized Ticketmaster content reaches the canonical Concierge marketplace with provider-checkout truth', async () => {
  process.env.TICKETMASTER_API_KEY = 'test-key-not-real';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    assert.match(url, /^https:\/\/app\.ticketmaster\.com\/discovery\/v2\/events\.json/);
    return new Response(JSON.stringify({
      page: { totalElements: 1 },
      _embedded: { events: [{
        id: 'evt_sa_launch_1', name: 'Riyadh Launch Event', url: 'https://events.tmtickets.sa/event/launch', locale: 'en-us',
        images: [{ url: 'https://s1.ticketm.net/event.jpg', width: 1024, height: 576, ratio: '16_9' }],
        dates: { start: { localDate: '2026-10-01', localTime: '20:00:00' }, timezone: 'Asia/Riyadh', status: { code: 'onsale' } },
        _embedded: { venues: [{ name: 'Riyadh Venue', city: { name: 'Riyadh' }, country: { countryCode: 'SA' } }] },
      }] },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const payload = await queryMarketplace({ family: 'dir3-concierge', page: 1, pageSize: 9 }, { anonymous: false, clientKey: 'test' });
  assert.equal(payload.services.length, 1);
  const item = payload.services[0];
  assert.equal(item?.provider, 'ticketmaster');
  assert.equal(item?.providerItemId, 'evt_sa_launch_1');
  assert.equal(item?.transactionMethod, 'provider_checkout');
  assert.equal(item?.fulfilmentState, 'external_provider');
  assert.equal(item?.marketplaceEnvironment, 'production');
  assert.equal(item?.imageUrl, 'https://s1.ticketm.net/event.jpg');
  assert.equal(item?.href, '/marketplace/preview/evt_sa_launch_1');
  assert.equal(payload.meta.hasRealData, true);
});

test('missing Ticketmaster authorization fails closed without substitute cards', async () => {
  delete process.env.TICKETMASTER_API_KEY;
  delete process.env.TICKETMASTER_CONSUMER_KEY;
  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => { requestedUrls.push(String(input)); return new Response('{}'); }) as typeof fetch;
  const payload = await queryMarketplace({ family: 'dir3-concierge', page: 1, pageSize: 9 }, { anonymous: false, clientKey: 'test' });
  assert.equal(payload.services.some((item) => item.provider === 'ticketmaster'), false);
  assert.equal(requestedUrls.some((url) => url.includes('app.ticketmaster.com')), false);
});
