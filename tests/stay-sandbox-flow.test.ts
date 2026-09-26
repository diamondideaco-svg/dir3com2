import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createElement, type ReactElement } from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as contract from '../lib/marketplace/stay-demo';
import * as mode from '../lib/marketplace/stay-demo-mode';
import type { StaySearchResult } from '../lib/travel/contracts';
import * as discovery from '../lib/marketplace/discovery';

const now = Date.parse('2026-09-19T00:00Z');
const search = 'family=dir3-stay&providerProof=liteapi&destination=cairo&checkIn=2026-10-12&checkOut=2026-10-14';
const env = { VERCEL_ENV: 'preview', DIR3COM_STAY_SANDBOX_ENABLED: 'true', DIR3COM_STAY_SANDBOX_PROVIDERS: 'liteapi', LITEAPI_ENV: 'sandbox', LITEAPI_TEST_API_KEY: 'sand_unit_only' };
type Get = (r: Request) => Promise<Response>;
type Props = { initialSearch: string; hotelId?: string; nationalities: discovery.NationalityChoices };
type Component = (p: Props) => ReactElement;

function load<T>(file: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: (id: string) => { assert.ok(id in imports, id); return imports[id]; },
    URL, URLSearchParams, Request, Response, Date, ...globals });
  return exports as T;
}

// All doubles stay in this test. The real page, client effect, route dispatch, query validation,
// provider search/cache, normalization and card/detail render run together; only transport is fake.
function api(environment: Record<string, string | undefined> = env, fail = false) {
  let calls = 0;
  const server = load<{ createStayDemoSearch: (transport: () => Promise<StaySearchResult>, clock: () => number) => (query: contract.StayDemoQuery, e: typeof env) => Promise<contract.StayDemoResult> }>(
    'lib/marketplace/stay-demo-server.ts', { 'server-only': {}, './stay-demo': contract, './stay-demo-mode': mode,
      '../travel/liteapi/stays': { searchLiteApiHotels: () => assert.fail('No real network in unit tests') },
      './stay-demo-global': { stayDemoGlobalGate: { acquire: () => assert.fail('Global gate is Production-only'), complete: () => undefined, release: () => undefined } } });
  const run = server.createStayDemoSearch(async () => {
    calls++;
    if (fail) throw Error('private transport error');
    return { provider: 'liteapi', sandbox: true, status: 'ok', hotels: Array.from({ length: 25 }, (_, i) => ({
      id: `unit-${i}`, provider: 'liteapi', name: `Transport hotel ${i}`, rooms: [{ id: 'room', name: 'Room', rates: [{
        id: `offer-${i}`, provider: 'liteapi', roomName: 'Room', totalAmount: '100', currency: 'SAR', refundable: false,
      }] }],
    })) };
  }, () => now);
  const stay = load<{ GET: Get }>('app/api/marketplace/stay-sandbox/route.ts', {
    '@/lib/marketplace/stay-demo-mode': { stayDemoEnabled: () => mode.stayDemoEnabled(environment) },
    '@/lib/marketplace/stay-demo': { parseStayDemoQuery: (p: URLSearchParams) => contract.parseStayDemoQuery(p, now) },
    '@/lib/marketplace/stay-demo-server': { searchStayDemo: (q: contract.StayDemoQuery) => run(q, environment as typeof env) },
    '@/lib/marketplace/stay-demo-global': { stayDemoRequestSubject: () => 'a'.repeat(64) },
  }, { process: { env: environment } });
  const proof = load<{ GET: Get }>('app/api/marketplace/provider-proof/route.ts', {
    'next/server': { NextResponse: Response }, '../stay-sandbox/route': stay,
    '@/lib/marketplace/provider-proof-mode': { authorizeProviderProofRequest: () => false },
    '@/lib/marketplace/provider-proof': { runProviderProofSearch: () => assert.fail('Must not widen legacy provider access') },
    '@/lib/marketplace/stay-demo-mode': { stayDemoEnabled: () => mode.stayDemoEnabled(environment) },
  }, { process: { env: environment } });
  return { get: proof.GET, stay: stay.GET, calls: () => calls };
}

function client(get: Get, language: 'ar' | 'en', clientDiscovery: typeof discovery = discovery) {
  const states: unknown[] = []; let index = 0; let effect: (() => void | (() => void)) | undefined;
  const requests: string[] = []; const history: string[] = []; let dependencies: unknown[] = [];
  const Client = load<{ default: Component }>('components/stay/StaySandbox.tsx', {
    'react/jsx-runtime': jsx,
    react: { useState: (initial: unknown) => {
      const slot = index++; if (!(slot in states)) states[slot] = initial;
      return [states[slot], (v: unknown) => { states[slot] = typeof v === 'function' ? v(states[slot]) : v; }];
    }, useEffect: (fn: () => void | (() => void), deps: unknown[]) => { effect = fn; dependencies = deps; } },
    'next/link': { default: (props: Record<string, unknown>) => { const dom = { ...props }; delete dom.prefetch; return createElement('a', dom); } },
    'next/image': { default: 'img' }, './stay-sandbox.module.css': { default: {} },
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language, direction: language === 'ar' ? 'rtl' : 'ltr' }) },
    '@/lib/marketplace/stay-demo': contract,
    '@/lib/marketplace/discovery': clientDiscovery,
    '@/components/public/MarketplaceNavigation': { default: () => null },
  }, { AbortController, setTimeout, clearTimeout, queueMicrotask,
    window: { history: { replaceState: (_state: unknown, _title: string, url: string) => history.push(url) } },
    FormData: class { constructor(private values: Record<string,string>) {} get(key: string) { return this.values[key]; } },
    fetch: (url: string) => {
    requests.push(url); return get(new Request(`https://preview.invalid${url}`));
  } }).default;
  const tree = (props: Props) => { index = 0; return Client(props); };
  const render = (props: Props) => renderToStaticMarkup(tree(props));
  return { Client, render, tree, requests, history, dependencies: () => dependencies, async mount(props: Props) {
    render(props); const cleanup = effect!();
    for (let i = 0; i < 20 && (states[2] === 'loading' || i === 0); i++) await new Promise(resolve => setImmediate(resolve));
    assert.notEqual(states[2], 'loading', 'effect must settle, not hang');
    const html = render(props); if (typeof cleanup === 'function') cleanup(); return html;
  } };
}

async function page(Client: Component, initial: string, enabled = true) {
  return load<{ default: (p: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement<Props>> }>('app/marketplace/page.tsx', {
    'react/jsx-runtime': jsx, '@/components/stay/StaySandbox': { default: Client },
    '@/components/public/MarketplaceExplorer': { default: 'legacy-catalogue' },
    '@/components/drive/DriveMarketplace': { default: 'drive-marketplace' },
    '@/components/public/marketplace-local.module.css': { default: {} },
    '@/lib/marketplace/data': { isMarketplaceFamilyKey: (s: string) => ['dir3-stay', 'dir3-drive'].includes(s) },
    '@/lib/marketplace/search-context': { serializePageQuery: (q: Record<string, string>) => new URLSearchParams(q).toString() },
    '@/lib/marketplace/stay-demo-mode': { stayDemoEnabled: () => enabled }, '@/lib/marketplace/stay-demo': contract,
    '@/lib/marketplace/discovery': discovery,
  }).default({ searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(initial))) });
}

for (const language of ['ar', 'en'] as const) test(`reported public Preview URL executes provider API and renders 20 cards/detail in ${language}`, async () => {
  const backend = api(); const ui = client(backend.get, language); const element = await page(ui.Client, search);
  assert.equal(element.type, ui.Client, 'legacy proof query must use Stay client, not catalogue');
  assert.equal(new URLSearchParams(element.props.initialSearch).get('searched'), '1');
  const html = await ui.mount(element.props);
  assert.equal(backend.calls(), 1); assert.equal(ui.requests.length, 1);
  assert.match(ui.requests[0], /^\/api\/marketplace\/provider-proof\?/);
  assert.match(ui.requests[0], /surface=stay-sandbox/);
  assert.equal((html.match(/data-stay-hotel=/g) ?? []).length, 20);
  assert.match(html, /LiteAPI · Sandbox/); assert.match(html, /name="providerProof" value="liteapi"/);
  assert.match(html, new RegExp(`dir="${language === 'ar' ? 'rtl' : 'ltr'}"`));
  const detail = ui.render({ ...element.props, hotelId: 'unit-0' });
  assert.match(detail, /Transport hotel 0/); assert.match(detail, /offer-0/); assert.match(detail, /<button disabled=""/);
  assert.doesNotMatch(html + detail, /href="[^" ]*(?:login|checkout|booking)|\/api\/marketplace\/requests/);
});

test('provider failure settles without catalogue or invented fallback cards', async () => {
  const backend = api(env, true); const ui = client(backend.get, 'en'); const element = await page(ui.Client, search);
  const html = await ui.mount(element.props);
  assert.equal(backend.calls(), 1); assert.doesNotMatch(html, /data-stay-hotel=|private transport error/);
  assert.match(html, /Provider unavailable/);
});

test('proof alias rejects Production, unknown environment, wrong scope and disabled/keyless flags before transport', async () => {
  const route = `/api/marketplace/provider-proof?${search}&surface=stay-sandbox&provider=liteapi&environment=sandbox`;
  for (const patch of [{ VERCEL_ENV: 'production' }, { VERCEL_ENV: 'unknown' }, { DIR3COM_STAY_SANDBOX_ENABLED: 'false' },
    { DIR3COM_STAY_SANDBOX_PROVIDERS: 'liteapi,duffel' }, { LITEAPI_TEST_API_KEY: '' }, { LITEAPI_ENV: 'production' }]) {
    const backend = api({ ...env, ...patch }); assert.equal((await backend.get(new Request(`https://preview.invalid${route}`))).status, 403); assert.equal(backend.calls(), 0);
  }
  for (const path of [route.replace('provider=liteapi', 'provider=duffel'), route + '&provider=sabre',
    route.replace('family=dir3-stay', 'family=dir3-drive'), route.replace('environment=sandbox', 'environment=live'), route.replace('surface=stay-sandbox', 'surface=other')]) {
    const backend = api(); assert.equal((await backend.get(new Request(`https://preview.invalid${path}`))).status, 403); assert.equal(backend.calls(), 0);
  }
});

test('normal Stay and partner/Drive routing remain separate; unsubmitted searches never fetch', async () => {
  const backend = api(); const ui = client(backend.stay, 'en');
  const normal = await page(ui.Client, 'family=dir3-stay'); assert.equal(normal.type, ui.Client);
  await ui.mount(normal.props); assert.equal(ui.requests.length, 0); assert.equal(backend.calls(), 0);
  assert.notEqual((await page(ui.Client, search + '&inventory=partners')).type, ui.Client);
  assert.notEqual((await page(ui.Client, search, false)).type, ui.Client);
  assert.equal((await page(ui.Client, 'family=dir3-drive')).type, 'drive-marketplace');
  assert.equal((await page(ui.Client, '')).type, 'drive-marketplace', 'public entry must expose the canonical nine-offer journey');
  assert.notEqual((await page(ui.Client, 'q=hotel')).type, 'drive-marketplace', 'explicit legacy searches are preserved');
  const ordinary = await page(ui.Client, search.replace('&providerProof=liteapi', '&searched=1'));
  await ui.mount(ordinary.props); assert.match(ui.requests[0], /^\/api\/marketplace\/stay-sandbox\?/);
});

test('actual Stay filter submit updates results/detail URL without changing effect dependencies or fetching again', async () => {
  const backend=api(); const ui=client(backend.get,'en'); const element=await page(ui.Client,search);
  await ui.mount(element.props); const before=[...ui.dependencies()];
  function descendants(value: unknown): ReactElement<Record<string,unknown>>[] {
    if(Array.isArray(value)) return value.flatMap(descendants);
    if(!value || typeof value!=='object' || !('props' in value)) return [];
    const node=value as ReactElement<Record<string,unknown>>;
    return [node,...descendants(node.props.children)];
  }
  const form=descendants(ui.tree(element.props)).find(node=>node.type==='form' && node.props.onSubmit)!;
  assert.ok(form);
  (form.props.onSubmit as (event:unknown)=>void)({preventDefault(){},currentTarget:{sort:'price-asc',hotelName:'Transport hotel 19',maxPrice:'200'}});
  const html=ui.render(element.props);
  assert.equal((html.match(/data-stay-hotel=/g)??[]).length,1);
  assert.match(html,/data-stay-hotel="unit-19"/);
  assert.match(html,/hotelName=Transport\+hotel\+19/);
  assert.equal(ui.history.length,1); assert.match(ui.history[0],/checkIn=2026-10-12/);
  assert.deepEqual([...ui.dependencies()],before);
  assert.equal(ui.requests.length,1); assert.equal(backend.calls(),1);
});

for (const query of ['query=hotel', `query=${encodeURIComponent('فندق')}`, 'q=hotel', 'category=hotel', 'service=stay']) {
  test(`explicit search retains Explorer and its original context: ${query}`, async () => {
    const backend = api(); const ui = client(backend.stay, 'en');
    const element = await page(ui.Client, query);
    const explorer = (element as unknown as ReactElement<{ children: ReactElement<Props> }>).props.children;
    assert.equal(explorer.type, 'legacy-catalogue');
    assert.equal(explorer.props.initialSearch, query);
    assert.equal(backend.calls(), 0);
    assert.equal((await page(ui.Client, `family=dir3-drive&${query}`)).type, 'drive-marketplace');
    assert.equal((await page(ui.Client, `family=dir3-stay&${query}`)).type, ui.Client);
  });
}

for (const language of ['ar', 'en'] as const) test(`nationality SSR and initial client options use the same serialized snapshot in ${language}`, async () => {
  const backend = api(); const serverUi = client(backend.stay, language);
  const element = await page(serverUi.Client, 'family=dir3-stay&nationality=EG');
  const props = JSON.parse(JSON.stringify(element.props)) as Props;
  const browserUi = client(backend.stay, language, { ...discovery,
    nationalityOptions: () => assert.fail('Client must not regenerate runtime-dependent names or ordering'),
  });
  const options = (html: string) => html.match(/<select name="nationality"[\s\S]*?<\/select>/)![0];
  assert.equal(options(serverUi.render(element.props)), options(browserUi.render(props)));
  for (const locale of ['ar', 'en'] as const) {
    assert.deepEqual(props.nationalities[locale], discovery.nationalityOptions(locale));
    assert.equal(new Set(props.nationalities[locale].map(c => c.code)).size, 245);
  }
  assert.match(options(browserUi.render(props)), /value="EG" selected=""/);
  assert.match(options(browserUi.render(props)), language === 'ar' ? /مصر/ : /Egypt/);
  assert.equal(backend.calls(), 0);
  assert.doesNotMatch(readFileSync('components/stay/StaySandbox.tsx', 'utf8'), /suppressHydrationWarning/);
});
