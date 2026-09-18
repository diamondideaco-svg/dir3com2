import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { marketplaceRequestAttemptKey } from '../lib/marketplace/request-attempt';
import * as requestGate from '../lib/marketplace/request-gate';
import * as requestInput from '../lib/marketplace/request-input';
import * as catalogAvailability from '../lib/marketplace/catalog-availability';

const body = JSON.stringify({ product_id: 'isolated-product', requested_for: '2099-10-12T12:00:00.000Z', traveller_count: 1, customer_brief: { notes: 'private notes' } });
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

test('PDP retry after a lost response retains one intent key, including remount', async () => {
  const tab = storage();
  const attempt = { nonce: null as string | null };
  const first = await marketplaceRequestAttemptKey(attempt, 'customer-a', body, () => tab);
  const retry = await marketplaceRequestAttemptKey(attempt, 'customer-a', body, () => tab);
  const remount = await marketplaceRequestAttemptKey({ nonce: null }, 'customer-a', body, () => tab);
  assert.equal(first, retry);
  assert.equal(first, remount);
  assert.match(first, /^[A-Za-z0-9:_-]{16,120}$/);
  assert.equal(tab.values.size, 1);
  assert.doesNotMatch(JSON.stringify([...tab.values]), /customer-a|private notes|isolated-product|2099/);
});

test('changed account or request intent never reuses the previous key', async () => {
  const tab = storage();
  const attempt = { nonce: null as string | null };
  const first = await marketplaceRequestAttemptKey(attempt, 'customer-a', body, () => tab);
  assert.notEqual(first, await marketplaceRequestAttemptKey(attempt, 'customer-b', body, () => tab));
  assert.notEqual(first, await marketplaceRequestAttemptKey(attempt, 'customer-a', body.replace('2099-10-12', '2099-10-13'), () => tab));
  assert.notEqual(first, await marketplaceRequestAttemptKey({ nonce: null }, 'customer-a', body, storage));
});

test('restricted storage retains retry safety in memory and malformed saved nonce is ignored', async () => {
  const attempt = { nonce: null as string | null };
  const denied = () => { throw new Error('Storage denied'); };
  const first = await marketplaceRequestAttemptKey(attempt, 'customer-a', body, denied);
  assert.equal(first, await marketplaceRequestAttemptKey(attempt, 'customer-a', body, denied));
  const malformed = { getItem: () => 'not-a-uuid', setItem() {} };
  const recovered = { nonce: null as string | null };
  await marketplaceRequestAttemptKey(recovered, 'customer-a', body, () => malformed);
  assert.match(recovered.nonce!, /^[0-9a-f-]{36}$/);
});

test('PDP attaches the intent key after authentication and preserves the request body', () => {
  const source = readFileSync(new URL('../components/public/PublicServiceDetailClient.tsx', import.meta.url), 'utf8');
  assert.match(source, /useRef<\{ nonce: string \| null \}>\(\{ nonce: null \}\)/);
  assert.match(source, /marketplaceRequestAttemptKey\(requestAttempt.current, session.user.id, requestBody, \(\) => window.sessionStorage\)/);
  assert.match(source, /'Idempotency-Key': idempotencyKey/);
  assert.match(source, /body: requestBody/);
  assert.ok(source.indexOf('const idempotencyKey =') > source.indexOf('identity?.authenticated !== true'));
  assert.match(source, /requestInFlight.current \|\| requestState === 'sent'/);
});

test('actual request route replays one submitted REQ after response loss with the PDP key', async () => {
  // Isolated in-memory persistence only; actual validation and route code run.
  const rows: Record<string, unknown>[] = [];
  const actor = '22222222-2222-4222-8222-222222222222';
  const product = { id: '11111111-1111-4111-8111-111111111111', name_en: 'Isolated unit test', status: 'published', synthetic: false, marketplace_environment: 'production', fulfilment_state: 'verified_requestable', transaction_method: 'request_to_confirm', marketplace_family: 'drive' };
  const db = { from(table: string) {
    assert.ok(['products', 'marketplace_requests'].includes(table), `Unexpected table: ${table}`);
    const predicates: Array<[string, unknown]> = [];
    const q = {
      select() { return q; },
      eq(field: string, value: unknown) { predicates.push([field, value]); return q; },
      async maybeSingle() { return { data: (table === 'products' ? [product] : rows).find(row => predicates.every(([field, value]) => (row as Record<string, unknown>)[field] === value)) ?? null, error: null }; },
      insert(row: Record<string, unknown>) { assert.equal(table, 'marketplace_requests'); rows.push(row); return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; },
    };
    return q;
  } };
  const dependencies: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, init?: { status: number }) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/supabase/server': { supabaseAdmin: db, createSupabaseRequestClient: async () => ({ user: { id: actor }, supabase: {} }) },
    '@/lib/security/safe-logger': { logServerError() {} },
    '@/lib/marketplace/request-gate': requestGate,
    '@/lib/marketplace/customer-requests': {},
    '@/lib/marketplace/request-input': requestInput,
    '@/lib/marketplace/catalog-availability-server': { readCatalogAvailability: async () => ({ failed: false, byProduct: new Map([[product.id, { availability_status: 'available' }]]) }) },
    '@/lib/marketplace/catalog-availability': catalogAvailability,
    '@/lib/drive/request-server': { createDriveRequest() { assert.fail('Legacy product requests must not enter the managed Drive branch'); } },
  };
  const exports: { POST?: (request: Request) => Promise<{ status: number; body: { request: Record<string, unknown> } }> } = {};
  const source = readFileSync(new URL('../app/api/marketplace/requests/route.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, crypto, TextEncoder,
    require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  const tab = storage();
  const payload = JSON.stringify({ product_id: product.id, request_type: 'request_to_confirm', requested_for: '2099-10-12T12:00:00.000Z', traveller_count: 1 });
  const firstKey = await marketplaceRequestAttemptKey({ nonce: null }, actor, payload, () => tab);
  const request = (key: string) => new Request('http://isolated.invalid/api/marketplace/requests', { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': key }, body: payload });
  const first = await exports.POST!(request(firstKey));
  // The client did not receive first.body. A remount/retry obtains the same key.
  const retryKey = await marketplaceRequestAttemptKey({ nonce: null }, actor, payload, () => tab);
  const retry = await exports.POST!(request(retryKey));
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal(rows.length, 1);
  assert.equal(first.body.request.request_reference, retry.body.request.request_reference);
  assert.equal(rows[0].status, 'request_submitted');
  assert.equal(rows[0].user_id, actor);
  assert.equal(rows[0].payment_status, undefined);
  assert.equal(rows[0].booking_id, undefined);
});
