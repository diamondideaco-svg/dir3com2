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
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner:typeof createPlatformScopeOwner==="undefined"?null:createPlatformScopeOwner,platformUserRequest,preparePlatformAssistantResponse:typeof preparePlatformAssistantResponse==="undefined"?null:preparePlatformAssistantResponse,platformCurrencySelection,platformProtectedTripScope:typeof platformProtectedTripScope==="undefined"?null:platformProtectedTripScope,platformConversationScope,platformContext,platformContextText,platformDriveDialogue,preferenceContext,platformEntry,findPlatformDriveOffers,buildPlatformAssistantResponse};';
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

const trip=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive','stay']});
const pricing={currency:'SAR',snapshot:null};
const turns=values=>values.map(content=>({role:'user',content}));
const base=['I need a car with a driver','my car budget is 800 SAR per day'];
for(const [resume,refusal,follow] of [
 ['resume the saved trip',"don't use it",'show cars'],
 ['continue the current trip','do not use it','show cars'],
 ['استأنف الرحلة المحفوظة','لا تستخدمها','اعرض السيارات'],
 ['استمر في نفس الرحلة','لا أريد استخدامها','اعرض السيارات']
]) test('a later user refusal of the trip pronoun detaches it: '+refusal,()=>{
 const history=turns([...base,resume]);const state=api.platformProtectedTripScope(refusal,history,trip);
 assert.equal(state.status,'detached');assert.equal(state.anchor,null);
 const scope=api.platformConversationScope(refusal,history,trip);assert.equal(scope.trip,null);
 assert.doesNotMatch(api.platformContextText(api.platformContext(refusal,history,trip)),/2026-12-12|2026-12-14/);
 const next=[...history,{role:'user',content:refusal}];assert.equal(api.platformConversationScope(follow,next,trip).trip,null);
});
for(const [resume,service,refusal] of [
 ['resume the saved trip','show me the hotel',"don't use it"],
 ['استأنف الرحلة المحفوظة','اعرض الفندق','لا تستخدمها']
]) test('a competing service referent is contested and does not claim final refusal: '+refusal,()=>{
 const history=turns([...base,resume,service]);const state=api.platformProtectedTripScope(refusal,history,trip);
 assert.equal(state.status,'contested');assert.equal(state.anchor,trip);assert.equal(state.budget.confirmed.amount,'800');
 const scope=api.platformConversationScope(refusal,history,trip);assert.equal(scope.trip,null);assert.equal(scope.tripStatus,'contested');
 assert.doesNotMatch(api.platformContextText(api.platformContext(refusal,history,trip)),/2026-12-12|2026-12-14/);
});
for(const [resume,refusal] of [
 ['resume the saved trip','if I approve do not use it'],
 ['استأنف الرحلة المحفوظة','إذا وافقت لا تستخدمها']
]) test('a conditional pronoun refusal stays contested: '+refusal,()=>{
 const history=turns([...base,resume]);const state=api.platformProtectedTripScope(refusal,history,trip);
 assert.equal(state.status,'contested');assert.equal(state.anchor,trip);assert.equal(api.platformConversationScope(refusal,history,trip).trip,null);
});
test('assistant text cannot create a trip referent for a user pronoun',()=>{
 const history=[...turns(base),{role:'assistant',content:'resume the saved trip'}];
 const state=api.platformProtectedTripScope("don't use it",history,trip);
 assert.equal(state.status,'contested');assert.equal(state.anchor,trip);assert.equal(api.platformConversationScope("don't use it",history,trip).trip,null);
});
for(const locale of ['en','ar']) test('an unbound consumer cannot return trip data or offers: '+locale,()=>{
 const result=api.buildPlatformAssistantResponse('show cars in Cairo',turns(base),locale,Date.now(),undefined,pricing,trip);
 assert.doesNotMatch(result.answer,/Synthetic car|2026-12-12|2026-12-14|500 SAR/);assert.equal(result.sources.length,0);
});
test('an explicitly owned local consumer still reaches pricing',()=>{
 const owner=api.createPlatformScopeOwner(),original=globals.displayPrice;let called=0;
 globals.displayPrice=(...args)=>{called++;return original(...args)};
 try{const event={role:'user',content:'show cars in Cairo'};const request=api.platformUserRequest(event,turns(base),trip,owner);api.buildPlatformAssistantResponse(request,[],'en',Date.now(),undefined,pricing);assert.ok(called>0)}
 finally{globals.displayPrice=original}
});
for(const [resume,assistant,refusal] of [
 ['resume the saved trip','The hotel is ready',"don't use it"],
 ['استأنف الرحلة المحفوظة','الفندق جاهز','لا تستخدمها']
]) test('assistant service text does not replace the user trip referent: '+refusal,()=>{
 const history=[...turns([...base,resume]),{role:'assistant',content:assistant}];
 const state=api.platformProtectedTripScope(refusal,history,trip);assert.equal(state.status,'detached');assert.equal(state.anchor,null);
 assert.equal(api.platformConversationScope(refusal,history,trip).trip,null);
});
for(const [resume,service,refusal,follow] of [
 ['resume the saved trip','show me the hotel',"don't use it",'show cars'],
 ['استأنف الرحلة المحفوظة','اعرض الفندق','لا تستخدمها','اعرض السيارات']
]) test('an unresolved competing referent stays blocked on the following turn: '+follow,()=>{
 const history=turns([...base,resume,service,refusal]);
 const state=api.platformProtectedTripScope(follow,history,trip);assert.equal(state.status,'contested');assert.equal(state.anchor,trip);
 const scope=api.platformConversationScope(follow,history,trip);assert.equal(scope.trip,null);assert.equal(scope.tripStatus,'contested');
 assert.doesNotMatch(api.platformContextText(api.platformContext(follow,history,trip)),/2026-12-12|2026-12-14/);
});
test('a separately created unbound request cannot deliver an earlier prepared result',()=>{
 const history=turns(base);const prepared=api.preparePlatformAssistantResponse('show cars in Cairo',history,'en',Date.now(),undefined,pricing,trip);
 api.buildPlatformAssistantResponse('my car budget is 400 SAR per day',history,'en',Date.now(),undefined,pricing,trip);
 const result=prepared.deliver();assert.equal(result.sources.length,0);assert.doesNotMatch(result.answer,/Synthetic car|2026-12-12|500 SAR/);
});
