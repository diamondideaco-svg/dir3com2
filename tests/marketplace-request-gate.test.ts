import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { requestTypeMatchesProduct } from '@/lib/marketplace/request-gate';

const product = (overrides: Record<string, unknown> = {}) => ({
  status: 'active',
  deleted_at: null,
  synthetic: false,
  marketplace_environment: 'production',
  fulfilment_state: 'verified_requestable',
  transaction_method: 'request_to_confirm',
  ...overrides,
});

test('request and quote paths require matching server truth', () => {
  assert.equal(requestTypeMatchesProduct('request_to_confirm', product()), true);
  assert.equal(requestTypeMatchesProduct('request_quote', product()), false);
  assert.equal(requestTypeMatchesProduct('request_quote', product({ fulfilment_state: 'verified_quote', transaction_method: 'request_quote' })), true);
});

test('only publicly published products can use request and quote mutations', () => {
  assert.equal(requestTypeMatchesProduct('request_to_confirm', product({ status: 'active' })), true);
  assert.equal(requestTypeMatchesProduct('request_quote', product({ status: 'published', fulfilment_state: 'verified_quote', transaction_method: 'request_quote' })), true);
  for (const status of ['draft', 'unpublished', 'disabled', 'archived', 'hidden', '', null]) {
    assert.equal(requestTypeMatchesProduct('request_to_confirm', product({ status })), false, `${status} request must fail closed`);
    assert.equal(requestTypeMatchesProduct('request_quote', product({ status, fulfilment_state: 'verified_quote', transaction_method: 'request_quote' })), false, `${status} quote must fail closed`);
  }
});

test('hidden UUID lookup cannot bypass the same public eligibility gate', () => {
  const route = fs.readFileSync(path.resolve('app/api/marketplace/requests/route.ts'), 'utf8');
  const gate = fs.readFileSync(path.resolve('lib/marketplace/request-gate.ts'), 'utf8');
  assert.match(route, /select\('id, status, deleted_at, synthetic, marketplace_environment, fulfilment_state, transaction_method'\)/);
  assert.doesNotMatch(route, /is_active/);
  assert.match(route, /requestTypeMatchesProduct/);
  assert.match(gate, /isPublicMarketplaceProduct/);
  assert.equal(requestTypeMatchesProduct('request_to_confirm', product({ status: 'draft', id: '00000000-0000-4000-8000-000000000001' })), false);
});

test('inactive and soft-deleted products cannot use request or quote mutations', () => {
  for (const overrides of [{ status: 'inactive' }, { status: 'disabled' }, { deleted_at: '2026-08-28T00:00:00.000Z' }]) {
    assert.equal(requestTypeMatchesProduct('request_to_confirm', product(overrides)), false);
    assert.equal(requestTypeMatchesProduct('request_quote', product({ ...overrides, fulfilment_state: 'verified_quote', transaction_method: 'request_quote' })), false);
  }
});

test('public result filtering and request eligibility agree on publication status', () => {
  for (const status of ['published', 'active', 'featured']) {
    assert.equal(requestTypeMatchesProduct('request_to_confirm', product({ status })), true);
  }
  for (const status of ['draft', 'unpublished', 'disabled', 'archived', 'hidden']) {
    assert.equal(requestTypeMatchesProduct('request_to_confirm', product({ status })), false);
  }
});

test('non-production supply cannot create a customer request', () => {
  assert.equal(requestTypeMatchesProduct('request_to_confirm', product({ synthetic: true })), false);
  assert.equal(requestTypeMatchesProduct('request_to_confirm', product({ marketplace_environment: 'sandbox' })), false);
});

test('request creation uses the server-only admin client', () => {
  const route = fs.readFileSync(path.resolve('app/api/marketplace/requests/route.ts'), 'utf8');
  assert.match(route, /supabaseAdmin\.from\('marketplace_requests'\)\.insert/);
  assert.doesNotMatch(route, /auth\.supabase\.from\('marketplace_requests'\)\.insert/);
});
