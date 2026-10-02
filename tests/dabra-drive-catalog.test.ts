import assert from 'node:assert/strict';
import test from 'node:test';
import { DRIVE_CATALOG_SOURCE_URL, readDriveCatalog, validateDriveCatalog } from '../lib/dabra/drive-catalog';

function fixture() {
  return {source: 'DIR3COM_PUBLISHED_DRIVE_CATALOG', catalogVersion: 'fixture-v1', verifiedAvailability: false,
    cityAvailabilityVerified: false, dateAvailabilityVerified: false, country: 'EG', timezone: 'Africa/Cairo', total: 30,
    offers: Array.from({length: 30}, (_, index) => ({id: `offer-${index}`, vehicleId: `car-${index}`, supplierId: 'egypt-operations',
      country: 'EG', version: 'fixture-v1', currency: 'EGP', availability: 'request_to_confirm',
      vehicle: {id: `car-${index}`, ar: `سيارة ${index}`, en: `Car ${index}`, exactModelGuaranteed: false},
      price: {baseAmount: 100, currency: 'EGP', unit: 'day', total: null, finalTotalRequired: true},
      airportPrice: {baseAmount: null, currency: 'EGP', unit: 'transfer', total: null, finalTotalRequired: true},
    }))};
}
const input = {service: 'drive', destination: 'Cairo', language: 'en' as const, page: 1, pageSize: 20};

test('catalogue is separate request-to-confirm data with source and stable offer link', () => {
  const items = validateDriveCatalog(fixture(), 'en')!;
  assert.equal(items.length, 30);
  for (const item of items) {
    assert.equal(item.verifiedAvailability, false);
    assert.equal(item.cityAvailabilityVerified, false);
    assert.equal(item.dateAvailabilityVerified, false);
    assert.equal(item.transactionMethod, 'request_to_confirm');
    assert.equal(item.sourceUrl, DRIVE_CATALOG_SOURCE_URL);
    assert.equal(item.url, `https://www.dir3com.com/marketplace?family=dir3-drive&offer=${item.id}`);
    assert.ok(item.name.endsWith('or similar'));
  }
});

test('Cairo aliases match; filters run before pagination and other cities never fetch', async context => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url: URL, options: RequestInit) => {
    calls++;
    assert.equal(String(url), DRIVE_CATALOG_SOURCE_URL);
    assert.equal(url.search, '');
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'manual');
    return Response.json(fixture());
  });
  assert.equal((await readDriveCatalog(input)).catalogReturned, 20);
  assert.equal((await readDriveCatalog({...input, destination: 'القاهرة', page: 2})).catalogReturned, 10);
  const result = await readDriveCatalog({...input, query: 'Car 29', pageSize: 1});
  assert.equal(result.catalogTotal, 1);
  assert.equal(result.catalogResults[0].id, 'offer-29');
  const exact = await readDriveCatalog({...input, id: 'offer-2', pageSize: 1});
  assert.equal(exact.catalogTotal, 1);
  assert.equal(exact.catalogResults[0].id, 'offer-2');
  const count = calls;
  assert.equal((await readDriveCatalog({...input, destination: 'Dubai'})).catalogSourceHealth, 'not_applicable');
  assert.equal((await readDriveCatalog({...input, service: 'stay'})).catalogSourceHealth, 'not_applicable');
  assert.equal(calls, count);
});

test('validation rejects live claims, conflicting provenance, duplicates and invalid prices', () => {
  for (const change of [
    (payload: ReturnType<typeof fixture>) => {payload.verifiedAvailability = true;},
    (payload: ReturnType<typeof fixture>) => {payload.offers[0].price.baseAmount = -1;},
    (payload: ReturnType<typeof fixture>) => {payload.source = 'OTHER';},
    (payload: ReturnType<typeof fixture>) => {payload.offers[1].id = payload.offers[0].id;},
  ]) {
    const payload = fixture(); change(payload);
    assert.equal(validateDriveCatalog(payload, 'en'), null);
  }
});

test('unavailable or redirected source fails closed', async context => {
  for (const status of [302, 503]) {
    context.mock.method(globalThis, 'fetch', async () => new Response('{}', {status}));
    const result = await readDriveCatalog(input);
    assert.equal(result.catalogSourceHealth, 'unavailable');
    assert.equal(result.catalogReturned, 0);
    context.mock.restoreAll();
  }
});
