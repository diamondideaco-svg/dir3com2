import assert from 'node:assert/strict';
import test from 'node:test';
import { marketplaceRequestErrorMessage } from '../lib/marketplace/request-feedback';
import { parseMarketplaceRequestInputs } from '../lib/marketplace/request-input';

test('missing dates are validation failures, not expired sessions', () => {
  assert.equal(parseMarketplaceRequestInputs({ requested_for: '', traveller_count: 2 }).ok, false);
  for (const en of [false, true]) {
    assert.doesNotMatch(marketplaceRequestErrorMessage(400, en), /sign in|سجّل الدخول/i);
    assert.match(marketplaceRequestErrorMessage(401, en), /sign in|سجّل الدخول/i);
  }
});

test('product and service failures do not direct signed-in customers to login', () => {
  for (const status of [409, 500, 503, 0]) {
    for (const en of [false, true]) assert.doesNotMatch(marketplaceRequestErrorMessage(status, en), /sign in|سجّل الدخول/i);
  }
});

test('complete request data is normalized for both browser and API validation', () => {
  const input = parseMarketplaceRequestInputs({ requested_for: '2026-09-20T10:00:00+03:00', traveller_count: 2 });
  assert.deepEqual(input, { ok: true, requestedFor: '2026-09-20T07:00:00.000Z', travellers: 2 });
});
