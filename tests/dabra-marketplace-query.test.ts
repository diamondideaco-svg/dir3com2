import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDabraMarketplaceFamily, parseDabraMarketplaceQuery, toMarketplaceSearchParams } from '@/lib/dabra/marketplace-query';

test('public family values normalize to the DABRA family keys', () => {
  assert.equal(normalizeDabraMarketplaceFamily('drive'), 'dir3-drive');
  assert.equal(normalizeDabraMarketplaceFamily('dir3-stay'), 'dir3-stay');
  assert.equal(normalizeDabraMarketplaceFamily('unknown'), 'dir3-concierge');
});

test('DABRA parses Arabic and English family/destination intent deterministically', () => {
  assert.deepEqual(parseDabraMarketplaceQuery('سيارة فاخرة الرياض'), {
    query: 'سيارة فاخرة الرياض', family: 'dir3-drive', category: 'cars', destination: 'riyadh', make: undefined, model: undefined,
  });
  assert.deepEqual(parseDabraMarketplaceQuery('premium hotel in Jeddah'), {
    query: 'premium hotel in jeddah', family: 'dir3-stay', category: 'hotels', destination: 'jeddah', make: undefined, model: undefined,
  });
});

test('family-only browse uses the canonical Marketplace query parameters without a fake text query', () => {
  const params = toMarketplaceSearchParams(parseDabraMarketplaceQuery('', 'dir3-concierge'));
  assert.equal(params.get('family'), 'dir3-concierge');
  assert.equal(params.get('query'), null);
});

test('make and model terms remain bounded and are sent through the canonical query contract', () => {
  const parsed = parseDabraMarketplaceQuery('Lexus model ES300 Riyadh');
  assert.equal(parsed.make, 'lexus');
  assert.equal(parsed.model, 'es300');
  assert.equal(toMarketplaceSearchParams(parsed).get('query'), 'lexus es300');
});

test('destination remains in the canonical q contract for server-side city filtering', () => {
  const params = toMarketplaceSearchParams(parseDabraMarketplaceQuery('hotel in Riyadh'));
  assert.equal(params.get('destination'), 'riyadh');
  assert.equal(params.get('query'), null);
});
