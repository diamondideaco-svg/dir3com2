import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as identity from '../lib/auth/identity';

type Row = Record<string, unknown>;

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const require = createRequire(import.meta.url);
  runInNewContext(compiled, {
    exports,
    require: (id: string) => id in dependencies ? dependencies[id] : require(id),
    crypto,
  }, { filename: path });
  return exports as T;
}

function fixture(profile: Row | null, options: { authError?: boolean; profileError?: boolean } = {}) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'partner@example.invalid', user_metadata: {} };
  const filters: Array<[string, unknown]> = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: options.authError ? null : user },
        error: options.authError ? new Error('auth unavailable') : null,
      }),
    },
    from(table: string) {
      assert.equal(table, 'profiles');
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => { filters.push([column, value]); return chain; },
        is: (column: string, value: unknown) => { filters.push([column, value]); return chain; },
        maybeSingle: async () => ({ data: options.profileError ? null : profile, error: options.profileError ? new Error('profile unavailable') : null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  const portal = load<typeof import('../lib/partner-portal/server')>('lib/partner-portal/server.ts', {
    '@/lib/auth/identity': identity,
    '@/lib/supabase/server': { createSupabaseServerClient: async () => client, supabaseAdmin: null },
    '@/lib/partner-portal/domain': { resolvePartnerDomainType: async () => 'partner' },
  });
  return { portal, filters, user };
}

test('canonical active profile requires exact ID, active status, null deletion and recognized role', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const cases: Array<[string, Row | null, boolean]> = [
    ['active partner', { id: userId, role: 'partner', status: 'active', deleted_at: null, full_name: 'Partner' }, true],
    ['active admin alias', { id: userId, role: 'super_admin', status: 'active', deleted_at: null, full_name: 'Admin' }, true],
    ['wrong id', { id: '22222222-2222-4222-8222-222222222222', role: 'partner', status: 'active', deleted_at: null }, false],
    ['deleted active', { id: userId, role: 'partner', status: 'active', deleted_at: '2026-09-05T00:00:00Z' }, false],
    ['inactive', { id: userId, role: 'partner', status: 'inactive', deleted_at: null }, false],
    ['unknown role', { id: userId, role: 'owner', status: 'active', deleted_at: null }, false],
    ['missing', null, false],
  ];

  for (const [name, row, expected] of cases) {
    const { portal, filters } = fixture(row);
    assert.equal(Boolean(await portal.requirePortalActor()), expected, name);
    assert.deepEqual(filters, [['id', userId], ['status', 'active'], ['deleted_at', null]], name);
  }
});

test('portal authorization fails closed on auth and profile lookup errors', async () => {
  const row = { id: '11111111-1111-4111-8111-111111111111', role: 'partner', status: 'active', deleted_at: null };
  assert.equal(await fixture(row, { authError: true }).portal.requirePortalActor(), null);
  assert.equal(await fixture(row, { profileError: true }).portal.requirePortalActor(), null);
});

test('legitimate active portal roles remain available while customer authority is denied', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  for (const role of ['partner', 'admin', 'staff']) {
    const actor = await fixture({ id: userId, role, status: 'active', deleted_at: null, full_name: role }).portal.requirePortalActor();
    assert.equal(actor?.authRole, role);
  }
  assert.equal(await fixture({ id: userId, role: 'customer', status: 'active', deleted_at: null }).portal.requirePortalActor(), null);
});
