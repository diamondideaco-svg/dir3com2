import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { normalizeOptionalUuid } from '@/lib/marketplace/optional-uuid';
import { resolveStoredMarketplaceFamily } from '@/lib/marketplace/data';

const publicPdp = readFileSync('app/api/public/marketplace/items/[slug]/route.ts', 'utf8');
const operationsAction = readFileSync('lib/actions/operations-actions.ts', 'utf8');
const operationsTable = readFileSync('components/admin/MarketplaceRequestOperationsTable.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260829234937_dir120_revenue_request_transition_safety.sql', 'utf8');

test('nullable and malformed category ids never become UUID equality filters', () => {
  assert.equal(normalizeOptionalUuid(null), null);
  assert.equal(normalizeOptionalUuid(undefined), null);
  assert.equal(normalizeOptionalUuid('null'), null);
  assert.equal(normalizeOptionalUuid(''), null);
  assert.equal(normalizeOptionalUuid('86ed339b-8945-40fa-bc04-4a142c5d755e'), '86ed339b-8945-40fa-bc04-4a142c5d755e');
  assert.doesNotMatch(publicPdp, /\.eq\('id', product\.category_id\)/);
  assert.match(publicPdp, /if \(categoryId\) \{[\s\S]*?\.eq\('id', categoryId\)/);
  assert.equal(resolveStoredMarketplaceFamily('drive')?.key, 'dir3-drive');
  assert.deepEqual(resolveStoredMarketplaceFamily('drive')?.label, { ar: 'التنقّل', en: 'Drive' });
  assert.equal(resolveStoredMarketplaceFamily('unknown'), null);
});

test('missing category relation remains fail closed', () => {
  assert.match(publicPdp, /if \(!category\) \{[\s\S]*?return buildUnavailableResponse\(\)/);
  assert.match(publicPdp, /applyPublicCategoryFilters/);
});

test('request transition and audit are one atomic database operation', () => {
  assert.match(operationsAction, /rpc\('transition_marketplace_request'/);
  assert.doesNotMatch(operationsAction, /\.from\('marketplace_requests'\)[\s\S]*?\.update\(/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /UPDATE public\.marketplace_requests[\s\S]*?INSERT INTO public\.audit_logs/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
});

test('stale and unsafe confirmation transitions fail closed', () => {
  assert.match(operationsTable, /name="expectedStatus" value=\{request\.status\}/);
  assert.match(operationsTable, /defaultValue=\{request\.status\}/);
  assert.doesNotMatch(operationsTable, /defaultValue="under_review"/);
  assert.match(migration, /DIR120_STALE_REQUEST_STATE/);
  assert.match(migration, /DIR120_TRANSITION_NOT_ALLOWED/);
  assert.match(migration, /DIR120_CONFIRMATION_EVIDENCE_REQUIRED/);
  assert.match(migration, /COALESCE\(evidence->>'confirmation_source', ''\) NOT IN/);
  assert.match(migration, /DIR120_LEGACY_CONFIRMED_REQUIRES_RECONCILIATION/);
  assert.match(migration, /payment_status <> 'payment_verified'/);
  assert.match(migration, /DIR120_QUOTE_EVIDENCE_REQUIRED/);
  assert.match(migration, /current_request\.quote_expires_at <= NOW\(\)/);
});

test('terminal states cannot be reopened by the DIR-120 transition function', () => {
  for (const terminal of ['confirmed', 'declined', 'cancelled', 'completed', 'refunded']) {
    assert.doesNotMatch(migration, new RegExp(`current_request\\.status = '${terminal}' AND p_new_status`));
  }
});
