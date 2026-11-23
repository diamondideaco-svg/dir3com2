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
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner,platformUserRequest,platformUserRequestScope,platformCurrencySelection,platformConversationScope,findPlatformDriveOffers,buildPlatformAssistantResponse};';
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
for(const text of [
 'if I approve show prices in USD; do not use EUR',
 'do not use EUR; if I approve show prices in USD',
 'إذا وافقت اعرض الأسعار بالدولار؛ لا تستخدم اليورو',
 'لا تستخدم اليورو؛ إذا وافقت اعرض الأسعار بالدولار'
]) test('an independent later currency refusal survives a conditional choice: '+text,()=>{
 const c=api.platformCurrencySelection(text);assert.equal(Array.from(c.excluded).includes('EUR'),true);assert.notEqual(c.requested,'USD');
});
for(const text of ['if I approve; actually do not use EUR','إذا وافقت؛ بل لا تستخدم اليورو','if I approve, do not use EUR']) {
 test('a dependent condition is not cancelled by punctuation or a correction marker: '+text,()=>{
  const c=api.platformCurrencySelection(text);assert.equal(Array.from(c.excluded).includes('EUR'),false);
 });
}
for(const text of ['I live in Paris; show cars in Cairo','أعيش في باريس؛ أريد سيارة في القاهرة']) {
 test('residence does not replace an explicit service destination: '+text,()=>{
  const r=cityRoles(text);assert.equal(r.city,'cairo');assert.equal(r.unknownDestination,false);
 });
}
test('an unknown transfer origin remains guarded',()=>assert.equal(cityRoles('I need a transfer from Paris to Cairo').unknownOrigin,true));
const saved=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']});
const base=['I need a car with a driver','my car budget is 800 SAR per day'];
const prefs={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
test('pricing consumes confirmed structured budget rather than a conditional currency sentence',()=>{
 const plan=driveDialogue([...base,'if I approve show prices in EUR'].map(norm),prefs);
 assert.equal(plan?.kind,'ready');assert.equal(plan?.budget?.amount,'800');
 const context='I need a car in Cairo, my car budget is 800 SAR per day if I approve show prices in EUR';
 const matchingRequest=api.platformUserRequest('if I approve show prices in EUR',base.map(content=>({role:'user',content})),saved,testOwner);
 const matchingScope=api.platformUserRequestScope(matchingRequest);
 const selected=api.findPlatformDriveOffers(context,{currency:'SAR',snapshot:null},saved,plan,matchingScope);
 assert.deepEqual(Array.from(selected,x=>x.id),['synthetic-low']);
});
test('a pending structured budget blocks matching even when omitted from display text',()=>{
 const plan=driveDialogue([...base,'if I approve my car budget is 1000 SAR per day'].map(norm),prefs);
 assert.equal(plan?.kind,'clarify');assert.ok(plan?.pendingBudgets.length);
 const event={role:'user',content:'show cars in Cairo'};
 const history=[...base,'if I approve my car budget is 1000 SAR per day'].map(content=>({role:'user',content}));
 const request=api.platformUserRequest(event,history,saved,testOwner);
 const original=globals.driveBudgetState;let calls=0;globals.driveBudgetState=(...args)=>{calls++;return original(...args)};
 try{assert.equal(api.findPlatformDriveOffers(event.content,{currency:'SAR',snapshot:null},saved,plan,request).length,0);assert.equal(api.findPlatformDriveOffers(event.content,{currency:'SAR',snapshot:null},saved,undefined,request).length,0);assert.ok(calls>0,'budget guard was reached')}
 finally{globals.driveBudgetState=original}
});
test('an empty price match does not invent a passenger-capacity failure',()=>{
 const history=[{role:'user',content:'I need a car with a driver'},{role:'user',content:'my car budget is 100 SAR per day'}];
 const r=api.buildPlatformAssistantResponse('show cars',history,'en',Date.now(),undefined,{currency:'SAR',snapshot:null},saved);
 assert.match(r.answer,/No car matches/i);assert.doesNotMatch(r.answer,/capacity is not documented/i);
});
test('a later explicit EUR refusal prevents showing a synthetic EUR price',()=>{
 const history=base.map(content=>({role:'user',content}));
 const trip={...saved,currency:'EUR'};
 const r=api.buildPlatformAssistantResponse('if I approve show prices in USD; do not use EUR',history,'en',Date.now(),undefined,{currency:'EUR',snapshot:null},trip);
 assert.doesNotMatch(r.answer,/\d+(?:\.\d+)?\s*EUR/);
});
