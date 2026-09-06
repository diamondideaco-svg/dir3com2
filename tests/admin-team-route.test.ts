import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import ts from 'typescript';

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  const require = createRequire(import.meta.url);
  runInNewContext(compiled, { exports, require: (id: string) => id in dependencies ? dependencies[id] : require(id) }, { filename: path });
  return exports as T;
}

const events: unknown[] = [];
const loader = load<typeof import('../lib/admin/team-access-data')>('lib/admin/team-access-data.ts', {
  'server-only': {}, '@/lib/security/safe-logger': { logServerEvent: (...args: unknown[]) => events.push(args) },
});
const identity = load<typeof import('../lib/auth/identity')>('lib/auth/identity.ts', { 'server-only': {} });
const team = load<typeof import('../lib/auth/team-access')>('lib/auth/team-access.ts', {
  'server-only': {},
  '@/lib/auth/identity': identity,
});
const valid = { id: 'grant', email: 'employee@example.invalid', job_title: 'Manager', access_level: 'scoped_staff', country_scope: ['EG', 'QA'], permissions: ['customers:read'], status: 'active', invited_user_id: 'employee' };

function fixture({ tableError = null, functionError = null, data = [] as unknown, rpcData = false as unknown, throws = false, actor = true } = {} as {
  tableError?: { code: string; message?: string } | null; functionError?: { code: string } | null; data?: unknown; rpcData?: unknown; throws?: boolean; actor?: boolean;
}) {
  const calls: string[] = [];
  const query = {
    select: () => query, order: () => query, limit: () => query,
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => (throws ? Promise.reject(new Error('private upstream failure')) : Promise.resolve({ data, error: tableError })).then(resolve, reject),
  };
  const client = {
    from: (name: string) => { calls.push(name); return query; },
    rpc: async (name: string) => { calls.push(name); return { data: rpcData, error: functionError }; },
  } as unknown as SupabaseClient;
  async function html(language: 'ar' | 'en') {
    const page = load<{ default: () => Promise<React.ReactNode> }>('app/admin/team/page.tsx', {
      '@/lib/auth/admin': { requireAdminReadAccess: async () => ({ supabase: client, user: { id: actor ? team.CEO_USER_ID : 'other' } }) },
      '@/lib/auth/team-access': { ...team, isCeoActor: async () => actor },
      '@/lib/admin/team-access-data': loader,
      '@/lib/actions/team-access-actions': { setTeamAccessStatusAction: '/test/status', upsertTeamAccessGrantAction: '/test/save' },
      '@/components/admin/AdminLocale': {
        AdminText: (props: { ar: React.ReactNode; en: React.ReactNode }) => props[language],
        AdminRetryButton: () => createElement('button', { type: 'button' }, language === 'ar' ? 'إعادة المحاولة' : 'Try again'),
        AdminStatusText: ({ value }: { value: string }) => value,
        AdminLocalizedInput: ({ ar, en, ...props }: { ar: string; en: string }) => createElement('input', { ...props, placeholder: language === 'ar' ? ar : en }),
      },
    });
    return renderToStaticMarkup(await page.default());
  }
  return { client, calls, html };
}

for (const code of ['PGRST205', '42P01']) test(`table missing ${code}: explicit non-activated state, no fake empty/list/actions`, async () => {
  const f = fixture({ tableError: { code, message: 'SQL private credentials secret=do-not-return' } });
  assert.equal((await loader.loadTeamAccess(f.client)).status, 'not_activated');
  for (const language of ['ar', 'en'] as const) {
    const html = await f.html(language);
    assert.match(html, language === 'ar' ? /لم تُفعّل/ : /not activated/);
    assert.doesNotMatch(html, /<form|No employees|لا يوجد موظفون|PGRST|42P01|SQL|secret|تعذر تحميل صفحة الإدارة/);
  }
  assert.ok(f.calls.every(call => call === 'team_access_grants'));
});

for (const code of ['PGRST202', '42883']) test(`function missing ${code}: no ready controls despite present table`, async () => {
  const f = fixture({ data: [valid], functionError: { code } });
  assert.equal((await loader.loadTeamAccess(f.client)).status, 'not_activated');
  assert.doesNotMatch(await f.html('en'), /employee@example|<form|No employees/);
});

for (const code of ['42501', '42703', '22P02', 'PGRST301']) test(`query failure ${code} is unavailable, not activation or empty success`, async () => {
  const f = fixture({ tableError: { code, message: 'private SQL' } });
  assert.equal((await loader.loadTeamAccess(f.client)).status, 'unavailable');
  const html = await f.html('en');
  assert.match(html, /could not be loaded/);
  assert.doesNotMatch(html, /not activated|No employees|<form|private SQL/);
});

test('transport exception and malformed responses fail safely without an error boundary', async () => {
  for (const input of [{ throws: true }, { data: null }, { data: [null] }, { data: [{ ...valid, permissions: null }] }, { rpcData: null }]) {
    const f = fixture(input);
    assert.equal((await loader.loadTeamAccess(f.client)).status, 'unavailable');
    assert.match(await f.html('ar'), /تعذّر تحميل بيانات الفريق/);
  }
});

test('present schema with true zero grants alone renders truthful empty state and invite controls', async () => {
  const f = fixture();
  assert.equal((await loader.loadTeamAccess(f.client)).status, 'ready');
  assert.match(await f.html('en'), /No employees assigned yet/);
  assert.match(await f.html('ar'), /لا يوجد موظفون مضافون بعد/);
  assert.match(await f.html('en'), /name="email"/);
  assert.ok(f.calls.includes('is_ceo_actor'));
});

test('valid migrated grants render team, countries, permissions, status and activation controls', async () => {
  const f = fixture({ data: [valid] });
  const html = await f.html('en');
  for (const text of ['Manager', 'EG, QA', 'customers:read', 'active', 'Deactivate', 'Save employee access']) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /No employees|not activated/);
});

test('non-CEO is denied before any privileged table/function IO', async () => {
  const f = fixture({ actor: false });
  assert.match(await f.html('en'), /CEO access required/);
  assert.deepEqual(f.calls, []);
});

test('operational logs exclude raw upstream messages and credentials', async () => {
  events.length = 0;
  await loader.loadTeamAccess(fixture({ tableError: { code: 'PGRST205', message: 'secret=never-log' } }).client);
  assert.match(JSON.stringify(events), /PGRST205/);
  assert.doesNotMatch(JSON.stringify(events), /never-log|secret=/);
});
