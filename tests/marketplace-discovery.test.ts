import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createElement } from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { discoveryFamilies, discoveryHref, nationalityOptions, stayFilterSearch } from '../lib/marketplace/discovery';
import * as data from '../lib/marketplace/data';
import * as launch from '../lib/marketplace/launch-catalog';
import { parseStayDemoQuery, stayDemoProviderInput } from '../lib/marketplace/stay-demo';

test('Drive and Stay are first; changing family never carries submitted/provider intent', () => {
  assert.deepEqual(discoveryFamilies.slice(0,2), ['dir3-drive','dir3-stay']);
  const original = 'family=dir3-stay&searched=1&providerProof=liteapi&checkIn=2026-10-12&checkOut=2026-10-14&currency=USD&language=ar&destination=Cairo';
  for (const next of ['dir3-drive','dir3-vip','dir3-fly','dir3-concierge',undefined] as const) {
    const p = new URL(discoveryHref(next,'dir3-stay',original),'https://unit.invalid').searchParams;
    assert.equal(p.get('searched'),null); assert.equal(p.get('providerProof'),null);
    assert.equal(p.get('language'),'ar'); assert.equal(p.get('currency'),'USD');
  }
  assert.equal(discoveryHref('dir3-stay','dir3-stay',original),`/marketplace?${original}`);
  assert.equal(discoveryHref(undefined,undefined,'language=ar&currency=USD'),'/marketplace?language=ar&currency=USD');
});

for (const language of ['ar','en'] as const) test(`shared family navigation labels Coming Soon and is public in ${language}`, () => {
  const exports: {default?: (props: { family: string; search: string }) => React.ReactNode} = {};
  const modules: Record<string,unknown> = {
    'react/jsx-runtime':jsx, 'next/link':{default:(props: Record<string,unknown>)=>{const p={...props};delete p.prefetch;return createElement('a',p);}},
    '@/components/i18n/LanguageProvider':{useLanguage:()=>({language})},
    '@/lib/marketplace/data':data, '@/lib/marketplace/launch-catalog':launch,
    '@/lib/marketplace/discovery':{discoveryFamilies,discoveryHref}, './marketplace-navigation.module.css':{default:{}},
  };
  runInNewContext(ts.transpileModule(readFileSync('components/public/MarketplaceNavigation.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,require:(id:string)=>{assert.ok(id in modules,id);return modules[id];}});
  const html=renderToStaticMarkup(exports.default!({family:'dir3-stay',search:''}));
  assert.equal((html.match(/<small>/g)??[]).length,2);
  assert.match(html,language==='ar'?/قريبًا/:/Coming soon/);
  assert.match(html,/aria-current="page"/); assert.doesNotMatch(html,/login|checkout|booking|providerProof/);
});

test('localized nationality names retain identical explicit server codes; no language-derived nationality', () => {
  const ar=nationalityOptions('ar'), en=nationalityOptions('en');
  assert.deepEqual(ar.map(x=>x.code).sort(),en.map(x=>x.code).sort());
  assert.equal(en.find(x=>x.code==='EG')?.label,'Egypt');
  assert.equal(ar.find(x=>x.code==='EG')?.label,'مصر');
  const search=new URLSearchParams('destination=Cairo&checkIn=2026-10-12&checkOut=2026-10-14&adults=3&rooms=2&nationality=SA&currency=USD');
  const q=parseStayDemoQuery(search,Date.parse('2026-09-26T00:00Z'))!;
  assert.equal(stayDemoProviderInput(q).guestNationality,'SA');
  assert.deepEqual(stayDemoProviderInput(q).occupancies,[{adults:2},{adults:1}]);
});

test('presentation filter URL preserves trip, nationality, currency and detail/back context', () => {
  const input='family=dir3-stay&searched=1&destination=Cairo&checkIn=2026-10-12&checkOut=2026-10-14&adults=3&rooms=2&nationality=EG&currency=USD&language=ar';
  const out=new URLSearchParams(stayFilterSearch(input,{sort:'price-asc',hotelName:'Cairo',maxPrice:'200'}));
  for(const [key,value] of new URLSearchParams(input)) assert.equal(out.get(key),value);
  assert.equal(out.get('sort'),'price-asc'); assert.equal(out.get('maxPrice'),'200');
});
