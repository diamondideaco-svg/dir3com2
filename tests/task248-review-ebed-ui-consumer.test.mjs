import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveDialogue,driveDialogueCopy,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner:typeof createPlatformScopeOwner==="undefined"?null:createPlatformScopeOwner,preparePlatformAssistantResponse:typeof preparePlatformAssistantResponse==="undefined"?null:preparePlatformAssistantResponse,platformUserRequest:typeof platformUserRequest==="undefined"?null:platformUserRequest,platformUserRequestScope:typeof platformUserRequestScope==="undefined"?null:platformUserRequestScope,hasActivePlatformDriveDialogue,preparePlatformEntryForUserRequest:typeof preparePlatformEntryForUserRequest==="undefined"?null:preparePlatformEntryForUserRequest,preparePlatformMarketDisplay:typeof preparePlatformMarketDisplay==="undefined"?null:preparePlatformMarketDisplay,platformUnanchoredScopeAnswer:typeof platformUnanchoredScopeAnswer==="undefined"?null:platformUnanchoredScopeAnswer,platformUserRequestFacts:typeof platformUserRequestFacts==="undefined"?null:platformUserRequestFacts,createPlatformMarketSession:typeof createPlatformMarketSession==="undefined"?null:createPlatformMarketSession,preparePlatformMarketInput:typeof preparePlatformMarketInput==="undefined"?null:preparePlatformMarketInput,platformCurrencySelection,platformProtectedTripScope:typeof platformProtectedTripScope==="undefined"?null:platformProtectedTripScope,platformConversationScope,platformContext,platformDriveDialogue,preferenceContext,platformEntry,findPlatformDriveOffers,buildPlatformAssistantResponse};';
const offers=[{id:'synthetic-low',currency:'SAR',chauffeur:500,airport:500},{id:'synthetic-high',currency:'SAR',chauffeur:900,airport:900}];
const globals={URL,URLSearchParams,cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,
 driveDialogue,driveDialogueCopy,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage,
 conversationTopicChange:()=>null,conversationIntent:()=>null,conversationReply:()=>null,conversationClarification:()=> 'Please clarify',withoutNegativeActions:x=>x,validSearchDate:()=>true,
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null,
 DRIVE_OFFERS:offers,vehicleFor:()=>({make:'Toyota',model:'Corolla',ar:'تويوتا',passengers:4}),vehicleTitle:()=> 'Synthetic car',
 displayPrice:(amount,currency,target)=>({amount:currency===target?amount:amount/4,currency:target,unavailable:false,converted:currency!==target}),
 driveOwnerAvailabilityCopy:()=>'',driveModelReferenceCopy:()=>null,cairoInstant:()=>null,
 serviceEntryHref:(family,params)=>'/'+family+'?'+params.toString(),serverReplyLink:(label,href)=>label+' ['+href+']',
 serverReplySegments:()=>({segments:[],push(...v){this.segments.push(...v)}}),renderServerReply:segments=>segments.join(' '),
 CORE_REQUIRED_DIALOGUE_UNITS:'requiredUnits',AI2_DABRA_CONVERSATION_COPY:{en:{},ar:{}}};
const api=runInNewContext(code,globals);

const cairo=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive','stay']});
const dubai=Object.freeze({...cairo,id:'22222222-2222-4222-8222-222222222222',destination:'Dubai'});
const pricing={currency:'SAR',snapshot:null};
const turns=values=>values.map(content=>({role:'user',content}));

// This synthetic test harness supplies USER turns as its documented source.
// Its label is not proof of an authenticated production actor or consent.
const syntheticEvent=content=>Object.freeze({role:'user',content});
function issue(content,history,trip,owner) {
 const event=syntheticEvent(content);
 return {event,request:api.platformUserRequest(event,history,trip,owner)};
}


function loadSearchConsumer() {
 const file=readFileSync(new URL('../components/dabra/DabraChatCommerce.tsx',import.meta.url),'utf8');
 const start=file.indexOf('  async function searchMarketplace('),end=file.indexOf('  async function submitMarketplaceRequest(',start);
 assert.ok(start>=0&&end>start);
 const raw=file.slice(start,end),compiled=stripTypeScriptTypes(raw,{mode:'strip'});
 const session=api.createPlatformMarketSession(),marketSession=session,marketTurnsRef={current:[]},marketCurrencyMutationRef={current:false},marketHistoryUncertainRef={current:false};
 const marketplaceRequestRef={current:0},marketplaceAbortRef={current:null};let latest=null,state='idle',loading=false,mode='normal',release=null,delivered=0,fetchCalls=0;
 const wait=new Promise(resolve=>{release=resolve});
 const continuity={trip:cairo,scoped:items=>items,refine(){return this.trip},scope(_m,_h){this.trip=null;return null}};
 const continuityContextRef={current:continuity};let conversationMessages=[];const selections=[];
 const conversation={getSnapshot:()=>({generation:1,messages:conversationMessages}),selectRequestCurrency:(...args)=>{if(args.length)selections.push(args);return 'SAR'},getExcludedRequestCurrencies:()=>[]};
 const generated=api.platformContext('show cars',[],cairo);
 const sandbox={...api,newTripRequested,marketSession,marketTurnsRef,marketCurrencyMutationRef,marketHistoryUncertainRef,marketplaceRequestRef,marketplaceAbortRef,continuityContextRef,conversation,
  activeTab:undefined,AbortController,platformConversationScope:api.platformConversationScope,
  ensureContinuityFresh:async()=>{if(mode==='coercion'){const unreachable=generated+'; do not use it';return Boolean(unreachable)}if(mode==='wait')await wait;return true},
  setPlatformQuery:v=>{latest=v},setServices:v=>{if(v.length)delivered++},setResultState:v=>{state=v},setLoading:v=>{loading=v},setLastMarketplaceQuery:()=>{},setMarketNotice:()=>{},language:'en',
  parseDabraMarketplaceQuery:()=>({}),toMarketplaceSearchParams:()=>new URLSearchParams(),publicItemsToServices:items=>items,
  fetch:async()=>{fetchCalls++;if(mode==='fetchwait')return {ok:true,json:async()=>{await wait;return {items:[{id:'old-synthetic'}]}}};throw Error('synthetic test must not fetch')},URLSearchParams};
 const search=runInNewContext('('+compiled.trim()+')',sandbox);
 return {raw,session,search,continuity,selections,get latest(){return latest},get state(){return state},get loading(){return loading},get delivered(){return delivered},get fetchCalls(){return fetchCalls},markHistoryUncertain:()=>{marketHistoryUncertainRef.current=true},release:()=>release(),set mode(value){mode=value},set messages(items){conversationMessages=items}};
}
test('the display consumer starts its lifecycle at input receipt and handles coercion failure before a separate refusal',async()=>{
 const c=loadSearchConsumer();
 c.messages=[{role:'user',text:'I need a car with a driver'},{role:'user',text:'my car budget is 800 SAR per day'}];
 await c.search('show cars in Cairo','dir3-drive',false);
 assert.ok(c.latest?.request);const prior=api.preparePlatformMarketDisplay(c.latest.request,'drive','en',pricing);
 assert.deepEqual(Array.from(prior.deliver().offers,x=>x.id),['synthetic-low']);
 c.mode='coercion';await c.search('new user input','dir3-drive',false);
 assert.equal(prior.deliver().status,'stale');assert.equal(c.latest,null);assert.equal(c.state,'error');
 c.mode='normal';c.messages=[{role:'user',text:'resume the saved trip'}];
 await c.search('do not use it','dir3-drive',false);
 assert.ok(c.latest?.request);const scope=api.platformUserRequestScope(c.latest.request);assert.equal(scope.trip,null);
 const result=api.preparePlatformMarketDisplay(c.latest.request,'drive','en',pricing).deliver();
 assert.equal(result.offers.length,0);assert.doesNotMatch(result.entry+result.answer,/2026-12-12|destination=cairo|Synthetic car/);
});
test('display source uses one issued request, not generated text relabelled as user input',()=>{
 const c=loadSearchConsumer();
 assert.match(c.raw,/preparePlatformMarketInput/);assert.match(c.raw,/platformUserRequestFacts/);
 assert.doesNotMatch(c.raw,/platformContext\s*\(/);assert.doesNotMatch(c.raw,/platformFamilies\s*\(/);
 const view=readFileSync(new URL('../components/dabra/PlatformResults.tsx',import.meta.url),'utf8');
 assert.match(view,/preparePlatformMarketDisplay\(request/);assert.doesNotMatch(view,/platformContext\s*\(|platformEntry\s*\(/);
});

for(const phrase of ['start a new trip, show cars in Cairo','ابدأ رحلة جديدة، اعرض السيارات في القاهرة']) test('a stale asynchronous search cannot detach a newer trip: '+phrase,async()=>{
 const c=loadSearchConsumer();c.mode='wait';
 const old=c.search(phrase,'dir3-drive',false);await Promise.resolve();
 c.mode='normal';await c.search('show cars in Cairo','dir3-drive',false);
 const newer=c.latest;assert.ok(newer?.request);assert.equal(c.continuity.trip,cairo);
 c.release();await old;assert.equal(c.continuity.trip,cairo);assert.equal(c.latest,newer);
});
for(const [separate,follow] of [['separate request, show cars in Cairo','show cars in Cairo'],['طلب منفصل، اعرض السيارات في القاهرة','اعرض السيارات في القاهرة']]) test('the actual local consumer keeps an explicit separation on its following search: '+separate,async()=>{
 const c=loadSearchConsumer();c.continuity.trip=null;
 c.messages=[{role:'user',text:'I need a car in Cairo from 2026-12-12 to 2026-12-14'},{role:'user',text:'my car budget is 800 SAR per day'},{role:'user',text:'my hotel budget is 1000 EUR per day'},{role:'user',text:'same request'}];
 await c.search(separate,'dir3-drive',false);assert.ok(c.latest?.request);
 assert.equal(api.platformUserRequestScope(c.latest.request).history.length,0);
 await c.search(follow,'dir3-drive',false);assert.ok(c.latest?.request);
 const scope=api.platformUserRequestScope(c.latest.request);assert.doesNotMatch(JSON.stringify(scope.history),/2026-12-12|800|1000/);
});

test('an unordered mixture of market and later chat turns cannot silently drop earlier constraints',async()=>{
 const c=loadSearchConsumer();c.continuity.trip=null;
 await c.search('I need a car with a budget of 800 SAR per day','dir3-drive',false);assert.ok(c.latest?.request);
 c.markHistoryUncertain();c.messages=[{role:'user',text:'do not use my previous car request'}];
 await c.search('show cars in Cairo','dir3-drive',false);
 assert.equal(c.latest,null);
 await c.search('start a new trip, show cars in Cairo','dir3-drive',false);
 assert.ok(c.latest?.request);assert.deepEqual(Array.from(api.preparePlatformMarketDisplay(c.latest.request,'drive','en',pricing).deliver().offers,x=>x.id),['synthetic-low','synthetic-high']);
});

for(const message of ['separate request, show cars in Cairo','طلب منفصل، اعرض السيارات في القاهرة']) test('a clear separate request also resolves mixed-history uncertainty without an attached trip: '+message,async()=>{
 const c=loadSearchConsumer();c.continuity.trip=null;
 await c.search('I need a car with a budget of 800 SAR per day','dir3-drive',false);assert.ok(c.latest?.request);
 c.markHistoryUncertain();c.messages=[{role:'user',text:'my hotel budget is 1000 EUR per day'}];
 await c.search(message,'dir3-drive',false);assert.ok(c.latest?.request);
 assert.equal(api.platformUserRequestScope(c.latest.request).history.length,0);
});

test('the display consumer derives currency intent from its issued request',async()=>{
 const c=loadSearchConsumer();assert.doesNotMatch(c.raw,/platformCurrencySelection\s*\(/);
 await c.search('show cars in Cairo in EUR','dir3-drive',true);assert.ok(c.latest?.request);
 assert.equal(c.selections.at(-1)[0],'EUR');
 await c.search('do not use EUR, show cars in Cairo','dir3-drive',true);assert.ok(c.latest?.request);
 assert.ok(c.selections.at(-1)[1].includes('EUR'));
});
test('the migrated local consumer handles an Arabic rejection as an independent user event',async()=>{
 const c=loadSearchConsumer();c.messages=[{role:'user',text:'استأنف الرحلة المحفوظة'}];
 await c.search('لا تستخدمها','dir3-drive',false);assert.ok(c.latest?.request);
 const scope=api.platformUserRequestScope(c.latest.request);assert.equal(scope.trip,null);
 const frame=api.preparePlatformMarketDisplay(c.latest.request,'drive','ar',pricing).deliver();
 assert.equal(frame.offers.length,0);assert.doesNotMatch(frame.entry+frame.answer,/2026-12-12|destination=cairo|Synthetic car/);
});

test('the actual consumer rechecks its lifecycle after the last asynchronous marketplace read',async()=>{
 const c=loadSearchConsumer();c.continuity.trip=null;c.mode='fetchwait';
 const old=c.search('find excursions',undefined,false);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(c.fetchCalls,1);
 c.mode='normal';await c.search('show cars in Cairo','dir3-drive',false);
 const newer=c.latest;assert.ok(newer?.request);c.release();await old;
 assert.equal(c.latest,newer);assert.equal(c.delivered,0);
});

for(const change of ['messages','currency','generation','preferences']) test('the copied shared-session subscription invalidates a prior local display on '+change,async()=>{
 const file=readFileSync(new URL('../components/dabra/DabraChatCommerce.tsx',import.meta.url),'utf8');
 const marker='  // The shared local session owns the view lifecycle.';
 const start=file.indexOf('  useEffect(() => {',file.indexOf(marker)),end=file.indexOf('  }, [conversation, marketSession]);',start);
 assert.ok(start>=0&&end>start);
 const effect=stripTypeScriptTypes(file.slice(start,end)+'  }, [conversation, marketSession]);',{mode:'strip'});
 const marketSession=api.createPlatformMarketSession(),prepared=await api.preparePlatformMarketInput(marketSession,()=>syntheticEvent('show cars in Cairo'),async()=>({history:[],trip:cairo}));
 assert.equal(prepared.status,'ready');const previous=api.preparePlatformMarketDisplay(prepared.request,'drive','en',pricing);
 let state={generation:1,messages:[],pending:false,preferences:null,continuityDraft:null},currency='SAR',listener=null,shown='old';
 const conversation={getSnapshot:()=>state,selectRequestCurrency:()=>currency,getExcludedRequestCurrencies:()=>[],subscribe:f=>{listener=f;return()=>{listener=null}}};
 const sandbox={conversation,marketSession,useEffect:f=>f(),marketCurrencyMutationRef:{current:false},marketTurnsRef:{current:[]},marketHistoryUncertainRef:{current:false},marketplaceRequestRef:{current:0},marketplaceAbortRef:{current:null},
  setPlatformQuery:value=>{shown=value},setServices:()=>{},setResultState:()=>{},setLoading:()=>{}};
 runInNewContext(effect,sandbox);assert.equal(typeof listener,'function');
 if(change==='messages')state={...state,messages:[{role:'user',text:'new event'}]};
 if(change==='generation')state={...state,generation:2};
 if(change==='preferences')state={...state,preferences:{synthetic:true}};
 if(change==='currency')currency='EUR';
 listener();assert.equal(shown,null);assert.equal(previous.deliver().status,'stale');
});
