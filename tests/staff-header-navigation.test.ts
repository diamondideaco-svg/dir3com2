import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as routing from '../lib/auth/redirect';

const require = createRequire(import.meta.url);

async function renderHeader(role: string | null, language: 'ar' | 'en', mobileOpen: boolean) {
  const values: unknown[] = [];
  const effects: Array<() => void | (() => void)> = [];
  const identityRequests: Array<{ url: string; cache: string }> = [];
  let index = 0;
  const source = readFileSync(new URL('../components/layout/Header.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: { default?: () => ReactElement } = {};
  const dependencies: Record<string, unknown> = {
    react: {
      useState(initial: unknown) {
        const position = index++;
        if (!(position in values)) values[position] = position === 0 ? mobileOpen : initial;
        return [values[position], (value: unknown) => { values[position] = value; }];
      },
      useEffect(effect: () => void | (() => void)) { effects.push(effect); },
    },
    'next/navigation': { usePathname: () => '/my-account' },
    'next/image': { default: () => null },
    'next/link': { default: 'a' },
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language, direction: language === 'ar' ? 'rtl' : 'ltr', toggleLanguage() {} }) },
    '@/components/auth/LogoutButton': { default: () => null },
    '@/lib/auth/redirect': routing,
  };
  runInNewContext(compiled, {
    exports,
    queueMicrotask,
    window: { localStorage: { getItem: () => null } },
    document: { documentElement: { dataset: {} }, body: { dataset: {} } },
    require: (id: string) => id in dependencies ? dependencies[id] : require(id),
    fetch: async (url: string, options: { cache: string }) => {
      identityRequests.push({ url, cache: options.cache });
      return { json: async () => ({ authenticated: true, role, roleRaw: role }) };
    },
  });
  assert.ok(exports.default);
  renderToStaticMarkup(createElement(exports.default));
  // Execute every mount effect with isolated browser stubs, regardless of order.
  const cleanups = effects.map((effect) => effect());
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(identityRequests, [{ url: '/api/auth/session-identity', cache: 'no-store' }]);
    index = 0;
    return renderToStaticMarkup(createElement(exports.default));
  } finally {
    for (const cleanup of cleanups.reverse()) if (typeof cleanup === 'function') cleanup();
  }
}

test('staff sees the operational entry in Arabic/English desktop and mobile navigation', async () => {
  for (const language of ['ar', 'en'] as const) {
    for (const mobileOpen of [false, true]) {
      const html = await renderHeader('staff', language, mobileOpen);
      assert.match(html, /href="\/admin"/);
      assert.ok(html.includes(language === 'ar' ? 'لوحة العمل' : 'Staff workspace'));
      assert.doesNotMatch(html, /href="\/admin\/(dashboard|team-access|finance)"/);
      assert.equal((html.match(/href="\/admin"/g) ?? []).length, mobileOpen ? 2 : 1);
    }
  }
});

test('customer sees My account / حسابي entry without acquiring administrative navigation', async () => {
  for (const language of ['ar', 'en'] as const) {
    for (const mobileOpen of [false, true]) {
      const html = await renderHeader('customer', language, mobileOpen);
      assert.match(html, /href="\/my-account"/);
      assert.ok(html.includes(language === 'ar' ? 'حسابي' : 'My account'));
      assert.doesNotMatch(html, /href="\/admin/);
      assert.doesNotMatch(html, /Staff workspace|لوحة العمل/);
      assert.equal((html.match(/href="\/my-account"/g) ?? []).length, mobileOpen ? 2 : 1);
    }
  }
});

test('unavailable roles do not acquire customer or administrative navigation', async () => {
  const html = await renderHeader(null, 'en', true);
  assert.doesNotMatch(html, /href="\/admin/);
  assert.doesNotMatch(html, /Staff workspace/);
  assert.doesNotMatch(html, /href="\/my-account"/);
});

test('admin and partner entries retain their existing labels and destinations', async () => {
  assert.match(await renderHeader('admin', 'en', false), /href="\/admin"[^>]*>.*?Dashboard/);
  assert.match(await renderHeader('partner', 'en', false), /href="\/partner-portal"[^>]*>.*?Partner Dashboard/);
});
