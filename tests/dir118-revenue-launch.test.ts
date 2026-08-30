import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20260829223000_dir118_revenue_launch_requests.sql', 'utf8');
const route = readFileSync('app/api/marketplace/requests/route.ts', 'utf8');
const bookings = readFileSync('app/my-bookings/page.tsx', 'utf8');
const operations = readFileSync('components/admin/MarketplaceRequestOperationsTable.tsx', 'utf8');
const operationsActions = readFileSync('lib/actions/operations-actions.ts', 'utf8');
const revenueSafetyMigration = readFileSync('supabase/migrations/20260829234937_dir120_revenue_request_transition_safety.sql', 'utf8');

test('request snapshot persists revenue-launch truth before any handoff', () => {
  for (const field of ['marketplace_family', 'supplier_name', 'service_name', 'fulfilment_method', 'transaction_method', 'handoff_type', 'next_action']) {
    assert.match(migration, new RegExp(field));
    assert.match(route, new RegExp(field));
  }
  assert.match(route, /status: 'request_submitted'/);
  assert.doesNotMatch(route, /status: 'confirmed'/);
});

test('customer bookings page includes owner-scoped marketplace requests without relabelling them as bookings', () => {
  assert.match(bookings, /from\('marketplace_requests'\)/);
  assert.match(bookings, /eq\('user_id', user\.id\)/);
  assert.match(bookings, /MarketplaceRequestsPanel/);
});

test('operations visibility is authorized beside the privileged query', () => {
  assert.ok(operations.indexOf("await requireAdminPageAccess('/admin/operations')") < operations.indexOf(".from('marketplace_requests')"));
  assert.match(operations, /request_reference, user_id, product_id/);
  assert.match(operations, /supplier_name, marketplace_family/);
  assert.match(operations, /handoff_type, status, next_action/);
  assert.match(operations, /requested_for, traveller_count/);
  assert.match(operations, />Created</);
  assert.match(operations, />Last updated</);
  assert.match(operations, /new Date\(request\.created_at\)\.toLocaleString\('en-GB'\)/);
  assert.match(operations, /new Date\(request\.updated_at\)\.toLocaleString\('en-GB'\)/);
  assert.match(operations, /request\.user_id/);
  assert.match(operations, /admin\.operations\.marketplace_requests_read_failed/);
  assert.match(operations, /throw new Error\('Unable to load marketplace revenue requests\.'\)/);
  assert.match(operationsActions, /requireAdminActionAccess/);
  assert.match(operationsActions, /supabase\.rpc\('transition_marketplace_request'/);
  assert.doesNotMatch(operationsActions, /p_actor_id/);
  assert.match(revenueSafetyMigration, /UPDATE public\.marketplace_requests/);
  assert.match(revenueSafetyMigration, /INSERT INTO public\.audit_logs/);
});

test('DIR-118 migration backfills authoritative legacy request context from products', () => {
  assert.match(migration, /FROM public\.products/);
  assert.match(migration, /products\.id = marketplace_requests\.product_id/);
  assert.match(migration, /marketplace_family = COALESCE\(marketplace_requests\.marketplace_family, products\.marketplace_family\)/);
  assert.match(migration, /supplier_name = COALESCE\(marketplace_requests\.supplier_name, products\.supplier_name\)/);
  assert.match(migration, /service_name = COALESCE\(marketplace_requests\.service_name, products\.name_ar, products\.name_en\)/);
  assert.match(migration, /next_action = COALESCE\(marketplace_requests\.next_action, 'operations_review'\)/);
});

test('request lifecycle supports launch-safe human operations states', () => {
  for (const state of ['request_submitted', 'under_review', 'awaiting_supplier', 'confirmed', 'declined', 'cancelled']) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
  assert.doesNotMatch(migration, /GRANT (?:ALL|INSERT|UPDATE|DELETE).*authenticated/i);
});
