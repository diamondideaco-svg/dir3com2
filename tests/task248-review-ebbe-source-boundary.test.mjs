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

for(const [label,trip] of [['Dubai',dubai],['Cairo',cairo]]) test('generated context is opaque and cannot be used as a USER turn: '+label,()=>{
 const owner=api.createPlatformScopeOwner(),context=api.platformContext('show cars',[],trip);
 assert.notEqual(typeof context,'string');
 assert.throws(()=>context+'; do not use it',/context.*(?:coerc|convert|text)/i);
 assert.doesNotMatch(JSON.stringify(context),/2026-12-12|2026-12-14|Cairo|Dubai|800/i);
 for(const input of [context,{role:'user',content:context}]) {
  const request=api.platformUserRequest(input,[],trip,owner);
  assert.equal(api.platformUserRequestScope(request),null);
  const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
  assert.doesNotMatch(answer,/Synthetic car|500\.00|900\.00|2026-12-12|destination=cairo/i);
  assert.equal(api.findPlatformDriveOffers('',pricing,trip,undefined,request).length,0);
 }
});
for(const [locale,base,hotel,follow] of [
 ['en',['I need a car with a driver','my car budget is 800 SAR per day'],'my hotel budget is 1000 EUR per day','show cars in Cairo'],
 ['ar',['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'ميزانية الفندق 1000 يورو يومياً','اعرض السيارات في القاهرة']
]) test('without an attached trip, competing service budgets do not become unbounded matches: '+locale,()=>{
 const history=turns([...base,hotel]),owner=api.createPlatformScopeOwner();
 const state=api.platformProtectedTripScope(follow,history,null);
 assert.equal(state.budget.confirmed.amount,'800');assert.ok(state.budget.pending.some(x=>x.value.kind==='amount'&&x.value.amount==='1000'));
 const {request}=issue(follow,history,null,owner),scope=api.platformUserRequestScope(request);
 assert.equal(scope.trip,null);assert.equal(scope.tripStatus,'contested');
 const answer=api.buildPlatformAssistantResponse(request,[],locale,Date.now(),'drive',pricing).answer;
 assert.match(answer,locale==='ar'?/الميزاني|الطلب/:/budget|request/i);
 assert.doesNotMatch(answer,/Synthetic car|500\.00|900\.00/);
 assert.equal(api.findPlatformDriveOffers('',pricing,null,undefined,request).length,0);
});
for(const [locale,base,hotel,fix] of [
 ['en',['I need a car with a driver','my car budget is 800 SAR per day'],'my hotel budget is 1000 EUR per day','same trip, set my car budget to 700 SAR per day'],
 ['ar',['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'ميزانية الفندق 1000 يورو يومياً','نفس الرحلة، ميزانية السيارة 700 ريال يومياً']
]) test('explicit same-scope correction retains the other-service proposal without an attached trip: '+locale,()=>{
 const history=turns([...base,hotel]),owner=api.createPlatformScopeOwner(),{request}=issue(fix,history,null,owner);
 const scope=api.platformUserRequestScope(request);assert.equal(scope.trip,null);assert.notEqual(scope.tripStatus,'revalidation');
 const all=[...scope.history.filter(t=>t.role==='user').map(t=>norm(t.content)),norm(scope.message)];
 const state=driveBudgetState(all);assert.equal(state.confirmed.amount,'700');assert.ok(state.pending.some(x=>x.value.kind==='amount'&&x.value.amount==='1000'));
 assert.equal(api.findPlatformDriveOffers('',pricing,null,undefined,request).length,0);
});
for(const message of ['start a new trip, show cars in Cairo','ابدأ رحلة جديدة، اعرض السيارات في القاهرة']) test('an explicit new request may end the prior budget scope: '+message,()=>{
 const history=turns(['I need a car with a driver','my car budget is 800 SAR per day','my hotel budget is 1000 EUR per day']);
 const owner=api.createPlatformScopeOwner(),{request}=issue(message,history,null,owner),scope=api.platformUserRequestScope(request);
 assert.equal(scope.trip,null);assert.notEqual(scope.tripStatus,'contested');assert.equal(scope.history.length,0);
});
test('scope-block and same-trip budget matcher are measured in distinct phases',()=>{
 const base=['I need a car with a driver','my car budget is 800 SAR per day'];
 const owner=api.createPlatformScopeOwner(),old=globals.driveBudgetState,seen={issue:0,match:0};let phase='issue';
 globals.driveBudgetState=(...args)=>{seen[phase]++;return old(...args)};
 try{
  const uncertain=issue('show cars in Cairo',turns([...base,'my hotel budget is 1000 EUR per day']),cairo,owner).request;
  const scoped=api.platformUserRequestScope(uncertain);assert.equal(scoped.tripStatus,'contested');assert.ok(seen.issue>0);
  phase='match';seen.match=0;assert.equal(api.findPlatformDriveOffers('',pricing,scoped.trip,undefined,uncertain).length,0);assert.equal(seen.match,0);
  phase='issue';const explicit=issue('show cars in Cairo',turns([...base,'same trip, my hotel budget is 1000 EUR per day']),cairo,owner).request;
  const acceptedScope=api.platformUserRequestScope(explicit);assert.equal(acceptedScope.trip,cairo);
  phase='match';seen.match=0;assert.equal(api.findPlatformDriveOffers('',pricing,cairo,undefined,explicit).length,0);assert.ok(seen.match>0);
 }finally{globals.driveBudgetState=old}
});
for(const [label,snapshot,wanted] of [['available',{},['synthetic-low']],['missing',null,[]],['expired',{expired:true},[]]]) test('the same issued request reaches the FX guard: '+label,()=>{
 const history=turns(['I need a car with a driver','my car budget is 200 EUR per day']),owner=api.createPlatformScopeOwner();
 const request=issue('show cars in Cairo',history,cairo,owner).request,original=globals.displayPrice;let calls=0;
 globals.displayPrice=(amount,currency,target,rate)=>{if(currency===target)return {amount,currency,unavailable:false};calls++;return !rate||rate.expired?{amount,currency,unavailable:true}:{amount:amount/4,currency:target,unavailable:false}};
 try{assert.deepEqual(Array.from(api.findPlatformDriveOffers('',{currency:'SAR',snapshot},cairo,undefined,request),x=>x.id),wanted);assert.ok(calls>0)}finally{globals.displayPrice=original}
});

for(const [base,hotel,fix,follow] of [
 [['I need a car with a driver','my car budget is 800 SAR per day'],'my hotel budget is 1000 EUR per day','same trip, set my car budget to 700 SAR per day','show cars in Cairo'],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'ميزانية الفندق 1000 يورو يومياً','نفس الرحلة، ميزانية السيارة 700 ريال يومياً','اعرض السيارات في القاهرة']
]) test('a confirmed same-scope correction and competing proposal survive the next user turn: '+fix,()=>{
 const history=turns([...base,hotel,fix]),owner=api.createPlatformScopeOwner(),{request}=issue(follow,history,null,owner);
 const scope=api.platformUserRequestScope(request);assert.notEqual(scope.tripStatus,'contested');
 const all=[...scope.history.filter(t=>t.role==='user').map(t=>norm(t.content)),norm(scope.message)];
 const state=driveBudgetState(all);assert.equal(state.confirmed.amount,'700');assert.ok(state.pending.some(x=>x.value.kind==='amount'&&x.value.amount==='1000'));
 assert.equal(api.findPlatformDriveOffers('',pricing,null,undefined,request).length,0);
});

for(const [base,hotel] of [
 [['I need a car with a driver','my car budget is 800 SAR per day'],'my hotel budget is 1000 EUR per day'],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'ميزانية الفندق 1000 يورو يومياً']
]) test('the current cross-service budget turn is also withheld without an attached trip: '+hotel,()=>{
 const owner=api.createPlatformScopeOwner(),request=issue(hotel,turns(base),null,owner).request;
 const scope=api.platformUserRequestScope(request);assert.equal(scope.tripStatus,'contested');assert.equal(scope.trip,null);
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.match(answer,/budget|request/i);assert.doesNotMatch(answer,/Synthetic car|500\.00|900\.00/i);
 assert.equal(api.findPlatformDriveOffers('',pricing,null,undefined,request).length,0);
});
test('cloned and serialized generated context does not expose the trip or become a user event',()=>{
 const context=api.platformContext('show cars',[],cairo),owner=api.createPlatformScopeOwner();
 const clone={...context},serialized=JSON.stringify(context),copy=JSON.parse(serialized);
 assert.doesNotMatch(serialized,/2026-12-12|2026-12-14|Cairo|800/i);
 assert.throws(()=>`${context}; do not use it`,/context.*coerced/i);
 for(const input of [clone,copy,{role:'user',content:clone},{role:'user',content:copy}]) {
  const request=api.platformUserRequest(input,[],cairo,owner);
  assert.equal(api.platformUserRequestScope(request),null);
  assert.doesNotMatch(api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer,/Synthetic car|2026-12-12|destination=cairo/i);
 }
});

for(const [hotel,answer] of [
 ['my hotel budget is 1000 EUR per day','same request'],
 ['ميزانية الفندق 1000 يورو يومياً','نفس الطلب']
]) test('the no-trip clarification accepts an explicit same-request answer: '+answer,()=>{
 const history=turns(['I need a car with a driver','my car budget is 800 SAR per day',hotel]);
 const owner=api.createPlatformScopeOwner(),request=issue(answer,history,null,owner).request,scope=api.platformUserRequestScope(request);
 assert.notEqual(scope.tripStatus,'contested');assert.equal(scope.trip,null);
 const state=driveBudgetState([...scope.history.filter(t=>t.role==='user').map(t=>norm(t.content)),norm(scope.message)]);
 assert.equal(state.confirmed.amount,'800');assert.ok(state.pending.some(x=>x.value.kind==='amount'&&x.value.amount==='1000'));
 assert.equal(api.findPlatformDriveOffers('',pricing,null,undefined,request).length,0);
});
for(const [hotel,answer] of [
 ['my hotel budget is 1000 EUR per day','separate request, show cars in Cairo'],
 ['ميزانية الفندق 1000 يورو يومياً','طلب منفصل، اعرض السيارات في القاهرة']
]) test('the no-trip clarification accepts an explicit separate-request answer: '+answer,()=>{
 const history=turns(['I need a car with a driver','my car budget is 800 SAR per day',hotel]);
 const owner=api.createPlatformScopeOwner(),request=issue(answer,history,null,owner).request,scope=api.platformUserRequestScope(request);
 assert.notEqual(scope.tripStatus,'contested');assert.equal(scope.trip,null);assert.equal(scope.history.length,0);
});
for(const answer of ['if I approve, same request','same request?','not the same request','same request; actually a separate request','إذا وافقت، نفس الطلب','هل نفس الطلب؟']) test('conditional, advisory or conflicting scope answers remain blocked: '+answer,()=>{
 const history=turns(['I need a car with a driver','my car budget is 800 SAR per day','my hotel budget is 1000 EUR per day']);
 const owner=api.createPlatformScopeOwner(),request=issue(answer,history,null,owner).request,scope=api.platformUserRequestScope(request);
 assert.equal(scope.tripStatus,'contested');assert.equal(api.findPlatformDriveOffers('',pricing,null,undefined,request).length,0);
});

for(const [hotel,answer,follow] of [
 ['my hotel budget is 1000 EUR per day','same request','show cars in Cairo'],
 ['ميزانية الفندق 1000 يورو يومياً','نفس الطلب','اعرض السيارات في القاهرة']
]) test('a same-request clarification survives the following turn without losing budgets: '+answer,()=>{
 const history=turns(['I need a car with a driver','my car budget is 800 SAR per day',hotel,answer]);
 const owner=api.createPlatformScopeOwner(),request=issue(follow,history,null,owner).request,scope=api.platformUserRequestScope(request);
 assert.notEqual(scope.tripStatus,'contested');
 const state=driveBudgetState([...scope.history.filter(t=>t.role==='user').map(t=>norm(t.content)),norm(scope.message)]);
 assert.equal(state.confirmed.amount,'800');assert.ok(state.pending.some(x=>x.value.kind==='amount'&&x.value.amount==='1000'));
 assert.equal(api.findPlatformDriveOffers('',pricing,null,undefined,request).length,0);
});
for(const answer of ['separate request','طلب منفصل']) test('a separate-request clarification does not resurrect earlier budgets on the following turn: '+answer,()=>{
 const history=turns(['I need a car with a driver','my car budget is 800 SAR per day','my hotel budget is 1000 EUR per day',answer]);
 const owner=api.createPlatformScopeOwner(),request=issue('show cars in Cairo',history,null,owner).request,scope=api.platformUserRequestScope(request);
 assert.notEqual(scope.tripStatus,'contested');assert.doesNotMatch(JSON.stringify(scope.history),/800|1000/);
});

for(const [hotel,answer,rejection] of [
 ['my hotel budget is 1000 EUR per day','same request','do not use my hotel budget 1000 EUR per day'],
 ['ميزانية الفندق 1000 يورو يومياً','نفس الطلب','لا تستخدم ميزانية الفندق 1000 يورو يومياً']
]) test('an explicit rejection of the other-service proposal can resolve that proposal without losing the car cap: '+rejection,()=>{
 const history=turns(['I need a car with a driver','my car budget is 800 SAR per day',hotel,answer,rejection]);
 const owner=api.createPlatformScopeOwner(),request=issue('show cars in Cairo',history,null,owner).request,scope=api.platformUserRequestScope(request);
 const state=driveBudgetState([...scope.history.filter(t=>t.role==='user').map(t=>norm(t.content)),norm(scope.message)]);
 assert.equal(state.confirmed.amount,'800');assert.equal(state.confirmed.currency,'SAR');
 assert.equal(state.pending.some(x=>x.value.kind==='amount'&&x.value.amount==='1000'),false);
 assert.deepEqual(Array.from(api.findPlatformDriveOffers('',pricing,null,undefined,request),x=>x.id),['synthetic-low']);
});

for(const [base,hotel,flight,reject] of [
 [['I need a car with a driver','my car budget is 800 SAR per day'],'my hotel budget is 1000 EUR per day','my flight budget is 1000 EUR per day','do not use my hotel budget 1000 EUR per day'],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'ميزانية الفندق 1000 يورو يومياً','ميزانية الطيران 1000 يورو يومياً','لا تستخدم ميزانية الفندق 1000 يورو يومياً']
]) test('a named other-service rejection resolves only the matching service proposal: '+reject,()=>{
 const state=driveBudgetState([...base,hotel,flight,reject].map(norm));
 assert.equal(state.confirmed.amount,'800');assert.equal(state.confirmed.currency,'SAR');
 assert.equal(state.pending.some(x=>x.sourceTurn===2),false);
 assert.equal(state.pending.some(x=>x.sourceTurn===3&&x.value.kind==='amount'&&x.value.amount==='1000'),true);
});
for(const [hotel,reject] of [
 ['my hotel budget is 1000 EUR per day','if I approve, do not use my hotel budget 1000 EUR per day'],
 ['my hotel budget is 1000 EUR per day','do not use my hotel budget 1000 EUR total'],
 ['my hotel budget is 1000 EUR per day','do not use my hotel budget 1000 SAR per day'],
 ['ميزانية الفندق 1000 يورو يومياً','إذا وافقت، لا تستخدم ميزانية الفندق 1000 يورو يومياً'],
 ['ميزانية الفندق 1000 يورو يومياً','لا تستخدم ميزانية الفندق 1000 يورو إجمالي']
]) test('a conditional or mismatched other-service rejection cannot clear its pending proposal: '+reject,()=>{
 const state=driveBudgetState(['I need a car with a driver','my car budget is 800 SAR per day',hotel,reject].map(norm));
 assert.equal(state.confirmed.amount,'800');assert.equal(state.pending.some(x=>x.sourceTurn===2&&x.value.kind==='amount'&&x.value.amount==='1000'),true);
});
test('a hotel rejection cannot clear an equally priced flight proposal',()=>{
 const state=driveBudgetState(['I need a car with a driver','my car budget is 800 SAR per day','my flight budget is 1000 EUR per day','do not use my hotel budget 1000 EUR per day'].map(norm));
 assert.equal(state.confirmed.amount,'800');assert.equal(state.pending.some(x=>x.sourceTurn===2),true);
});

test('a named rejection with a daily basis does not clear the same service trip-total proposal',()=>{
 const turns=['I need a car with a driver','my car budget is 800 SAR per day','my hotel budget is 1000 EUR per day','my hotel budget is 1000 EUR total','do not use my hotel budget 1000 EUR per day'];
 const state=driveBudgetState(turns.map(norm));assert.equal(state.confirmed.amount,'800');
 assert.equal(state.pending.some(x=>x.sourceTurn===2),false);
 assert.equal(state.pending.some(x=>x.sourceTurn===3&&x.value.kind==='amount'&&x.value.basis==='trip'),true);
});
test('a rejection without the stated currency and basis leaves an otherwise matching proposal pending',()=>{
 const state=driveBudgetState(['I need a car with a driver','my car budget is 800 SAR per day','my hotel budget is 1000 EUR per day','do not use my hotel budget 1000'].map(norm));
 assert.equal(state.confirmed.amount,'800');assert.equal(state.pending.some(x=>x.sourceTurn===2),true);
});

for(const [base,rejection,follow] of [
 [['I need a car with a driver','my car budget is 800 SAR per day'],'I do not want a hotel','show cars in Cairo'],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'لا أريد فندق','اعرض السيارات في القاهرة']
]) test('rejecting an unrelated service does not discard the existing no-trip car request: '+rejection,()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(base),first=issue(rejection,history,null,owner).request;
 const scoped=api.platformUserRequestScope(first);assert.notEqual(scoped.tripStatus,'contested');assert.equal(scoped.history.length,history.length);
 const next=issue(follow,[...history,{role:'user',content:rejection}],null,owner).request,scope=api.platformUserRequestScope(next);
 assert.notEqual(scope.tripStatus,'contested');
 assert.deepEqual(Array.from(api.findPlatformDriveOffers('',pricing,null,undefined,next),x=>x.id),['synthetic-low']);
});

for(const [base,proposal,reject] of [
 [['I need a car with a driver','my car budget is 800 SAR per day'],"the tour's budget is 800 SAR per day","do not use the tour's budget 800 SAR per day"],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'الجولة ميزانيتها 800 ريال يومياً','لا تستخدم ميزانية الجولة 800 ريال يومياً']
]) test('an unfamiliar named service with the same amount cannot erase the car budget: '+reject,()=>{
 const state=driveBudgetState([...base,proposal,reject].map(norm));
 assert.equal(state.confirmed.amount,'800');assert.equal(state.confirmed.currency,'SAR');
 assert.equal(state.pending.some(x=>x.sourceTurn===2),false);
});

for(const [base,reject] of [
 [['I need a car with a driver','my car budget is 800 SAR per day'],'do not use my current budget 800 SAR per day'],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'لا تستخدم ميزانيتي الحالية 800 ريال يومياً']
]) test('a current-budget adjective does not masquerade as another service: '+reject,()=>{
 const state=driveBudgetState([...base,reject].map(norm));assert.equal(state.confirmed,null);
});
