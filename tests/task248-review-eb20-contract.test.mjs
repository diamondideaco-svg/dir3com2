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
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner,platformUserRequest,platformUserRequestScope,platformCurrencySelection,platformProtectedTripScope:typeof platformProtectedTripScope==="undefined"?null:platformProtectedTripScope,platformConversationScope,platformContext,platformDriveDialogue,preferenceContext,platformEntry,findPlatformDriveOffers,buildPlatformAssistantResponse};';
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

offers.push({id:'synthetic-3600',currency:'SAR',chauffeur:3600,airport:3600});
const trip=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']});
const baseEn=['I need a car with a driver','my car budget is 800 SAR per day'];
const baseAr=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
const pricing={currency:'SAR',snapshot:null};
for(const [base,pending,compound] of [
 [baseEn,'if I approve do not use the saved trip','resume the saved trip and my car budget is 700 SAR per day'],
 [baseEn,'if I approve do not use the saved trip','continue the current trip and my car budget is 700 SAR per day'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','استأنف الرحلة المحفوظة وميزانية السيارة 700 ريال يومياً'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','استمر في نفس الرحلة وميزانية السيارة 700 ريال يومياً']
]) test('a compound continuation keeps its budget as an unbound turn through replay: '+compound,()=>{
 const history=[...base,pending].map(content=>({role:'user',content}));
 const first=api.platformProtectedTripScope(compound,history,trip);
 assert.equal(first.status,'revalidation');assert.equal(first.anchor,trip);assert.equal(first.budget.confirmed.amount,'800');
 assert.ok(first.deferredTurns.some(x=>x.text===compound&&x.sourceTurn===3));
 assert.ok(first.unboundBudgetInputs.some(x=>x.value.kind==='amount'&&x.value.amount==='700'&&x.scope==='unbound'&&x.sourceTurn===3));
 const replay=api.platformProtectedTripScope('show cars',[...history,{role:'user',content:compound}],trip);
 assert.equal(replay.status,'revalidation');assert.equal(replay.budget.confirmed.amount,'800');
 assert.ok(replay.unboundBudgetInputs.some(x=>x.value.kind==='amount'&&x.value.amount==='700'&&x.sourceTurn===3));
 const scope=api.platformConversationScope(compound,history,trip);
 assert.equal(scope.trip,null);assert.equal(scope.tripStatus,'revalidation');assert.doesNotMatch(JSON.stringify(scope),/700|800|2026-12-12/);
});
for(const [base,pending,compound] of [
 [baseEn,'if I approve do not use the saved trip','if I approve continue the current trip and my car budget is 700 SAR per day'],
 [baseEn,'if I approve do not use the saved trip','should I continue the current trip and my car budget is 700 SAR per day?'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','إذا وافقت استمر في نفس الرحلة وميزانية السيارة 700 ريال يومياً']
]) test('a conditional or advisory continuation does not authorize revalidation: '+compound,()=>{
 const history=[...base,pending].map(content=>({role:'user',content}));
 const state=api.platformProtectedTripScope(compound,history,trip);
 assert.equal(state.status,'contested');assert.equal(state.anchor,trip);assert.equal(state.budget.confirmed.amount,'800');
 assert.ok(state.deferredTurns.some(x=>x.text===compound));assert.equal(api.platformConversationScope(compound,history,trip).trip,null);
});
for(const event of ['if I approve do not use the saved trip','my car budget is 400 SAR per day']) test('an issued old scope cannot be replayed after a later objection or cap correction: '+event,()=>{
 const history=baseEn.map(content=>({role:'user',content}));
 const owner=api.createPlatformScopeOwner();
 const oldEvent={role:'user',content:'show cars in Cairo'};
 const oldRequest=api.platformUserRequest(oldEvent,history,trip,owner);
 assert.deepEqual(Array.from(api.findPlatformDriveOffers('show cars in Cairo',pricing,trip,undefined,oldRequest),x=>x.id),['synthetic-low']);
 const nextEvent={role:'user',content:event};
 const nextRequest=api.platformUserRequest(nextEvent,history,trip,owner);
 const next=api.platformUserRequestScope(nextRequest);
 const nextTrip=next.trip;
 assert.equal(api.findPlatformDriveOffers(event,pricing,nextTrip,undefined,nextRequest).length,0);
 assert.equal(api.findPlatformDriveOffers('show cars in Cairo',pricing,trip,undefined,oldRequest).length,0);
});
test('a real issued active scope reaches budget parsing and filters the synthetic catalogue',()=>{
 const history=baseEn.map(content=>({role:'user',content}));
 const owner=api.createPlatformScopeOwner(),event={role:'user',content:'show cars in Cairo'};
 const request=api.platformUserRequest(event,history,trip,owner);
 const originalBudget=globals.driveBudgetState,originalPrice=globals.displayPrice;
 let budgetCalls=0,priceCalls=0;
 globals.driveBudgetState=(...args)=>{budgetCalls++;return originalBudget(...args)};
 globals.displayPrice=(...args)=>{priceCalls++;return originalPrice(...args)};
 try{
  const got=api.findPlatformDriveOffers('show cars in Cairo',pricing,trip,undefined,request);
  assert.deepEqual(Array.from(got,x=>x.id),['synthetic-low']);assert.ok(budgetCalls>0);assert.ok(priceCalls>0);
 }finally{globals.driveBudgetState=originalBudget;globals.displayPrice=originalPrice}
});
for(const later of [
 'do not change my budget from 800 SAR to 1000 EUR',
 'if I approve my car budget is 1000 EUR per day',
 'do not use my car budget of 800 SAR per day'
]) test('an issued scope reaches the budget guard for a negative or pending change: '+later,()=>{
 const history=baseEn.map(content=>({role:'user',content}));
 const owner=api.createPlatformScopeOwner(),event={role:'user',content:later};
 const request=api.platformUserRequest(event,history,trip,owner);
 const scope=api.platformUserRequestScope(request);
 const original=globals.driveBudgetState;let calls=0;
 globals.driveBudgetState=(...args)=>{calls++;return original(...args)};
 try{
  const got=api.findPlatformDriveOffers(later,pricing,scope.trip,undefined,request);
  assert.ok(calls>0,'budget reducer must actually execute');
  if(later.startsWith('do not change')) assert.deepEqual(Array.from(got,x=>x.id),['synthetic-low']);
  else assert.equal(got.length,0);
 }finally{globals.driveBudgetState=original}
});

// Pure, synthetic contract model only. It is not imported by the product and
// cannot prove identity, consent, source freshness or server authorization.
function referenceLeaseModel(source,sourceVersion,expiresAt) {
 let version=0;const issued=new WeakMap();
 return {
  issue(requestId,now){const lease={};issued.set(lease,{requestId,source,sourceVersion,version,expiresAt});return lease},
  change(nextSourceVersion=sourceVersion){version++;sourceVersion=nextSourceVersion},
  permits(lease,requestId,currentSource,currentSourceVersion,now){
   const r=issued.get(lease);
   return !!r && r.requestId===requestId && r.source===currentSource && r.sourceVersion===currentSourceVersion
    && r.version===version && now<r.expiresAt;
  }
 };
}
test('reference model binds request, source, version and expiry, and isolates sessions',()=>{
 const first=referenceLeaseModel('trip-A','revision-1',100),other=referenceLeaseModel('trip-B','revision-1',100);
 const a=first.issue('request-A',10),b=other.issue('request-B',10);
 assert.equal(first.permits(a,'request-A','trip-A','revision-1',20),true);
 assert.equal(first.permits(a,'request-other','trip-A','revision-1',20),false);
 assert.equal(first.permits(a,'request-A','trip-A','revision-1',100),false);
 assert.equal(other.permits(a,'request-A','trip-A','revision-1',20),false);
 first.change('revision-2');
 assert.equal(first.permits(a,'request-A','trip-A','revision-1',20),false);
 assert.equal(other.permits(b,'request-B','trip-B','revision-1',20),true);
});

for(const [base,pending,compound] of [
 [baseEn,'if I approve do not use the saved trip','resume the saved trip and if I approve my car budget is 1000 EUR per day'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','استأنف الرحلة المحفوظة وإذا وافقت ميزانية السيارة 1000 يورو يومياً']
]) test('a clear continuation does not promote a conditional budget in the remainder: '+compound,()=>{
 const history=[...base,pending].map(content=>({role:'user',content}));
 const state=api.platformProtectedTripScope(compound,history,trip);
 assert.equal(state.status,'revalidation');assert.equal(state.budget.confirmed.amount,'800');
 assert.ok(state.unboundBudgetInputs.some(x=>x.value.kind==='amount'&&x.value.amount==='1000'&&x.scope==='unbound'&&x.conditional===true));
 assert.equal(api.platformConversationScope(compound,history,trip).trip,null);
});
for(const [base,pending,compound] of [
 [baseEn,'if I approve do not use the saved trip','resume the saved trip if I approve and my car budget is 700 SAR per day'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','استأنف الرحلة المحفوظة إذا وافقت وميزانية السيارة 700 ريال يومياً']
]) test('a condition on the continuation itself remains contested: '+compound,()=>{
 const history=[...base,pending].map(content=>({role:'user',content}));
 const state=api.platformProtectedTripScope(compound,history,trip);
 assert.equal(state.status,'contested');assert.equal(state.budget.confirmed.amount,'800');assert.equal(api.platformConversationScope(compound,history,trip).trip,null);
});

for(const [base,pending,compound] of [
 [baseEn,'if I approve do not use the saved trip','resume the saved trip and do not use the saved trip'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','استأنف الرحلة المحفوظة ولا تستخدم الرحلة المحفوظة']
]) test('a later explicit trip refusal in a compound turn remains detached: '+compound,()=>{
 const history=[...base,pending].map(content=>({role:'user',content}));
 const state=api.platformProtectedTripScope(compound,history,trip);
 assert.equal(state.status,'detached');assert.equal(state.anchor,null);
 assert.equal(api.platformConversationScope(compound,history,trip).trip,null);
});
test('reference model keeps two sessions isolated even for the same synthetic source',()=>{
 const first=referenceLeaseModel('trip-A','revision-1',100),other=referenceLeaseModel('trip-A','revision-1',100);
 const a=first.issue('request-A',10),b=other.issue('request-B',10);
 assert.equal(first.permits(a,'request-A','trip-A','revision-1',20),true);
 assert.equal(first.permits(b,'request-B','trip-A','revision-1',20),false);
 first.change('revision-2');
 assert.equal(first.permits(a,'request-A','trip-A','revision-1',20),false);
 assert.equal(other.permits(b,'request-B','trip-A','revision-1',20),true);
});

for(const [label,snapshot,expected] of [
 ['synthetic available FX',{expired:false},['synthetic-low']],
 ['synthetic unavailable FX',null,[]],
 ['synthetic expired FX',{expired:true},[]]
]) test('an issued scope reaches conversion and never guesses FX: '+label,()=>{
 const history=['I need a car with a driver','my car budget is 200 EUR per day'].map(content=>({role:'user',content}));
 const owner=api.createPlatformScopeOwner(),event={role:'user',content:'show cars in Cairo'};
 const request=api.platformUserRequest(event,history,trip,owner);
 const original=globals.displayPrice;let conversions=0;
 globals.displayPrice=(amount,currency,target,rate)=>{
  if(currency===target)return {amount,currency,target,unavailable:false};
  conversions++;
  if(!rate||rate.expired)return {amount,currency,unavailable:true};
  return {amount:amount/4,currency:target,unavailable:false};
 };
 try{
  const selected=api.findPlatformDriveOffers('show cars in Cairo',{currency:'SAR',snapshot},trip,undefined,request);
  assert.ok(conversions>0);assert.deepEqual(Array.from(selected,x=>x.id),expected);
 }finally{globals.displayPrice=original}
});

test('the deferred source is the original user turn, not an assistant assertion',()=>{
 const compound='resume the saved trip and my car budget is 700 SAR per day';
 const history=[{role:'user',content:baseEn[0]},{role:'assistant',content:'Synthetic question'},
  {role:'user',content:baseEn[1]},{role:'user',content:'if I approve do not use the saved trip'}];
 const state=api.platformProtectedTripScope(compound,history,trip);
 assert.equal(state.status,'revalidation');
 assert.ok(state.deferredTurns.some(x=>x.text===compound&&x.sourceTurn===3));
 assert.ok(state.unboundBudgetInputs.some(x=>x.value.kind==='amount'&&x.value.amount==='700'&&x.sourceTurn===3));
 assert.equal(state.deferredTurns.some(x=>x.text==='Synthetic question'),false);
});

for(const later of [
 'لا تغير ميزانيتي من 800 ريال إلى 1000 يورو',
 'إذا وافقت ميزانية السيارة 1000 يورو يومياً',
 'لا تستخدم ميزانية السيارة 800 ريال يومياً'
]) test('a scoped Arabic request reaches the budget reducer and its guard: '+later,()=>{
 const history=baseAr.map(content=>({role:'user',content}));
 const owner=api.createPlatformScopeOwner(),event={role:'user',content:later};
 const request=api.platformUserRequest(event,history,trip,owner);
 const scope=api.platformUserRequestScope(request);
 const original=globals.driveBudgetState;let calls=0;
 globals.driveBudgetState=(...args)=>{calls++;return original(...args)};
 try{
  const got=api.findPlatformDriveOffers(later,pricing,scope.trip,undefined,request);
  assert.ok(calls>0,'budget reducer must actually execute');
  if(later.startsWith('لا تغير'))assert.deepEqual(Array.from(got,x=>x.id),['synthetic-low']);
  else assert.equal(got.length,0);
 }finally{globals.driveBudgetState=original}
});
