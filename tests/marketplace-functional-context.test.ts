import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';
import * as publicFilters from '../lib/marketplace/public-filters';
import * as searchContextContract from '../lib/marketplace/search-context';
import * as handoffContract from '../lib/auth/marketplace-request-handoff';
import * as marketplaceData from '../lib/marketplace/data';
import * as marketplaceTruth from '../lib/marketplace/truth';
import { filterMarketplaceServices, normalizeMarketplaceServices } from '../lib/marketplace/data';
import { buildMarketplaceRequestReturnPath, buildMarketplaceLoginHandoff } from '../lib/auth/marketplace-request-handoff';
import { familyContextFields, readSearchContext, initialContextFilters, contextSummary, withSearchContext, searchContextBrief, requestDetailHref, validSearchDate } from '../lib/marketplace/search-context';

const inputs = {
  drive: { country: 'sa', pickupCity: 'riyadh', dropoffCity: 'jeddah', pickupDate: '2026-10-10', returnDate: '2026-10-12', passengers: '5' },
  stay: { country: 'sa', city: 'riyadh', checkIn: '2026-10-10', checkOut: '2026-10-12', rooms: '2', guests: '5' },
  fly: { originCountry: 'sa', originCity: 'riyadh', destinationCountry: 'eg', destinationCity: 'cairo', departureDate: '2026-10-10', returnDate: '2026-10-12', passengers: '5' },
  concierge: { country: 'sa', city: 'riyadh', serviceDate: '2026-10-10', guests: '5' },
  vip: { country: 'sa', city: 'riyadh', tripDate: '2026-10-10', guests: '5' },
};
for (const [service, fields] of Object.entries(inputs)) {
  test(`${service}: every actual family field survives listing, PDP, login and request brief`, () => {
    assert.deepEqual(Object.keys(fields), [...familyContextFields[service as keyof typeof inputs]]);
    const context = readSearchContext(new URLSearchParams({ service, ...fields }));
    assert.deepEqual(context, { service, ...fields });
    const pdp = withSearchContext('/services/unit-product', context);
    const handoff = buildMarketplaceRequestReturnPath({ slug: 'unit-product', productId: 'unit-id', family: service, intent: 'request_to_confirm', searchContext: context });
    const login = new URL(buildMarketplaceLoginHandoff(handoff), 'https://local.invalid');
    assert.equal(login.searchParams.get('redirect'), handoff);
    for (const path of [pdp, handoff, withSearchContext('/marketplace?family=dir3-stay', context)]) {
      assert.deepEqual(readSearchContext(new URL(path, 'https://local.invalid').searchParams), context);
    }
    assert.deepEqual(JSON.parse(searchContextBrief(context).requirements!), context);
    assert.ok(searchContextBrief(context).requirements!.length < 1000);
    assert.equal(initialContextFilters(context, `dir3-${service}`).travelers, '5');
    for (const lang of ['ar', 'en'] as const) assert.equal(contextSummary(context, lang).length, Object.keys(fields).length);
  });
}
test('only supported family semantics become catalog filters; route/dates/rooms remain preferences', () => {
  const drive = initialContextFilters({ service: 'drive', ...inputs.drive }, 'dir3-drive');
  assert.equal(drive.destination, 'all');
  assert.equal(drive.checkIn, '');
  assert.equal(initialContextFilters({ service: 'stay', ...inputs.stay }, 'dir3-stay').destination, 'riyadh');
  assert.equal(initialContextFilters({ service: 'fly', ...inputs.fly }, 'dir3-fly').checkIn, '2026-10-10');
  assert.equal(initialContextFilters({ service: 'vip', ...inputs.vip }, 'dir3-vip').checkIn, '');
  assert.equal(initialContextFilters({ service: 'drive', ...inputs.drive }, 'dir3-stay').travelers, 'all');
  assert.equal(validSearchDate('2026-02-30'), '');
});
test('query context cannot inject request authority, external redirects or repeated ambiguous input', () => {
  const context = readSearchContext(new URLSearchParams('service=stay&city=riyadh&city=cairo&guests=2&user_id=evil&product=evil&family=vip&redirect=https://evil.invalid'));
  assert.deepEqual(context, { service: 'stay', guests: '2' });
  assert.equal(withSearchContext('https://outside.invalid', context), 'https://outside.invalid');
  assert.equal(withSearchContext('//outside.invalid', context), '//outside.invalid');
  assert.equal(withSearchContext('/booking', context), '/booking');
  const returned = new URL(buildMarketplaceRequestReturnPath({ slug: 'real', productId: 'real-id', family: 'stay', intent: 'request_quote', searchContext: { ...context, product: 'evil', user_id: 'evil' } }), 'https://local.invalid');
  assert.equal(returned.searchParams.get('product'), 'real-id');
  assert.equal(returned.searchParams.get('user_id'), null);
});
// Pure isolated unit records, not server fixtures or published inventory.
test('capacity uses only max_guests, never product count; unknown fails explicit filters', () => {
  const rows = normalizeMarketplaceServices([
    { id: 'one-product-six-guests', max_guests: 6, products: [{ id: 'a' }] },
    { id: 'many-products-one-guest', max_guests: 1, products: Array(20).fill({ id: 'b' }) },
    { id: 'unknown', products: Array(20).fill({ id: 'c' }) },
  ], false);
  assert.equal(filterMarketplaceServices(rows, { travelers: 'all' }).length, 3);
  for (const travelers of ['2', '3+', '5', '6']) assert.deepEqual(filterMarketplaceServices(rows, { travelers }).map(row => row.id), ['one-product-six-guests']);
  for (const travelers of ['7', '0', '-1', 'NaN', '2x']) assert.equal(filterMarketplaceServices(rows, { travelers }).length, 0);
});
test('destination uses recorded city/country, never title or assumed Saudi location', () => {
  const rows = normalizeMarketplaceServices([
    { id: 'cairo', name_en: 'Riyadh promotion', city: 'Cairo', country: 'eg' },
    { id: 'unknown', name_en: 'Riyadh promotion' },
  ], false);
  assert.equal(filterMarketplaceServices(rows, { destination: 'riyadh' }).length, 0);
  assert.equal(filterMarketplaceServices(rows, { destination: 'saudi-arabia' }).length, 0);
  assert.equal(filterMarketplaceServices(rows, { destination: 'Cairo' })[0].id, 'cairo');
  assert.equal(filterMarketplaceServices(rows, { destination: 'egypt' })[0].id, 'cairo');
});
test('SAR budget cannot treat USD as SAR; popularity cannot be invented from row position', () => {
  const rows = normalizeMarketplaceServices([{ id: 'usd', base_price: 1500, currency: 'USD' }, { id: 'sar', base_price: 1500, currency: 'SAR' }], false);
  assert.deepEqual(filterMarketplaceServices(rows, { budget: '0-2000' }).map(row => row.id), ['sar']);
  assert.equal(filterMarketplaceServices(rows, { collection: 'popular' }).length, 0);
});
test('request navigation uses only a real response REQ reference and never a booking route', () => {
  assert.equal(requestDetailHref('REQ-ABC12345'), '/my-requests/REQ-ABC12345');
  for (const value of ['', 'BOOKING-123', '../../admin', 'REQ-/evil']) assert.equal(requestDetailHref(value), null);
  const source = readFileSync('components/public/PublicServiceDetailClient.tsx', 'utf8');
  assert.match(source, /response.ok && payload.request\?\.request_reference/);
  assert.match(source, /requestDetailHref\(requestReference\)/);
  assert.ok(source.includes('View request details') && source.includes('عرض تفاصيل الطلب'));
  assert.match(source, /searchContextBrief\(searchContext\)/);
  assert.doesNotMatch(source, /booking_confirmed/);
});
test('database read selects authoritative capacity and preserves public isolation filters', () => {
  const source = readFileSync('lib/marketplace/adapters.ts', 'utf8');
  assert.match(source, /supplier_verified,max_guests,city,country/);
  assert.match(source, /max_guests: product.max_guests/);
  assert.match(source, /applyPublicProductFilters/);
  assert.match(source, /applyPublicAssetSyntheticFilter/);
});

test('adapter query carries max_guests/city/country through the actual mapping (isolated database double)', async () => {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const database = { from(table: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'eq', 'neq', 'is', 'order']) {
      chain[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return chain; };
    }
    chain.then = (resolve: (result: unknown) => unknown) => resolve({ error: null, data: table === 'products'
      ? [{ id: 'unit-only', max_guests: 6, city: 'Riyadh', country: 'sa', synthetic: false, marketplace_family: 'drive' }] : [] });
    return chain;
  } };
  const exports: Record<string, unknown> = {};
  const source = ts.transpileModule(readFileSync('lib/marketplace/adapters.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports, require(id: string) {
    if (id === '@/lib/supabase/server') return { supabaseAdmin: database };
    if (id === '@/lib/marketplace/public-filters') return publicFilters;
    throw new Error(`Unexpected dependency ${id}`);
  } });
  const result = await (exports.supabaseMarketplaceAdapter as typeof import('../lib/marketplace/adapters').supabaseMarketplaceAdapter).fetchServices();
  assert.equal(result?.services[0].max_guests, 6);
  assert.equal(result?.services[0].city, 'Riyadh');
  assert.equal(normalizeMarketplaceServices(result?.services, false)[0].maxGuests, 6);
  assert.ok(calls.some(call => call.table === 'products' && call.method === 'select' && String(call.args[0]).includes('max_guests,city,country')));
  for (const [method, column, value] of [['eq', 'synthetic', false], ['eq', 'marketplace_environment', 'production'], ['neq', 'fulfilment_state', 'test_sandbox'], ['is', 'deleted_at', null]]) {
    assert.ok(calls.some(call => call.table === 'products' && call.method === method && call.args[0] === column && call.args[1] === value));
  }
});

for (const language of ['ar', 'en'] as const) {
  test(`${language}: actual PDP click preserves context and shows only the successful response REQ link (isolated component)`, async () => {
    type Node = { type: unknown; props: { children?: unknown; href?: string; onClick?: () => Promise<void> } };
    const state: unknown[] = [{ id: 'unit-product', slug: 'unit-product', name_ar: 'unit only', name_en: 'unit only', marketplace_family: 'drive', fulfilment_state: 'verified_requestable', transaction_method: 'request_to_confirm', marketplace_environment: 'production', supply_type: 'verified_local_partner', supplier_verified: true }, null, false, null, 'idle', null, '2026-10-10T10:00', 5, 'unit notes'];
    let index = 0;
    const calls: Array<{ url: string; body?: string }> = [];
    const context = { service: 'drive', ...inputs.drive };
    const dependencies: Record<string, unknown> = {
      'react/jsx-runtime': { jsx: (type: unknown, props: Node['props']) => ({ type, props }), jsxs: (type: unknown, props: Node['props']) => ({ type, props }) },
      react: { useState: () => { const i = index++; return [state[i], (value: unknown) => { state[i] = value; }]; }, useEffect() {} },
      'next/image': 'image', 'next/link': 'link', 'next/navigation': { useRouter: () => ({ replace() {} }) },
      'react-icons/fi': {}, '@/components/design-system': {}, '@/components/ui/button': { buttonVariants: () => '' },
      '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language, direction: language === 'ar' ? 'rtl' : 'ltr' }) },
      '@/lib/marketplace/data': marketplaceData, '@/lib/marketplace/truth': marketplaceTruth,
      '@/lib/services/canonical': { getCanonicalService: () => null },
      '@/lib/auth/marketplace-request-handoff': handoffContract,
      '@/lib/marketplace/customer-identifiers': {}, '@/lib/marketplace/search-context': searchContextContract,
    };
    const exports: Record<string, unknown> = {};
    const source = ts.transpileModule(readFileSync('components/public/PublicServiceDetailClient.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    runInNewContext(source, { exports, require(id: string) { assert.ok(id in dependencies, id); return dependencies[id]; }, fetch: async (url: string, options?: { body?: string }) => {
      calls.push({ url, body: options?.body });
      return { ok: true, json: async () => url.includes('session-identity') ? { authenticated: true } : { request: { request_reference: 'REQ-UNIT1234' } } };
    } });
    const component = exports.default as (props: { slug: string; searchContext: Record<string, string> }) => Node;
    function flatten(value: unknown): Node[] {
      if (Array.isArray(value)) return value.flatMap(flatten);
      if (!value || typeof value !== 'object' || !('props' in value)) return [];
      const node = value as Node;
      return [node, ...flatten(node.props.children)];
    }
    let tree = component({ slug: 'unit-product', searchContext: context });
    assert.equal(flatten(tree).filter(node => node.props.href?.startsWith('/my-requests/')).length, 0);
    const submit = flatten(tree).find(node => node.type === 'button' && node.props.onClick);
    assert.ok(submit?.props.onClick);
    await submit.props.onClick();
    assert.deepEqual(calls.map(call => call.url), ['/api/auth/session-identity', '/api/marketplace/requests']);
    const body = JSON.parse(calls[1].body!);
    assert.equal(body.product_id, 'unit-product');
    assert.equal(body.traveller_count, 5);
    assert.deepEqual(JSON.parse(body.customer_brief.requirements), context);
    assert.equal(body.user_id, undefined);
    index = 0;
    tree = component({ slug: 'unit-product', searchContext: context });
    const links = flatten(tree).filter(node => node.props.href?.startsWith('/my-requests/'));
    assert.equal(links.length, 1);
    assert.equal(links[0].props.href, '/my-requests/REQ-UNIT1234');
    assert.equal(links[0].props.children, language === 'ar' ? 'عرض تفاصيل الطلب' : 'View request details');
  });
}
