import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from './fixtures/task258-platform-vm.mjs';
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
let testOwner;
beforeEach(()=>{testOwner=api.createPlatformScopeOwner()});
const buildFromUser=api.buildPlatformAssistantResponse;
api.buildPlatformAssistantResponse=(message,history,locale,now,family,pricing,trip)=>buildFromUser(api.platformUserRequest(message,history,trip,testOwner),[],locale,now,family,pricing);

offers.push({id:'synthetic-3600',currency:'SAR',chauffeur:3600,airport:3600});
const trip=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']});
const prefs={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const baseEn=['I need a car with a driver','my car budget is 800 SAR per day'];
const baseAr=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
const pricing={currency:'EUR',snapshot:null};
for(const [base,pending,clarifications] of [
 [baseEn,'if I approve do not use the saved trip',['resume the saved trip','continue the current trip','keep the same trip']],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة',['استأنف الرحلة المحفوظة','استمر في نفس الرحلة','أبق نفس الرحلة']]
]) for(const clarification of clarifications) test('an explicit continuation reaches revalidation without exposing the anchor: '+clarification,()=>{
 const history=[...base.map(content=>({role:'user',content})),{role:'user',content:pending}];
 const state=api.platformProtectedTripScope(clarification,history,trip);
 assert.equal(state.status,'revalidation');assert.equal(state.anchor,trip);
 assert.equal(state.budget.confirmed.amount,'800');
 const projection=api.platformConversationScope(clarification,history,trip,testOwner);
 assert.equal(projection.trip,null);assert.equal(projection.history.length,0);assert.equal(projection.tripStatus,'revalidation');
 assert.doesNotMatch(JSON.stringify(projection),/2026-12-12|11111111-1111|800/);
 const result=api.buildPlatformAssistantResponse(clarification,history,'en',Date.now(),'drive',pricing,trip);
 assert.match(result.answer,/verify that it is still available for use/i);
 assert.doesNotMatch(result.answer,/Synthetic car|3600|2026-12-12/);
});
for(const [base,pending,follow] of [
 [baseEn,'if I approve do not use the saved trip','show cars in Cairo'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','اعرض السيارات في القاهرة']
]) test('a contested structured scope blocks matching for every appended message: '+follow,()=>{
 const history=[...base.map(content=>({role:'user',content})),{role:'user',content:pending}];
 const request=api.platformUserRequest(follow,history,trip,testOwner);
 const scope=api.platformUserRequestScope(request);
 assert.equal(scope.tripStatus,'contested');assert.equal(scope.trip,null);
 const variants=[scope.message,scope.message+'; '+follow,follow+'; '+scope.message,
  scope.message+'; '+follow+'; car budget 1000 EUR per day',follow];
 for(const text of variants) {
  assert.equal(api.findPlatformDriveOffers(text,pricing,null,undefined,scope).length,0,text);
  assert.equal(api.findPlatformDriveOffers(text,pricing,null).length,0,'missing scope: '+text);
 }
});
test('an active structured scope binds matching to its user-derived 800 SAR cap',()=>{
 const history=baseEn.map(content=>({role:'user',content}));
 const request=api.platformUserRequest('show cars in Cairo',history,trip,testOwner);
 const scope=api.platformUserRequestScope(request);
 const plan=driveDialogue([...baseEn,'show cars in Cairo'].map(norm),prefs);
 const selected=api.findPlatformDriveOffers('show cars in Cairo',pricing,trip,plan,scope);
 assert.deepEqual(Array.from(selected,x=>x.id),['synthetic-low']);
 const tampered=api.findPlatformDriveOffers('show cars in Cairo; car budget 1000 EUR per day',pricing,trip,undefined,scope);
 assert.deepEqual(Array.from(tampered,x=>x.id),['synthetic-low']);
 assert.equal(api.findPlatformDriveOffers('show cars in Cairo',pricing,trip,plan,{...scope}).length,0);
 assert.equal(api.findPlatformDriveOffers('show cars in Cairo',pricing,null,plan,scope).length,0);
});
for(const [base,pending,update,conditional,resume] of [
 [baseEn,'if I approve do not use the saved trip','my car budget is 700 SAR per day','if I approve my car budget is 1000 EUR per day','keep the same trip'],
 [baseAr,'إذا وافقت لا تستخدم الرحلة المحفوظة','ميزانية السيارة 700 ريال يومياً','إذا وافقت ميزانية السيارة 1000 يورو يومياً','استمر في نفس الرحلة']
]) test('post-objection budgets remain unbound proposals until scope and source are verified: '+update,()=>{
 const history=[...base,pending,update,conditional].map(content=>({role:'user',content}));
 const state=api.platformProtectedTripScope(resume,history,trip);
 assert.equal(state.status,'revalidation');assert.equal(state.anchor,trip);
 assert.equal(state.budget.confirmed.amount,'800');assert.equal(state.budget.confirmed.currency,'SAR');
 assert.ok(state.unboundBudgetInputs.some(x=>x.value.kind==='amount'&&x.value.amount==='700'&&x.value.currency==='SAR'&&x.scope==='unbound'));
 assert.ok(state.unboundBudgetInputs.some(x=>x.value.kind==='amount'&&x.value.amount==='1000'&&x.value.currency==='EUR'&&x.scope==='unbound'&&x.conditional===true));
 const request=api.platformUserRequest(resume,history,trip,testOwner);
 const scope=api.platformUserRequestScope(request);
 assert.equal(scope.trip,null);assert.equal(scope.tripStatus,'revalidation');
 assert.doesNotMatch(JSON.stringify(scope),/700|1000|800|2026-12-12/);
 assert.equal(api.findPlatformDriveOffers('show cars in Cairo',pricing,null,undefined,scope).length,0);
});

test('mutating a returned scope cannot change its recorded budget facts',()=>{
 const history=baseEn.map(content=>({role:'user',content}));
 const request=api.platformUserRequest('show cars in Cairo',history,trip,testOwner);
 const scope=api.platformUserRequestScope(request);
 scope.message='show cars in Cairo, car budget 1000 EUR per day';
 scope.history[1].content='my car budget is 1000 EUR per day';
 const selected=api.findPlatformDriveOffers(scope.message,pricing,trip,undefined,scope);
 assert.deepEqual(Array.from(selected,x=>x.id),['synthetic-low']);
});
test('a saved budget without a temporal basis is not treated as an open car cap',()=>{
 const request=api.platformUserRequest('show cars in Cairo',[],trip,testOwner);
 const scope=api.platformUserRequestScope(request);
 assert.equal(api.findPlatformDriveOffers(scope.message,pricing,trip,undefined,scope).length,0);
});

test('a changed trip object invalidates the issued request scope',()=>{
 const changing={...trip,families:[...trip.families]};
 const history=baseEn.map(content=>({role:'user',content}));
 const request=api.platformUserRequest('show cars in Cairo',history,changing,testOwner);
 const scope=api.platformUserRequestScope(request);
 changing.budget=null;
 assert.equal(api.findPlatformDriveOffers(scope.message,pricing,changing,undefined,scope).length,0);
});
