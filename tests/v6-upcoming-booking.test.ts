import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { normalizeBookingStatus } from '../lib/booking/workflow-status';

const require = createRequire(import.meta.url);
test('actual account query finds an older upcoming booking beyond ten historical records without losing owner scope', async () => {
  const actor = 'customer-a';
  const fixtures = [
    { id: 'foreign', user_id: 'customer-b', status: 'Confirmed' },
    ...Array.from({ length: 10 }, (_, n) => ({ id: `history-${n}`, user_id: actor, status: n % 2 ? 'completed' : 'CANCELLED' })),
    { id: 'upcoming', user_id: actor, status: 'confirmed' },
  ];
  const source = readFileSync(new URL('../app/my-account/page.tsx', import.meta.url), 'utf8');
  const calls: string[] = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: actor, email: 'test@example.invalid' } } }) },
    from(table: string) {
      let rows = table === 'bookings' ? [...fixtures] : [];
      const chain = {
        select() { return chain; },
        eq(key: string, value: string) { if (table === 'bookings') { assert.equal(key, 'user_id'); assert.equal(value, actor); rows = rows.filter(row => row.user_id === value); calls.push('owner'); } return chain; },
        or(filter: string) { assert.equal(table, 'bookings'); assert.equal(filter, 'status.is.null,and(status.not.ilike.completed,status.not.ilike.cancelled,status.not.ilike.canceled)'); rows = rows.filter(row => !['completed', 'cancelled', 'canceled'].includes(row.status.toLowerCase())); calls.push('filter'); return chain; },
        order(key: string, options: { ascending: boolean }) { assert.equal(key, 'created_at'); assert.equal(options.ascending, false); return chain; },
        limit(n: number) { if (table === 'bookings') { calls.push('limit'); rows = rows.slice(0, n); } return Promise.resolve({ data: rows, error: null }); },
        maybeSingle: async () => ({ data: { id: actor, role: 'customer', status: 'active' }, error: null }),
      };
      return chain;
    },
  };
  const dependencies: Record<string, unknown> = {
    'next/navigation': { redirect() { throw Error('unexpected login redirect'); } },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => db },
    '@/lib/auth/identity': { normalizeRole: () => 'customer' },
    '@/lib/marketplace/customer-requests': { listCustomerMarketplaceRequests: async () => ({ requests: [] }) },
    '@/lib/booking/workflow-status': { normalizeBookingStatus },
    '@/components/account/MyAccountContent': { default: 'Account' },
    '@/components/v6/AccountFrame': { default: 'Frame' },
  };
  const exports: { default?: () => Promise<{ props: { children: { props: { booking: { id: string } } } } }> } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: (id: string) => id in dependencies ? dependencies[id] : require(id),
  });
  const page = await exports.default!();
  assert.equal(page.props.children.props.booking.id, 'upcoming');
  assert.deepEqual(calls, ['owner', 'filter', 'limit']);
});
