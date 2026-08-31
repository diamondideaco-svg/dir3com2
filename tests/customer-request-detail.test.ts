import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  formatCustomerRequestTimestamp,
  getCustomerMarketplaceRequest,
  isMarketplaceRequestReference,
  listCustomerMarketplaceRequests,
  type CustomerMarketplaceRequest,
} from '../lib/marketplace/customer-requests';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const CUSTOMER_A = '77ac72af-f743-4bc9-9b31-8556965739ba';
const CUSTOMER_B = '11111111-1111-4111-8111-111111111111';

const requests: Array<CustomerMarketplaceRequest & { user_id: string }> = [
  {
    id: '797c4598-1670-46f1-9fd5-92926b7e9ced',
    user_id: CUSTOMER_A,
    request_reference: 'REQ-FC5095B5',
    product_id: '86ed339b-8945-40fa-bc04-4a142c5d755e',
    request_type: 'request_to_confirm',
    status: 'request_submitted',
    requested_for: null,
    traveller_count: 1,
    quote_amount: null,
    quote_currency: null,
    quote_expires_at: null,
    payment_status: 'awaiting_payment',
    marketplace_family: 'drive',
    supplier_name: 'Abu Al hana Drive',
    service_name: 'هيونداي أفانتي',
    fulfilment_method: 'request_to_confirm',
    transaction_method: 'request_to_confirm',
    handoff_type: 'none',
    handoff_reference: null,
    handoff_started_at: null,
    next_action: 'operations_review',
    created_at: '2026-08-29T20:27:59.254529+00:00',
    updated_at: '2026-08-29T20:27:59.254529+00:00',
  },
  {
    id: '23b0cd29-7973-41e0-90d2-3fbc71cc73d5',
    user_id: CUSTOMER_A,
    request_reference: 'REQ-E8BB9F5E',
    product_id: '86ed339b-8945-40fa-bc04-4a142c5d755e',
    request_type: 'request_to_confirm',
    status: 'request_submitted',
    requested_for: null,
    traveller_count: 1,
    quote_amount: null,
    quote_currency: null,
    quote_expires_at: null,
    payment_status: 'awaiting_payment',
    marketplace_family: 'drive',
    supplier_name: 'Abu Al hana Drive',
    service_name: 'هيونداي أفانتي',
    fulfilment_method: 'request_to_confirm',
    transaction_method: 'request_to_confirm',
    handoff_type: 'none',
    handoff_reference: null,
    handoff_started_at: null,
    next_action: 'operations_review',
    created_at: '2026-08-29T20:17:04.492531+00:00',
    updated_at: '2026-08-29T20:17:04.492531+00:00',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    user_id: CUSTOMER_B,
    request_reference: 'REQ-FOREIGN1',
    product_id: '44444444-4444-4444-8444-444444444444',
    request_type: 'request_to_confirm',
    status: 'request_submitted',
    requested_for: null,
    traveller_count: 1,
    quote_amount: null,
    quote_currency: null,
    quote_expires_at: null,
    payment_status: 'awaiting_payment',
    marketplace_family: 'drive',
    supplier_name: 'Another supplier',
    service_name: 'Foreign request',
    fulfilment_method: 'request_to_confirm',
    transaction_method: 'request_to_confirm',
    handoff_type: 'none',
    handoff_reference: null,
    handoff_started_at: null,
    next_action: 'operations_review',
    created_at: '2026-08-29T20:00:00.000000+00:00',
    updated_at: '2026-08-29T20:00:00.000000+00:00',
  },
];

function mockSupabase(rows: typeof requests) {
  class Query {
    private filters: Array<[string, unknown]> = [];
    private rowLimit: number | undefined;

    select() { return this; }
    eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
    order() { return this; }
    limit(value: number) { this.rowLimit = value; return this; }
    private matches() {
      const filtered = rows.filter((row) => this.filters.every(([column, value]) => row[column as keyof typeof row] === value));
      return this.rowLimit === undefined ? filtered : filtered.slice(0, this.rowLimit);
    }
    maybeSingle() { return Promise.resolve({ data: this.matches()[0] ?? null, error: null }); }
    then<TResult1 = { data: typeof rows; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: typeof rows; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve({ data: this.matches() as typeof rows, error: null }).then(onfulfilled, onrejected);
    }
  }

  return {
    from(table: string) {
      assert.equal(table, 'marketplace_requests');
      return new Query();
    },
  } as unknown as SupabaseClient;
}

test('owned request detail lookup maps both authoritative customer references', async () => {
  const supabase = mockSupabase(requests);
  for (const reference of ['REQ-FC5095B5', 'REQ-E8BB9F5E']) {
    const result = await getCustomerMarketplaceRequest(supabase, CUSTOMER_A, reference);
    assert.equal(result.error, null);
    assert.equal(result.request?.request_reference, reference);
    assert.equal(result.request?.service_name, 'هيونداي أفانتي');
    assert.equal(result.request?.supplier_name, 'Abu Al hana Drive');
    assert.equal(result.request?.marketplace_family, 'drive');
    assert.equal(result.request?.status, 'request_submitted');
    assert.equal(result.request?.next_action, 'operations_review');
    assert.ok(result.request?.created_at);
    assert.ok(result.request?.updated_at);
  }
});

test('owner binding denies foreign customer, guessed reference, and parameter spoofing', async () => {
  const supabase = mockSupabase(requests);
  assert.equal((await getCustomerMarketplaceRequest(supabase, CUSTOMER_A, 'REQ-FOREIGN1')).request, null);
  assert.equal((await getCustomerMarketplaceRequest(supabase, CUSTOMER_A, 'REQ-GUESSED1')).request, null);
  assert.equal((await getCustomerMarketplaceRequest(supabase, CUSTOMER_B, 'REQ-FC5095B5')).request, null);
  const own = await listCustomerMarketplaceRequests(supabase, CUSTOMER_A);
  assert.deepEqual(own.requests.map((request) => request.request_reference), ['REQ-FC5095B5', 'REQ-E8BB9F5E']);
});

test('route validates references, protects anonymous sessions, and returns 404 for non-owned records', () => {
  const page = read('app/my-requests/[reference]/page.tsx');
  const proxy = read('proxy.ts');
  assert.equal(isMarketplaceRequestReference('REQ-FC5095B5'), true);
  assert.equal(isMarketplaceRequestReference('REQ-E8BB9F5E'), true);
  assert.equal(isMarketplaceRequestReference('../admin'), false);
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /if \(!user\) redirect\(buildLoginTarget\(destination\)\)/);
  assert.match(page, /getCustomerMarketplaceRequest\(supabase, user\.id, reference\)/);
  assert.doesNotMatch(page, /searchParams|user_id|owner_id/);
  assert.match(page, /if \(!request\) notFound\(\)/);
  assert.match(proxy, /'\/my-requests'/);
});

test('shared summaries expose one accessible bilingual request detail CTA', () => {
  const panel = read('components/account/MarketplaceRequestsPanel.tsx');
  const account = read('app/my-account/page.tsx');
  const bookings = read('app/my-bookings/page.tsx');
  assert.match(panel, /href=\{`\/my-requests\/\$\{encodeURIComponent\(request\.request_reference\)\}`\}/);
  assert.match(panel, /عرض التفاصيل/);
  assert.match(panel, /View details/);
  assert.match(panel, /min-h-11/);
  assert.match(account, /listCustomerMarketplaceRequests\(supabase, user\.id, 5\)/);
  assert.match(bookings, /listCustomerMarketplaceRequests\(supabase, user\.id\)/);
});

test('detail UI is bilingual and preserves request-versus-booking truth', () => {
  const detail = read('components/account/MarketplaceRequestDetail.tsx');
  for (const label of ['المرجع الداخلي', 'الخدمة أو المنتج', 'المورد', 'الفئة', 'حالة الطلب', 'تاريخ إنشاء الطلب', 'آخر تحديث', 'الإجراء التالي']) {
    assert.match(detail, new RegExp(label));
  }
  for (const label of ['Internal reference', 'Service or product', 'Supplier', 'Family', 'Request status', 'Request created', 'Last updated', 'Next action']) {
    assert.match(detail, new RegExp(label));
  }
  assert.match(detail, /طلب سوق — ليس سجل حجز/);
  assert.match(detail, /Marketplace request — not a booking record/);
  assert.doesNotMatch(detail, /confirmed booking[^.]*request\.status|حجز مؤكد[^.]*request\.status/);
  assert.match(detail, /operations_review: 'مراجعة الطلب من فريق العمليات'/);
  assert.match(detail, /operations_review: 'Operations team review'/);
});

test('created and updated timestamps use deterministic UTC formatting', () => {
  const first = formatCustomerRequestTimestamp('2026-08-29T20:27:59.254529+00:00');
  const second = formatCustomerRequestTimestamp('2026-08-29T20:27:59.254529+00:00');
  assert.deepEqual(first, second);
  assert.match(first.ar, /2026/);
  assert.match(first.en, /2026/);
  assert.equal(formatCustomerRequestTimestamp('invalid').en, '—');
  const source = read('lib/marketplace/customer-requests.ts');
  assert.match(source, /timeZone: 'UTC'/);
  assert.match(source, /hourCycle: 'h23'/);
});

test('customer request reads use one canonical owner-scoped query contract', () => {
  const contract = read('lib/marketplace/customer-requests.ts');
  const api = read('app/api/marketplace/requests/route.ts');
  assert.equal((contract.match(/\.from\('marketplace_requests'\)/g) ?? []).length, 2);
  assert.match(contract, /\.eq\('user_id', authenticatedUserId\)/);
  assert.match(contract, /\.eq\('request_reference', reference\)/);
  assert.doesNotMatch(contract, /supabaseAdmin|SERVICE_ROLE|user_id:\s*reference/);
  assert.match(api, /listCustomerMarketplaceRequests\(auth\.supabase, auth\.user\.id\)/);
});
