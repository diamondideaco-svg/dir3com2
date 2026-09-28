import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as catalog from '../lib/drive/catalog';
import * as search from '../lib/drive/search';
import * as context from '../lib/marketplace/search-context';
import type { PricedDriveOffer } from '../components/drive/DriveMarketplace';

type Element = { type: unknown; props: Record<string, unknown>; key?: string };
function all(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...all(element.props.children)];
}
function control(tree: Element, label: string) {
  const parent = all(tree).find(node => node.type === 'label' && Array.isArray(node.props.children) && node.props.children[0] === label);
  assert.ok(parent, `missing label ${label}`);
  return all(parent).find(node => node.type === 'select')!;
}
function options(select: Element) {
  return all(select).filter(node => node.type === 'option').map(node => ({
    value: String(node.props.value ?? node.props.children), text: String(node.props.children),
  }));
}
function change(select: Element, value: string) {
  (select.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}
function cardIds(tree: Element) {
  return all(tree).filter(node => node.type === 'article').map(node => node.key).sort();
}
const offers: PricedDriveOffer[] = catalog.DRIVE_OFFERS.map(offer => ({
  ...offer, vehicle: catalog.vehicleFor(offer), price: catalog.journeyPrice(offer, 'chauffeur'),
  display: { amount: offer.chauffeur, currency: offer.currency, asOf: null, converted: false }, conversionUnavailable: false,
}));

async function mount(language: 'ar' | 'en', response: PricedDriveOffer[], selectedCurrency = 'USD') {
  const states: unknown[] = []; let cursor = 0; let effect: (() => (() => void)) | undefined;
  let dependencies: unknown[] = []; let fetches = 0;
  const jsx = (type: unknown, props: Record<string, unknown>, key?: string) => ({ type, props, key });
  const modules: Record<string, unknown> = {
    react: {
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], (next: unknown) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
      },
      useEffect(fn: () => (() => void), deps: unknown[]) { effect = fn; dependencies = deps; },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/image': 'image', 'next/link': 'link',
    'next/navigation': { useRouter: () => ({ push: () => assert.fail('Filtering must not navigate') }) },
    '@/components/currency/useDisplayCurrency': { useDisplayCurrency: () => ({ currency: selectedCurrency, setCurrency: () => undefined }) },
    '@/components/currency/CurrencyPrice': { default: 'currency-price' },
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language, direction: language === 'ar' ? 'rtl' : 'ltr' }) },
    '@/lib/drive/catalog': catalog, '@/lib/drive/search': search, './drive.module.css': { default: {} },
    '@/lib/marketplace/search-context': context, '@/components/public/MarketplaceNavigation': { default: () => null },
  };
  const exports: { default?: (props: { initialSearch: string }) => Element } = {};
  runInNewContext(ts.transpileModule(readFileSync('components/drive/DriveMarketplace.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, URLSearchParams, AbortController, setTimeout, clearTimeout, queueMicrotask,
    require(name: string) { assert.ok(name in modules, name); return modules[name]; },
    fetch: async () => { fetches++; return { ok: true, json: async () => ({ offers: response }) }; },
  });
  const initialSearch = 'family=dir3-drive&searched=1&pickup=Cairo&pickupAt=2030-10-12T12:00&returnAt=2030-10-13T12:00&mode=chauffeur&passengers=2&luggage=1&currency=USD';
  const render = () => { cursor = 0; return exports.default!({ initialSearch }); };
  render(); const cleanup = effect!();
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
  const tree = render(); cleanup();
  assert.equal(all(tree).some(node => node.props.role === 'status' || node.props.role === 'alert'), false);
  return { tree, render, dependencies: () => Array.from(dependencies), fetches: () => fetches };
}

for (const language of ['ar', 'en'] as const) {
  const makeLabel = language === 'ar' ? 'العلامة' : 'Make';
  const classLabel = language === 'ar' ? 'فئة السيارة' : 'Vehicle class';
  test(`Drive actual make/class controls cover all catalogue results and filter every offer (${language})`, async () => {
    const original = JSON.stringify(offers); const ui = await mount(language, offers);
    let tree = ui.tree; const deps = ui.dependencies();
    const makes = [...new Set(offers.map(offer => offer.vehicle.make))];
    const classes = [...new Set(offers.map(offer => offer.vehicle.vehicleClass))];
    assert.deepEqual(options(control(tree, makeLabel)).map(option => option.value).sort(), ['', ...makes].sort());
    assert.deepEqual(options(control(tree, classLabel)).map(option => option.value).sort(), ['', ...classes].sort());
    assert.equal(cardIds(tree).length, 30);
    for (const make of makes) {
      change(control(tree, makeLabel), make); tree = ui.render();
      assert.deepEqual(cardIds(tree), offers.filter(offer => offer.vehicle.make === make).map(offer => offer.id).sort());
      assert.equal(options(control(tree, makeLabel)).length, makes.length + 1, 'options must not shrink with the selected filter');
    }
    change(control(tree, makeLabel), ''); tree = ui.render();
    for (const value of classes) {
      const select = control(tree, classLabel);
      assert.equal(options(select).find(option => option.value === value)?.text, catalog.vehicleClassLabel(value, language));
      change(select, value); tree = ui.render();
      assert.deepEqual(cardIds(tree), offers.filter(offer => offer.vehicle.vehicleClass === value).map(offer => offer.id).sort());
    }
    change(control(tree, classLabel), 'Other'); tree = ui.render();
    change(control(tree, makeLabel), 'Toyota'); tree = ui.render();
    assert.deepEqual(cardIds(tree), ['managed-eg-toyota-hiace']);
    change(control(tree, makeLabel), ''); tree = ui.render();
    change(control(tree, classLabel), ''); tree = ui.render();
    assert.equal(cardIds(tree).length, 30);
    assert.deepEqual(ui.dependencies(), deps, 'filtering must not trigger the fetch effect again');
    assert.equal(ui.fetches(), 1); assert.equal(JSON.stringify(offers), original, 'filtering must not mutate catalogue records');
  });

  test(`Drive options reflect a partial or empty response, without invented inventory (${language})`, async () => {
    const subset = offers.filter(offer => offer.vehicle.make === 'Hyundai');
    const ui = await mount(language, subset);
    assert.deepEqual(options(control(ui.tree, makeLabel)).map(option => option.value), ['', 'Hyundai']);
    assert.deepEqual(options(control(ui.tree, classLabel)).map(option => option.value).sort(), ['', ...new Set(subset.map(offer => offer.vehicle.vehicleClass))].sort());
    const empty = await mount(language, []);
    assert.deepEqual(options(control(empty.tree, makeLabel)).map(option => option.value), ['']);
    assert.deepEqual(options(control(empty.tree, classLabel)).map(option => option.value), ['']);
    assert.equal(cardIds(empty.tree).length, 0);
  });
}

for (const currency of ['SAR', 'EGP']) {
  test(`Drive detail handoff preserves ${currency} without changing source query or repeating search`, async () => {
    const ui = await mount('en', offers, currency);
    const links = all(ui.tree).filter(node => String(node.props.href).startsWith('/marketplace/drive/') && String(node.props.href).includes('?'));
    assert.ok(links.length > 0);
    for (const link of links) {
      const params = new URL(String(link.props.href), 'https://qa.invalid').searchParams;
      assert.equal(params.get('displayCurrency'), currency);
      assert.equal(params.get('currency'), 'USD');
    }
    assert.equal(ui.fetches(), 1);
  });
}
