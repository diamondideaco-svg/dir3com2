import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ReactElement } from 'react';
import type { SavedTrip } from '../lib/dabra/continuity-contract';
import type { ContinuitySnapshot } from '../lib/dabra/continuity-service';
import { ContinuityContext } from '../lib/dabra/continuity-context';
import { runInternalAgent } from '../lib/dabra/agent';
import { createDabraAssistantTextResponse } from '../lib/dabra/chat-response-contract';
import { platformEntry } from '../lib/dabra/platform-assistant';

// Actual composer event handlers with controlled React hooks and transport.
// This is semantic component/agent evidence, not authenticated DB/browser QA.
function fixture(locale:'ar'|'en') {
  const preferences = { replyLanguage:locale,displayCurrency:'USD',travelClass:'business',lodgingStyle:'hotel',itineraryPace:'relaxed' };
  const trip: SavedTrip = {id:'11111111-1111-4111-8111-111111111111',origin:'Cairo',destination:'Riyadh',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:5000,currency:'EUR',families:['stay']};
  let state: unknown = {revision:1,generation:0,consentEnabled:true,consentVersion:'task187-v1',preferences,preferencesExpiresAt:'2027-01-01T00:00:00Z',trip,tripExpiresAt:'2027-01-01T00:00:00Z',updatedAt:null};
  const slots:unknown[]=[]; const refs:{current:unknown}[]=[]; let index=0,refIndex=0;
  const continuityPanel=()=>null;
  const resultsPanel=()=>null;
  const require=createRequire(import.meta.url);
  const requests:FormData[]=[];
  const deps:Record<string,unknown>={
    react:{useState:(initial:unknown)=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],(value:unknown)=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef:(initial:unknown)=>refs[refIndex]??(refs[refIndex++]={current:initial}),useMemo:(fn:()=>unknown)=>fn(),useEffect:()=>{}},
    '@/components/dabra/DabraContinuity':{default:continuityPanel},
    '@/components/dabra/PlatformResults':{default:resultsPanel},
    '@/components/dabra/PlatformAnswer':{default:()=>null},
    '@/components/dabra/DabraFamilySafetyPanel':{default:()=>null},
    '@/components/v6/CollaborativeTripCapabilities':{default:()=>null},
    '@/components/currency/useDisplayCurrency':{useDisplayCurrency:()=>({currency:'USD',setCurrency:()=>{}})},
    '@/components/i18n/LanguageProvider':{useLanguage:()=>({language:locale,direction:locale==='ar'?'rtl':'ltr'})},
    '@/lib/supabase/client':{supabase:{}},
  };
  // Preserve ref order on every render, including previously initialized refs.
  (deps.react as {useRef:(value:unknown)=>unknown}).useRef=(initial:unknown)=>{const i=refIndex++;return refs[i]??(refs[i]={current:initial});};
  const compiled=ts.transpileModule(readFileSync(new URL('../components/dabra/DabraChatCommerce.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={} as {default:()=>ReactElement};
  runInNewContext(compiled,{exports,require:(id:string)=>id in deps?deps[id]:require(id),JSON,Date,FormData,AbortController,AbortSignal,crypto:globalThis.crypto,window:{localStorage:{removeItem:()=>{}},sessionStorage:{removeItem:()=>{}}},fetch:async(url:string,options?:{body:FormData})=>{
    if(url==='/api/dabra/continuity')return new Response(JSON.stringify({enabled:true,ownerId:'user:A',state}),{headers:{'content-type':'application/json'}});
    assert.equal(url,'/api/ai2/chat'); const form=options!.body;requests.push(form);
    const response=await runInternalAgent({message:String(form.get('message')),history:JSON.parse(String(form.get('history'))),locale:form.get('locale') as 'ar'|'en',context:{role:'guest',readRequests:async()=>({kind:'authentication_required'})},trip:form.has('continuityTrip')?JSON.parse(String(form.get('continuityTrip'))).trip:null});
    return createDabraAssistantTextResponse(response);
  }},{filename:'DabraChatCommerce.tsx'});
  type Element={type:unknown;props:Record<string,unknown>};
  function elements(node:unknown):Element[]{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=='object'||!('props' in node))return [];const el=node as Element;return [el,...elements(el.props.children)];}
  const render=()=>{index=0;refIndex=0;return exports.default();};
  render();slots[32]={ownerId:'user:A',storage:'local'};slots[33]=true;slots[34]=true;
  const panel=()=>elements(render()).find(el=>el.type===continuityPanel)!.props;
  const settle=async()=>{for(let i=0;i<6;i++)await new Promise<void>(resolve=>setImmediate(resolve));};
  const send=async(message:string)=>{slots[1]=message;const button=elements(render()).find(el=>el.props.className==='dabra-send')!;(button.props.onClick as ()=>void)();await settle();};
  const search=async(message:string)=>{slots[9]=message;const form=elements(render()).find(el=>el.props.className==='dabra-marketplace-search')!;(form.props.onSubmit as (event:unknown)=>void)({preventDefault:()=>{}});await settle();};
  return {trip,preferences,requests,panel,send,search,settle,slots,context:()=>refs[0].current as ContinuityContext,setState:(value:unknown)=>{state=value;},state:()=>state as ContinuitySnapshot,results:()=>elements(render()).find(el=>el.type===resultsPanel)?.props};
}

for(const locale of ['ar','en'] as const)test(`${locale} actual resume/send/room/search handlers route the typed destination and forget it`,async()=>{
  const f=fixture(locale);await (f.panel().onResume as (trip:SavedTrip,prefs:unknown)=>Promise<void>)(f.trip,f.preferences);
  assert.equal(f.requests.length,0,'resume must only stage');
  assert.equal(f.context().trip?.destination,'Riyadh');
  // Deliberately hostile summary ordering cannot supply routing authority.
  f.context().draft='stay Cairo Riyadh from Cairo';
  await f.send(locale==='en'?'Show me hotels':'اعرض الفنادق');
  assert.equal(f.requests.length,1);
  const payload=JSON.parse(String(f.requests[0].get('continuityTrip')));
  assert.equal(payload.trip.origin,'Cairo');assert.equal(payload.trip.destination,'Riyadh');
  assert.equal(String(f.requests[0].get('history')).includes('Cairo'),false);
  assert.match((f.slots[0] as {text:string}[]).at(-1)!.text,/destination=riyadh/);
  await f.send(locale==='en'?'2 rooms':'٢ غرف');
  const carriedHistory=JSON.parse(String(f.requests[1].get('history'))) as {content:string}[];
  assert.ok(carriedHistory.some(turn=>turn.content===(locale==='en'?'Show me hotels':'اعرض الفنادق')));
  assert.equal(carriedHistory.some(turn=>/Cairo|Riyadh|destination=/.test(turn.content)),false);
  assert.match((f.slots[0] as {text:string}[]).at(-1)!.text,/destination=riyadh/);
  assert.match((f.slots[0] as {text:string}[]).at(-1)!.text,/rooms=2/);
  await f.send(locale==='en'?'Instead in Jeddah':'بدلا من ذلك في جدة');
  assert.equal(f.context().trip?.origin,'Cairo');
  assert.match((f.slots[0] as {text:string}[]).at(-1)!.text,/destination=jeddah/);
  const result=f.results()!;
  const url=new URL(platformEntry('stay',String(result.query),locale,'USD',result.trip as SavedTrip),'https://dir3com.com');
  assert.equal(url.searchParams.get('destination'),'jeddah');assert.equal(url.searchParams.get('rooms'),'2');
  await f.search(locale==='en'?'hotels in Dubai':'فنادق في دبي');
  assert.equal(f.context().trip?.destination,'dubai');
  assert.equal(f.context().trip?.origin,'Cairo');
  assert.equal(f.requests.length,3,'public result routing does not send a chat');
  (f.panel().onForget as ()=>void)();assert.equal(f.context().trip,null);assert.equal(f.results(),undefined);
  assert.equal(f.context().cachedMessages(f.slots[0] as never[]).some(m=>m.text.includes('destination=')),false);
  await f.send(locale==='en'?'hotels':'فنادق');assert.equal(f.requests.at(-1)!.has('continuityTrip'),false);
});

test('actual staged-summary-only confirmation supplies structured routing, not presentation text',async()=>{
  const f=fixture('en');await (f.panel().onResume as (trip:SavedTrip,prefs:unknown)=>Promise<void>)(f.trip,f.preferences);
  f.context().draft='Cairo Riyadh Cairo';await f.send('');
  assert.equal(f.requests[0].get('message'),'stay');
  assert.match((f.slots[0] as {text:string}[]).at(-1)!.text,/destination=riyadh/);
});

test('actual send rejects changed/expired continuity before transport; new trip removes its payload',async()=>{
  for(const changed of ['delete','revoke','expiry','account'] as const){
    const f=fixture('en');await (f.panel().onResume as (trip:SavedTrip,prefs:unknown)=>Promise<void>)(f.trip,f.preferences);
    const state=f.state();f.setState(changed==='expiry'?{...state,tripExpiresAt:'2020-01-01T00:00:00Z'}:changed==='account'?null:{...state,revision:2,generation:changed==='revoke'?1:0,consentEnabled:changed!=='revoke',trip:null,tripExpiresAt:null});
    await f.send('hotels');assert.equal(f.requests.length,0);assert.equal(f.context().trip,null);
  }
  const f=fixture('ar');await (f.panel().onResume as (trip:SavedTrip,prefs:unknown)=>Promise<void>)(f.trip,f.preferences);
  await f.send('رحلة جديدة');assert.equal(f.context().trip,null);assert.equal(f.requests[0].has('continuityTrip'),false);
});
