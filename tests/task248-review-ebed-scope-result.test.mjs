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
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner:typeof createPlatformScopeOwner==="undefined"?null:createPlatformScopeOwner,preparePlatformAssistantResponse:typeof preparePlatformAssistantResponse==="undefined"?null:preparePlatformAssistantResponse,platformUserRequest:typeof platformUserRequest==="undefined"?null:platformUserRequest,platformUserRequestScope:typeof platformUserRequestScope==="undefined"?null:platformUserRequestScope,hasActivePlatformDriveDialogue,preparePlatformEntryForUserRequest:typeof preparePlatformEntryForUserRequest==="undefined"?null:preparePlatformEntryForUserRequest,platformCurrencySelection,platformProtectedTripScope:typeof platformProtectedTripScope==="undefined"?null:platformProtectedTripScope,platformConversationScope,platformContext,platformDriveDialogue,preferenceContext,platformEntry,findPlatformDriveOffers,buildPlatformAssistantResponse};';
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


for (const [lang,base,hotel,same,separate,follow] of [
 ['en',['I need a car in Cairo from 2026-12-12 to 2026-12-14','my car budget is 800 SAR per day'],'my hotel budget is 1000 EUR per day','same request','separate request, show cars in Cairo','show cars in Cairo'],
 ['en',['I need a car in Cairo from 2026-12-12 to 2026-12-14','my car budget is 800 SAR per day'],'my hotel budget is 1000 EUR per day','same request','different request, show cars in Cairo','show cars in Cairo'],
 ['ar',['أحتاج سيارة في القاهرة من 2026-12-12 إلى 2026-12-14','ميزانية السيارة 800 ريال يومياً'],'ميزانية الفندق 1000 يورو يومياً','نفس الطلب','طلب منفصل، اعرض السيارات في القاهرة','اعرض السيارات في القاهرة'],
]) test('explicit separation clears a previously confirmed unanchored request, including follow-up: '+separate,()=>{
 const prior=turns([...base,hotel,same]);
 const owner=api.createPlatformScopeOwner(), request=issue(separate,prior,null,owner).request;
 const scope=api.platformUserRequestScope(request);
 assert.equal(scope.trip,null);assert.notEqual(scope.tripStatus,'contested');assert.equal(scope.history.length,0);
 const result=api.buildPlatformAssistantResponse(request,[],lang,Date.now(),'drive',pricing).answer;
 assert.doesNotMatch(result,/2026-12-12|2026-12-14|1000|800/);
 const next=issue(follow,turns([...base,hotel,same,separate]),null,owner).request;
 const scopedNext=api.platformUserRequestScope(next);
 assert.notEqual(scopedNext.tripStatus,'contested');
 assert.doesNotMatch(JSON.stringify(scopedNext.history),/2026-12-12|2026-12-14|1000|800/);
});
for (const message of ['start a new trip, show cars in Cairo','ابدأ رحلة جديدة، اعرض السيارات في القاهرة']) test('explicit independent trip is actually evaluated: '+message,()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car','my car budget is 800 SAR per day']);
 const request=issue(message,history,cairo,owner).request,scope=api.platformUserRequestScope(request);
 assert.equal(scope.trip,null);assert.equal(scope.history.length,0);
 assert.deepEqual(Array.from(api.findPlatformDriveOffers('',pricing,null,undefined,request),o=>o.id),['synthetic-low','synthetic-high']);
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.match(answer,/Synthetic car/);assert.doesNotMatch(answer,/No car matches|2026-12-12/);
});
for (const message of ['start a new trip, show cars in Cairo with a car budget of 800','ابدأ رحلة جديدة، اعرض السيارات في القاهرة بميزانية السيارة 800']) test('unknown budget unit never claims evaluated absence: '+message,()=>{
 const owner=api.createPlatformScopeOwner(),request=issue(message,[],null,owner).request;
 assert.equal(api.findPlatformDriveOffers('',pricing,null,undefined,request).length,0);
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.doesNotMatch(answer,/No car matches the current catalogue/i);
 assert.doesNotMatch(answer,/Synthetic car/);
});
for(const message of ['if I approve, separate request, show cars in Cairo','perhaps a new request, show cars in Cairo','إذا وافقت، طلب منفصل، اعرض السيارات في القاهرة','ربما طلب جديد، اعرض السيارات في القاهرة']) test('a conditional or tentative separation does not silently erase the confirmed request: '+message,()=>{
 const prior=turns(['I need a car in Cairo','my car budget is 800 SAR per day','my hotel budget is 1000 EUR per day','same request']);
 const owner=api.createPlatformScopeOwner(),request=issue(message,prior,null,owner).request,scope=api.platformUserRequestScope(request);
 assert.ok(scope.tripStatus==='contested' || JSON.stringify(scope.history).includes('800'));
 assert.equal(api.findPlatformDriveOffers('',pricing,null,undefined,request).length,0);
});
for (const [label,snapshot] of [['missing',null],['expired',{expired:true}]]) test('unavailable FX blocks a match and is not reported as an evaluated empty catalogue: '+label,()=>{
 const owner=api.createPlatformScopeOwner(),request=issue('show cars in Cairo',turns(['I need a car with a driver','my car budget is 200 EUR per day']),cairo,owner).request;
 const original=globals.displayPrice;let fxCalls=0;
 globals.displayPrice=(amount,currency,target,rate)=>{if(currency===target)return {amount,currency,unavailable:false};fxCalls++;return !rate||rate.expired?{amount,currency,unavailable:true}:{amount:amount/4,currency:target,unavailable:false}};
 try {
  const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',{currency:'SAR',snapshot}).answer;
  assert.ok(fxCalls>0);assert.doesNotMatch(answer,/No car matches the current catalogue|Synthetic car/i);
 } finally {globals.displayPrice=original}
});
