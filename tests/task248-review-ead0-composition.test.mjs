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
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner,platformUserRequest,platformUserRequestScope,platformCurrencySelection,platformConversationScope,platformContext,platformDriveDialogue,preferenceContext,platformEntry,findPlatformDriveOffers,buildPlatformAssistantResponse};';
const offers=[{id:'synthetic-low',currency:'SAR',chauffeur:500,airport:500},{id:'synthetic-high',currency:'SAR',chauffeur:900,airport:900}];
const globals={URL,URLSearchParams,cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,
 driveDialogue,driveDialogueCopy,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage,
 conversationTopicChange:()=>null,conversationIntent:()=>null,conversationReply:()=>null,withoutNegativeActions:x=>x,validSearchDate:()=>true,
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null,
 DRIVE_OFFERS:offers,vehicleFor:()=>({make:'Toyota',model:'Corolla',ar:'تويوتا',passengers:4}),vehicleTitle:()=> 'Synthetic car',
 displayPrice:(amount,currency,target)=>({amount:currency===target?amount:amount/4,currency:target,unavailable:false,converted:currency!==target}),
 driveOwnerAvailabilityCopy:()=>'',driveModelReferenceCopy:()=>null,cairoInstant:()=>null,
 serviceEntryHref:(family,params)=>'/marketplace?'+params.toString(),serverReplyLink:(label,href)=>label+' ['+href+']',
 serverReplySegments:()=>({segments:[],push(...v){this.segments.push(...v)}}),renderServerReply:segments=>segments.join(' '),
 CORE_REQUIRED_DIALOGUE_UNITS:'requiredUnits',AI2_DABRA_CONVERSATION_COPY:{en:{},ar:{}}};
const api=runInNewContext(code,globals);
let testOwner;
beforeEach(()=>{testOwner=api.createPlatformScopeOwner()});
const buildFromUser=api.buildPlatformAssistantResponse;
api.buildPlatformAssistantResponse=(message,history,locale,now,family,pricing,trip)=>buildFromUser(api.platformUserRequest(message,history,trip,testOwner),[],locale,now,family,pricing);

offers.push({id:'synthetic-3600',currency:'SAR',chauffeur:3600,airport:3600});
const trip=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'EUR',families:['drive','stay']});
const prefs={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const baseEn=['I need a car with a driver','my car budget is 800 SAR per day'];
const baseAr=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
for(const text of [
 'if I approve start a new trip; never use the saved trip for any reason',
 'إذا وافقت ابدأ رحلة جديدة؛ لا تستخدم الرحلة المحفوظة أبداً مهما كانت الظروف',
 'if I approve start a new trip; actually do not use the saved trip',
 'إذا وافقت ابدأ رحلة جديدة؛ بل لا تستخدم الرحلة المحفوظة',
 'if I approve start a new trip; if I approve do not use the saved trip'
]) test('a competing refusal after a completed conditional proposal cannot pass the anchor: '+text,()=>{
 const d=newTripRequested.decision(text);
 assert.equal(d.kind,'uncertain');assert.ok(d.refused||d.contested);
 const history=baseEn.map(content=>({role:'user',content}));
 const scoped=api.platformConversationScope(text,history,trip,testOwner);assert.equal(scoped.trip,null);
 const next=api.platformConversationScope('show cars',[...history,{role:'user',content:text}],trip,testOwner);assert.equal(next.trip,null);
 const response=api.buildPlatformAssistantResponse(text,history,'en',Date.now(),undefined,{currency:'EUR',snapshot:null},trip);
 assert.match(response.answer,/continue the current trip or start a new trip/i);assert.doesNotMatch(response.answer,/2026-12-12/);
});
for(const [base,text] of [
 [baseEn,"the hotel's budget is 1000 EUR per day"],
 [baseEn,"the accommodation's budget is 1000 EUR per day"],
 [baseAr,'الفندق ميزانيته 1000 يورو يومياً'],
 [baseAr,'الإقامة ميزانيتها 1000 يورو يومياً']
]) test('a possessive service budget cannot replace the car cap: '+text,()=>{
 const plan=driveDialogue([...base,text].map(norm),prefs);
 assert.equal(plan?.budget?.amount,'800');assert.equal(plan?.budget?.currency,'SAR');assert.equal(plan?.budget?.basis,'day');
 assert.ok(plan?.pendingBudgets.some(item=>item.scope==='other'&&item.value.kind==='amount'&&item.value.amount==='1000'));
 assert.equal(plan?.kind,'clarify');
 const event={role:'user',content:'show cars in Cairo'};
 const original=globals.driveBudgetState;let phase='scope',scopeCalls=0,matchCalls=0;
 globals.driveBudgetState=(...args)=>{if(phase==='scope')scopeCalls++;else matchCalls++;return original(...args)};
 try{const request=api.platformUserRequest(event,[...base,text].map(content=>({role:'user',content})),trip,testOwner);
  const scoped=api.platformUserRequestScope(request);assert.ok(scoped);phase='match';
  assert.equal(api.findPlatformDriveOffers(event.content,{currency:'EUR',snapshot:null},scoped.trip,plan,request).length,0);assert.equal(api.findPlatformDriveOffers(event.content,{currency:'EUR',snapshot:null},scoped.trip,undefined,request).length,0);assert.ok(scopeCalls+matchCalls>0,'a budget guard was reached');if(scoped.tripStatus==='contested'){assert.ok(scopeCalls>0,'scope reducer was reached');assert.equal(matchCalls,0,'scope veto occurs before matching reducer')}else assert.ok(matchCalls>0,'matching reducer was reached')}
 finally{globals.driveBudgetState=original}
 const flattened=[...base,text,'show cars in Cairo'].join('; ');
 assert.equal(api.findPlatformDriveOffers(flattened,{currency:'EUR',snapshot:null},trip).length,0);
});
for(const [base,text] of [
 [baseEn,"the car's budget is 700 SAR per day"],
 [baseAr,'السيارة ميزانيتها 700 ريال يومياً']
]) test('a possessive car budget can explicitly correct its own cap: '+text,()=>{
 const plan=driveDialogue([...base,text].map(norm),prefs);
 assert.equal(plan?.budget?.amount,'700');assert.equal(plan?.budget?.currency,'SAR');assert.equal(plan?.budget?.basis,'day');
 assert.equal(plan?.kind,'ready');
});
for(const [base,text] of [
 [baseEn,"the tour's budget is 1000 EUR per day"],
 [baseAr,'الجولة ميزانيتها 1000 يورو يومياً']
]) test('an unfamiliar possessive service budget stays unbound: '+text,()=>{
 const plan=driveDialogue([...base,text].map(norm),prefs);
 assert.equal(plan?.budget?.amount,'800');assert.equal(plan?.kind,'clarify');assert.ok(plan?.pendingBudgets.length);
 const event={role:'user',content:'show cars in Cairo'};
 const original=globals.driveBudgetState;let phase='scope',scopeCalls=0,matchCalls=0;
 globals.driveBudgetState=(...args)=>{if(phase==='scope')scopeCalls++;else matchCalls++;return original(...args)};
 try{const request=api.platformUserRequest(event,[...base,text].map(content=>({role:'user',content})),trip,testOwner);
  const scoped=api.platformUserRequestScope(request);assert.ok(scoped);phase='match';
  assert.equal(api.findPlatformDriveOffers(event.content,{currency:'EUR',snapshot:null},scoped.trip,plan,request).length,0);assert.equal(api.findPlatformDriveOffers(event.content,{currency:'EUR',snapshot:null},scoped.trip,undefined,request).length,0);assert.ok(scopeCalls+matchCalls>0,'a budget guard was reached');if(scoped.tripStatus==='contested'){assert.ok(scopeCalls>0,'scope reducer was reached');assert.equal(matchCalls,0,'scope veto occurs before matching reducer')}else assert.ok(matchCalls>0,'matching reducer was reached')}
 finally{globals.driveBudgetState=original}
});
for(const text of [
 'if I approve show prices in USD; actually never display EUR under any circumstances',
 'if I approve show prices in USD; actually never show EUR under any circumstances',
 'إذا وافقت اعرض الأسعار بالدولار؛ بل لا تعرض اليورو أبداً تحت أي ظرف'
]) test('an independent absolute rejection applies to all display actions: '+text,()=>{
 const choice=api.platformCurrencySelection(text);
 assert.equal(Array.from(choice.excluded).includes('EUR'),true);assert.notEqual(choice.requested,'USD');
 const history=baseEn.map(content=>({role:'user',content}));
 const result=api.buildPlatformAssistantResponse(text,history,'en',Date.now(),'drive',{currency:'EUR',snapshot:null},trip);
 assert.doesNotMatch(result.answer,/\d+(?:\.\d+)?\s*EUR/);
});
for(const text of [
 'if I approve show prices in USD; actually do not display EUR',
 'إذا وافقت اعرض الأسعار بالدولار؛ بل لا تعرض اليورو'
]) test('an unresolved competing currency rejection blocks display without becoming a confirmed exclusion: '+text,()=>{
 const choice=api.platformCurrencySelection(text);
 assert.equal(Array.from(choice.excluded).includes('EUR'),false);
 assert.equal(Array.from(choice.contested ?? []).includes('EUR'),true);
 const history=baseEn.map(content=>({role:'user',content}));
 const result=api.buildPlatformAssistantResponse(text,history,'en',Date.now(),'drive',{currency:'EUR',snapshot:null},trip);
 assert.doesNotMatch(result.answer,/\d+(?:\.\d+)?\s*EUR/);assert.doesNotMatch(result.answer,/currency=EUR/);
});
for(const text of ['do not use EUR','لا تستخدم اليورو']) test('a response link omits the refused currency: '+text,()=>{
 const history=baseEn.map(content=>({role:'user',content}));
 const result=api.buildPlatformAssistantResponse(text,history,'en',Date.now(),'drive',{currency:'EUR',snapshot:null},trip);
 assert.match(result.answer,/\[\/marketplace\?/);assert.doesNotMatch(result.answer,/currency=EUR/);
 assert.doesNotMatch(result.answer,/\d+(?:\.\d+)?\s*EUR/);
});
test('an eligible synthetic display currency may still appear in a response link',()=>{
 const history=baseEn.map(content=>({role:'user',content}));
 const result=api.buildPlatformAssistantResponse('show prices in SAR',history,'en',Date.now(),'drive',{currency:'SAR',snapshot:null},trip);
 assert.match(result.answer,/currency=SAR/);
});
test('the public entry helper filters a rejected currency without a precomputed policy',()=>{
 const href=api.platformEntry('drive','show cars in Cairo; do not use EUR','en','EUR',trip);
 assert.doesNotMatch(href,/currency=EUR/);
});

for(const text of [
 'if I approve show prices in USD; actually never display prices in EUR under any circumstances',
 'إذا وافقت اعرض الأسعار بالدولار؛ بل لا تعرض الأسعار باليورو أبداً تحت أي ظرف'
]) test('an absolute rejection remains attached to a display action with an object: '+text,()=>{
 const c=api.platformCurrencySelection(text);
 assert.equal(Array.from(c.excluded).includes('EUR'),true);assert.notEqual(c.requested,'USD');
 const history=baseEn.map(content=>({role:'user',content}));
 const r=api.buildPlatformAssistantResponse(text,history,'en',Date.now(),'drive',{currency:'EUR',snapshot:null},trip);
 assert.doesNotMatch(r.answer,/\d+(?:\.\d+)?\s*EUR/);assert.doesNotMatch(r.answer,/currency=EUR/);
});
for(const text of [
 'do not show prices in EUR',
 'لا تعرض الأسعار باليورو'
]) test('an unconditioned negative display action excludes its target currency: '+text,()=>{
 const c=api.platformCurrencySelection(text);assert.equal(Array.from(c.excluded).includes('EUR'),true);
});
for(const [earlier,later] of [
 ['if I approve show prices in USD; actually do not display EUR','show prices in EUR'],
 ['إذا وافقت اعرض الأسعار بالدولار؛ بل لا تعرض اليورو','اعرض الأسعار باليورو']
]) test('a later explicit display choice resolves a disputed currency: '+later,()=>{
 const history=[...baseEn.map(content=>({role:'user',content})),{role:'user',content:earlier}];
 const result=api.buildPlatformAssistantResponse(later,history,'en',Date.now(),'drive',{currency:'EUR',snapshot:null},trip);
 assert.match(result.answer,/currency=EUR/);assert.match(result.answer,/\d+(?:\.\d+)?\s*EUR/);
});
for(const [base,first,second] of [
 [baseEn,"the hotel's budget is 1000 EUR per day","the car's budget is 700 SAR per day"],
 [baseAr,'الفندق ميزانيته 1000 يورو يومياً','السيارة ميزانيتها 700 ريال يومياً']
]) test('correcting the car does not silently clear a different service proposal: '+second,()=>{
 const plan=driveDialogue([...base,first,second].map(norm),prefs);
 assert.equal(plan?.budget?.amount,'700');assert.equal(plan?.kind,'clarify');
 assert.ok(plan?.pendingBudgets.some(x=>x.scope==='other'&&x.value.kind==='amount'&&x.value.amount==='1000'));
 const event={role:'user',content:'show cars in Cairo'};
 const original=globals.driveBudgetState;let phase='scope',scopeCalls=0,matchCalls=0;
 globals.driveBudgetState=(...args)=>{if(phase==='scope')scopeCalls++;else matchCalls++;return original(...args)};
 try{const request=api.platformUserRequest(event,[...base,first,second].map(content=>({role:'user',content})),trip,testOwner);
  const scoped=api.platformUserRequestScope(request);assert.ok(scoped);phase='match';
  assert.equal(api.findPlatformDriveOffers(event.content,{currency:'EUR',snapshot:null},scoped.trip,plan,request).length,0);assert.equal(api.findPlatformDriveOffers(event.content,{currency:'EUR',snapshot:null},scoped.trip,undefined,request).length,0);assert.ok(scopeCalls+matchCalls>0,'a budget guard was reached');if(scoped.tripStatus==='contested'){assert.ok(scopeCalls>0,'scope reducer was reached');assert.equal(matchCalls,0,'scope veto occurs before matching reducer')}else assert.ok(matchCalls>0,'matching reducer was reached')}
 finally{globals.driveBudgetState=original}
});

for(const text of [
 'do not show prices in EUR, show prices in USD',
 'لا تعرض الأسعار باليورو، اعرض الأسعار بالدولار'
]) test('a later positive display action is not captured by an earlier negative action: '+text,()=>{
 const c=api.platformCurrencySelection(text);
 assert.equal(Array.from(c.excluded).includes('EUR'),true);
 assert.equal(Array.from(c.excluded).includes('USD'),false);
 assert.equal(c.requested,'USD');
});
for(const text of [
 'do not show prices in EUR or USD',
 'لا تعرض الأسعار باليورو أو الدولار'
]) test('a negative display action still covers its coordinated currency list: '+text,()=>{
 const c=api.platformCurrencySelection(text);
 assert.equal(Array.from(c.excluded).includes('EUR'),true);
 assert.equal(Array.from(c.excluded).includes('USD'),true);
});

for(const text of [
 'if I approve start a new trip; never use the saved trip for any reason',
 'إذا وافقت ابدأ رحلة جديدة؛ لا تستخدم الرحلة المحفوظة أبداً مهما كانت الظروف'
]) test('the already-projected consumer does not pass a contested trip to planning: '+text,()=>{
 const original=globals.driveDialogue, seen=[];
 globals.driveDialogue=(turns,preferences)=>{seen.push(preferences);return original(turns,preferences)};
 try {
  const r=api.buildPlatformAssistantResponse(text,[],'en',Date.now(),'drive',{currency:'EUR',snapshot:null},trip);
  assert.equal(seen.length,1);assert.equal(seen[0].city,undefined);
  assert.doesNotMatch(r.answer,/2026-12-12/);
 } finally {globals.driveDialogue=original}
});

for(const text of [
 'if I approve do not use the saved trip',
 'إذا وافقت لا تستخدم الرحلة المحفوظة'
]) test('a conditional refusal in the same clause blocks use without becoming a final refusal: '+text,()=>{
 const d=newTripRequested.decision(text);
 assert.equal(d.kind,'uncertain');assert.equal(d.refused,false);assert.equal(d.contested,true);
 const history=baseEn.map(content=>({role:'user',content}));
 const scoped=api.platformConversationScope(text,history,trip,testOwner);assert.equal(scoped.trip,null);
});

for(const text of [
 "do not use a driver for the same trip",
 'لا تستخدم السائق في نفس الرحلة'
]) test('rejecting a service does not reject the trip that contains it: '+text,()=>{
 const d=newTripRequested.decision(text);assert.equal(d.refused,false);assert.equal(d.contested,false);
 const scoped=api.platformConversationScope(text,baseEn.map(content=>({role:'user',content})),trip,testOwner);
 assert.equal(scoped.trip,trip);
});

test('an Arabic reference to the same trip is not an unknown destination',()=>{
 assert.equal(cityRoles('لا تستخدم السائق في نفس الرحلة').unknownDestination,false);
});
test('the same-word prefix does not hide a genuinely unknown destination',()=>{
 assert.equal(cityRoles('أريد سيارة في نفس باريس').unknownDestination,true);
});

for(const text of [
 'if I approve; actually never use the saved trip under any circumstances',
 'إذا وافقت؛ بل لا تستخدم الرحلة المحفوظة أبداً تحت أي ظرف'
]) test('a dangling conditional refusal also blocks use of the contested anchor: '+text,()=>{
 const d=newTripRequested.decision(text);assert.equal(d.kind,'uncertain');assert.equal(d.refused,false);assert.equal(d.contested,true);
 const history=baseEn.map(content=>({role:'user',content}));
 assert.equal(api.platformConversationScope(text,history,trip,testOwner).trip,null);
 const r=api.buildPlatformAssistantResponse(text,history,'en',Date.now(),'drive',{currency:'EUR',snapshot:null},trip);
 assert.match(r.answer,/continue the current trip or start a new trip/i);assert.doesNotMatch(r.answer,/2026-12-12/);
});
