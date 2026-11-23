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
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner:typeof createPlatformScopeOwner==="undefined"?null:createPlatformScopeOwner,platformUserRequest,platformUserRequestScope,preparePlatformAssistantResponse:typeof preparePlatformAssistantResponse==="undefined"?null:preparePlatformAssistantResponse,platformCurrencySelection,platformProtectedTripScope:typeof platformProtectedTripScope==="undefined"?null:platformProtectedTripScope,platformConversationScope,platformContext,platformDriveDialogue,preferenceContext,platformEntry,findPlatformDriveOffers,buildPlatformAssistantResponse};';
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
for(const family of [undefined,'drive','stay','fly','concierge','vip']) for(const [locale,message] of [['en',"don't use it"],['ar','لا تستخدمها']]) test('a disputed pronoun with any family override never projects saved trip facts: '+String(family)+' '+locale,()=>{
 const owner=api.createPlatformScopeOwner(),event={role:'user',content:message};
 const request=api.platformUserRequest(event,[],trip,owner),scope=api.platformUserRequestScope(request);
 assert.equal(scope.trip,null);assert.equal(scope.tripStatus,'contested');
 const original=globals.driveDialogue,seen=[];globals.driveDialogue=(turns,prefs)=>{seen.push(prefs);return original(turns,prefs)};
 try{
  const response=api.buildPlatformAssistantResponse(request,[],locale,Date.now(),family,pricing);
  assert.match(response.answer,locale==='ar'?/هل نتابع الرحلة الحالية أم نبدأ رحلة جديدة/:/continue the current trip or start a new trip/i);
  assert.doesNotMatch(response.answer,/destination=cairo|2026-12-12|2026-12-14|11111111-1111|800\s*(?:SAR|ريال)/i);
  for(const prefs of seen)assert.doesNotMatch(JSON.stringify(prefs),/2026-12-12|2026-12-14|cairo|800/i);
 }finally{globals.driveDialogue=original}
});
for(const family of [undefined,'drive','stay','fly','concierge','vip']) for(const [locale,message] of [['en','do not use the saved trip'],['ar','لا تستخدم الرحلة المحفوظة']]) test('a final rejection cannot place saved facts in forced or fallback replies: '+String(family)+' '+locale,()=>{
 const owner=api.createPlatformScopeOwner(),event={role:'user',content:message};
 const request=api.platformUserRequest(event,[],trip,owner);const response=api.buildPlatformAssistantResponse(request,[],locale,Date.now(),family,pricing);
 assert.doesNotMatch(response.answer,/destination=cairo|2026-12-12|2026-12-14|11111111-1111|800\s*(?:SAR|ريال)/i);
});
for(const family of [undefined,'drive','stay','fly','concierge','vip']) for(const [locale,prior,message] of [
 ['en','if I approve do not use the saved trip','resume the saved trip'],
 ['ar','إذا وافقت لا تستخدم الرحلة المحفوظة','استأنف الرحلة المحفوظة']
]) test('revalidation blocks trip-derived links for all overrides: '+String(family)+' '+locale,()=>{
 const owner=api.createPlatformScopeOwner(),history=[{role:'user',content:prior}];
 const event={role:'user',content:message},request=api.platformUserRequest(event,history,trip,owner);
 const response=api.buildPlatformAssistantResponse(request,[],locale,Date.now(),family,pricing);
 assert.match(response.answer,locale==='ar'?/التحقق من صلاحية استخدامها/:/verify that it is still available for use/i);
 assert.doesNotMatch(response.answer,/destination=cairo|2026-12-12|2026-12-14|11111111-1111|800\s*(?:SAR|ريال)/i);
});
const baseEn=['I need a car with a driver','my car budget is 800 SAR per day'];
for(const display of ['SAR','EUR']) test('an owned positive response reaches budget and display pricing: '+display,()=>{
 const owner=api.createPlatformScopeOwner(),history=baseEn.map(content=>({role:'user',content}));
 const originalBudget=globals.driveBudgetState,originalPrice=globals.displayPrice;let budgetCalls=0,priceCalls=0;
 globals.driveBudgetState=(...args)=>{budgetCalls++;return originalBudget(...args)};
 globals.displayPrice=(...args)=>{priceCalls++;return originalPrice(...args)};
 try{
  const event={role:'user',content:'show cars in Cairo'},request=api.platformUserRequest(event,history,trip,owner);
  const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',{currency:display,snapshot:null}).answer;
  assert.ok(budgetCalls>0,'budget reducer reached');assert.ok(priceCalls>0,'display pricing reached');
  assert.match(answer,/Synthetic car/);assert.match(answer,new RegExp('\\d+(?:\\.\\d+)?\\s*'+display));
  assert.doesNotMatch(answer,/900\.00\s*SAR|225\.00\s*EUR/);
 }finally{globals.driveBudgetState=originalBudget;globals.displayPrice=originalPrice}
});
for(const rejection of ['do not use EUR','لا تستخدم اليورو']) test('an owned response reaches pricing while respecting an explicit display exclusion: '+rejection,()=>{
 const owner=api.createPlatformScopeOwner(),history=[...baseEn,rejection].map(content=>({role:'user',content}));
 const original=globals.displayPrice;let calls=0;globals.displayPrice=(...args)=>{calls++;return original(...args)};
 try{
  const event={role:'user',content:'show cars in Cairo'},request=api.platformUserRequest(event,history,trip,owner);
  const answer=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),'drive',{currency:'EUR',snapshot:null}).answer;
  assert.ok(calls>0,'pricing reached');assert.match(answer,/Synthetic car/);assert.doesNotMatch(answer,/\d+(?:\.\d+)?\s*EUR|currency=EUR/);
 }finally{globals.displayPrice=original}
});
test('one owned context invalidates a prepared priced result after a correction',()=>{
 const owner=api.createPlatformScopeOwner(),history=baseEn.map(content=>({role:'user',content}));
 const original=globals.displayPrice;let calls=0;globals.displayPrice=(...args)=>{calls++;return original(...args)};
 try{
  const event={role:'user',content:'show cars in Cairo'},request=api.platformUserRequest(event,history,trip,owner);
  const prepared=api.preparePlatformAssistantResponse(request,[],'en',Date.now(),'drive',pricing);
  assert.ok(calls>0,'the first response reached pricing');api.platformUserRequest('my car budget is 400 SAR per day',history,trip,owner);
  const answer=prepared.deliver().answer;assert.match(answer,/request context changed/i);assert.doesNotMatch(answer,/Synthetic car|destination=cairo|2026-12-12/);
 }finally{globals.displayPrice=original}
});
