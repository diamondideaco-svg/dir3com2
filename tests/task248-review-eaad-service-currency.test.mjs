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
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner,platformUserRequest,platformUserRequestScope,platformCurrencySelection,platformConversationScope,platformContext,platformDriveDialogue,preferenceContext,findPlatformDriveOffers,buildPlatformAssistantResponse};';
const offers=[{id:'synthetic-low',currency:'SAR',chauffeur:500,airport:500},{id:'synthetic-high',currency:'SAR',chauffeur:900,airport:900}];
const globals={URL,URLSearchParams,cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,
 driveDialogue,driveDialogueCopy,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage,
 conversationTopicChange:()=>null,conversationIntent:()=>null,conversationReply:()=>null,withoutNegativeActions:x=>x,validSearchDate:()=>true,
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null,
 DRIVE_OFFERS:offers,vehicleFor:()=>({make:'Toyota',model:'Corolla',ar:'تويوتا',passengers:4}),vehicleTitle:()=> 'Synthetic car',
 displayPrice:(amount,currency,target)=>({amount:currency===target?amount:amount/4,currency:target,unavailable:false,converted:currency!==target}),
 driveOwnerAvailabilityCopy:()=>'',driveModelReferenceCopy:()=>null,cairoInstant:()=>null,
 serviceEntryHref:(family,params)=>'/marketplace?'+params.toString(),serverReplyLink:(label)=>label,
 serverReplySegments:()=>({segments:[],push(...v){this.segments.push(...v)}}),renderServerReply:segments=>segments.join(' '),
 CORE_REQUIRED_DIALOGUE_UNITS:'requiredUnits',AI2_DABRA_CONVERSATION_COPY:{en:{},ar:{}}};
const api=runInNewContext(code,globals);
let testOwner;
beforeEach(()=>{testOwner=api.createPlatformScopeOwner()});
const buildFromUser=api.buildPlatformAssistantResponse;
api.buildPlatformAssistantResponse=(message,history,locale,now,family,pricing,trip)=>buildFromUser(api.platformUserRequest(message,history,trip,testOwner),[],locale,now,family,pricing);

offers.push({id:'synthetic-3600',currency:'SAR',chauffeur:3600,airport:3600});
const saved=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive','stay']});
const prefs={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const baseEn=['I need a car with a driver','my car budget is 800 SAR per day'];
const baseAr=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
for(const [base,message] of [
 [baseEn,'my hotel budget is 1000 EUR per day'],
 [baseEn,'my budget for the hotel is 1000 EUR per day'],
 [baseAr,'ميزانية الفندق 1000 يورو يومياً'],
 [baseAr,'ميزانيتي للفندق 1000 يورو يومياً']
]) test('a service budget does not replace the confirmed car cap: '+message,()=>{
 const plan=driveDialogue([...base,message].map(norm),prefs);
 assert.equal(plan?.budget?.amount,'800');assert.equal(plan?.budget?.currency,'SAR');assert.equal(plan?.budget?.basis,'day');
 assert.ok(plan?.pendingBudgets.some(x=>x.scope==='other'&&x.value.kind==='amount'&&x.value.amount==='1000'&&x.value.currency==='EUR'));
 assert.equal(plan?.kind,'clarify');
 const event={role:'user',content:'show cars in Cairo'};
 const original=globals.driveBudgetState;let phase='scope',scopeCalls=0,matchCalls=0;
 globals.driveBudgetState=(...args)=>{if(phase==='scope')scopeCalls++;else matchCalls++;return original(...args)};
 try{const request=api.platformUserRequest(event,[...base,message].map(content=>({role:'user',content})),saved,testOwner);
  const scoped=api.platformUserRequestScope(request);assert.ok(scoped);phase='match';
  assert.equal(api.findPlatformDriveOffers(event.content,{currency:'SAR',snapshot:null},scoped.trip,plan,request).length,0);assert.equal(api.findPlatformDriveOffers(event.content,{currency:'SAR',snapshot:null},scoped.trip,undefined,request).length,0);assert.ok(scopeCalls+matchCalls>0,'a budget guard was reached');if(scoped.tripStatus==='contested'){assert.ok(scopeCalls>0,'scope reducer was reached');assert.equal(matchCalls,0,'scope veto occurs before matching reducer')}else assert.ok(matchCalls>0,'matching reducer was reached')}
 finally{globals.driveBudgetState=original}
});
for(const [base,message] of [
 [baseEn,'my overall trip budget is 900 SAR per day'],
 [baseAr,'ميزانية الرحلة العامة 900 ريال يومياً']
]) test('an overall trip budget is not silently relabelled as a car cap: '+message,()=>{
 const plan=driveDialogue([...base,message].map(norm),prefs);
 assert.equal(plan?.budget?.amount,'800');
 assert.ok(plan?.pendingBudgets.some(x=>x.scope==='unknown'&&x.value.kind==='amount'&&x.value.amount==='900'));
 assert.equal(plan?.kind,'clarify');
});
for(const [base,hotel,correct] of [
 [baseEn,'my hotel budget is 1000 EUR per day','set my car budget to 700 SAR per day'],
 [baseAr,'ميزانية الفندق 1000 يورو يومياً','ميزانية السيارة 700 ريال يومياً']
]) test('an explicit car correction preserves a different service proposal: '+correct,()=>{
 const plan=driveDialogue([...base,hotel,correct].map(norm),prefs);
 assert.equal(plan?.budget?.amount,'700');
 assert.ok(plan?.pendingBudgets.some(x=>x.scope==='other'&&x.value.kind==='amount'&&x.value.amount==='1000'));
 assert.equal(plan?.kind,'clarify');
});
for(const text of [
 'if I approve show prices in USD; actually never use EUR under any circumstances',
 'if I approve show prices in USD; never use EUR under any circumstances',
 'إذا وافقت اعرض الأسعار بالدولار؛ بل لا تستخدم اليورو أبداً تحت أي ظرف'
]) test('an absolute display rejection is independent of an earlier conditional proposal: '+text,()=>{
 const c=api.platformCurrencySelection(text);
 assert.equal(Array.from(c.excluded).includes('EUR'),true);assert.notEqual(c.requested,'USD');
});
for(const text of [
 'if I approve; actually never use EUR under any circumstances',
 'إذا وافقت؛ بل لا تستخدم اليورو أبداً تحت أي ظرف'
]) test('an unresolved condition is not cancelled by a correction marker: '+text,()=>{
 const c=api.platformCurrencySelection(text);assert.equal(Array.from(c.excluded).includes('EUR'),false);
});
for(const text of [
 'do not use EUR; my hotel budget is 1000 EUR per day',
 'لا تستخدم اليورو؛ ميزانية الفندق 1000 يورو يومياً'
]) test('a budget denomination cannot undo an earlier display exclusion: '+text,()=>{
 const c=api.platformCurrencySelection(text);assert.equal(Array.from(c.excluded).includes('EUR'),true);
});
for(const text of [
 'do not use EUR; show prices in EUR',
 'لا تستخدم اليورو؛ اعرض الأسعار باليورو'
]) test('a later unconditional display selection can reallow the currency: '+text,()=>{
 const c=api.platformCurrencySelection(text);assert.equal(Array.from(c.excluded).includes('EUR'),false);assert.equal(c.requested,'EUR');
});
for(const [rejection,budget] of [
 ['do not use EUR','my hotel budget is 1000 EUR per day'],
 ['لا تستخدم اليورو','ميزانية الفندق 1000 يورو يومياً']
]) test('history exclusion is retained when a later service amount names that currency: '+budget,()=>{
 const history=[...baseEn.map(content=>({role:'user',content})),{role:'user',content:rejection}];
 const r=api.buildPlatformAssistantResponse(budget,history,'en',Date.now(),'drive',{currency:'EUR',snapshot:null},saved);
 assert.doesNotMatch(r.answer,/\d+(?:\.\d+)?\s*EUR/);
});

for(const [rejection,budget] of [
 ['do not use EUR','my hotel budget is 1000 EUR per day'],
 ['لا تستخدم اليورو','ميزانية الفندق 1000 يورو يومياً']
]) test('structured user history preserves a display refusal across a service amount: '+budget,()=>{
 const choice=api.platformCurrencySelection(budget);assert.equal(choice.explicitRequested,null);
 const context=api.preferenceContext(budget,[{role:'user',content:rejection}]);
 assert.equal(Array.from(api.platformCurrencySelection(context).excluded).includes('EUR'),true);
});

for(const [base,message,follow] of [
 [baseEn,'same trip, my hotel budget is 1000 EUR per day','show cars'],
 [baseAr,'نفس الرحلة، ميزانية الفندق 1000 يورو يومياً','اعرض السيارات']
]) test('a service-specific proposal stays with the same scoped user history on follow-up: '+message,()=>{
 const history=base.map(content=>({role:'user',content}));
 const scoped=api.platformConversationScope(message,history,saved,testOwner);
 assert.equal(scoped.trip,saved);assert.equal(scoped.history.length,history.length);
 const nextHistory=[...scoped.history,{role:'user',content:message}];
 const nextRequest=api.platformUserRequest(follow,nextHistory,scoped.trip,testOwner);
 const next=api.platformUserRequestScope(nextRequest);
 assert.equal(next.trip,saved);
 const context=api.preferenceContext(next.message,next.history);
 const plan=api.platformDriveDialogue({message:next.message,history:next.history,context,trip:next.trip});
 assert.equal(plan?.budget?.amount,'800');
 assert.ok(plan?.pendingBudgets.some(x=>x.scope==='other'&&x.value.kind==='amount'&&x.value.amount==='1000'));
 assert.equal(plan?.kind,'clarify');
 assert.equal(api.findPlatformDriveOffers(context,{currency:'SAR',snapshot:null},next.trip,plan,nextRequest).length,0);
});
test('the synthetic 3600 SAR offer exceeds the unchanged 800 SAR daily cap even with FX 4',()=>{
 const plan=driveDialogue(baseEn.map(norm),prefs);
 const matchingRequest=api.platformUserRequest('show cars in Cairo',baseEn.map(content=>({role:'user',content})),saved,testOwner);
 const matchingScope=api.platformUserRequestScope(matchingRequest);
 const selected=api.findPlatformDriveOffers('show cars in Cairo',{currency:'EUR',snapshot:null},saved,plan,matchingScope);
 assert.deepEqual(Array.from(selected,x=>x.id),['synthetic-low']);
});
for(const [base,rejection,message] of [
 [baseEn,'do not use EUR','my car budget is 800 EUR per day'],
 [baseAr,'لا تستخدم اليورو','ميزانية السيارة 800 يورو يومياً']
]) test('a later car-budget denomination does not disclose a refused display currency: '+message,()=>{
 const history=[...base.map(content=>({role:'user',content})),{role:'user',content:rejection}];
 const response=api.buildPlatformAssistantResponse(message,history,'en',Date.now(),'drive',{currency:'EUR',snapshot:null},saved);
 assert.match(response.answer,/Synthetic car/);assert.doesNotMatch(response.answer,/\d+(?:\.\d+)?\s*EUR/);
});

for(const [base,other] of [
 [baseEn,'my hotel budget is 1000 EUR total'],
 [baseAr,'ميزانية الفندق 1000 يورو إجمالي']
]) test('a trip-total lodging proposal cannot become a daily car cap: '+other,()=>{
 const plan=driveDialogue([...base,other].map(norm),prefs);
 assert.equal(plan?.budget?.amount,'800');assert.equal(plan?.budget?.currency,'SAR');assert.equal(plan?.budget?.basis,'day');
 assert.ok(plan?.pendingBudgets.some(x=>x.scope==='other'&&x.value.kind==='amount'&&x.value.amount==='1000'&&x.value.basis==='trip'));
 assert.equal(plan?.kind,'clarify');
});
for(const [base,message] of [
 [baseEn,'my car budget is 700 SAR per day and my hotel budget is 1000 EUR per day'],
 [baseAr,'ميزانية السيارة 700 ريال يومياً وميزانية الفندق 1000 يورو يومياً']
]) test('competing service amounts cannot be silently flattened to the hotel amount: '+message,()=>{
 const plan=driveDialogue([...base,message].map(norm),prefs);
 assert.notEqual(plan?.budget?.amount,'1000');assert.equal(plan?.kind,'clarify');assert.ok(plan?.pendingBudgets.length);
 const event={role:'user',content:'show cars in Cairo'};
 const original=globals.driveBudgetState;let phase='scope',scopeCalls=0,matchCalls=0;
 globals.driveBudgetState=(...args)=>{if(phase==='scope')scopeCalls++;else matchCalls++;return original(...args)};
 try{const request=api.platformUserRequest(event,[...base,message].map(content=>({role:'user',content})),saved,testOwner);
  const scoped=api.platformUserRequestScope(request);assert.ok(scoped);phase='match';
  assert.equal(api.findPlatformDriveOffers(event.content,{currency:'SAR',snapshot:null},scoped.trip,plan,request).length,0);assert.equal(api.findPlatformDriveOffers(event.content,{currency:'SAR',snapshot:null},scoped.trip,undefined,request).length,0);assert.ok(scopeCalls+matchCalls>0,'a budget guard was reached');if(scoped.tripStatus==='contested'){assert.ok(scopeCalls>0,'scope reducer was reached');assert.equal(matchCalls,0,'scope veto occurs before matching reducer')}else assert.ok(matchCalls>0,'matching reducer was reached')}
 finally{globals.driveBudgetState=original}
});
for(const [rejection,selection] of [
 ['do not use EUR','show prices in EUR'],
 ['لا تستخدم اليورو','اعرض الأسعار باليورو']
]) test('an explicit display choice in a later turn can reallow a currency: '+selection,()=>{
 const choice=api.platformCurrencySelection(selection);assert.equal(choice.explicitRequested,'EUR');
 const context=api.preferenceContext(selection,[{role:'user',content:rejection}]);
 assert.equal(Array.from(api.platformCurrencySelection(context).excluded).includes('EUR'),false);
});
for(const text of [
 'if I approve show prices in USD; actually never use EUR under any circumstances; my hotel budget is 1000 EUR per day',
 'إذا وافقت اعرض الأسعار بالدولار؛ بل لا تستخدم اليورو أبداً تحت أي ظرف؛ ميزانية الفندق 1000 يورو يومياً'
]) test('a conditional proposal, absolute rejection, and service denomination remain distinct events: '+text,()=>{
 const choice=api.platformCurrencySelection(text);
 assert.equal(Array.from(choice.excluded).includes('EUR'),true);assert.notEqual(choice.requested,'USD');
});

for(const text of [
 'show prices in EUR; my hotel budget is 1000 USD per day',
 'my hotel budget is 1000 USD per day; show prices in EUR',
 'اعرض الأسعار باليورو؛ ميزانية الفندق 1000 دولار يومياً',
 'ميزانية الفندق 1000 دولار يومياً؛ اعرض الأسعار باليورو'
]) test('a service-budget denomination is not a later display-choice event: '+text,()=>{
 const choice=api.platformCurrencySelection(text);assert.equal(choice.explicitRequested,'EUR');assert.equal(choice.requested,'EUR');
});
