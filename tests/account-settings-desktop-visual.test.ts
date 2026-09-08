import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import postcss from 'postcss';

const require = createRequire(import.meta.url);
const read = (file: string) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const css = read('components/v6/v6.module.css');
const start = '/* Account Settings desktop-only presentation;';
const end = '/* End Account Settings desktop-only presentation. */';
const block = css.slice(css.indexOf(start), css.indexOf(end) + end.length);
const scope = '.root:has(.sidebar a[href="/my-profile"][aria-current=page])';

test('Account Settings styles are contained to desktop and the profile route', () => {
  assert.ok(css.includes(start));
  postcss.parse(block).walkRules(rule => {
    for (const selector of rule.selectors) assert.ok(selector.startsWith(scope));
    assert.equal(rule.parent?.type, 'atrule');
    assert.equal((rule.parent as postcss.AtRule).params, '(min-width:1051px)');
  });
  assert.doesNotMatch(block, /\.header|row-reverse|scaleX|\.customerLauncher|url\(/);
});

test('Profile read, authentication redirect and owner filter remain the existing contract', () => {
  const page = read('app/my-profile/page.tsx');
  for (const contract of [
    "supabase.auth.getUser()",
    "if (!user)",
    "redirect(buildLoginTarget('/my-profile'))",
    ".from('profiles')",
    ".select('full_name, email, phone, role, status, updated_at')",
    ".eq('id', user.id)",
    ".maybeSingle()",
    "id: user.id",
    "role: normalizeSessionRole(customer?.role)",
    "<MyProfileContent customer={customer}"
  ]) assert.ok(page.includes(contract), contract);
  assert.equal((page.match(/\.getUser\(/g) || []).length, 1);
  assert.equal((page.match(/\.from\(/g) || []).length, 1);
  assert.doesNotMatch(page, /\.(insert|upsert|update|delete|rpc|signOut|updateUser)\(/);
  assert.doesNotMatch(page, /role:.*user_metadata/);
});

test('Existing six read-only profile fields and null fallback are preserved, without new settings', () => {
  const content = read('components/account/MyProfileContent.tsx');
  for (const field of ['full_name', 'email', 'phone', 'role', 'status', 'updated_at']) assert.ok(content.includes('customer.' + field));
  for (const contract of ['normalizeSessionRole(customer.role)', 'getCustomerStatusLabel(customer.status, language)', 'formatCustomerHubDate(customer.updated_at, language)', '{t.empty}', 'href="/my-account"', 'dir={direction}']) assert.ok(content.includes(contract));
  assert.doesNotMatch(content, /<(input|select|form|button)\b|fetch\(|supabase|onSubmit|onClick/);
});

test('approved shell identifies Account settings and groups only real information; fallback identity stays unchanged', () => {
  const code = ts.transpileModule(read('components/account/MyProfileContent.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  for (const language of ['ar', 'en'] as const) for (const desktop of [false, true]) {
    const exports = {} as { default: React.ComponentType<{customer: Record<string, null> | null}> };
    runInNewContext(code, { exports, require: (id: string) => {
      if (id === 'next/link') return { default: 'a' };
      if (id === '@/components/i18n/LanguageProvider') return { useLanguage: () => ({ language, direction: language === 'ar' ? 'rtl' : 'ltr' }) };
      if (id === '@/components/v6/ProfileDesktopFrame') return { useCustomerReviewLayout: () => desktop };
      return require(id);
    }});
    const customer = { full_name: null, email: null, phone: null, role: null, status: null, updated_at: null };
    const html = renderToStaticMarkup(React.createElement(exports.default, { customer }));
    const title = desktop ? (language === 'ar' ? 'إعدادات الحساب' : 'Account settings') : (language === 'ar' ? 'الملف الشخصي' : 'Profile');
    assert.match(html, new RegExp('<h1[^>]*>' + title + '</h1>'));
    assert.equal((html.match(/<h2\b/g) || []).length, desktop ? 1 : 0);
    if (desktop) assert.ok(html.includes(language === 'ar' ? 'معلومات الحساب' : 'Account information'));
    assert.doesNotMatch(html, /<(input|select|form|button)\b/);
    assert.equal((html.match(/href="\/my-account"/g) || []).length, desktop ? 0 : 1);
    const empty = renderToStaticMarkup(React.createElement(exports.default, { customer: null }));
    assert.ok(empty.includes('data-profile-empty'));
    assert.doesNotMatch(empty, /data-account-information|data-profile-fields/);
  }
});

test('Desktop information is one compact section rather than six boxed cards', () => {
  const rules = new Map<string, Map<string, string>>();
  postcss.parse(block).walkRules(rule => {
    const values = new Map<string, string>();
    rule.walkDecls(d => { values.set(d.prop, d.value); });
    rules.set(rule.selector, values);
  });
  assert.equal(rules.get(scope + ' [data-profile-fields]')?.get('grid-template-columns'), 'minmax(0,1fr)');
  const row = rules.get(scope + ' [data-profile-fields] > div');
  assert.equal(row?.get('border'), '0');
  assert.equal(row?.get('border-radius'), '0');
  assert.equal(row?.get('background'), 'transparent');
  assert.equal(row?.get('align-items'), 'baseline');
  assert.equal(row?.get('padding'), '8px 12px');
  assert.equal(rules.get(scope + ' [data-profile-card]')?.get('padding'), '16px 20px');
});

test('Account Settings uses the exact internal white footer master', () => {
  const master = new Map<string, string>();
  postcss.parse(css).walkRules(rule => {
    if (rule.selector.includes('/my-bookings') && rule.selector.includes('[data-footer-')) master.set(rule.selector.replaceAll('/my-bookings', '/my-profile'), rule.nodes.map(n => n.toString()).join(';'));
  });
  let count = 0;
  postcss.parse(block).walkRules(rule => {
    if (rule.selector.includes('[data-footer-')) {
      assert.equal(rule.nodes.map(n => n.toString()).join(';'), master.get(rule.selector));
      count++;
    }
  });
  assert.equal(count, 7);
});

test('Account Settings desktop footer follows content while the intact sidebar spans both rows', () => {
  const declarations = new Map<string, Record<string, string>>();
  postcss.parse(block).walkRules(rule => {
    const values: Record<string, string> = {};
    rule.walkDecls(d => { values[d.prop] = d.value; });
    declarations.set(rule.selector, values);
  });
  assert.deepEqual(declarations.get(scope + ' > div:has(> .portal)'), {
    display: 'grid', 'grid-template-columns': '250px minmax(0,1fr)', 'grid-template-rows': 'min-content auto'
  });
  assert.deepEqual(declarations.get(scope + ' .portal'), { display: 'contents' });
  assert.deepEqual(declarations.get(scope), { 'min-height': '0' });
  assert.deepEqual(declarations.get(scope + ' .sidebar'), { 'grid-column': '1', 'grid-row': '1 / span 2' });
  assert.deepEqual(declarations.get(scope + ' .content'), { 'grid-column': '2', 'grid-row': '1' });
  assert.deepEqual(declarations.get(scope + ' > div:has(> .portal) > footer'), {
    'grid-column': '2', 'grid-row': '2', 'min-width': '0'
  });
  postcss.parse(block).walkDecls(d => {
    assert.ok(!['height', 'max-height'].includes(d.prop), 'no fixed or clipped shell height');
    assert.ok(!(d.prop === 'position' && d.value === 'absolute'));
    assert.ok(!(d.prop === 'overflow' && d.value === 'hidden'));
  });
});

test('Account Settings reuses one shared Customer Service launcher without a new variant', () => {
  const chrome = read('components/v6/Chrome.tsx');
  assert.equal((chrome.match(/<FloatingDibrah\s/g) || []).length, 1);
  assert.ok(chrome.includes("?? (path === '/my-profile' ? { greeting: ar ? 'مرحبًا، أنا الدبرة' : \"Hi, I'm DABRA\", role: ar ? 'خدمة العملاء' : 'Customer Service' } : undefined)"));
  assert.doesNotMatch(read('components/account/MyProfileContent.tsx'), /Dabra|Dibrah/);
});

type Exports = { ProfileDesktopFrame: React.ComponentType<{viewer: unknown; children: React.ReactNode}> };
function loadFrame(desktop?: boolean) {
  const code = ts.transpileModule(read('components/v6/ProfileDesktopFrame.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {} as Exports;
  runInNewContext(code, { exports, require: (id: string) => id === './Chrome'
    ? { Chrome: ({ children }: {children: React.ReactNode}) => React.createElement('section', {'data-customer-chrome': true}, children) }
    : id === 'react' && desktop !== undefined ? { ...React, useSyncExternalStore: () => desktop } : require(id) });
  return exports.ProfileDesktopFrame;
}
test('Profile frame preserves server/tablet fallback and wraps the approved presentation', () => {
  const child = React.createElement('p', null, 'existing profile fields');
  const props = { viewer: {}, children: child };
  const server = renderToStaticMarkup(React.createElement(loadFrame(), props));
  const mobile = renderToStaticMarkup(React.createElement(loadFrame(false), props));
  const desktop = renderToStaticMarkup(React.createElement(loadFrame(true), props));
  assert.equal(server, '<p>existing profile fields</p>');
  assert.equal(mobile, server);
  assert.equal(desktop, '<section data-customer-chrome="true"><p>existing profile fields</p></section>');
  const frame = read('components/v6/ProfileDesktopFrame.tsx');
  assert.ok(frame.includes("media.removeEventListener('change', onChange)"));
  assert.doesNotMatch(frame, /fetch\(|supabase|redirect\(|localStorage/);
});

test('Site shell switches only exact my-profile and preserves other route decisions', () => {
  const source = read('components/layout/SiteShell.tsx');
  assert.ok(source.includes("if (pathname === '/my-profile') return <ProfileSiteShell>"));
  assert.ok(source.includes('return desktop ? <>{children}</> : <PublicSiteChrome pathname="/my-profile">{children}</PublicSiteChrome>'));
  assert.ok(source.includes("if (pathname === '/register') return <>{children}</>"));
  assert.ok(source.includes("if (pathname === '/login') return <Chrome>{children}</Chrome>"));
  for (const route of ['/auth/verify-email', '/login-success', '/my-account', '/my-bookings', '/my-wallet', '/my-documents', '/favorites']) assert.ok(source.includes("'" + route + "'"));
  assert.ok(source.includes("{pathname !== '/dabra' && <FloatingDibrah />}"));
});
