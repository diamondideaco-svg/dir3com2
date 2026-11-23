import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from './fixtures/task258-platform-vm.mjs';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveDialogue,driveDialogueCopy,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner:typeof createPlatformScopeOwner==="undefined"?null:createPlatformScopeOwner,preparePlatformAssistantResponse:typeof preparePlatformAssistantResponse==="undefined"?null:preparePlatformAssistantResponse,platformUserRequest:typeof platformUserRequest==="undefined"?null:platformUserRequest,platformUserRequestScope:typeof platformUserRequestScope==="undefined"?null:platformUserRequestScope,hasActivePlatformDriveDialogue,preparePlatformEntryForUserRequest:typeof preparePlatformEntryForUserRequest==="undefined"?null:preparePlatformEntryForUserRequest,preparePlatformMarketDisplay:typeof preparePlatformMarketDisplay==="undefined"?null:preparePlatformMarketDisplay,platformUserRequestFacts:typeof platformUserRequestFacts==="undefined"?null:platformUserRequestFacts,createPlatformMarketSession:typeof createPlatformMarketSession==="undefined"?null:createPlatformMarketSession,preparePlatformMarketInput:typeof preparePlatformMarketInput==="undefined"?null:preparePlatformMarketInput,platformCurrencySelection,platformProtectedTripScope:typeof platformProtectedTripScope==="undefined"?null:platformProtectedTripScope,platformConversationScope,platformContext,platformDriveDialogue,preferenceContext,platformEntry,findPlatformDriveOffers,buildPlatformAssistantResponse};';
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


test('input consumer invalidates a prior delivery before a failing generated-context construction and handles refusal separately',async()=>{
 assert.equal(typeof api.createPlatformMarketSession,'function');assert.equal(typeof api.preparePlatformMarketInput,'function');
 const session=api.createPlatformMarketSession();
 const first=await api.preparePlatformMarketInput(session,()=>syntheticEvent('show cars in Cairo'),async()=>({history:[],trip:cairo}));
 assert.equal(first.status,'ready');
 const prepared=api.preparePlatformAssistantResponse(first.request,[],'en',Date.now(),'drive',pricing);
 const generated=api.platformContext('show cars',[],cairo);
 const failed=await api.preparePlatformMarketInput(session,()=>syntheticEvent(generated+'; do not use it'),async()=>({history:[],trip:cairo}));
 assert.equal(failed.status,'error');assert.match(prepared.deliver().answer,/context changed/i);
 const refused=await api.preparePlatformMarketInput(session,()=>syntheticEvent('do not use it'),async()=>({history:turns(['resume the saved trip']),trip:cairo}));
 assert.equal(refused.status,'ready');
 const scope=api.platformUserRequestScope(refused.request);assert.equal(scope.trip,null);
 const answer=api.buildPlatformAssistantResponse(refused.request,[],'en',Date.now(),'drive',pricing).answer;
 assert.doesNotMatch(answer,/2026-12-12|2026-12-14|destination=cairo|Synthetic car/);
});
test('the consumer checks freshness after its last asynchronous preparation',async()=>{
 const session=api.createPlatformMarketSession();let release;
 const pending=new Promise(resolve=>{release=resolve});
 const older=api.preparePlatformMarketInput(session,()=>syntheticEvent('show cars'),async()=>{await pending;return {history:[],trip:cairo}});
 const newer=await api.preparePlatformMarketInput(session,()=>syntheticEvent('start a new trip, show cars in Cairo'),async()=>({history:[],trip:null}));
 assert.equal(newer.status,'ready');release();assert.equal((await older).status,'stale');
 assert.match(api.buildPlatformAssistantResponse(newer.request,[],'en',Date.now(),'drive',pricing).answer,/Synthetic car/);
});
test('request facts, response, link and matching consume the same issued request and stale facts are withheld',async()=>{
 const session=api.createPlatformMarketSession();
 const event=syntheticEvent('same trip, show cars in Cairo in SAR');
 const result=await api.preparePlatformMarketInput(session,()=>event,async()=>({history:turns(['I need a car with a driver','my car budget is 800 SAR per day']),trip:cairo}));
 assert.equal(result.status,'ready');const request=result.request,scope=api.platformUserRequestScope(request),facts=api.platformUserRequestFacts(request);
 assert.ok(facts.families.includes('drive'));assert.equal(facts.blocked,false);assert.equal(scope.trip,cairo);
 assert.deepEqual(Array.from(api.findPlatformDriveOffers('',pricing,scope.trip,undefined,request),x=>x.id),['synthetic-low']);
 assert.match(api.preparePlatformEntryForUserRequest('drive',request,'en','SAR').deliver(),/destination=cairo/);
 assert.match(api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer,/Synthetic car/);
 session.invalidate();assert.equal(api.platformUserRequestFacts(request),null);
 assert.doesNotMatch(api.preparePlatformEntryForUserRequest('drive',request,'en','SAR').deliver(),/2026-12-12|destination=cairo/);
});

test('the actual display adapter shares one request and gates delivery after preparation',async()=>{
 const session=api.createPlatformMarketSession();
 const issued=await api.preparePlatformMarketInput(session,()=>syntheticEvent('show cars in Cairo'),async()=>({history:turns(['I need a car with a driver','my car budget is 800 SAR per day']),trip:cairo}));
 assert.equal(issued.status,'ready');assert.equal(typeof api.preparePlatformMarketDisplay,'function');
 const prepared=api.preparePlatformMarketDisplay(issued.request,'drive','en',pricing);
 const visible=prepared.deliver();assert.equal(visible.status,'ready');
 assert.deepEqual(Array.from(visible.offers,x=>x.id),['synthetic-low']);
 assert.match(visible.entry,/destination=cairo/);assert.doesNotMatch(visible.answer,/900\.00/);
 session.invalidate();const stale=prepared.deliver();assert.equal(stale.status,'stale');
 assert.equal(stale.offers.length,0);assert.doesNotMatch(stale.entry+stale.answer,/destination=cairo|2026-12-12|500\.00/);
});
for(const [locale,phrase] of [['en','do not use EUR'],['ar','لا تستخدم اليورو']]) test('the request-bound display adapter preserves a display exclusion while keeping the car cap: '+locale,async()=>{
 const session=api.createPlatformMarketSession();
 const issued=await api.preparePlatformMarketInput(session,()=>syntheticEvent(phrase),async()=>({history:turns(['I need a car with a driver','my car budget is 800 SAR per day']),trip:cairo}));
 assert.equal(issued.status,'ready');const facts=api.platformUserRequestFacts(issued.request);
 assert.ok(facts.currentExcludedCurrencies.includes('EUR'));
 const frame=api.preparePlatformMarketDisplay(issued.request,'drive',locale,{currency:'EUR',snapshot:null,excludedCurrencies:['EUR']}).deliver();
 assert.equal(frame.status,'ready');assert.deepEqual(Array.from(frame.offers,x=>x.id),['synthetic-low']);
 assert.doesNotMatch(frame.entry,/currency=EUR/i);assert.doesNotMatch(frame.answer,/500\.00 EUR|900\.00 EUR/i);
});
test('a verified empty catalogue remains distinguishable from a blocked comparison',async()=>{
 const session=api.createPlatformMarketSession();
 const issued=await api.preparePlatformMarketInput(session,()=>syntheticEvent('show BMW cars in Cairo'),async()=>({history:[],trip:null}));
 const frame=api.preparePlatformMarketDisplay(issued.request,'drive','en',pricing).deliver();
 assert.equal(frame.status,'ready');assert.equal(frame.offers.length,0);assert.match(frame.answer,/No car matches/i);
});
