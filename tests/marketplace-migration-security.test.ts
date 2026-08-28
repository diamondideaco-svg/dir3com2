import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20260827232309_customer_marketplace_truth_and_requests.sql'),
  'utf8',
);

test('request rows are owner-scoped and lifecycle fields stay server-authoritative', () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /USING \(\(SELECT auth\.uid\(\)\) = user_id\)/i);
  assert.doesNotMatch(migration, /GRANT (?:ALL|INSERT|UPDATE|DELETE)(?:\s|\()[\s\S]*?ON TABLE public\.marketplace_requests TO authenticated/i);
  assert.doesNotMatch(migration, /CREATE POLICY marketplace_requests_owner_create/i);
  assert.match(migration, /Creation, lifecycle, quote, payment and cancellation mutations remain server-authoritative/i);
});

test('database truth checks prevent mismatched booking and request methods', () => {
  assert.match(migration, /fulfilment_state = 'live_bookable' AND transaction_method = 'instant_booking'/i);
  assert.match(migration, /fulfilment_state = 'verified_requestable' AND transaction_method = 'request_to_confirm'/i);
  assert.match(migration, /fulfilment_state = 'verified_quote' AND transaction_method = 'request_quote'/i);
});
