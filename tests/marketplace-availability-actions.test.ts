import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as availability from '../lib/marketplace/catalog-availability';
import { approvedPartnerProductIds } from '../lib/marketplace/catalog-availability-server';
import * as requestGate from '../lib/marketplace/request-gate';
import * as requestInputs from '../lib/marketplace/request-input';
import { normalizeMarketplaceServices } from '../lib/marketplace/data';
import { filterApprovedLaunchInventory } from '../lib/marketplace/launch-catalog';

test('card, PDP and server share the same fail-closed action truth', () => {
  for (const action of ['request_to_confirm', 'request_quote'] as const) {
    for (const state of ['available', 'limited']) assert.equal(availability.catalogRequestAction(action, state), action);
    assert.equal(availability.catalogRequestAction(action, 'sold-out'), 'unavailable');
    for (const state of [undefined, null, 'unknown', 'unavailable']) assert.equal(availability.catalogRequestAction(action, state), 'view_details');
  }
  assert.equal(availability.catalogRequestAction('none', 'available'), 'none');
  assert.equal(availability.catalogRequestAction('unavailable', 'unknown'), 'unavailable');
  for (const file of ['components/shared/ServiceCard.tsx', 'components/public/PublicServiceDetailClient.tsx', 'app/api/marketplace/requests/route.ts']) {
    assert.match(readFileSync(file, 'utf8'), /catalogRequestAction\(/);
  }
  const detail = readFileSync('app/api/services/[slug]/route.ts', 'utf8');
  assert.match(detail, /readCatalogAvailability\(client, \[String\(product.id\)\]\)/);
  assert.doesNotMatch(detail, /readCatalogAvailability\(client, \[String\(service.id\)\]\)/);
  assert.match(detail, /safeProducts.map\(\(product\) => String\(product.id\)\)/);
});

test('partner approval uses the actual FK, not names, dates, or invented ownership', () => {
  const link = { product_id: 'unit-product', partner_id: 'unit-partner', synthetic: false, environment: 'production',
    partner: { id: 'unit-partner', status: 'approved', synthetic: false, environment: 'production', deleted_at: null as string | null } };
  assert.deepEqual([...approvedPartnerProductIds([link])], ['unit-product']);
  for (const invalid of [
    { ...link, synthetic: true }, { ...link, environment: 'sandbox' }, { ...link, partner: null },
    { ...link, partner_id: 'other' }, { ...link, partner: { ...link.partner, status: 'suspended' } },
    { ...link, partner: { ...link.partner, deleted_at: '2026-01-01' } },
    { ...link, partner: { ...link.partner, synthetic: true } },
    { ...link, partner: { ...link.partner, environment: 'sandbox' } },
  ]) assert.equal(approvedPartnerProductIds([invalid]).size, 0);
  const product = { id: 'unit-product', marketplace_family: 'drive' as const, status: 'published', verified: false,
    supplier_verified: true, partner_approved: true, marketplace_environment: 'production' as const,
    fulfilment_state: 'verified_quote' as const, transaction_method: 'request_quote' as const,
    synthetic: false, currency: 'EGP', base_price: null };
  for (const name of ['Independent approved partner', 'أحد الموردين المعتمدين', '']) {
    assert.equal(filterApprovedLaunchInventory(normalizeMarketplaceServices([{ ...product, supplier_name: name }], false)).length, 1);
  }
  assert.equal(filterApprovedLaunchInventory(normalizeMarketplaceServices([{ ...product, partner_approved: false, supplier_name: 'Abu Al-Hana' }], false)).length, 0);
});

// Isolated execution of the real handler: no network, database, or published fixtures.
async function runRequest(state: string, options: { authenticated?: boolean; replay?: boolean; readFailure?: boolean } = {}) {
  let inserts = 0;
  let reads = 0;
  const scoped: unknown[][] = [];
  const productId = '00000000-0000-4000-8000-000000000001';
  const product = { id: productId, status: 'published', synthetic: false, deleted_at: null,
    marketplace_environment: 'production', marketplace_family: 'drive', fulfilment_state: 'verified_requestable', transaction_method: 'request_to_confirm' };
  const existing = { request_reference: 'REQ-UNITONLY', status: 'request_submitted' };
  const admin = { from(table: string) {
    let inserted = false;
    const query = {
      select() { return query; },
      eq(...args: unknown[]) { scoped.push(args); return query; },
      insert() { inserts++; inserted = true; return query; },
      async maybeSingle() { return { error: null, data: table === 'products' ? product : options.replay ? existing : null }; },
      async single() { assert.equal(inserted, true); return { error: null, data: existing }; },
    };
    return query;
  } };
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync('app/api/marketplace/requests/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, init: ResponseInit) => Response.json(body, init) } },
    '@/lib/supabase/server': { supabaseAdmin: admin, createSupabaseRequestClient: async () => options.authenticated === false ? null : { user: { id: 'unit-owner' } } },
    '@/lib/security/safe-logger': { logServerError() {} },
    '@/lib/marketplace/request-gate': requestGate,
    '@/lib/marketplace/request-input': requestInputs,
    '@/lib/marketplace/customer-requests': {},
    '@/lib/marketplace/catalog-availability': availability,
    '@/lib/marketplace/catalog-availability-server': { async readCatalogAvailability() { reads++; return { failed: options.readFailure, byProduct: new Map([[productId, { availability_status: state }]]) }; } },
  };
  runInNewContext(code, { exports, crypto, TextEncoder, require(name: string) { assert.ok(name in deps, name); return deps[name]; } });
  const response = await (exports.POST as (request: Request) => Promise<Response>)(new Request('https://unit.invalid/api/marketplace/requests', {
    method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'unit-idempotency-only-123' },
    body: JSON.stringify({ product_id: productId, request_type: 'request_to_confirm', requested_for: '2099-10-12', traveller_count: 1 }),
  }));
  return { response, body: await response.json(), inserts, reads, scoped };
}

test('POST rejects unknown/sold-out availability and availability read failure before any insert', async () => {
  for (const state of ['unknown', 'sold-out', 'unavailable']) {
    const result = await runRequest(state);
    assert.equal(result.response.status, 409);
    assert.equal(result.body.code, 'AVAILABILITY_UNCONFIRMED');
    assert.equal(result.inserts, 0);
  }
  const failure = await runRequest('available', { readFailure: true });
  assert.equal(failure.response.status, 503);
  assert.equal(failure.inserts, 0);
});

test('POST retains authentication, request_submitted truth, and owner/product-scoped idempotent replay', async () => {
  const anonymous = await runRequest('available', { authenticated: false });
  assert.equal(anonymous.response.status, 401);
  assert.equal(anonymous.inserts, 0);
  const success = await runRequest('available');
  assert.equal(success.response.status, 201);
  assert.equal(success.inserts, 1);
  assert.equal(success.body.request.status, 'request_submitted');
  const replay = await runRequest('sold-out', { replay: true });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.inserts, 0);
  assert.equal(replay.reads, 0);
  assert.ok(replay.scoped.some(([key, value]) => key === 'user_id' && value === 'unit-owner'));
  assert.ok(replay.scoped.some(([key, value]) => key === 'product_id' && value === '00000000-0000-4000-8000-000000000001'));
});
