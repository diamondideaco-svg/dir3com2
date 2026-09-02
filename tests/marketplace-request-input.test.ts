import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMarketplaceRequestInputs } from '../lib/marketplace/request-input';

test('marketplace request input validation rejects missing requested date', () => {
  assert.deepEqual(parseMarketplaceRequestInputs({ traveller_count: 2 }), {
    ok: false,
    error: 'Requested date is required',
  });
  assert.deepEqual(parseMarketplaceRequestInputs({ requested_for: '   ', traveller_count: 2 }), {
    ok: false,
    error: 'Requested date is required',
  });
});

test('marketplace request input validation rejects invalid and out-of-range dates', () => {
  assert.deepEqual(parseMarketplaceRequestInputs({ requested_for: 'not-a-date', traveller_count: 2 }), {
    ok: false,
    error: 'Invalid requested date',
  });
  assert.deepEqual(parseMarketplaceRequestInputs({ requested_for: '+999999-01-01T00:00:00.000Z', traveller_count: 2 }), {
    ok: false,
    error: 'Invalid requested date',
  });
});

test('marketplace request input validation requires explicit valid traveller count', () => {
  assert.deepEqual(parseMarketplaceRequestInputs({ requested_for: '2026-09-20T10:00:00Z' }), {
    ok: false,
    error: 'Traveller count is required',
  });
  assert.deepEqual(parseMarketplaceRequestInputs({ requested_for: '2026-09-20T10:00:00Z', traveller_count: 0 }), {
    ok: false,
    error: 'Invalid traveller count',
  });
  assert.deepEqual(parseMarketplaceRequestInputs({ requested_for: '2026-09-20T10:00:00Z', traveller_count: 100 }), {
    ok: false,
    error: 'Invalid traveller count',
  });
});

test('marketplace request input validation normalizes valid inputs', () => {
  assert.deepEqual(parseMarketplaceRequestInputs({ requested_for: '2026-09-20T10:00:00Z', traveller_count: '3' }), {
    ok: true,
    requestedFor: '2026-09-20T10:00:00.000Z',
    travellers: 3,
  });
});
