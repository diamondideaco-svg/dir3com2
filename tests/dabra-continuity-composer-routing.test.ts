import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ReactElement } from 'react';
import type { SavedTrip } from '../lib/dabra/continuity-contract';
import type { ContinuitySnapshot } from '../lib/dabra/continuity-service';
import type { ContinuityContext } from '../lib/dabra/continuity-context';
import { ConversationSession } from '../lib/dabra/conversation-session';
import { runInternalAgent } from '../lib/dabra/agent';
import { createDabraAssistantTextResponse } from '../lib/dabra/chat-response-contract';
import { platformEntry } from './fixtures/task248-platform-request';
import { NextRequest } from 'next/server';
import { parseContinuitySnapshot } from '../lib/dabra/continuity-service';
import { continuityChatTripFresh, type ContinuityChatTrip } from '../lib/dabra/continuity-chat';

// Actual composer event handlers with controlled React hooks and transport.
// This is semantic component/agent evidence, not authenticated DB/browser QA.
function fixture(locale:'ar'|'en', options:{actualPost?:boolean;guest?:boolean; fault?:'before'|'during'|'expired'|'after';savedLocale?:'ar'|'en';savedCurrency?:'USD'|'EUR'|'SAR';liveMarketLifecycle?:boolean}={}) {
  const conversation = new ConversationSession();
  conversation.resolve(conversation.invalidate('customer-public'), {ownerId:'user:A',storage:'local'});
  const preferences = { replyLanguage:options.savedLocale??locale,displayCurrency:options.savedCurrency??'USD',travelClass:'business',lodgingStyle:'hotel',itineraryPace:'relaxed' };
  const trip: SavedTrip = {id:'11111111-1111-4111-8111-111111111111',origin:'Cairo',destination:'Riyadh',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:5000,currency:'EUR',families:['stay']};
  let state: unknown = {revision:1,generation:0,consentEnabled:true,consentVersion:'task187-v1',preferences,preferencesExpiresAt:'2027-01-01T00:00:00Z',trip,tripExpiresAt:'2027-01-01T00:00:00Z',updatedAt:null};
  let marketEffect:(()=>unknown)|undefined;
  const slots:unknown[]=[]; const refs:{current:unknown}[]=[]; let index=0,refIndex=0;
  const continuityPanel=()=>null;
  const resultsPanel=()=>null;
  const require=createRequire(import.meta.url);
  const requests:FormData[]=[];const statuses:number[]=[];const optionsFault=options.fault;let deferContinuity=false;let releaseContinuity:(()=>void)|undefined;
  const withdraw=()=>{const current=state as ContinuitySnapshot;state=options.fault==='expired'
    ? {...current,tripExpiresAt:'2020-01-01T00:00:00Z',preferencesExpiresAt:'2020-01-01T00:00:00Z'}
    : {...current,consentEnabled:false,generation:current.generation+1,trip:null,tripExpiresAt:null};};
  const routeDeps:Record<string,unknown>={
    '@/lib/dabra/successful-task-production-policy':{selectSuccessfulTaskPilot:async()=>({kind:'disabled'}),successfulTaskProductionGate:async()=>null},
    '@/lib/dabra/successful-task-chat':{successfulTaskChatResponse:async()=>null},
    '@/lib/dabra/continuity-chat-server':{resolveContinuityChatTrip:async(_request:NextRequest,input:ContinuityChatTrip)=>{
      const snapshot=parseContinuitySnapshot(state);return snapshot&&continuityChatTripFresh(input,snapshot)?snapshot.trip:null;
    }},
    '@/lib/dabra/agent-context':{resolveAgentContext:async()=>options.guest?{role:'guest',readRequests:async()=>({kind:'authentication_required'})}:({role:'customer',taskAuthority:{kind:'customer',actorId:'user:A',ownerId:'user:A'},isTaskAuthorityCurrent:async()=>true,readRequests:async()=>({kind:'authentication_required'})})},
    '@/lib/dabra/agent-dialogue':{getAgentDialoguePolicy:async()=>({publicMonthly:false})},
    '@/lib/currency/service':{getCurrencySnapshot:async()=>null},
    '@/lib/dabra/agent-handoff':{runInternalAgentTask:async(input:Parameters<typeof runInternalAgent>[0],handoffOptions?:{platformRequest?:Parameters<typeof runInternalAgent>[1];displayPolicy?:Parameters<typeof runInternalAgent>[2]})=>{
      const response=await runInternalAgent(input,handoffOptions?.platformRequest,handoffOptions?.displayPolicy);if(options.fault==='during'||options.fault==='expired')withdraw();return {kind:'response',response};
    }},
  };
  const routeExports={} as {POST:(request:NextRequest)=>Promise<Response>};
  if(options.actualPost){
    const route=ts.transpileModule(readFileSync(new URL('../app/api/ai2/chat/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(route,{exports:routeExports,require:(id:string)=>id in routeDeps?routeDeps[id]:require(id),process:{env:{DABRA_INTERNAL_AI_ENABLED:'false'}},JSON,Date,URL,FormData,File,Response,Request,Headers,AbortController,AbortSignal,crypto:globalThis.crypto,setTimeout,clearTimeout},{filename:'route.ts'});
  }
  const deps:Record<string,unknown>={
    '@/components/dabra/DabraConversationProvider':{useDabraConversation:()=>({session:conversation,state:conversation.getSnapshot()})},
    react:{useCallback:(fn:unknown)=>fn,useState:(initial:unknown)=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],(value:unknown)=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef:(initial:unknown)=>refs[refIndex]??(refs[refIndex++]={current:initial}),useMemo:(fn:()=>unknown)=>fn(),useEffect:(fn:()=>unknown)=>{if(options.liveMarketLifecycle&&String(fn).includes('let previous = conversation.getSnapshot()'))marketEffect=fn;}},
    '@/components/dabra/DabraContinuity':{default:continuityPanel},
    '@/components/dabra/PlatformResults':{default:resultsPanel},
    '@/components/dabra/PlatformAnswer':{default:()=>null},
    '@/components/dabra/DabraFamilySafetyPanel':{default:()=>null},
    '@/components/v6/CollaborativeTripCapabilities':{default:()=>null},
    '@/components/currency/useDisplayCurrency':{useDisplayCurrency:()=>({currency:'USD',setCurrency:()=>{}}),useCurrencyRates:()=>({snapshot:null,loading:false})},
    '@/components/i18n/LanguageProvider':{useLanguage:()=>({language:locale,direction:locale==='ar'?'rtl':'ltr'})},
    '@/lib/supabase/client':{supabase:{}},
  };
  // Preserve ref order on every render, including previously initialized refs.
  (deps.react as {useRef:(value:unknown)=>unknown}).useRef=(initial:unknown)=>{const i=refIndex++;return refs[i]??(refs[i]={current:initial});};
  const compiled=ts.transpileModule(readFileSync(new URL('../components/dabra/DabraChatCommerce.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={} as {default:()=>ReactElement};
  runInNewContext(compiled,{exports,require:(id:string)=>id in deps?deps[id]:require(id),JSON,Date,FormData,AbortController,AbortSignal,crypto:globalThis.crypto,window:{localStorage:{removeItem:()=>{}},sessionStorage:{removeItem:()=>{}}},fetch:async(url:string,options?:{body:FormData})=>{
    if(url==='/api/dabra/continuity'){if(deferContinuity){deferContinuity=false;await new Promise<void>(resolve=>{releaseContinuity=resolve;});}return new Response(JSON.stringify({enabled:true,ownerId:'user:A',state}),{headers:{'content-type':'application/json'}});}
    assert.equal(url,'/api/ai2/chat'); const form=options!.body;requests.push(form);
    if(routeExports.POST){
      if(optionsFault==='before')withdraw();
      const response=await routeExports.POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',body:form}));
      statuses.push(response.status);if(optionsFault==='after')withdraw();return response;
    }
    const response=await runInternalAgent({message:String(form.get('message')),history:JSON.parse(String(form.get('history'))),locale:form.get('locale') as 'ar'|'en',context:{role:'guest',readRequests:async()=>({kind:'authentication_required'})},trip:form.has('continuityTrip')?JSON.parse(String(form.get('continuityTrip'))).trip:null});
    return createDabraAssistantTextResponse(response);
  }},{filename:'DabraChatCommerce.tsx'});
  type Element={type:unknown;props:Record<string,unknown>};
  function elements(node:unknown):Element[]{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=='object'||!('props' in node))return [];const el=node as Element;return [el,...elements(el.props.children)];}
  const render=()=>{index=0;refIndex=0;const wrapper=exports.default();assert.equal(typeof wrapper.type,'function');return (wrapper.type as ()=>ReactElement)();};
  render();
  if(options.liveMarketLifecycle){assert.ok(marketEffect,'actual market subscription must be installed');marketEffect();}
  const panel=()=>elements(render()).find(el=>el.type===continuityPanel)!.props;
  const settle=async()=>{for(let i=0;i<6;i++)await new Promise<void>(resolve=>setImmediate(resolve));};
  const send=async(message:string)=>{const input=elements(render()).find(el=>el.type==='input'&&el.props['aria-label']===(locale==='ar'?'رسالة للدبرة':'Message DABRA'));assert.ok(input);(input.props.onChange as (event:unknown)=>void)({target:{value:message}});const button=elements(render()).find(el=>el.props.className==='dabra-send')!;(button.props.onClick as ()=>void)();await settle();};
  const search=async(message:string)=>{const input=elements(render()).find(el=>el.props.id==='dabra-marketplace-query');assert.ok(input);(input.props.onChange as (event:unknown)=>void)({target:{value:message}});const form=elements(render()).find(el=>el.props.className==='dabra-marketplace-search')!;(form.props.onSubmit as (event:unknown)=>void)({preventDefault:()=>{}});await settle();};
  return {trip,preferences,requests,statuses,panel,send,search,settle,slots,conversation,deferNextContinuity:()=>{deferContinuity=true;},releaseContinuity:()=>{assert.ok(releaseContinuity);releaseContinuity();},context:()=>conversation.context as ContinuityContext,messages:()=>conversation.getSnapshot().messages,setMessages:conversation.setMessages,setState:(value:unknown)=>{state=value;},state:()=>state as ContinuitySnapshot,results:()=>elements(render()).find(el=>el.type===resultsPanel)?.props};
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
  assert.match(f.messages().at(-1)!.text,/destination=riyadh/);
  await f.send(locale==='en'?'2 rooms':'٢ غرف');
  const carriedHistory=JSON.parse(String(f.requests[1].get('history'))) as {content:string}[];
  assert.ok(carriedHistory.some(turn=>turn.content===(locale==='en'?'Show me hotels':'اعرض الفنادق')));
  assert.equal(carriedHistory.some(turn=>/Cairo|Riyadh|destination=/.test(turn.content)),false);
  assert.match(f.messages().at(-1)!.text,/destination=riyadh/);
  assert.match(f.messages().at(-1)!.text,/rooms=2/);
  await f.send(locale==='en'?'Instead in Jeddah':'بدلا من ذلك في جدة');
  assert.equal(f.context().trip?.origin,'Cairo');
  assert.match(f.messages().at(-1)!.text,/destination=jeddah/);
  const result=f.results()!;
  const url=new URL(platformEntry('stay',result.request as import('../lib/dabra/platform-assistant').PlatformUserRequest,locale,'USD'),'https://dir3com.com');
  assert.equal(url.searchParams.get('destination'),'jeddah');assert.equal(url.searchParams.get('rooms'),'2');
  await f.search(locale==='en'?'hotels in Dubai':'فنادق في دبي');
  assert.equal(f.context().trip,null,'a different destination is a separate request');
  const independent=f.results()!;
  const independentUrl=new URL(platformEntry('stay',independent.request as import('../lib/dabra/platform-assistant').PlatformUserRequest,locale,'USD'),'https://dir3com.com');
  assert.equal(independentUrl.searchParams.get('destination'),'dubai');
  assert.equal(independentUrl.searchParams.get('origin'),null);
  assert.equal(f.requests.length,3,'public result routing does not send a chat');
  (f.panel().onForget as ()=>void)();assert.equal(f.context().trip,null);assert.equal(f.results(),undefined);
  assert.equal(f.context().cachedMessages(f.messages()).some(m=>m.text.includes('destination=')),false);
  await f.send(locale==='en'?'hotels':'فنادق');assert.equal(f.requests.at(-1)!.has('continuityTrip'),false);
});

test('actual staged-summary-only confirmation supplies structured routing, not presentation text',async()=>{
  const f=fixture('en');await (f.panel().onResume as (trip:SavedTrip,prefs:unknown)=>Promise<void>)(f.trip,f.preferences);
  f.context().draft='Cairo Riyadh Cairo';await f.send('');
  assert.equal(f.requests[0].get('message'),'stay');
  assert.match(f.messages().at(-1)!.text,/destination=riyadh/);
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

test('explicit resume starts a new boundary without posting the saved draft as ordinary text',async()=>{
 const f=fixture('en',{actualPost:true});
 f.setMessages([{id:'independent',role:'user',text:'I need a car in Cairo'}]);
 await (f.panel().onResume as (trip:SavedTrip,prefs:unknown)=>Promise<void>)(f.trip,f.preferences);
 f.context().draft='SYNTHETIC_PRIVATE_TRIP Riyadh 5000 EUR';
 await f.send('');
 assert.equal(f.requests.length,1);
 assert.equal(f.requests[0].get('message'),'stay');
 assert.equal(f.requests[0].get('history'),'[]');
 assert.equal(JSON.parse(String(f.requests[0].get('continuityTrip'))).trip.destination,'Riyadh');
 assert.doesNotMatch(String(f.requests[0].get('message')),/SYNTHETIC_PRIVATE_TRIP|5000/);
 assert.equal(f.statuses[0],200);
});

test('saved preference-only values never become unbound POST settings during revoke or expiry',async()=>{
 for(const fault of ['during','expired','after'] as const){
  const f=fixture('ar',{actualPost:true,fault,savedLocale:'en',savedCurrency:'EUR'});
  await (f.panel().onApply as (prefs:unknown)=>Promise<void>)(f.preferences);
  await f.send('أحتاج سيارة');
  assert.equal(f.requests.length,1,fault);
  assert.equal(f.requests[0].get('locale'),'ar',fault);
  assert.equal(f.requests[0].get('currency'),'SAR',fault);
  assert.equal(f.requests[0].has('continuityTrip'),false,fault);
  assert.equal(f.context().lease,null,fault);
  assert.equal(f.state().preferences?.replyLanguage,'en',fault);
  assert.equal(f.state().preferences?.displayCurrency,'EUR',fault);
 }
});

test('actual UI to POST discards derived content when continuity is revoked or expires during transport',async()=>{
 for(const fault of ['before','during','expired','after'] as const){
  const f=fixture('en',{actualPost:true,fault});
  await (f.panel().onResume as (trip:SavedTrip,prefs:unknown)=>Promise<void>)(f.trip,f.preferences);
  await f.send('Show me hotels');
  assert.equal(f.requests.length,1,fault);
  assert.equal(f.statuses[0],fault==='after'?200:409,fault);
  assert.equal(f.context().lease,null,fault);
  assert.equal(f.messages().some(m=>/Riyadh|5000 EUR|destination=riyadh/.test(m.text)),false,fault);
 }
});

test('detaching a trip retains its provenance until old derived content is cleared',async()=>{
 const f=fixture('en',{actualPost:true});
 await (f.panel().onResume as (trip:SavedTrip,prefs:unknown)=>Promise<void>)(f.trip,f.preferences);
 await f.send('I need a car in Cairo');
 assert.equal(f.context().trip,null);
 assert.equal(f.context().lease?.tripSource,true);
 f.setState({...f.state(),tripExpiresAt:'2020-01-01T00:00:00Z'});
 const count=f.requests.length;
 await f.send('another car');
 assert.equal(f.requests.length,count);
 assert.equal(f.context().lease,null);
});


test('full composer sends postfix currency exclusion to actual POST and hides a rejected FX fallback',async()=>{
 for(const [message,locale] of [['Show cars in Cairo, USD is not acceptable','en'],['Show cars in Cairo, do not use USD','en'],['اعرض السيارات في القاهرة والدولار غير مقبول','ar'],['اعرض السيارات في القاهرة لا تستخدم الدولار','ar']] as const){
  const f=fixture(locale,{actualPost:true});await f.send(message);
  assert.equal(f.statuses[0],200);assert.equal(f.requests[0].get('currency'),'SAR');
  assert.deepEqual(JSON.parse(String(f.requests[0].get('excludedCurrencies'))),['USD']);
  const answer=f.messages().at(-1)?.text ?? '';
  assert.doesNotMatch(answer,/\b[\d,.]+\s+USD\b/i);assert.match(answer,/cannot currently be shown|تعذر عرض بعض الأسعار/);
 }
});


test('full composer preflight cannot reapply an old exclusion over a newer choice',async()=>{
 const f=fixture('en');
 await (f.panel().onResume as (trip:SavedTrip,prefs:unknown)=>Promise<void>)(f.trip,f.preferences);
 f.deferNextContinuity();await f.send('Show cars in Cairo, do not use USD');
 assert.equal(f.requests.length,0);assert.deepEqual(f.conversation.getExcludedRequestCurrencies(),['USD']);
 f.conversation.selectRequestCurrency('USD');f.releaseContinuity();await f.settle();
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].get('currency'),'SAR');
 assert.deepEqual(JSON.parse(String(f.requests[0].get('excludedCurrencies'))),['USD']);
 assert.equal(f.conversation.selectRequestCurrency(),'USD');assert.deepEqual(f.conversation.getExcludedRequestCurrencies(),[]);
});

// Preserve the real shared-session subscription: a different destination
// detaches the saved trip locally and must still refresh this send's results.
for(const locale of ['ar','en'] as const)test(`${locale} exact browser journey keeps results after detaching the saved trip`,async()=>{
 const f=fixture(locale,{liveMarketLifecycle:true});
 await (f.panel().onResume as (trip:SavedTrip,prefs:unknown)=>Promise<void>)(f.trip,f.preferences);
 const phrases=locale==='ar'?['فنادق','2 غرف','فنادق في جدة','سيارة في جدة','سيارة في القاهرة']:['hotels','2 rooms','hotels in Jeddah','car in Jeddah','car in Cairo'];
 for(let i=0;i<phrases.length;i++){
  await f.send(phrases[i]);assert.equal(f.requests.length,i+1,'chat transport at step '+(i+1));
  const result=f.results();assert.ok(result,'issued result at step '+(i+1));
  const family=i<3?'stay':'drive';
  const url=new URL(platformEntry(family,result.request as import('../lib/dabra/platform-assistant').PlatformUserRequest,locale,'USD'),'https://dir3com.com');
  assert.equal(url.searchParams.get('destination'),i<2?'riyadh':i<4?'jeddah':'cairo');
  if(i===2){assert.equal(f.context().trip,null);assert.equal(f.requests[i].has('continuityTrip'),false);assert.equal(url.searchParams.get('origin'),null);assert.equal(url.searchParams.get('rooms'),'2');}
 }
});

const cairoGuestPrompts=[
 'أحتاج سيارة مع سائق في القاهرة لمدة ثلاثة أيام لشخصين بالغين ومعنا شنطتان كبيرتان. ميزانيتي 900 ريال سعودي للرحلة كاملة، لا لليوم. اعرض خيارات منشورة إن وجدت، لا تعرض السعر بالدولار، ولا تحجز. إذا ناقصك شيء اسأل سؤالًا واحدًا فقط.',
 'قصدي تخطيط رحلة جديدة: سيارة مع سائق في القاهرة لمدة ٣ أيام لشخصين وشنطتين. الحد الأعلى ٩٠٠ ريال سعودي إجماليًا. جاوبني بالعربي: ما الخيارات وما الذي تحتاجه مني؟',
];
for(const sequential of [true,false])test(`Task248 Cairo guest EN composer to actual POST, sequential=${sequential}`,async()=>{
 const f=fixture('en',{actualPost:true,guest:true});
 for(const [index,message] of cairoGuestPrompts.entries()){
  if(!sequential&&index===0)continue;
  await f.send(message);
  assert.equal(f.statuses.at(-1),200);
  assert.equal(f.requests.at(-1)!.has('continuityTrip'),false);
  assert.equal(f.requests.at(-1)!.get('locale'),index===0?'en':'ar');
  const answer=f.messages().at(-1)!.text;
  assert.doesNotMatch(answer,/REQ|هل نتابع الرحلة الحالية|current trip or|تم الحجز|booking confirmed/i);
  assert.match(answer,index===0?/cairo/i:/القاهرة/);
  assert.match(answer,index===0?/3 days/:/3 أيام/);
  assert.equal((answer.match(/[?؟]/g)??[]).length,1);
  assert.doesNotMatch(answer,/\d+(?:\.\d+)?\s*USD/);
  if(index===0)assert.match(answer,/900 SAR/);
  else {assert.match(answer,/2 أشخاص/);assert.match(answer,/2 قطع أمتعة/);assert.match(answer,/ما تاريخا بدء الاستخدام/);}
 }
});
