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
