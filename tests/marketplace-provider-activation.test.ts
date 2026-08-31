import assert from 'node:assert/strict';
import test from 'node:test';
import { getMarketplaceProviderActivationMatrix } from '@/lib/marketplace/provider-activation';

test('provider activation matrix covers five families without exposing credential values', () => {
  const env = {
    DUFFEL_ENV: 'sandbox', DUFFEL_TEST_TOKEN: 'secret-duffel', LITEAPI_ENV: 'sandbox', LITEAPI_TEST_API_KEY: 'sand_secret-liteapi',
    TICKETMASTER_API_KEY: 'secret-ticketmaster',
  } as unknown as NodeJS.ProcessEnv;
  const rows = getMarketplaceProviderActivationMatrix(env);
  assert.deepEqual([...new Set(rows.map((row) => row.serviceFamily))].sort(), ['CONCIERGE', 'DRIVE', 'FLY', 'STAY', 'VIP']);
  assert.equal(rows.find((row) => row.providerName === 'Duffel')?.accountStatus, 'TEST_ONLY');
  assert.equal(rows.find((row) => row.providerName === 'LiteAPI')?.productionAccess, false);
  assert.equal(rows.find((row) => row.providerName === 'Ticketmaster Discovery')?.checkoutMode, 'PROVIDER_CHECKOUT');
  assert.doesNotMatch(JSON.stringify(rows), /secret-duffel|secret-liteapi|secret-ticketmaster/);
});

test('blocked external sources expose exact activation requirements without inventing access', () => {
  const rows = getMarketplaceProviderActivationMatrix({} as NodeJS.ProcessEnv);
  const carTrawler = rows.find((row) => row.providerName === 'CarTrawler');
  const travelpayouts = rows.find((row) => row.providerName === 'Travelpayouts car-rental affiliate');
  const ticketmaster = rows.find((row) => row.providerName === 'Ticketmaster Discovery');
  const viator = rows.find((row) => row.providerName === 'Viator Basic');

  assert.equal(carTrawler?.checkoutMode, 'NONE');
  assert.match(carTrawler?.activationBlocker || '', /CARTRAWLER_PARTNER_TOKEN.*CARTRAWLER_PARTNER_ID.*CARTRAWLER_API_BASE_URL/);
  assert.equal(travelpayouts?.affiliateDeepLinkAccess, false);
  assert.match(travelpayouts?.activationBlocker || '', /account\/project.*program approval.*link\/widget\/API tool/i);
  assert.equal(ticketmaster?.checkoutMode, 'NONE');
  assert.match(ticketmaster?.activationBlocker || '', /Consumer Key.*TICKETMASTER_API_KEY.*TICKETMASTER_CONSUMER_KEY/);
  assert.equal(viator?.productionAccess, false);
  assert.match(viator?.activationBlocker || '', /affiliate\/content API partnership.*VIATOR_API_KEY/);
});
