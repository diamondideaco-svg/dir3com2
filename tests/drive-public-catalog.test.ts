import assert from 'node:assert/strict';
import test from 'node:test';
import { DRIVE_OFFERS, DRIVE_CATALOG_VERSION, journeyPrice } from '../lib/drive/catalog';
import { publicDriveCatalog } from '../lib/drive/public-catalog';

test('public catalogue preserves all published offer IDs, order, version and base rates', () => {
  const payload = publicDriveCatalog();
  assert.equal(payload.total, 30);
  assert.equal(payload.catalogVersion, DRIVE_CATALOG_VERSION);
  assert.deepEqual(payload.offers.map(offer => offer.id), DRIVE_OFFERS.map(offer => offer.id));
  assert.equal(new Set(payload.offers.map(offer => offer.id)).size, payload.total);
  payload.offers.forEach((offer, index) => {
    assert.deepEqual(offer.price, journeyPrice(DRIVE_OFFERS[index], 'chauffeur'));
    assert.deepEqual(offer.airportPrice, journeyPrice(DRIVE_OFFERS[index], 'airport'));
    assert.equal(offer.availability, 'request_to_confirm');
    assert.equal(offer.country, 'EG');
    assert.equal(offer.vehicle.exactModelGuaranteed, false);
    assert.deepEqual(Object.keys(offer).sort(), ['airportPrice', 'availability', 'country', 'currency', 'id', 'price', 'supplierId', 'vehicle', 'vehicleId', 'version']);
  });
});

test('catalogue makes no city, travel-date or confirmed availability promise', () => {
  const payload = publicDriveCatalog();
  assert.equal(payload.verifiedAvailability, false);
  assert.equal(payload.cityAvailabilityVerified, false);
  assert.equal(payload.dateAvailabilityVerified, false);
  assert.doesNotMatch(JSON.stringify(payload), /user_id|tenant_id|authorization|service_role|customer|pickupAt|returnAt/);
});
