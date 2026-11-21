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



for(const [condition,base,hotel,same] of [
 ['separate request, when I approve, show cars in Cairo',['I need a car in Cairo','my car budget is 800 SAR per day'],'my hotel budget is 1000 EUR per day','same request'],
 ['when I approve, separate request, show cars in Cairo',['I need a car in Cairo','my car budget is 800 SAR per day'],'my hotel budget is 1000 EUR per day','same request'],
 ['طلب منفصل عندما أوافق، اعرض السيارات في القاهرة',['أحتاج سيارة في القاهرة','ميزانية السيارة 800 ريال يومياً'],'ميزانية الفندق 1000 يورو يومياً','نفس الطلب'],
 ['عندما أوافق، طلب منفصل، اعرض السيارات في القاهرة',['أحتاج سيارة في القاهرة','ميزانية السيارة 800 ريال يومياً'],'ميزانية الفندق 1000 يورو يومياً','نفس الطلب'],
]) test('a conditional separation cannot clear the prior cap or open matching: '+condition,()=>{
 const history=turns([...base,hotel,same]),owner=api.createPlatformScopeOwner(),request=issue(condition,history,null,owner).request;
 const scope=api.platformUserRequestScope(request);assert.equal(scope.tripStatus,'contested');
 const frame=api.preparePlatformMarketDisplay(request,'drive','en',pricing).deliver();assert.equal(frame.offers.length,0);
 const next=issue('show cars in Cairo',turns([...base,hotel,same,condition]),null,owner).request;
 assert.equal(api.platformUserRequestScope(next).tripStatus,'contested');assert.equal(api.preparePlatformMarketDisplay(next,'drive','en',pricing).deliver().offers.length,0);
});
for(const [message,follow] of [['do not use my trip','show cars'],['لا تستخدم رحلتي','اعرض السيارات']]) test('direct rejection of the current trip detaches it and its following turn: '+message,()=>{
 const owner=api.createPlatformScopeOwner(),request=issue(message,[],dubai,owner).request,scope=api.platformUserRequestScope(request);assert.equal(scope.trip,null);
 const first=api.preparePlatformMarketDisplay(request,'drive','en',pricing).deliver();assert.doesNotMatch(first.entry+first.answer,/Dubai|2026-12-12|2026-12-14/i);
 const next=issue(follow,turns([message]),dubai,owner).request;assert.equal(api.platformUserRequestScope(next).trip,null);
 const later=api.preparePlatformMarketDisplay(next,'drive','en',pricing).deliver();assert.doesNotMatch(later.entry+later.answer,/Dubai|2026-12-12|2026-12-14/i);
});
for(const phrase of ["don't use the hotel for my trip",'لا تستخدم الفندق في رحلتي']) test('a hotel rejection does not refuse the trip: '+phrase,()=>{
 const owner=api.createPlatformScopeOwner(),request=issue(phrase,[],dubai,owner).request;
 assert.equal(api.platformUserRequestScope(request).trip,dubai);
});
for(const [label,message] of [
 ['capacity','I need a car in Cairo from 2026-12-20 to 2026-12-22 for 8 passengers with a driver, my car budget is 800 SAR per day'],
 ['driver','I need a car in Cairo from 2026-12-20 to 2026-12-22 for 2 passengers without a driver, my car budget is 800 SAR per day'],
 ['rejected',"I don't want a car"],
 ['luggage','I need a car in Cairo from 2026-12-20 to 2026-12-22 for 2 passengers with a driver and 8 bags, my car budget is 800 SAR per day'],
]) test('the display cannot advertise a car that fails its service or documented capacity: '+label,()=>{
 const owner=api.createPlatformScopeOwner(),request=issue(message,[],null,owner).request;
 const frame=api.preparePlatformMarketDisplay(request,'drive','en',pricing).deliver();assert.equal(frame.offers.length,0);
 assert.doesNotMatch(frame.answer,/Synthetic car: .*\/ day/i);
});
test('a positively requested car with known passenger capacity and a daily cap still matches',()=>{
 const owner=api.createPlatformScopeOwner();const message='I need a car in Cairo from 2026-12-20 to 2026-12-22 for 2 passengers with a driver, my car budget is 800 SAR per day';
 const request=issue(message,[],null,owner).request;const frame=api.preparePlatformMarketDisplay(request,'drive','en',pricing).deliver();
 assert.deepEqual(Array.from(frame.offers,x=>x.id),['synthetic-low']);
});
test('a local currency capability binds display and link to its selected currency and expires on change',async()=>{
 const session=api.createPlatformMarketSession();const issued=await api.preparePlatformMarketInput(session,()=>syntheticEvent('show cars in Cairo in EUR'),async()=>({history:[],trip:null}));
 assert.equal(issued.status,'ready');const policy=session.issueCurrencyPolicy(issued.ticket,issued.request,'SAR',[],true);assert.ok(policy);
 const prepared=api.preparePlatformMarketDisplay(issued.request,'drive','en',{currency:'EUR',snapshot:{synthetic:true}},policy);
 const frame=prepared.deliver();assert.match(frame.entry,/currency=SAR/i);assert.doesNotMatch(frame.entry,/currency=EUR/i);assert.match(frame.answer,/SAR/);
 session.noteCurrencyChange();assert.equal(prepared.deliver().status,'stale');assert.equal(prepared.deliver().offers.length,0);
 const forged=api.preparePlatformMarketDisplay(issued.request,'drive','en',pricing,{kind:'platform-local-currency-policy'}).deliver();assert.equal(forged.status,'stale');
});
for(const phrase of ["my trip, don't use it",'رحلتي، لا تستخدمها','ignore my trip','تجاهل رحلتي']) test('a trip reference and its negative action remain bound: '+phrase,()=>{
 const owner=api.createPlatformScopeOwner(),request=issue(phrase,[],dubai,owner).request;assert.equal(api.platformUserRequestScope(request).trip,null);
 assert.doesNotMatch(api.preparePlatformMarketDisplay(request,'drive','en',pricing).deliver().answer,/Dubai|2026-12-12/i);
});
for(const phrase of ['show cars in Cairo without a driver','اعرض سيارات في القاهرة بدون سائق','I do not want a car','لا أريد سيارة']) test('a negative service constraint alone never produces a conflicting car card: '+phrase,()=>{
 const owner=api.createPlatformScopeOwner(),request=issue(phrase,[],null,owner).request;
 assert.equal(api.preparePlatformMarketDisplay(request,'drive','en',pricing).deliver().offers.length,0);
});
for(const phrase of ['once I approve, separate request, show cars in Cairo','separate request after I approve, show cars in Cairo','بشرط موافقتي، طلب منفصل، اعرض السيارات في القاهرة','طلب منفصل بعد موافقتي، اعرض السيارات في القاهرة']) test('temporal or approval conditions keep the scope decision pending: '+phrase,()=>{
 const owner=api.createPlatformScopeOwner(),request=issue(phrase,turns(['I need a car','my car budget is 800 SAR per day','my hotel budget is 1000 EUR per day','same request']),null,owner).request;
 assert.equal(api.platformUserRequestScope(request).tripStatus,'contested');assert.equal(api.preparePlatformMarketDisplay(request,'drive','en',pricing).deliver().offers.length,0);
});
for(const phrase of ["I don't want a driver for my trip",'لا أريد سائق لرحلتي',"I don't want a car for my trip",'لا أريد سيارة في رحلتي']) test('rejecting a named service for my trip is not a trip identity question: '+phrase,()=>{
 const owner=api.createPlatformScopeOwner(),request=issue(phrase,[],cairo,owner).request;
 assert.equal(newTripRequested.decision(phrase).refused,false);assert.equal(newTripRequested.decision(phrase).kind,'continue');
 assert.equal(api.platformUserRequestScope(request).trip,cairo);
 assert.equal(api.preparePlatformMarketDisplay(request,'drive','en',pricing).deliver().offers.length,0);
});
