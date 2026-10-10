import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type * as Diagnostic from '../lib/admin/server-binding-diagnostic';

type Row = Record<string, unknown>;
function load<T>(path: string, dependencies: Record<string, unknown>, env: Record<string, string | undefined> = {}): T {
  const exports = {};
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    exports, URL, Date, process: { env },
    require(name: string) {
      if (name === 'server-only') return {};
      if (name in dependencies) return dependencies[name];
      throw new Error('Unmocked dependency: ' + name);
    },
  }, { filename: path });
  return exports as T;
}
const identity = load<{ resolveCanonicalActiveProfile: unknown }>('lib/auth/identity.ts', {});
const team = load<{ CEO_USER_ID: string; isCeoActor: unknown }>('lib/auth/team-access.ts', { '@/lib/auth/identity': identity });
const platform = {
  VERCEL: '1', VERCEL_ENV: 'production', VERCEL_DEPLOYMENT_ID: 'dpl_SYNTHETIC166',
  VERCEL_URL: 'dir3com2-immutable-test.vercel.app', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
  NEXT_PUBLIC_SUPABASE_URL: 'https://public-test.supabase.co',
  SUPABASE_URL: 'https://server-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-only-service-key',
};
function fixture() {
  let user: Row | null = { id: team.CEO_USER_ID, email: 'display-only@example.invalid' };
  let profile: Row | null = { id: team.CEO_USER_ID, role: 'admin', status: 'active', deleted_at: null, full_name: 'Synthetic CEO' };
  let authError: unknown = null;
  let queryError: unknown = null;
  let authCalls = 0;
  let hostnameReads = 0;
  const tables: string[] = [];
  const client = {
    auth: { getUser: async () => { authCalls++; return { data: { user }, error: authError }; } },
    from(table: string) {
      tables.push(table); assert.equal(table, 'profiles');
      const filters: [string, unknown][] = [];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        is: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        maybeSingle: async () => ({ data: profile && filters.every(([key, value]) => profile![key] === value) ? profile : null, error: queryError }),
      };
      return query;
    },
  };
  return {
    client, tables, authCalls: () => authCalls, hostnameReads: () => hostnameReads,
    setUser: (value: Row | null) => { user = value; },
    setProfile: (value: Row | null) => { profile = value; },
    authError: (value: unknown) => { authError = value; },
    queryError: (value: unknown) => { queryError = value; },
    server: { createSupabaseServerClient: async () => client, getSupabaseAdminHostname: () => { hostnameReads++; return 'server-test.supabase.co'; } },
  };
}
function diagnostic(f = fixture(), env: Record<string, string | undefined> = platform) {
  return load<typeof Diagnostic>('lib/admin/server-binding-diagnostic.ts', {
    '@/lib/supabase/server': f.server, '@/lib/auth/team-access': team,
  }, env);
}
function server(env: Record<string, string | undefined>, throwOnCreate = false) {
  const constructed: unknown[][] = [];
  const api = load<{ getSupabaseAdminHostname(): string | null }>('lib/supabase/server.ts', {
    '@supabase/supabase-js': { createClient: (...args: unknown[]) => { if (throwOnCreate) throw new Error('synthetic-private-error'); constructed.push(args); return {}; } },
    '@supabase/ssr': { createServerClient: () => { throw new Error('Unexpected auth IO'); } },
    'next/headers': { cookies: () => { throw new Error('Unexpected cookie IO'); } },
  }, env);
  return { api, constructed };
}

test('anonymous and failed verified auth cannot read the binding or query profiles', async () => {
  for (const failedAuth of [false, true]) {
    const f = fixture();
    if (failedAuth) f.authError(new Error('private-auth-error')); else f.setUser(null);
    assert.equal((await diagnostic(f).readServerBindingDiagnostic()).status, 'anonymous');
    assert.equal(f.authCalls(), 1); assert.equal(f.hostnameReads(), 0); assert.equal(f.tables.length, 0);
  }
});
test('wrong account cannot substitute a role, CEO email, or metadata claim', async () => {
  const f = fixture();
  f.setUser({ id: '22222222-2222-4222-8222-222222222222', email: 'diamondidea.co@gmail.com', user_metadata: { role: 'admin' } });
  assert.equal((await diagnostic(f).readServerBindingDiagnostic()).status, 'forbidden');
  assert.equal(f.hostnameReads(), 0); assert.equal(f.tables.length, 0);
});
test('pinned CEO must have a fresh active undeleted canonical admin profile', async () => {
  for (const patch of [{ status: 'inactive' }, { deleted_at: '2026-01-01' }, { role: 'super_admin' }, { role: 'staff' }]) {
    const f = fixture();
    f.setProfile({ id: team.CEO_USER_ID, role: 'admin', status: 'active', deleted_at: null, ...patch });
    assert.equal((await diagnostic(f).readServerBindingDiagnostic()).status, 'forbidden');
    assert.equal(f.hostnameReads(), 0); assert.deepEqual(f.tables, ['profiles']);
  }
  const f = fixture(); f.queryError(new Error('private-db-error'));
  assert.equal((await diagnostic(f).readServerBindingDiagnostic()).status, 'forbidden');
});
test('canonical revocation is effective on the next read; identity is never cached', async () => {
  const f = fixture(); const api = diagnostic(f);
  assert.equal((await api.readServerBindingDiagnostic()).status, 'verified');
  f.setProfile(null);
  assert.equal((await api.readServerBindingDiagnostic()).status, 'forbidden');
  assert.equal(f.authCalls(), 2); assert.equal(f.hostnameReads(), 1);
});
test('privileged projection captures the actual constructed client, not public config or later env', () => {
  const env = { ...platform }; const { api, constructed } = server(env);
  assert.equal(constructed[0][0], platform.SUPABASE_URL);
  assert.equal(api.getSupabaseAdminHostname(), 'server-test.supabase.co');
  env.SUPABASE_URL = 'https://other-server.supabase.co';
  assert.equal(api.getSupabaseAdminHostname(), 'server-test.supabase.co');
  assert.doesNotMatch(JSON.stringify(api.getSupabaseAdminHostname()), /synthetic-only-service-key|public-test/);
});
test('missing, malformed or sensitive URL components fail closed without raw output', () => {
  for (const value of ['', 'not-a-url', 'http://server-test.supabase.co', 'https://secret:private@server-test.supabase.co',
    'https://server-test.supabase.co/private', 'https://server-test.supabase.co?key=private',
    'https://server-test.supabase.co#private', 'https://server-test.supabase.co:8443', 'https://localhost']) {
    assert.equal(server({ ...platform, SUPABASE_URL: value }).api.getSupabaseAdminHostname(), null, value);
  }
  assert.equal(server({ ...platform, SUPABASE_SERVICE_ROLE_KEY: '' }).api.getSupabaseAdminHostname(), null);
  assert.equal(server(platform, true).api.getSupabaseAdminHostname(), null);
});
test('only valid platform system identity can accompany a binding; no request identity input', async () => {
  const f = fixture(); const api = diagnostic(f);
  const good = api.getDeploymentIdentity(platform)!;
  assert.equal(good.deploymentId, platform.VERCEL_DEPLOYMENT_ID);
  assert.equal(good.deploymentUrl, 'https://' + platform.VERCEL_URL);
  for (const patch of [
    { VERCEL: undefined }, { VERCEL_ENV: 'development' }, { VERCEL_DEPLOYMENT_ID: 'caller-id' },
    { VERCEL_URL: 'https://secret@external.invalid/path' }, { VERCEL_GIT_COMMIT_SHA: 'caller-sha' },
    { VERCEL_BRANCH_URL: platform.VERCEL_URL }, { VERCEL_PROJECT_PRODUCTION_URL: platform.VERCEL_URL },
  ]) {
    assert.equal(api.getDeploymentIdentity({ ...platform, ...patch }), null);
    const denied = await diagnostic(f, { ...platform, ...patch }).readServerBindingDiagnostic();
    assert.equal(denied.status, 'unavailable'); assert.doesNotMatch(JSON.stringify(denied), /supabase|private/);
  }
  assert.equal(f.hostnameReads(), 0);
});
test('success returns only hostname, deployment identity and observation time; runtime failures are generic', async () => {
  const f = fixture(); const result = await diagnostic(f).readServerBindingDiagnostic();
  assert.equal(result.status, 'verified');
  assert.deepEqual(Object.keys(result).sort(), ['deployment', 'hostname', 'observedAt', 'status']);
  assert.doesNotMatch(JSON.stringify(result), /service-key|public-test|display-only|Synthetic CEO/);
  assert.deepEqual(f.tables, ['profiles']);
  f.server.getSupabaseAdminHostname = () => { throw new Error('private-value'); };
  const failed = await diagnostic(f).readServerBindingDiagnostic();
  assert.equal(failed.status, 'unavailable'); assert.equal(Object.keys(failed).length, 1);
});
test('page waits for the request, denies anonymous/non-CEO, and cannot render unavailable hostname', async () => {
  let connected = false;
  let result: Row = { status: 'anonymous' };
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const page = load<{ default(): Promise<unknown> }>('app/admin/server-binding/page.tsx', {
    'next/server': { connection: async () => { connected = true; } },
    'next/navigation': { redirect: (url: string) => { throw new Error('REDIRECT:' + url); }, notFound: () => { throw new Error('NOT_FOUND'); } },
    '@/lib/admin/server-binding-diagnostic': { readServerBindingDiagnostic: async () => { assert.equal(connected, true); return result; } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
  });
  await assert.rejects(page.default(), /REDIRECT:\/login\?redirect=%2Fadmin%2Fserver-binding/);
  result = { status: 'forbidden' }; await assert.rejects(page.default(), /NOT_FOUND/);
  result = { status: 'unavailable' };
  const rendered = JSON.stringify(await page.default());
  assert.match(rendered, /Binding unavailable/); assert.doesNotMatch(rendered, /supabase\.co|service-key|private-value/);
});
test('private no-cache policy covers the exact page without widening other admin routes', async () => {
  const config = load<{ default: { headers(): Promise<{ source: string; headers: { key: string; value: string }[] }[]> } }>('next.config.ts', {});
  const policies = await config.default.headers();
  assert.equal(policies.length, 1); assert.equal(policies[0].source, '/admin/server-binding');
  const headers = Object.fromEntries(policies[0].headers.map(({ key, value }) => [key, value]));
  assert.match(headers['Cache-Control'], /private.*no-store/);
  assert.equal(headers['CDN-Cache-Control'], 'no-store'); assert.equal(headers['Vercel-CDN-Cache-Control'], 'no-store');
  assert.equal(headers['Referrer-Policy'], 'no-referrer'); assert.match(headers['X-Robots-Tag'], /noindex/);
});
