import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as routing from '../lib/auth/redirect';
import * as currencyContract from '../lib/currency/display';
import { ConversationSession } from '../lib/dabra/conversation-session';

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
    '@/components/currency/CurrencySelector': { default: () => null },
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

// The role-focused fixture above isolates the selector. These cases render the
// actual Header, CurrencySelector, currency hooks, parser and conversation
// session together; only the provider and browser/React environment are faked.
type ElementNode = ReactElement<Record<string, unknown>>;
function elementNodes(value: unknown): ElementNode[] {
  if (Array.isArray(value)) return value.flatMap(elementNodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const element = value as ElementNode;
  return [element, ...elementNodes(element.props.children)];
}

function headerCurrencyFixture(language: 'ar' | 'en', mobileOpen: boolean, hasProvider: boolean) {
  const stored = new Map<string, string>();
  const events: string[] = [];
  const location = new URL('https://synthetic.invalid/my-account');
  const localStorage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  };
  const window = {
    location, localStorage,
    history: { replaceState: (_state: unknown, _title: unknown, next: string) => { location.href = new URL(next, location).href; } },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: (event: Event) => { events.push(event.type); return true; },
  };
  const session = hasProvider ? new ConversationSession() : null;
  let stateIndex = 0;
  const react = {
    useState: (initial: unknown) => [stateIndex++ === 0 ? mobileOpen : initial, () => undefined],
    useEffect: () => undefined,
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  };
  const navigation = { usePathname: () => '/my-account' };
  const common = { window, localStorage, URL, URLSearchParams, Event };
  function load<T>(relativePath: string, dependencies: Record<string, unknown>): T {
    const source = readFileSync(new URL('../' + relativePath, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {};
    runInNewContext(compiled, { ...common, exports, require: (id: string) => id in dependencies ? dependencies[id] : require(id) });
    return exports as T;
  }
  const display = load('components/currency/useDisplayCurrency.ts', {
    react, 'next/navigation': navigation, '@/lib/currency/display': currencyContract,
  });
  const explicit = load('components/currency/useExplicitDisplayCurrency.ts', {
    './useDisplayCurrency': display, '@/lib/currency/display': currencyContract,
    '@/components/dabra/DabraConversationProvider': { useOptionalDabraConversationSession: () => session },
  });
  type SelectorProps = { language: 'ar' | 'en'; className?: string };
  const selector = load<{ default: (props: SelectorProps) => ElementNode }>('components/currency/CurrencySelector.tsx', {
    './useExplicitDisplayCurrency': explicit, '@/lib/currency/display': currencyContract,
  });
  const header = load<{ default: () => ElementNode }>('components/layout/Header.tsx', {
    react, 'next/navigation': navigation, 'next/image': { default: () => null }, 'next/link': { default: 'a' },
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language, direction: language === 'ar' ? 'rtl' : 'ltr', toggleLanguage() {} }) },
    '@/components/auth/LogoutButton': { default: () => null }, '@/lib/auth/redirect': routing,
    '@/components/currency/CurrencySelector': selector,
  });
  const selectors = elementNodes(header.default()).filter(element => element.type === selector.default);
  return { selectors, selector: selector.default, session, location, stored, events };
}

for (const language of ['ar', 'en'] as const) for (const mobileOpen of [false, true]) for (const hasProvider of [false, true]) {
  test(`Header mounts real currency selector: ${language}, menu=${mobileOpen}, provider=${hasProvider}`, () => {
    const f = headerCurrencyFixture(language, mobileOpen, hasProvider);
    assert.equal(f.selectors.length, mobileOpen ? 2 : 1);
    for (const [index, element] of f.selectors.entries()) {
      const props = element.props as { language: 'ar' | 'en'; className?: string };
      assert.equal(props.language, language);
      const control = f.selector(props);
      assert.equal(control.type, 'select');
      assert.equal(control.props['aria-label'], language === 'ar' ? 'عملة العرض' : 'Display currency');
      assert.deepEqual(elementNodes(control).filter(node => node.type === 'option').map(node => node.props.value), ['SAR', 'USD', 'EGP', 'EUR', 'AED']);
      const requested = index === 0 ? 'EUR' : 'USD';
      if (f.session) { f.session.selectRequestCurrency(null, [requested]); assert.ok(f.session.getExcludedRequestCurrencies().includes(requested)); }
      const onChange = control.props.onChange as (event: { target: { value: string } }) => void;
      onChange({ target: { value: requested } });
      assert.equal(f.stored.get('dir3com-display-currency'), requested);
      assert.equal(f.location.searchParams.get('displayCurrency'), requested);
      assert.equal(f.events.at(-1), 'dir3com-currency-change');
      assert.equal(f.selector(props).props.value, requested);
      if (f.session) { assert.equal(f.session.selectRequestCurrency(), requested); assert.ok(!f.session.getExcludedRequestCurrencies().includes(requested)); }
      onChange({ target: { value: 'INVALID' } });
      assert.equal(f.stored.get('dir3com-display-currency'), requested);
      if (f.session) assert.equal(f.session.selectRequestCurrency(), requested);
    }
  });
}
