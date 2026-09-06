import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as routing from '../lib/auth/redirect';
import { buildOAuthCallbackUrl } from '../lib/auth/oauth-callback';
import type { SessionRole } from '../lib/auth/identity-contract';
import * as copy from '../lib/i18n/customer-hub';
import * as bookingStatus from '../lib/booking/workflow-status';

const require = createRequire(import.meta.url);

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports, URL,
    require: (id: string) => id in dependencies ? dependencies[id] : require(id),
  }, { filename: path });
  return exports as T;
}

const identity = load<typeof import('../lib/auth/identity')>('lib/auth/identity.ts', { 'server-only': {} });
const actorId = '11111111-1111-4111-8111-111111111111';

async function callback(role: string | null, search = '') {
  const chain = {
    select: () => chain,
    eq: (column: string, value: string) => {
      assert.equal(column, 'id');
      assert.equal(value, actorId);
      return chain;
    },
    maybeSingle: async () => ({ data: role ? { role } : null, error: null }),
  };
  const supabase = {
    auth: { exchangeCodeForSession: async () => ({ data: { user: { id: actorId, user_metadata: { role: 'admin' } } }, error: null }) },
    from: (table: string) => { assert.equal(table, 'profiles'); return chain; },
  };
  const route = load<{ GET(request: Request): Promise<{ url: string }> }>('app/auth/callback/route.ts', {
    'next/server': { NextResponse: { redirect: (url: string) => ({ url }) } },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => supabase, supabaseAdmin: null },
    '@/lib/auth/redirect': routing,
    '@/lib/auth/identity': { ...identity, ensureCanonicalProfileFromAuthUser: async () => undefined },
    '@/lib/security/safe-logger': { logServerError() {}, logServerEvent() {} },
  });
  return (await route.GET(new Request(`https://example.invalid/auth/callback?code=test${search}`))).url;
}

test('Google staff default uses canonical operational routing including the generated root landing', async () => {
  assert.equal(await callback('staff'), 'https://example.invalid/admin');
  const url = new URL(buildOAuthCallbackUrl('https://example.invalid', routing.getPostLoginDestination(null)));
  assert.equal(await callback('staff', `&${url.searchParams}`), 'https://example.invalid/admin');
});

test('staff callback preserves explicit account and operational return paths with redirect precedence', async () => {
  for (const parameter of ['redirect', 'next']) {
    for (const path of ['/', '/my-account', '/my-account?tab=bookings', '/admin/customers']) {
      assert.equal(await callback('staff', `&${parameter}=${encodeURIComponent(path)}`), `https://example.invalid${path}`);
    }
  }
  assert.equal(await callback('staff', '&redirect=%2Fmy-account&next=%2Fadmin'), 'https://example.invalid/my-account');
});

test('customer, admin, partner and unavailable roles retain callback behavior without metadata authority', async () => {
  for (const [role, destination] of [['customer', '/my-account'], ['admin', '/admin'], ['partner', '/partner-portal'], [null, '/my-account']] as const) {
    assert.equal(await callback(role), `https://example.invalid${destination}`);
    assert.equal(await callback(role, '&redirect=%2F&next=%2F'), 'https://example.invalid/');
    assert.equal(await callback(role, '&next=%2Fmy-account'), 'https://example.invalid/my-account');
  }
});

test('staff callback does not redirect outside the application or select an executive landing', async () => {
  for (const destination of ['https://outside.invalid/account', '//outside.invalid/account', 'javascript:alert(1)']) {
    const url = new URL(await callback('staff', `&redirect=${encodeURIComponent(destination)}`));
    assert.equal(url.origin, 'https://example.invalid');
    assert.equal(url.pathname, '/');
  }
});

test('rendered account headings and badges reflect each canonical role in Arabic and English', () => {
  const cases: Array<[SessionRole | null, string, string, string, string]> = [
    ['customer', 'Customer dashboard', 'لوحة العميل', 'Customer', 'عميل'],
    ['staff', 'Staff workspace', 'لوحة الموظف', 'Staff', 'موظف'],
    ['admin', 'Admin workspace', 'لوحة الإدارة', 'Admin', 'مسؤول'],
    ['partner', 'Partner workspace', 'بوابة الشريك', 'Partner', 'شريك'],
    [null, 'My account', 'حسابي', 'Unassigned', 'غير معيّن'],
  ];
  for (const language of ['ar', 'en'] as const) {
    const { default: Account } = load<{ default: ComponentType<Record<string, unknown>> }>('components/account/MyAccountContent.tsx', {
      'next/link': { default: 'a' },
      '@/components/account/MarketplaceRequestsPanel': { default: () => null },
      '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language, direction: language === 'ar' ? 'rtl' : 'ltr' }) },
      '@/lib/i18n/customer-hub': copy,
      '@/lib/booking/workflow-status': bookingStatus,
      '@/components/v6/v6.module.css': { default: {} },
    });
    for (const [role, english, arabic, englishBadge, arabicBadge] of cases) {
      const html = renderToStaticMarkup(createElement(Account, {
        displayName: 'Account fixture', displayEmail: 'test@example.invalid', role, roleRaw: role,
        accountStatus: 'active', joinedAt: null, requests: [],
      }));
      const heading = html.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1];
      assert.equal(heading, language === 'ar' ? arabic : english);
      assert.ok(html.includes(`>${language === 'ar' ? arabicBadge : englishBadge}</span>`));
      assert.ok(html.includes('href="/my-profile"'));
    }
  }
});

test('the staff entry keeps EG scope and denies global pages, missing permissions and inactive grants', async () => {
  const grant = {
    id: 'test-grant', invited_user_id: actorId, status: 'active',
    access_level: 'scoped_staff', country_scope: ['EG'], permissions: ['customers:read'],
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: actorId } }, error: null }) },
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        maybeSingle: async () => ({
          data: table === 'profiles'
            ? { id: actorId, role: 'staff', status: 'active', deleted_at: null }
            : grant,
          error: null,
        }),
      };
      return chain;
    },
  };
  const team = load<typeof import('../lib/auth/team-access')>('lib/auth/team-access.ts', {
    'server-only': {}, '@/lib/auth/identity': identity,
  });
  const admin = load<typeof import('../lib/auth/admin')>('lib/auth/admin.ts', {
    'server-only': {},
    'next/navigation': { redirect() { throw new Error('LOGIN_REQUIRED'); }, notFound() { throw new Error('ACCESS_DENIED'); } },
    '@/lib/supabase/server': { createSupabaseServerClient: async () => supabase, supabaseAdmin: null },
    '@/lib/auth/identity': identity,
    '@/lib/auth/team-access': team,
  });
  const context = await admin.requireScopedAdminPageAccess('/admin/customers', 'customers:read');
  assert.equal(context.role, 'staff');
  assert.equal(context.scope.mode, 'country');
  assert.equal(admin.isCountryAllowed(context.scope, 'EG'), true);
  assert.equal(admin.isCountryAllowed(context.scope, 'QA'), false);
  await assert.rejects(admin.requireAdminPageAccess('/admin/dashboard'), /ACCESS_DENIED/);
  await assert.rejects(admin.requireScopedAdminPageAccess('/admin/finance', 'finance:read'), /ACCESS_DENIED/);
  grant.status = 'inactive';
  await assert.rejects(admin.requireAdminShellAccess('/admin'), /ACCESS_DENIED/);
});
