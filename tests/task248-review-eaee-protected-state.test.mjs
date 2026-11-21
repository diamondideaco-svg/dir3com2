import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveDialogue,driveDialogueCopy,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner,platformUserRequest,platformCurrencySelection,platformProtectedTripScope:typeof platformProtectedTripScope==="undefined"?null:platformProtectedTripScope,platformConversationScope,platformContext,platformContextText,platformDriveDialogue,preferenceContext,platformEntry,findPlatformDriveOffers,buildPlatformAssistantResponse};';
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
let testOwner;
beforeEach(()=>{testOwner=api.createPlatformScopeOwner()});
const buildFromUser=api.buildPlatformAssistantResponse;
api.buildPlatformAssistantResponse=(message,history,locale,now,family,pricing,trip)=>buildFromUser(api.platformUserRequest(message,history,trip,testOwner),[],locale,now,family,pricing);

offers.push({id:'synthetic-3600',currency:'SAR',chauffeur:3600,airport:3600});
const trip=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'EUR',families:['drive','stay']});
const baseEn=['I need a car with a driver','my car budget is 800 SAR per day'];
const baseAr=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
for(const [base,pending,follow,resume] of [
 [baseEn,'if I approve do not use the saved trip','show cars','resume the saved trip'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','اعرض السيارات','استأنف الرحلة المحفوظة']
]) test('protected trip facts persist while consumer projections and matching remain blocked: '+pending,()=>{
 const history=base.map(content=>({role:'user',content}));
 const protectedState=api.platformProtectedTripScope(pending,history,trip);
 assert.equal(protectedState.status,'contested');assert.equal(protectedState.anchor,trip);
 assert.equal(protectedState.budget.confirmed.amount,'800');assert.equal(protectedState.budget.confirmed.currency,'SAR');
 const scoped=api.platformConversationScope(pending,history,trip,testOwner);
 assert.equal(scoped.trip,null);assert.equal(scoped.history.length,0);assert.equal(scoped.tripStatus,'contested');
 const nextHistory=[...history,{role:'user',content:pending}];
 const nextProtected=api.platformProtectedTripScope(follow,nextHistory,trip);
 assert.equal(nextProtected.status,'contested');assert.equal(nextProtected.anchor,trip);assert.equal(nextProtected.budget.confirmed.amount,'800');
 const next=api.platformConversationScope(follow,nextHistory,trip,testOwner);
 assert.equal(next.trip,null);assert.equal(next.history.length,0);assert.equal(next.tripStatus,'contested');
 const context=api.platformContextText(api.platformContext(follow,nextHistory,trip));
 assert.doesNotMatch(context,/2026-12-12|800\s*(?:SAR|ريال)|Cairo|القاهرة/i);
 assert.equal(api.findPlatformDriveOffers(context,{currency:'SAR',snapshot:null},null).length,0);
 const result=api.buildPlatformAssistantResponse(follow,nextHistory,'en',Date.now(),'drive',{currency:'SAR',snapshot:null},trip);
 assert.match(result.answer,/continue the current trip or start a new trip/i);
 assert.doesNotMatch(result.answer,/3600|Synthetic car|2026-12-12/);
 const revalidation=api.platformProtectedTripScope(resume,nextHistory,trip);
 assert.equal(revalidation.status,'revalidation');assert.equal(revalidation.anchor,trip);assert.equal(revalidation.budget.confirmed.amount,'800');
 const resumed=api.platformConversationScope(resume,nextHistory,trip,testOwner);
 assert.equal(resumed.trip,null);assert.equal(resumed.tripStatus,'revalidation');
 const waiting=api.buildPlatformAssistantResponse(resume,nextHistory,'en',Date.now(),'drive',{currency:'SAR',snapshot:null},trip);
 assert.match(waiting.answer,/verify that it is still available for use/i);
 assert.doesNotMatch(waiting.answer,/3600|Synthetic car|2026-12-12/);
});
for(const text of [
 'if I approve start a new trip; I reject the saved trip completely',
 'if I approve start a new trip; I refuse the saved trip entirely',
 'إذا وافقت ابدأ رحلة جديدة؛ أرفض الرحلة المحفوظة نهائياً'
]) test('an independent explicit final rejection detaches the anchor: '+text,()=>{
 const decision=newTripRequested.decision(text);assert.equal(decision.refused,true);
 const history=baseEn.map(content=>({role:'user',content}));
 const state=api.platformProtectedTripScope(text,history,trip);
 assert.equal(state.status,'detached');assert.equal(state.anchor,null);
 const later=api.platformConversationScope('resume the saved trip',[...history,{role:'user',content:text}],trip,testOwner);
 assert.equal(later.trip,null);
 const result=api.buildPlatformAssistantResponse(text,history,'en',Date.now(),'drive',{currency:'SAR',snapshot:null},trip);
 assert.doesNotMatch(result.answer,/2026-12-12|3600|Synthetic car/);
});
for(const text of [
 'if I approve I reject the saved trip',
 'إذا وافقت أرفض الرحلة المحفوظة'
]) test('a conditional rejection remains contested, not final: '+text,()=>{
 const decision=newTripRequested.decision(text);assert.equal(decision.refused,false);assert.equal(decision.contested,true);
});
for(const text of [
 'if I approve; actually never display EUR under any circumstances',
 'إذا وافقت؛ بل لا تعرض اليورو أبداً تحت أي ظرف'
]) test('an unresolved conditional currency refusal blocks display without asserting a final rejection: '+text,()=>{
 const choice=api.platformCurrencySelection(text);assert.equal(Array.from(choice.excluded).includes('EUR'),false);
 assert.equal(Array.from(choice.contested).includes('EUR'),true);
 const history=baseEn.map(content=>({role:'user',content}));
 const r=api.buildPlatformAssistantResponse(text,history,'en',Date.now(),'drive',{currency:'EUR',snapshot:null},trip);
 assert.doesNotMatch(r.answer,/\d+(?:\.\d+)?\s*EUR|currency=EUR/);
});
for(const locale of ['en','ar']) test('fallback links respect the supplied currency exclusion: '+locale,()=>{
 const r=api.buildPlatformAssistantResponse('hello',[],locale,Date.now(),undefined,{currency:'EUR',snapshot:null,excludedCurrencies:['EUR']});
 assert.match(r.answer,/\[\/drive\?/);assert.match(r.answer,/\[\/stay\?/);assert.doesNotMatch(r.answer,/currency=EUR/);
});

for(const [base,pending,follow] of [
 [baseEn,'if I approve do not use the saved trip','show cars'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','اعرض السيارات']
]) test('the scope message itself cannot trigger unbounded direct matching: '+follow,()=>{
 const history=[...base.map(content=>({role:'user',content})),{role:'user',content:pending}];
 const scoped=api.platformConversationScope(follow,history,trip,testOwner);
 assert.equal(scoped.trip,null);assert.equal(scoped.tripStatus,'contested');
 assert.equal(api.findPlatformDriveOffers(scoped.message,{currency:'SAR',snapshot:null},scoped.trip).length,0);
});

for(const [base,pending,follow,resume] of [
 [baseEn,'if I approve do not use the saved trip','show cars','resume the saved trip'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','اعرض السيارات','استأنف الرحلة المحفوظة']
]) test('the planning reducer retains the confirmed cap while pending and revalidating: '+pending,()=>{
 for(const turns of [[...base,pending,follow],[...base,pending,resume]]) {
  const plan=driveDialogue(turns.map(norm),{city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'});
  assert.equal(plan?.budget?.amount,'800');assert.equal(plan?.budget?.currency,'SAR');
  assert.equal(plan?.kind,'clarify');assert.equal(plan?.question,'trip');
  assert.equal(api.findPlatformDriveOffers('show cars in Cairo',{currency:'SAR',snapshot:null},null,plan).length,0);
 }
 const history=[...base.map(content=>({role:'user',content})),{role:'user',content:pending}];
 const scoped=api.platformConversationScope(follow,history,trip,testOwner);
 assert.doesNotMatch(JSON.stringify(scoped),/2026-12-12|11111111-1111|800/);
});
for(const [base,proposal,pending] of [
 [baseEn,'if I approve my car budget is 1000 EUR per day','if I approve do not use the saved trip'],
 [baseAr,'إذا وافقت ميزانية السيارة 1000 يورو يومياً','إذا وافقت لا تستخدم الرحلة المحفوظة']
]) test('a different pending budget remains in protected state during trip ambiguity: '+pending,()=>{
 const history=[...base,proposal].map(content=>({role:'user',content}));
 const state=api.platformProtectedTripScope(pending,history,trip);
 assert.equal(state.status,'contested');assert.equal(state.budget.confirmed.amount,'800');
 assert.ok(state.budget.pending.some(x=>x.value.kind==='amount'&&x.value.amount==='1000'));
 const scoped=api.platformConversationScope(pending,history,trip,testOwner);
 assert.doesNotMatch(JSON.stringify(scoped),/800|1000|2026-12-12/);
});

for(const text of [
 'if I approve start a new trip; I reject the saved trip',
 'إذا وافقت ابدأ رحلة جديدة؛ أرفض الرحلة المحفوظة'
]) test('an ambiguously scoped rejection blocks the trip without claiming final refusal: '+text,()=>{
 const d=newTripRequested.decision(text);assert.equal(d.refused,false);assert.equal(d.contested,true);
 const history=baseEn.map(content=>({role:'user',content}));
 assert.equal(api.platformConversationScope(text,history,trip,testOwner).trip,null);
});
for(const text of [
 'do not reject the saved trip',
 'if I approve start a new trip; do not reject the saved trip',
 'لا ترفض الرحلة المحفوظة'
]) test('negating a rejection verb does not itself reject the trip: '+text,()=>{
 const d=newTripRequested.decision(text);assert.equal(d.refused,false);assert.equal(d.contested,false);
});
for(const text of [
 'I reject the hotel for the same trip',
 'أرفض الفندق في نفس الرحلة'
]) test('an explicitly rejected service is not a rejected trip: '+text,()=>{
 const d=newTripRequested.decision(text);assert.equal(d.refused,false);assert.equal(d.contested,false);
});

for(const text of [
 'if I approve start a new trip; ignore the saved trip outright',
 'إذا وافقت ابدأ رحلة جديدة؛ تجاهل الرحلة المحفوظة تماماً'
]) test('another independently final refusal cannot revive the protected anchor: '+text,()=>{
 const d=newTripRequested.decision(text);assert.equal(d.refused,true);
 const history=[...baseEn.map(content=>({role:'user',content})),{role:'user',content:text}];
 const state=api.platformProtectedTripScope('resume the saved trip',history,trip);
 assert.equal(state.status,'detached');assert.equal(state.anchor,null);
 assert.equal(api.platformConversationScope('resume the saved trip',history,trip,testOwner).trip,null);
});
for(const [base,pending] of [
 [baseEn,'if I approve do not use the saved trip'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة']
]) test('the protected history and confirmed cap are not the consumer projection: '+pending,()=>{
 const history=base.map(content=>({role:'user',content}));
 const state=api.platformProtectedTripScope(pending,history,trip);
 assert.deepEqual(Array.from(state.protectedTurns),base);
 assert.equal(state.anchor,trip);assert.equal(state.budget.confirmed.amount,'800');
 const projected=api.platformConversationScope(pending,history,trip,testOwner);
 assert.equal(projected.trip,null);assert.equal(projected.history.length,0);
 assert.doesNotMatch(JSON.stringify(projected),/800|2026-12-12|11111111-1111/);
});
