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
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner:typeof createPlatformScopeOwner==="undefined"?null:createPlatformScopeOwner,platformUserRequest,platformUserRequestScope,preparePlatformAssistantResponse:typeof preparePlatformAssistantResponse==="undefined"?null:preparePlatformAssistantResponse,platformCurrencySelection,platformProtectedTripScope:typeof platformProtectedTripScope==="undefined"?null:platformProtectedTripScope,platformConversationScope,platformContext,platformContextText,platformDriveDialogue,preferenceContext,platformEntry,findPlatformDriveOffers,buildPlatformAssistantResponse};';
const offers=[{id:'synthetic-low',currency:'SAR',chauffeur:500,airport:500},{id:'synthetic-high',currency:'SAR',chauffeur:900,airport:900}];
const globals={URL,URLSearchParams,cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,
 driveDialogue,driveDialogueCopy,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage,
 conversationTopicChange:()=>null,conversationIntent:()=>null,conversationReply:()=>null,withoutNegativeActions:x=>x,validSearchDate:()=>true,
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null,
 DRIVE_OFFERS:offers,vehicleFor:()=>({make:'Toyota',model:'Corolla',ar:'تويوتا',passengers:4}),vehicleTitle:()=> 'Synthetic car',
 displayPrice:(amount,currency,target)=>({amount:currency===target?amount:amount/4,currency:target,unavailable:false,converted:currency!==target}),
 driveOwnerAvailabilityCopy:()=>'',driveModelReferenceCopy:()=>null,cairoInstant:()=>null,
 serviceEntryHref:(family,params)=>'/'+family+'?'+params.toString(),serverReplyLink:(label,href)=>label+' ['+href+']',
 serverReplySegments:()=>({segments:[],push(...v){this.segments.push(...v)}}),renderServerReply:segments=>segments.join(' '),
 CORE_REQUIRED_DIALOGUE_UNITS:'requiredUnits',AI2_DABRA_CONVERSATION_COPY:{en:{},ar:{}}};
const api=runInNewContext(code,globals);

const trip=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']});
const baseEn=['I need a car with a driver','my car budget is 800 SAR per day'];
const baseAr=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
const pricing={currency:'SAR',snapshot:null};
const turns=values=>values.map(content=>({role:'user',content}));

for(const [base,phrase,follow] of [
 [baseEn,"resume the saved trip and don't use it",'show cars'],
 [baseAr,'استأنف الرحلة المحفوظة ولا تستخدمها','اعرض السيارات'],
 [baseEn,'continue the current trip; do not use it','show cars'],
 [baseAr,'استمر في نفس الرحلة؛ لا تستخدمها','اعرض السيارات']
]) test('negative pronoun cannot expose a trip on the same or next turn: '+phrase,()=>{
 const history=turns(base),scope=api.platformConversationScope(phrase,history,trip);
 assert.equal(scope.trip,null);assert.doesNotMatch(api.platformContextText(api.platformContext(phrase,history,trip)),/2026-12-12|2026-12-14/);
 const next=api.platformConversationScope(follow,[...history,{role:'user',content:phrase}],trip);
 assert.equal(next.trip,null);assert.doesNotMatch(api.platformContextText(api.platformContext(follow,[...history,{role:'user',content:phrase}],trip)),/2026-12-12|2026-12-14/);
});
for(const phrase of [
 'resume the saved trip and do not use the hotel',
 'continue the current trip but do not use the hotel',
 'استأنف الرحلة المحفوظة ولا تستخدم الفندق',
 'استمر في نفس الرحلة لكن لا تستخدم الفندق'
]) test('explicit refusal of a hotel does not become refusal of the trip: '+phrase,()=>{
 const scope=api.platformConversationScope(phrase,[],trip);assert.equal(scope.trip,trip);
});
for(const [base,previous,phrase] of [
 [baseEn,'if I approve do not use the saved trip','if I approve do not use the saved trip and my car budget is 700 SAR per day and three passengers'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','إذا وافقت لا تستخدم الرحلة المحفوظة وميزانية السيارة 700 ريال يومياً وثلاثة مسافرين']
]) test('a contested composite turn retains its source, condition and unbound facts: '+phrase,()=>{
 const history=turns([...base,previous]);const protectedState=api.platformProtectedTripScope(phrase,history,trip);
 assert.equal(protectedState.status,'contested');assert.equal(protectedState.anchor,trip);assert.equal(protectedState.budget.confirmed.amount,'800');
 assert.ok(protectedState.deferredTurns.some(x=>x.text===phrase&&x.sourceTurn===3));
 assert.ok(protectedState.unboundBudgetInputs.some(x=>x.value.kind==='amount'&&x.value.amount==='700'&&x.scope==='unbound'&&x.sourceTurn===3&&x.conditional));
 const replay=api.platformProtectedTripScope('show cars',[...history,{role:'user',content:phrase}],trip);
 assert.equal(replay.status,'contested');assert.ok(replay.unboundBudgetInputs.some(x=>x.value.amount==='700'&&x.sourceTurn===3));
 assert.equal(api.platformConversationScope(phrase,history,trip).trip,null);
});
for(const event of ['if I approve do not use the saved trip','my car budget is 400 SAR per day']) test('one explicit lifecycle owner revokes old matching on a new turn: '+event,()=>{
 assert.equal(typeof api.createPlatformScopeOwner,'function');const owner=api.createPlatformScopeOwner();
 const history=turns(baseEn),oldEvent={role:'user',content:'show cars in Cairo'};
 const old=api.platformUserRequest(oldEvent,history,trip,owner);
 assert.deepEqual(Array.from(api.findPlatformDriveOffers('show cars in Cairo',pricing,trip,undefined,old),x=>x.id),['synthetic-low']);
 const nextEvent={role:'user',content:event},next=api.platformUserRequest(nextEvent,history,trip,owner);
 const nextScope=api.platformUserRequestScope(next);
 assert.equal(api.findPlatformDriveOffers(event,pricing,nextScope.trip,undefined,next).length,0);
 assert.equal(api.findPlatformDriveOffers('show cars in Cairo',pricing,trip,undefined,old).length,0);
});
test('owners isolate contexts even when their synthetic source IDs are equal',()=>{
 const a=api.createPlatformScopeOwner(),b=api.createPlatformScopeOwner(),history=turns(baseEn);
 const event={role:'user',content:'show cars in Cairo'};
 const one=api.platformUserRequest(event,history,trip,a),two=api.platformUserRequest(event,history,trip,b);
 api.platformUserRequest('my car budget is 400 SAR per day',history,trip,a);
 assert.equal(api.findPlatformDriveOffers('',pricing,trip,undefined,one).length,0);
 assert.deepEqual(Array.from(api.findPlatformDriveOffers('',pricing,trip,undefined,two),x=>x.id),['synthetic-low']);
});
test('source replacement invalidates previously issued work in that owner',()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(baseEn);
 const previous=api.platformUserRequest('show cars in Cairo',history,trip,owner);
 const replacement={...trip,id:'22222222-2222-4222-8222-222222222222'};
 api.platformUserRequest('show cars in Cairo',history,replacement,owner);
 assert.equal(api.findPlatformDriveOffers('',pricing,trip,undefined,previous).length,0);
});
test('the actual response consumer withholds a result invalidated while pricing',()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(baseEn),original=globals.displayPrice;let called=0;
 globals.displayPrice=(...args)=>{called++;owner.invalidate();return original(...args)};
 try{
  const event={role:'user',content:'show cars in Cairo'};
  const request=api.platformUserRequest(event,history,trip,owner);
  const response=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),undefined,pricing);
  assert.ok(called>0,'pricing guard must be reached');assert.doesNotMatch(response.answer,/Synthetic car|2026-12-12|2026-12-14|500 SAR/);
 }finally{globals.displayPrice=original}
});
test('without an explicit owner an issued projection is not a matching authority',()=>{
 const scope=api.platformConversationScope('show cars in Cairo',turns(baseEn),trip);
 assert.equal(api.findPlatformDriveOffers('',pricing,trip,undefined,scope).length,0);
});
for(const phrase of [
 "resume the saved trip to the hotel and don't use it",
 'استأنف الرحلة المحفوظة إلى الفندق ولا تستخدمها'
]) test('an ambiguous pronoun after two subjects withholds the trip: '+phrase,()=>{
 const scope=api.platformConversationScope(phrase,[],trip);assert.equal(scope.trip,null);
 assert.doesNotMatch(api.platformContextText(api.platformContext(phrase,[],trip)),/2026-12-12|2026-12-14/);
});
for(const phrase of [
 "resume the saved trip; use the hotel; don't use it",
 'استأنف الرحلة المحفوظة؛ استخدم الفندق؛ لا تستخدمها'
]) test('an explicitly intervening hotel remains the pronoun subject: '+phrase,()=>{
 const scope=api.platformConversationScope(phrase,[],trip);assert.equal(scope.trip,trip);
});
for(const [base,later,expected] of [
 [baseEn,'do not change my budget from 800 SAR to 1000 EUR',['synthetic-low']],
 [baseEn,'if I approve my car budget is 1000 EUR per day',[]],
 [baseEn,'do not use my car budget of 800 SAR per day',[]],
 [baseAr,'لا تغير ميزانيتي من 800 ريال إلى 1000 يورو',['synthetic-low']],
 [baseAr,'إذا وافقت ميزانية السيارة 1000 يورو يومياً',[]],
 [baseAr,'لا تستخدم ميزانية السيارة 800 ريال يومياً',[]]
]) test('an owned scope reaches the reducer and budget guard: '+later,()=>{
 const owner=api.createPlatformScopeOwner(),event={role:'user',content:later};
 const request=api.platformUserRequest(event,turns(base),trip,owner),scope=api.platformUserRequestScope(request),original=globals.driveBudgetState;let calls=0;
 globals.driveBudgetState=(...args)=>{calls++;return original(...args)};
 try{
  const got=api.findPlatformDriveOffers(later,pricing,scope.trip,undefined,request);
  assert.ok(calls>0,'the budget reducer must be reached');assert.deepEqual(Array.from(got,x=>x.id),expected);
 }finally{globals.driveBudgetState=original}
});
for(const [label,snapshot,expected] of [['available',{},['synthetic-low']],['missing',null,[]],['expired',{expired:true},[]]]) test('owned matching reaches the synthetic FX guard: '+label,()=>{
 const history=turns(['I need a car with a driver','my car budget is 200 EUR per day']),owner=api.createPlatformScopeOwner();
 const event={role:'user',content:'show cars in Cairo'};
 const request=api.platformUserRequest(event,history,trip,owner),original=globals.displayPrice;let calls=0;
 globals.displayPrice=(amount,currency,target,rate)=>{if(currency===target)return {amount,currency,unavailable:false};calls++;return !rate||rate.expired?{amount,currency,unavailable:true}:{amount:amount/4,currency:target,unavailable:false}};
 try{assert.deepEqual(Array.from(api.findPlatformDriveOffers('',{currency:'SAR',snapshot},trip,undefined,request),x=>x.id),expected);assert.ok(calls>0)}
 finally{globals.displayPrice=original}
});
test('an unused old scope is also invalid after a later local decision',()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(baseEn),old=api.platformUserRequest('show cars in Cairo',history,trip,owner);
 api.platformUserRequest('my car budget is 400 SAR per day',history,trip,owner);
 assert.equal(api.findPlatformDriveOffers('',pricing,trip,undefined,old).length,0);
});
test('an owned scope rejects forged copies and source-field mutation',()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(baseEn),changing={...trip,families:[...trip.families]};
 const request=api.platformUserRequest('show cars in Cairo',history,changing,owner),scope=api.platformUserRequestScope(request);
 assert.deepEqual(Array.from(api.findPlatformDriveOffers('',pricing,changing,undefined,request),x=>x.id),['synthetic-low']);
 assert.equal(api.findPlatformDriveOffers('',pricing,changing,undefined,{...scope}).length,0);
 changing.budget=200;assert.equal(api.findPlatformDriveOffers('',pricing,changing,undefined,scope).length,0);
});
for(const [base,event,locale] of [
 [baseEn,'if I approve do not use the saved trip','en'],
 [baseEn,'my car budget is 400 SAR per day','en'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','ar'],
 [baseAr,'ميزانية السيارة 400 ريال يومياً','ar']
]) test('a prepared local result is rechecked after a later turn before delivery: '+event,()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(base);
 const request=api.platformUserRequest('show cars in Cairo',history,trip,owner);
 const prepared=api.preparePlatformAssistantResponse(request,[],locale,Date.now(),undefined,pricing);
 assert.deepEqual(Object.keys(prepared),['deliver']);
 api.platformUserRequest(event,history,trip,owner);
 const delivered=prepared.deliver();assert.doesNotMatch(delivered.answer,/Synthetic car|2026-12-12|2026-12-14|500 SAR/);
 assert.equal(delivered.sources.length,0);
});
