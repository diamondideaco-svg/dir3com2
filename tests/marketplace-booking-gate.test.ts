import assert from 'node:assert/strict';
import test from 'node:test';

import { isProductBookable } from '@/app/api/bookings/route';

const product = (overrides: Record<string, unknown> = {}) => ({
  status: 'active',
  deleted_at: null,
  synthetic: false,
  marketplace_environment: 'production',
  fulfilment_state: 'live_bookable',
  transaction_method: 'instant_booking',
  ...overrides,
});

test('instant booking accepts only explicit live production supply', () => {
  assert.equal(isProductBookable(product()), true);
  assert.equal(isProductBookable(product({ status: 'published' })), true);
  assert.equal(isProductBookable(product({ status: 'featured' })), true);
});

test('unpublished and hidden live products cannot bypass instant booking', () => {
  for (const status of ['draft', 'unpublished', 'disabled', 'archived', 'hidden', '', null]) {
    assert.equal(isProductBookable(product({ status })), false, `${status} must not book`);
  }
});

test('inactive and soft-deleted live products cannot book', () => {
  assert.equal(isProductBookable(product({ status: 'inactive' })), false);
  assert.equal(isProductBookable(product({ status: 'disabled' })), false);
  assert.equal(isProductBookable(product({ deleted_at: '2026-08-28T00:00:00.000Z' })), false);
});

test('catalogue, request, quote, unknown and unavailable products cannot book', () => {
  for (const fulfilment_state of ['catalog_only', 'verified_requestable', 'verified_quote', 'availability_unknown', 'unavailable']) {
    assert.equal(isProductBookable(product({ fulfilment_state })), false);
  }
});

test('synthetic and non-production products cannot book', () => {
  assert.equal(isProductBookable(product({ synthetic: true })), false);
  assert.equal(isProductBookable(product({ marketplace_environment: 'sandbox' })), false);
});
