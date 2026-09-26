import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createElement, type ReactElement } from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as entry from '../lib/marketplace/public-entry';
import * as coverage from '../lib/services/coverage';
import * as canonical from '../lib/services/canonical';
import * as context from '../lib/marketplace/search-context';
import * as stay from '../lib/marketplace/stay-demo';
import * as rooms from '../lib/services/search-state';
import * as drive from '../lib/drive/search';
import * as catalog from '../lib/drive/catalog';
import { filterMarketplaceServices, type MarketplaceService } from '../lib/marketplace/data';

type Node = ReactElement<Record<string, unknown>>;
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Node; return [node, ...nodes(node.props.children)];
}
function load<T>(file: string, imports: Record<string, unknown>) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports,URLSearchParams, require:(id:string)=>{assert.ok(id in imports,id); return imports[id];}});
  return exports as T;
}
function harness(language: 'ar'|'en') {
  let index=0; const state:unknown[]=[]; const pushed:string[]=[];
  const react = {useEffect:()=>undefined, useMemo:(f:()=>unknown)=>f(), useState:(initial:unknown)=>{
    const slot=index++; if (!(slot in state)) state[slot]=typeof initial==='function'?initial():initial;
    return [state[slot], (v:unknown)=>{state[slot]=typeof v==='function'?v(state[slot]):v;}];
  }};
  const icons = Object.fromEntries(['FiCalendar','FiChevronDown','FiChevronUp','FiFlag','FiMapPin','FiSearch','FiUsers','FiArrowUpLeft'].map(k=>[k,()=>null]));
  const imports:Record<string,unknown> = {'react/jsx-runtime':jsx,react,'react-icons/fi':icons,
    'next/navigation':{useRouter:()=>({push:(href:string)=>pushed.push(href)})},
    'next/link':{default:(p:Record<string,unknown>)=>{const props={...p};delete props.prefetch;return createElement('a',props);}},'next/image':{default:'img'},
    '@/components/i18n/LanguageProvider':{useLanguage:()=>({language,direction:language==='ar'?'rtl':'ltr'})},
    '@/lib/marketplace/public-entry':entry,'@/lib/services/coverage':coverage,'@/lib/services/search-state':rooms,
    '@/lib/marketplace/stay-demo':stay,'@/lib/services/canonical':canonical,
    '@/lib/marketplace/search-context':context,'@/lib/drive/search':drive,'@/lib/drive/catalog':catalog,
    './drive.module.css':{default:{}}, '@/components/public/MarketplaceNavigation':{default:()=>null},
  };
  const Search=load<{default:(p:Record<string,unknown>)=>Node}>('components/shared/ServiceSearchTable.tsx',imports).default;
  const tree=(service='drive')=>{index=0;return Search({initialService:service});};
  const change=(label:string,value:string,service='drive')=>{
    const control=nodes(tree(service)).find(n=>n.props['aria-label']===label && n.props.onChange);
    assert.ok(control, label); (control.props.onChange as (e:unknown)=>void)({target:{value}});
  };
  const submit=(service='drive')=>{
    const form=nodes(tree(service)).find(n=>n.type==='form');assert.ok(form);
    (form.props.onSubmit as(e:unknown)=>void)({preventDefault(){},currentTarget:{querySelectorAll:()=>[]}});
  };
  return {tree,change,submit,pushed,imports,reset:()=>{index=0;}};
}

for(const language of ['ar','en'] as const) test(`canonical entries and launch truth in ${language}`,()=>{
  for(const s of canonical.canonicalServices) {
    const state=entry.serviceEntryState(s.slug,language), link=entry.publicServiceLink(`/services/${s.slug}`,s.name,language);
    if(['fly','concierge'].includes(s.slug)) { assert.equal(state.comingSoon,true);assert.match(link.label,language==='ar'?/قريبًا/:/Coming soon/);assert.equal(link.href,`/services/${s.slug}`); }
    else {assert.equal(state.comingSoon,false);assert.equal(link.href,`/marketplace?family=dir3-${s.slug}${s.slug==='vip'?'&service=vip':''}`);}
    if(s.slug==='stay') assert.match(link.label,/Sandbox/);
  }
  assert.deepEqual(entry.publicServiceLink('/my-account','Account',language),{href:'/my-account',label:'Account'});
});

test('legacy context is allowlisted and never grants execution, redirect or provider authority',()=>{
  const input=new URLSearchParams('city=cairo&checkIn=2026-10-12&checkOut=2026-10-14&guests=3&rooms=2&language=en&currency=USD&nationality=SA&searched=1&providerProof=liteapi&next=https://evil.invalid&url=https://evil.invalid');
  const p=new URL(entry.serviceEntryHref('stay',input),'https://test.invalid').searchParams;
  assert.equal(p.get('destination'),'Cairo');assert.equal(p.get('adults'),'3');assert.equal(p.get('rooms'),'2');assert.equal(p.get('nationality'),'SA');
  for(const key of ['checkIn','checkOut','language','currency']) assert.equal(p.get(key),input.get(key));
  for(const key of ['searched','providerProof','next','url','service']) assert.equal(p.get(key),null);
  assert.equal(new URLSearchParams(stay.normalizeStayDemoSearch(p.toString())).get('searched'),null);
  assert.equal(new URL(entry.serviceEntryHref('stay',new URLSearchParams('city=cairo&city=riyadh&nationality=xx&language=bad&currency=FAKE&checkIn=2026-02-31')),'https://test.invalid').searchParams.get('destination'),null);
});

test('Drive date-only handoff preserves dates without inventing time or passing six-hour validation',()=>{
  const href=entry.serviceEntryHref('drive',new URLSearchParams('pickupCity=cairo&dropoffCity=giza&pickupDate=2026-10-12&returnDate=2026-10-14&passengers=3&currency=USD'));
  const p=new URL(href,'https://test.invalid').searchParams;
  assert.equal(p.get('pickup'),'Cairo');assert.equal(p.get('dropoff'),'Giza');assert.equal(p.get('pickupDate'),'2026-10-12');assert.equal(p.get('passengers'),'3');
  assert.equal(p.get('pickupAt'),null);assert.equal(p.get('searched'),null);
  assert.equal(drive.validateDriveSearch(drive.readDriveSearch(p)), 'INVALID_LOCAL_TIME');
});

for (const inventory of ['', '&inventory=partners']) test(`Stay receiving catalogue preserves party filtering ${inventory || '(demo disabled)'}`,()=>{
  const source = new URLSearchParams(`service=stay&country=EG&city=cairo&checkIn=2026-12-12&checkOut=2026-12-14&rooms=2&guests=3${inventory}`);
  const params = new URL(entry.serviceEntryHref('stay', source), 'https://unit.invalid').searchParams;
  const filters = context.initialContextFilters(context.readSearchContext(params), 'dir3-stay');
  assert.equal(filters.travelers, '3');
  assert.equal(filters.checkIn, '2026-12-12');
  assert.equal(filters.checkOut, '2026-12-14');
  assert.equal(params.get('rooms'), '2');
  // Isolated filter inputs only: never persisted or exposed as inventory.
  const capacityOnly = [2, 3].map(maxGuests => ({ id: String(maxGuests), maxGuests,
    family: 'dir3-stay', destination: 'cairo' } as MarketplaceService));
  assert.deepEqual(filterMarketplaceServices(capacityOnly, { ...filters, family: 'dir3-stay' }).map(item => item.id), ['3']);
  assert.equal(params.get('service'), null);
  assert.equal(params.get('nationality'), null);
  assert.equal(new URLSearchParams(stay.normalizeStayDemoSearch(params.toString())).get('searched'), null);
});

test('Stay party mapping uses explicit adults consistently and rejects ambiguous/invalid counts',()=>{
  for (const [input, expected] of [['guests=3&adults=4', '4'], ['guests=3&guests=4', null], ['guests=0', null], ['adults=3.5', null]] as const) {
    const p = new URL(entry.serviceEntryHref('stay', new URLSearchParams(input)), 'https://unit.invalid').searchParams;
    assert.equal(p.get('travelers'), expected);
    assert.equal(p.get('searched'), null);
  }
});

for(const service of ['drive','stay'] as const) test(`actual legacy ${service} route redirects only to safe canonical prefill`,async()=>{
  let target='';const Page=load<{default:(p:unknown)=>Promise<void>}>(`app/services/${service}/page.tsx`,{
    'next/navigation':{redirect:(url:string)=>{target=url;throw Error('REDIRECT');}},'@/lib/marketplace/public-entry':entry,'@/lib/marketplace/search-context':context,
  }).default;
  await assert.rejects(Page({searchParams:Promise.resolve({city:'cairo',pickupCity:'cairo',language:'en',searched:'1',next:'https://evil.invalid'})}),/REDIRECT/);
  assert.match(target,new RegExp(`^/marketplace\\?family=dir3-${service}&`)); assert.doesNotMatch(target,/evil|searched/);
});

for(const language of ['ar','en'] as const) test(`Home Drive submit preserves inputs and tab state in ${language}`,()=>{
  const h=harness(language), ar=language==='ar';
  for(const [label,value] of [[ar?'الدولة':'Country','EG'],[ar?'مدينة الانطلاق':'Pickup city','cairo'],[ar?'مدينة الوصول':'Drop-off city','giza'],[ar?'تاريخ الانطلاق':'Pickup date','2026-12-12'],[ar?'تاريخ العودة':'Return date','2026-12-14'],[ar?'عدد الركاب':'Passengers','3']]) h.change(label,value);
  const switchTo=(name:string)=>{const tab=nodes(h.tree()).find(n=>n.props.role==='tab'&&JSON.stringify(n.props.children).includes(name))!;(tab.props.onClick as()=>void)();};
  switchTo('Stay');switchTo('Drive');
  assert.equal(nodes(h.tree()).find(n=>n.props['aria-label']===(ar?'مدينة الانطلاق':'Pickup city'))?.props.value,'cairo');
  h.submit();assert.equal(h.pushed.length,1);
  const p=new URL(h.pushed[0],'https://unit.invalid').searchParams;
  assert.equal(p.get('family'),'dir3-drive');assert.equal(p.get('pickup'),'Cairo');assert.equal(p.get('pickupDate'),'2026-12-12');assert.equal(p.get('language'),language);assert.equal(p.get('passengers'),'3');assert.equal(p.get('searched'),null);
});

for(const language of ['ar','en'] as const) test(`Home Stay submit preserves trip and requires explicit nationality at destination in ${language}`,()=>{
  const h=harness(language), ar=language==='ar';h.tree('stay');
  for(const [label,value] of [[ar?'الدولة':'Country','EG'],[ar?'المدينة':'City','cairo'],[ar?'تاريخ الوصول':'Check-in','2026-12-12'],[ar?'تاريخ المغادرة':'Check-out','2026-12-14'],[ar?'عدد الغرف':'Rooms','2'],[ar?'عدد الضيوف':'Guests','3']]) h.change(label,value,'stay');
  h.submit('stay');const p=new URL(h.pushed[0],'https://unit.invalid').searchParams;
  assert.equal(p.get('family'),'dir3-stay');assert.equal(p.get('destination'),'Cairo');assert.equal(p.get('adults'),'3');assert.equal(p.get('rooms'),'2');assert.equal(p.get('checkIn'),'2026-12-12');assert.equal(p.get('nationality'),null);assert.equal(p.get('searched'),null);
});

for(const service of ['fly','concierge']) test(`${service} actual search and landing expose no form or transaction CTA`,()=>{
  const h=harness('en');const tree=h.tree(service);assert.equal(nodes(tree).filter(n=>n.type==='form').length,0);
  assert.match(renderToStaticMarkup(tree),/Coming soon/);assert.equal(h.pushed.length,0);
  const Content=load<{ServicePageContent:(p:unknown)=>Node}>('components/services/ServicePageContent.tsx',{
    ...h.imports,'@/components/shared/ServiceSearchTable':{default:()=>assert.fail('Coming Soon must not mount a form')},
    '@/components/home/HomeUtilities':{default:()=>null},'@/components/shared/PartnersTicker':{default:()=>null},'@/components/shared/StoriesCarousel':{default:()=>null},'@/lib/content/partners':{partners:[]},'./drive-family.module.css':{default:{}},
  }).ServicePageContent;
  const html=renderToStaticMarkup(Content({service,stories:[],familyMarketplace:true}));assert.match(html,/Coming soon/);assert.doesNotMatch(html,/<form|Start search|Browse .* marketplace|\/booking|\/checkout/);
});

test('actual Drive prefill renders legacy dates and empty required times, canonical validation remains authoritative',()=>{
  const h=harness('en');const Component=load<{default:(p:unknown)=>Node}>('components/drive/DriveMarketplace.tsx',h.imports).default;
  const search=new URL(entry.serviceEntryHref('drive',new URLSearchParams('pickupCity=cairo&dropoffCity=giza&pickupDate=2026-12-12&returnDate=2026-12-14&passengers=3')),'https://unit.invalid').search;
  const tree=Component({initialSearch:search.slice(1)});const inputs=nodes(tree).filter(n=>n.type==='input');
  assert.deepEqual(inputs.filter(n=>n.props.type==='date').map(n=>n.props.value),['2026-12-12','2026-12-14']);
  assert.equal(inputs.filter(n=>n.props.type==='time' && n.props.required && n.props.value==='').length,2);
});
