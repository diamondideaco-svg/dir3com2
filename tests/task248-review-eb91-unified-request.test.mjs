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
for(const [locale,base] of [
 ['en',['I need a car with a driver','my car budget is 800 SAR per day']],
 ['ar',['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً']]
]) test('one issued request reaches response, dialogue, link and budget filtering: '+locale,()=>{
 const owner=api.createPlatformScopeOwner(),{request}=issue('show cars in Cairo',turns(base),cairo,owner);
 let budgetCalls=0,priceCalls=0;const oldBudget=globals.driveBudgetState,oldPrice=globals.displayPrice;
 globals.driveBudgetState=(...args)=>{budgetCalls++;return oldBudget(...args)};
 globals.displayPrice=(...args)=>{priceCalls++;return oldPrice(...args)};
 try{
  const answer=api.buildPlatformAssistantResponse(request,[],locale,Date.now(),'drive',pricing).answer;
  assert.match(answer,/Synthetic car.*500\.00\s*SAR/i);assert.doesNotMatch(answer,/900\.00\s*SAR/i);
  assert.equal(api.hasActivePlatformDriveDialogue(request),true);
  const link=api.preparePlatformEntryForUserRequest('drive',request,locale,'SAR').deliver();
  assert.match(link,/destination=cairo/);assert.match(link,/2026-12-12/);
  const selected=api.findPlatformDriveOffers('show cars in Cairo',pricing,cairo,undefined,request);
  assert.deepEqual(Array.from(selected,x=>x.id),['synthetic-low']);
  assert.ok(budgetCalls>0,'budget reducer was reached');assert.ok(priceCalls>0,'pricing was reached');
 }finally{globals.driveBudgetState=oldBudget;globals.displayPrice=oldPrice}
});
for(const message of ['I need a transfer from Giza to Cairo','أحتاج توصيل من الجيزة إلى القاهرة']) test('one event preserves pickup, dropoff and currency: '+message,()=>{
 const owner=api.createPlatformScopeOwner(),{request}=issue(message,[],cairo,owner);
 const params=new URL(api.preparePlatformEntryForUserRequest('drive',request,'en','EUR').deliver(),'https://example.invalid').searchParams;
 assert.equal(params.get('pickup'),'giza');assert.equal(params.get('dropoff'),'cairo');assert.equal(params.get('destination'),'cairo');assert.equal(params.get('currency'),'EUR');
});
for(const [message,expectedCalls] of [
 ['if I approve my car budget is 1000 EUR per day',true],
 ['do not change my budget from 800 SAR to 1000 EUR',true]
]) test('same request reaches a real budget guard: '+message,()=>{
 const owner=api.createPlatformScopeOwner();const history=turns(['I need a car with a driver','my car budget is 800 SAR per day']);
 const {request}=issue(message,history,cairo,owner);let calls=0;const old=globals.driveBudgetState;
 globals.driveBudgetState=(...args)=>{calls++;return old(...args)};
 try{
  const result=api.findPlatformDriveOffers('',pricing,cairo,undefined,request);
  assert.ok(calls>0,'must not return before the budget reducer');
  if(message.startsWith('if '))assert.equal(result.length,0);else assert.deepEqual(Array.from(result,x=>x.id),['synthetic-low']);
 }finally{globals.driveBudgetState=old}
});
test('the same owner invalidates matching, link and delayed reply after a correction',async()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car with a driver','my car budget is 800 SAR per day']);
 const {request}=issue('show cars in Cairo',history,cairo,owner);
 const reply=api.preparePlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing);
 const link=api.preparePlatformEntryForUserRequest('drive',request,'en','SAR');
 assert.deepEqual(Array.from(api.findPlatformDriveOffers('',pricing,cairo,undefined,request),x=>x.id),['synthetic-low']);
 await Promise.resolve();issue('my car budget is 400 SAR per day',history,cairo,owner);
 assert.equal(api.findPlatformDriveOffers('',pricing,cairo,undefined,request).length,0);
 assert.doesNotMatch(link.deliver(),/destination=cairo|2026-12-12/);
 assert.match(reply.deliver().answer,/context changed/i);
});
for(const [trip,label] of [[dubai,'Dubai'],[cairo,'Cairo']]) test('a locally generated projection cannot be relabelled as a user event: '+label,()=>{
 const owner=api.createPlatformScopeOwner();const generated=api.platformContext('show cars',[],trip);
 const {request}=issue(generated,[],trip,owner);
 const response=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.doesNotMatch(response,/Synthetic car|500\.00|900\.00|2026-12-12|destination=cairo/i);
 assert.equal(api.findPlatformDriveOffers('',pricing,trip,undefined,request).length,0);
});
for(const refusal of ["don't use it",'لا تستخدمها']) test('a generated projection plus refusal cannot leak its dates: '+refusal,()=>{
 const owner=api.createPlatformScopeOwner(),generated=api.platformContext('show cars',[],cairo);
 assert.throws(()=>generated+'; '+refusal,/context.*coerced/i);
 const {request}=issue(generated,[],cairo,owner);
 const response=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.doesNotMatch(response,/Synthetic car|2026-12-12|2026-12-14|destination=cairo/i);
});

for(const [base,hotel,follow] of [
 [['I need a car with a driver','my car budget is 800 SAR per day'],'my hotel budget is 1000 EUR per day','show cars in Cairo'],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'ميزانية الفندق 1000 يورو يومياً','اعرض السيارات في القاهرة']
]) test('an ambiguous service boundary cannot discard a confirmed car cap and pending lodging amount: '+hotel,()=>{
 const owner=api.createPlatformScopeOwner(),history=turns([...base,hotel]);
 const protectedState=api.platformProtectedTripScope(follow,history,cairo);
 assert.equal(protectedState.anchor,cairo);assert.equal(protectedState.budget.confirmed.amount,'800');
 assert.ok(protectedState.budget.pending.some(item=>item.value.kind==='amount'&&item.value.amount==='1000'));
 const {request}=issue(follow,history,cairo,owner),scope=api.platformUserRequestScope(request);
 assert.equal(scope.tripStatus,'contested');assert.equal(scope.trip,null);assert.equal(scope.history.length,0);
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.match(answer,/continue the current trip or start a new trip/i);
 assert.doesNotMatch(answer,/Synthetic car|2026-12-12|2026-12-14|destination=cairo/i);
 assert.equal(api.findPlatformDriveOffers('',pricing,scope.trip,undefined,request).length,0);
});
for(const [base,hotel,follow] of [
 [['I need a car with a driver','my car budget is 800 SAR per day'],'same trip, my hotel budget is 1000 EUR per day','show cars in Cairo'],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'نفس الرحلة، ميزانية الفندق 1000 يورو يومياً','اعرض السيارات في القاهرة']
]) test('an explicitly shared trip reaches its other-service budget guard: '+hotel,()=>{
 const owner=api.createPlatformScopeOwner(),history=turns([...base,hotel]);
 const {request}=issue(follow,history,cairo,owner),scope=api.platformUserRequestScope(request);
 assert.equal(scope.trip,cairo);let calls=0;const original=globals.driveBudgetState;
 globals.driveBudgetState=(...args)=>{calls++;return original(...args)};
 try{assert.equal(api.findPlatformDriveOffers('',pricing,scope.trip,undefined,request).length,0);assert.ok(calls>0)}
 finally{globals.driveBudgetState=original}
});

for(const [hotel,confirm,newTrip] of [
 ['my hotel budget is 1000 EUR per day','same trip, show cars','start a new trip, show cars in Cairo'],
 ['ميزانية الفندق 1000 يورو يومياً','نفس الرحلة، اعرض السيارات','ابدأ رحلة جديدة، اعرض السيارات في القاهرة']
]) test('resolving an ambiguous service boundary requires revalidation or an explicit new trip: '+hotel,()=>{
 const history=turns(['I need a car with a driver','my car budget is 800 SAR per day',hotel]);
 const owner=api.createPlatformScopeOwner(),same=issue(confirm,history,cairo,owner).request;
 const scope=api.platformUserRequestScope(same);
 assert.equal(scope.tripStatus,'revalidation');assert.equal(scope.trip,null);
 const answer=api.buildPlatformAssistantResponse(same,[],'en',Date.now(),'drive',pricing).answer;
 assert.match(answer,/verify that it is still available for use/i);
 assert.doesNotMatch(answer,/Synthetic car|2026-12-12|destination=cairo/i);
 const fresh=issue(newTrip,history,cairo,owner).request,freshScope=api.platformUserRequestScope(fresh);
 assert.equal(freshScope.trip,null);assert.notEqual(freshScope.tripStatus,'contested');
 assert.equal(cairo.budget,800);assert.equal(cairo.destination,'Cairo');
});

for(const [base,hotel] of [
 [['I need a car with a driver','my car budget is 800 SAR per day'],'my hotel budget is 1000 EUR per day'],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'ميزانية الفندق 1000 يورو يومياً']
]) test('the budget-bearing service transition is withheld on the current turn too: '+hotel,()=>{
 const owner=api.createPlatformScopeOwner(),{request}=issue(hotel,turns(base),cairo,owner);
 const scope=api.platformUserRequestScope(request);
 assert.equal(scope.tripStatus,'contested');assert.equal(scope.trip,null);
 const response=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.match(response,/continue the current trip or start a new trip/i);
 assert.doesNotMatch(response,/Synthetic car|2026-12-12|destination=cairo/i);
 assert.equal(api.findPlatformDriveOffers('',pricing,scope.trip,undefined,request).length,0);
});

for(const [hotel,resume] of [
 ['my hotel budget is 1000 EUR per day','resume the saved trip'],
 ['ميزانية الفندق 1000 يورو يومياً','استأنف الرحلة المحفوظة']
]) test('an explicit saved-trip resume after an ambiguous service boundary still requires revalidation: '+resume,()=>{
 const history=turns(['I need a car with a driver','my car budget is 800 SAR per day',hotel]);
 const owner=api.createPlatformScopeOwner(),{request}=issue(resume,history,cairo,owner);
 const scope=api.platformUserRequestScope(request);
 assert.equal(scope.tripStatus,'revalidation');assert.equal(scope.trip,null);
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.match(answer,/verify that it is still available for use/i);assert.doesNotMatch(answer,/Synthetic car|2026-12-12|destination=cairo/i);
});

for(const [car,hotel,follow] of [
 ['show cars','show hotels','show cars'],
 ['اعرض السيارات','اعرض الفنادق','اعرض السيارات']
]) test('a saved budget with no time basis is not lost at an ambiguous service boundary: '+hotel,()=>{
 const owner=api.createPlatformScopeOwner(),history=turns([car,hotel]);
 const {request}=issue(follow,history,cairo,owner),scope=api.platformUserRequestScope(request);
 assert.equal(scope.tripStatus,'contested');assert.equal(scope.trip,null);
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.match(answer,/continue the current trip or start a new trip/i);
 assert.doesNotMatch(answer,/Synthetic car|2026-12-12|500\.00|900\.00/i);
 assert.equal(api.findPlatformDriveOffers('',pricing,scope.trip,undefined,request).length,0);
 assert.equal(cairo.budget,800);
});

test('a synthetic USER event is accepted as one structured request while an assistant event is not',()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car with a driver','my car budget is 800 SAR per day']);
 const userEvent=syntheticEvent('show cars in Cairo');
 const request=api.platformUserRequest(userEvent,history,cairo,owner);
 assert.equal(api.platformUserRequestScope(request).trip,cairo);
 assert.deepEqual(Array.from(api.findPlatformDriveOffers('',pricing,cairo,undefined,request),x=>x.id),['synthetic-low']);
 const assistantEvent={role:'assistant',content:'my car budget is 10000 SAR per day'};
 const rejected=api.platformUserRequest(assistantEvent,history,cairo,owner);
 assert.equal(api.platformUserRequestScope(rejected),null);
 assert.equal(api.findPlatformDriveOffers('',pricing,cairo,undefined,rejected).length,0);
 assert.equal(api.findPlatformDriveOffers('',pricing,cairo,undefined,request).length,0);
});
