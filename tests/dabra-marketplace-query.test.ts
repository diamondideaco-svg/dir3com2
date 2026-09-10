import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDabraMarketplaceQuery, toMarketplaceSearchParams } from '@/lib/dabra/marketplace-query';

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
