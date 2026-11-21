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
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner:typeof createPlatformScopeOwner==="undefined"?null:createPlatformScopeOwner,preparePlatformAssistantResponse:typeof preparePlatformAssistantResponse==="undefined"?null:preparePlatformAssistantResponse,platformUserRequest:typeof platformUserRequest==="undefined"?null:platformUserRequest,platformUserRequestScope:typeof platformUserRequestScope==="undefined"?null:platformUserRequestScope,hasActivePlatformDriveDialogue,preparePlatformEntryForUserRequest:typeof preparePlatformEntryForUserRequest==="undefined"?null:preparePlatformEntryForUserRequest,platformCurrencySelection,platformProtectedTripScope:typeof platformProtectedTripScope==="undefined"?null:platformProtectedTripScope,platformConversationScope,platformContext,platformContextText,platformDriveDialogue,preferenceContext,platformEntry,findPlatformDriveOffers,buildPlatformAssistantResponse};';
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
for(const [label,trip] of [['Dubai',dubai],['Cairo',cairo]]) test('legacy generated context cannot become a user event: '+label,()=>{
 const context=api.platformContext('show cars',[],trip),owner=api.createPlatformScopeOwner();
 assert.match(api.platformContextText(context),/drive stay/);assert.match(api.platformContextText(context),/2026-12-12/);
 const result=api.buildPlatformAssistantResponse(context,[],'en',Date.now(),'drive',pricing,trip,owner);
 assert.match(result.answer,/clarif|specify|tell me/i);
 assert.doesNotMatch(result.answer,/Synthetic car|500\.00|900\.00|2026-12-12|2026-12-14|destination=cairo/i);
});
for(const refusal of ["don't use it",'لا تستخدمها']) test('legacy generated dates do not escape after an appended refusal: '+refusal,()=>{
 const context=api.platformContext('show cars',[],cairo),owner=api.createPlatformScopeOwner();
 assert.throws(()=>context+'; '+refusal,/context.*coerced/i);
 const result=api.buildPlatformAssistantResponse(context,[],'en',Date.now(),'drive',pricing,cairo,owner);
 assert.match(result.answer,/clarif|specify|tell me/i);assert.doesNotMatch(result.answer,/2026-12-12|2026-12-14|destination=cairo|Synthetic car/i);
});
for(const [label,trip] of [['Dubai',dubai],['Cairo',cairo]]) test('a structured user request retains its own destination and unresolved saved cap: '+label,()=>{
 assert.equal(typeof api.platformUserRequest,'function');const owner=api.createPlatformScopeOwner();
 const request=api.platformUserRequest('show cars',[],trip,owner);
 const result=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing);
 assert.doesNotMatch(result.answer,/500\.00|900\.00|Synthetic car/i);
 if(label==='Dubai')assert.match(result.answer,/No car matches the requested destination/i);
});
for(const [locale,base] of [
 ['en',['I need a car with a driver','my car budget is 800 SAR per day']],
 ['ar',['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً']]
]) test('a structured user budget retains 800 per day and reaches pricing: '+locale,()=>{
 const owner=api.createPlatformScopeOwner(),request=api.platformUserRequest('show cars in Cairo',turns(base),cairo,owner);
 const originalBudget=globals.driveBudgetState,originalPrice=globals.displayPrice;let budgetCalls=0,priceCalls=0;
 globals.driveBudgetState=(...args)=>{budgetCalls++;return originalBudget(...args)};globals.displayPrice=(...args)=>{priceCalls++;return originalPrice(...args)};
 try{
  const answer=api.buildPlatformAssistantResponse(request,[],locale,Date.now(),'drive',pricing).answer;
  assert.ok(budgetCalls>0);assert.ok(priceCalls>0);assert.match(answer,/Synthetic car.*500\.00\s*SAR/i);assert.doesNotMatch(answer,/900\.00\s*SAR/i);
 }finally{globals.driveBudgetState=originalBudget;globals.displayPrice=originalPrice}
});
for(const refusal of ['do not use EUR','لا تستخدم اليورو']) test('a structured user history preserves a display exclusion: '+refusal,()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car with a driver','my car budget is 800 SAR per day',refusal]);
 const request=api.platformUserRequest('show cars in Cairo',history,cairo,owner);
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',{currency:'EUR',snapshot:null}).answer;
 assert.match(answer,/Synthetic car/);assert.doesNotMatch(answer,/\d+(?:\.\d+)?\s*EUR|currency=EUR/);
});
for(const refusal of ["don't use it",'لا تستخدمها']) test('a structured disputed user turn withholds the trip: '+refusal,()=>{
 const owner=api.createPlatformScopeOwner(),request=api.platformUserRequest(refusal,[],cairo,owner);
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.match(answer,/continue the current trip or start a new trip/i);assert.doesNotMatch(answer,/2026-12-12|destination=cairo|Synthetic car/i);
});
test('a structured result is withheld after the owner advances',()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car with a driver','my car budget is 800 SAR per day']);
 const request=api.platformUserRequest('show cars in Cairo',history,cairo,owner);
 const prepared=api.preparePlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing);
 api.platformConversationScope('my car budget is 400 SAR per day',history,cairo,owner);
 assert.match(prepared.deliver().answer,/request context changed/i);assert.doesNotMatch(prepared.deliver().answer,/Synthetic car|2026-12-12/);
});
test('a forged input or conflicting legacy arguments cannot override a structured scope',()=>{
 const owner=api.createPlatformScopeOwner(),request=api.platformUserRequest('show cars',[],dubai,owner);
 const forged=api.buildPlatformAssistantResponse({kind:'user'},[],'en',Date.now(),'drive',pricing,cairo,owner);
 assert.doesNotMatch(forged.answer,/Synthetic car|2026-12-12|destination=cairo/i);
 const conflicting=api.buildPlatformAssistantResponse(request,[{role:'assistant',content:'Cairo'}],'en',Date.now(),'drive',pricing,cairo,owner);
 assert.doesNotMatch(conflicting.answer,/Synthetic car|2026-12-12|destination=cairo/i);
});
test('a legacy turn invalidates an earlier prepared result in the same local context',()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car with a driver','my car budget is 800 SAR per day']);
 const request=api.platformUserRequest('show cars in Cairo',history,cairo,owner);
 const prepared=api.preparePlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing);
 const legacy=api.platformContext('show cars',[],cairo);
 assert.throws(()=>legacy+"; don't use it",/context.*coerced/i);
 const clarification=api.buildPlatformAssistantResponse(legacy,[],'en',Date.now(),'drive',pricing,cairo,owner);
 assert.match(clarification.answer,/clarif|specify|tell me/i);
 assert.match(prepared.deliver().answer,/request context changed/i);assert.doesNotMatch(prepared.deliver().answer,/Synthetic car|2026-12-12/);
});
test('a stored user request uses its snapshot, not a later mutated client history',()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car with a driver','my car budget is 800 SAR per day']);
 const request=api.platformUserRequest('show cars in Cairo',history,cairo,owner);history[1].content='my car budget is 1000 EUR per day';
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.match(answer,/Synthetic car.*500\.00\s*SAR/i);assert.doesNotMatch(answer,/900\.00\s*SAR|1000\s*EUR/i);
});
test('mutating the referenced trip after capture blocks its use',()=>{
 const owner=api.createPlatformScopeOwner(),changing={...cairo,families:[...cairo.families]};
 const request=api.platformUserRequest('show cars',[],changing,owner);changing.destination='Dubai';
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.match(answer,/request context changed/i);assert.doesNotMatch(answer,/Synthetic car|2026-12-12|destination=cairo/i);
});
test('assistant text cannot establish a daily car budget for the structured user request',()=>{
 const owner=api.createPlatformScopeOwner(),history=[{role:'user',content:'I need a car with a driver'},{role:'assistant',content:'my car budget is 1000 SAR per day'}];
 const request=api.platformUserRequest('show cars',history,cairo,owner);
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing).answer;
 assert.doesNotMatch(answer,/Synthetic car|500\.00|900\.00/i);
});
test('legacy generated text with no attached trip or override is still not user authority',()=>{
 const owner=api.createPlatformScopeOwner(),legacy=api.platformContext('show cars',[],cairo);
 assert.throws(()=>legacy+"; don't use it",/context.*coerced/i);
 const answer=api.buildPlatformAssistantResponse(legacy,[],'en',Date.now(),undefined,pricing,undefined,owner).answer;
 assert.match(answer,/clarif|specify|tell me/i);assert.doesNotMatch(answer,/2026-12-12|2026-12-14|destination=cairo|Synthetic car/i);
});
for(const [base,proposal] of [
 [['I need a car with a driver','my car budget is 800 SAR per day'],'if I approve my car budget is 1000 SAR per day'],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'إذا وافقت ميزانية السيارة 1000 ريال يومياً'],
 [['I need a car with a driver','my car budget is 800 SAR per day'],"the hotel's budget is 1000 EUR per day"],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'الفندق ميزانيته 1000 يورو يومياً']
]) test('an owned scope actually reaches the pending-plan guard: '+proposal,()=>{
 const owner=api.createPlatformScopeOwner(),inputs=[...base,proposal],prefs={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
 const plan=driveDialogue(inputs.map(norm),prefs);assert.equal(plan.kind,'clarify');assert.ok(plan.pendingBudgets.length);
 const request=api.platformUserRequest('show cars in Cairo',turns(inputs),cairo,owner);
 const scope=api.platformUserRequestScope(request);let accesses=0;
 const tracked=new Proxy(plan,{get(target,key){if(key==='kind')accesses++;return target[key]}});
 const selected=api.findPlatformDriveOffers('show cars in Cairo',pricing,scope.trip,tracked,scope);
 assert.ok(accesses>0,'the pending-plan guard must be evaluated');assert.equal(selected.length,0);
});
for(const [label,trip] of [['Cairo',cairo],['Dubai',dubai]]) test('an unproven generated string cannot issue a matching capability: '+label,()=>{
 const owner=api.createPlatformScopeOwner(),legacy=api.platformContext('show cars',[],trip);
 const request=api.platformUserRequest(legacy,[],trip,owner);
 assert.equal(api.platformUserRequestScope(request),null);
 const result=api.findPlatformDriveOffers('',pricing,null,undefined,request);
 assert.equal(result.length,0);
});
for(const refusal of ["don't use it",'لا تستخدمها']) test('a legacy link helper does not extract generated dates: '+refusal,()=>{
 const legacy=api.platformContext('show cars',[],cairo);
 assert.throws(()=>legacy+'; '+refusal,/context.*coerced/i);
 const href=api.platformEntry('drive',legacy,'en','SAR',null);
 assert.doesNotMatch(href,/2026-12-12|2026-12-14|destination=cairo/i);
});
test('a structured user scope reaches the matching guard with the original daily cap',()=>{
 assert.equal(typeof api.platformUserRequestScope,'function');
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car with a driver','my car budget is 800 SAR per day']);
 const request=api.platformUserRequest('show cars in Cairo',history,cairo,owner),scope=api.platformUserRequestScope(request);
 const original=globals.driveBudgetState;let calls=0;globals.driveBudgetState=(...args)=>{calls++;return original(...args)};
 try{const selected=api.findPlatformDriveOffers('',pricing,scope.trip,undefined,scope);assert.ok(calls>0);assert.deepEqual(Array.from(selected,x=>x.id),['synthetic-low'])}
 finally{globals.driveBudgetState=original}
});
test('a structured link uses the scoped trip and a contested request cannot supply its facts',()=>{
 assert.equal(typeof api.preparePlatformEntryForUserRequest,'function');
 const owner=api.createPlatformScopeOwner(),request=api.platformUserRequest('show cars in Cairo',[],cairo,owner);
 const href=api.preparePlatformEntryForUserRequest('drive',request,'en','SAR').deliver();assert.match(href,/destination=cairo/);assert.match(href,/2026-12-12/);
 const disputed=api.platformUserRequest("don't use it",[],cairo,owner),blocked=api.preparePlatformEntryForUserRequest('drive',disputed,'en','SAR').deliver();
 assert.doesNotMatch(blocked,/destination=cairo|2026-12-12|2026-12-14/i);
});
test('a prepared structured link applies user currency exclusion and cannot outlive its owner revision',()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car with a driver','my car budget is 800 SAR per day','do not use EUR']);
 const request=api.platformUserRequest('show cars in Cairo',history,cairo,owner),link=api.preparePlatformEntryForUserRequest('drive',request,'en','EUR');
 const current=link.deliver();assert.match(current,/destination=cairo/);assert.doesNotMatch(current,/currency=EUR/);
 api.platformConversationScope('my car budget is 400 SAR per day',history,cairo,owner);
 assert.doesNotMatch(link.deliver(),/destination=cairo|2026-12-12|2026-12-14|currency=EUR/i);
});
test('an unowned or forged structured request cannot expose a scope or link',()=>{
 const unowned=api.platformUserRequest('show cars',[],cairo);
 assert.equal(api.platformUserRequestScope(unowned),null);
 assert.doesNotMatch(api.preparePlatformEntryForUserRequest('drive',unowned,'en','SAR').deliver(),/destination=cairo|2026-12-12/i);
 assert.equal(api.platformUserRequestScope({kind:'platform-user-request'}),null);
});
test('conflicting legacy arguments invalidate a prepared response for the same request',()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car with a driver','my car budget is 800 SAR per day']);
 const request=api.platformUserRequest('show cars in Cairo',history,cairo,owner);
 const prepared=api.preparePlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing);
 const conflicting=api.buildPlatformAssistantResponse(request,[{role:'assistant',content:'Dubai'}],'en',Date.now(),'drive',pricing);
 assert.match(conflicting.answer,/clarif|specify|tell me/i);assert.match(prepared.deliver().answer,/request context changed/i);
});
test('active-dialogue detection requires a current structured user request',()=>{
 const owner=api.createPlatformScopeOwner(),single={...cairo,families:['drive']},history=turns(['I need a car with a driver','my car budget is 800 SAR per day']);
 const request=api.platformUserRequest('show cars',history,single,owner);
 assert.equal(api.hasActivePlatformDriveDialogue(request),true);
 const legacy=api.platformContext('show cars',[],single);
 assert.equal(api.hasActivePlatformDriveDialogue({message:legacy,history:[],context:legacy,trip:single}),false);
 api.platformConversationScope('do not use the saved trip',history,single,owner);
 assert.equal(api.hasActivePlatformDriveDialogue(request),false);
});
test('a structured explicit car request does not classify generated room facts as a hotel request',()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car with a driver','my car budget is 800 SAR per day']);
 const request=api.platformUserRequest('show cars in Cairo',history,cairo,owner);
 const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),undefined,pricing).answer;
 assert.match(answer,/Synthetic car/);assert.doesNotMatch(answer,/Search hotels inside Stay/i);
});
for(const family of [undefined,'drive','stay','fly','concierge','vip']) for(const [locale,message] of [['en',"don't use it"],['ar','لا تستخدمها']]) test('typed disputed input withholds saved facts for every family: '+String(family)+' '+locale,()=>{
 const owner=api.createPlatformScopeOwner(),request=api.platformUserRequest(message,[],cairo,owner);
 const answer=api.buildPlatformAssistantResponse(request,[],locale,Date.now(),family,pricing).answer;
 assert.match(answer,locale==='ar'?/هل نتابع الرحلة الحالية أم نبدأ رحلة جديدة/:/continue the current trip or start a new trip/i);
 assert.doesNotMatch(answer,/destination=cairo|2026-12-12|2026-12-14|11111111-1111|800\s*(?:SAR|ريال)/i);
});
for(const family of [undefined,'drive','stay','fly','concierge','vip']) for(const [locale,message] of [['en','do not use the saved trip'],['ar','لا تستخدم الرحلة المحفوظة']]) test('typed final refusal cannot place saved facts in any family link: '+String(family)+' '+locale,()=>{
 const owner=api.createPlatformScopeOwner(),request=api.platformUserRequest(message,[],cairo,owner);
 const answer=api.buildPlatformAssistantResponse(request,[],locale,Date.now(),family,pricing).answer;
 assert.doesNotMatch(answer,/destination=cairo|2026-12-12|2026-12-14|11111111-1111|800\s*(?:SAR|ريال)/i);
});
for(const family of [undefined,'drive','stay','fly','concierge','vip']) for(const [locale,prior,message] of [
 ['en','if I approve do not use the saved trip','resume the saved trip'],
 ['ar','إذا وافقت لا تستخدم الرحلة المحفوظة','استأنف الرحلة المحفوظة']
]) test('typed revalidation withholds saved facts for every family: '+String(family)+' '+locale,()=>{
 const owner=api.createPlatformScopeOwner(),request=api.platformUserRequest(message,turns([prior]),cairo,owner);
 const answer=api.buildPlatformAssistantResponse(request,[],locale,Date.now(),family,pricing).answer;
 assert.match(answer,locale==='ar'?/التحقق من صلاحية استخدامها/:/verify that it is still available for use/i);
 assert.doesNotMatch(answer,/destination=cairo|2026-12-12|2026-12-14|11111111-1111|800\s*(?:SAR|ريال)/i);
});
for(const [label,snapshot,expected] of [['available',{expired:false},['synthetic-low']],['missing',null,[]],['expired',{expired:true},[]]]) test('structured matching reaches the synthetic FX guard: '+label,()=>{
 const owner=api.createPlatformScopeOwner(),history=turns(['I need a car with a driver','my car budget is 200 EUR per day']);
 const request=api.platformUserRequest('show cars in Cairo',history,cairo,owner),scope=api.platformUserRequestScope(request);
 const original=globals.displayPrice;let conversions=0;
 globals.displayPrice=(amount,currency,target,rate)=>{if(currency===target)return {amount,currency,unavailable:false};conversions++;return !rate||rate.expired?{amount,currency,unavailable:true}:{amount:amount/4,currency:target,unavailable:false}};
 try{
  const selected=api.findPlatformDriveOffers('',{currency:'SAR',snapshot},scope.trip,undefined,scope);
  assert.ok(conversions>0,'FX conversion must be reached');assert.deepEqual(Array.from(selected,x=>x.id),expected);
 }finally{globals.displayPrice=original}
});
for(const message of ['I need a transfer from Giza to Cairo','أحتاج توصيل من الجيزة إلى القاهرة']) test('a structured user transfer preserves independent pickup and destination: '+message,()=>{
 const owner=api.createPlatformScopeOwner(),request=api.platformUserRequest(message,[],cairo,owner);
 const href=api.preparePlatformEntryForUserRequest('drive',request,'en','SAR').deliver();
 const params=new URL(href,'https://example.invalid').searchParams;
 assert.equal(params.get('pickup'),'giza');assert.equal(params.get('dropoff'),'cairo');
});
for(const message of ['show cars in Cairo in EUR','اعرض السيارات في القاهرة في اليورو']) test('a structured user destination stays separate from display currency: '+message,()=>{
 const owner=api.createPlatformScopeOwner(),request=api.platformUserRequest(message,[],cairo,owner);
 const params=new URL(api.preparePlatformEntryForUserRequest('drive',request,'en','EUR').deliver(),'https://example.invalid').searchParams;
 assert.equal(params.get('destination'),'cairo');assert.equal(params.get('currency'),'EUR');
});
