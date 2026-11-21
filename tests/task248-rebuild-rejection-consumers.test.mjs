import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage} from '../lib/dabra/drive-planning.ts';

// Synthetic bounded consumers: not POST, a real browser, Auth/RLS, or a live provider.
const strip=path=>stripTypeScriptTypes(readFileSync(new URL(path,import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'');
const code=strip('../lib/marketplace/public-entry.ts')+'\n'+strip('../lib/dabra/platform-assistant.ts')
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner,platformUserRequest,preparePlatformEntryForUserRequest,platformCurrencySelection,platformEntry,platformConversationScope,findPlatformDriveOffers};';
const globals={URL,URLSearchParams,cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage,
 conversationTopicChange:()=>null,conversationIntent:()=>null,conversationReply:()=>null,isComingSoonMarketplaceFamily:()=>false,familyContextFields:{drive:[],stay:[],fly:[],vip:[],concierge:[]},
 canonicalCity:()=>null,partySize:()=>null,validSearchDate:()=>true,
 DRIVE_OFFERS:[{id:'synthetic-low',currency:'SAR',chauffeur:500,airport:500},{id:'synthetic-high',currency:'SAR',chauffeur:900,airport:900}],
 vehicleFor:()=>({make:'Toyota',model:'Corolla',ar:'تويوتا',passengers:4}),
 displayPrice:(amount,currency,target)=>({amount:currency===target?amount:amount/4,currency:target,unavailable:false}),
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null};
const api=runInNewContext(code,globals);
const saved=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']});
const pricing={currency:'SAR',snapshot:null};
for(const text of [
 'I need a car in Cairo, budget 800 SAR per day; do not change my budget from 800 SAR to 1000 EUR',
 'أحتاج سيارة في القاهرة، ميزانية السيارة 800 ريال يومياً؛ لا تغير ميزانيتي من 800 ريال إلى 1000 يورو'
]) test('a rejected target cannot relax a confirmed car cap: '+text,()=>{
 const event={role:'user',content:text},owner=api.createPlatformScopeOwner();
 const request=api.platformUserRequest(event,[],saved,owner);
 const offers=api.findPlatformDriveOffers(event.content,pricing,saved,undefined,request);
 assert.deepEqual(Array.from(offers,o=>o.id),['synthetic-low']);
 assert.equal(saved.budget,800);
});
for(const text of [
 'I need a car in Cairo, budget 800 SAR per day; do not use my car budget of 800 SAR per day',
 'أحتاج سيارة في القاهرة، ميزانية السيارة 800 ريال يومياً؛ لا تستخدم ميزانية السيارة 800 ريال يومياً'
]) test('withdrawn budget prevents synthetic matching and leaves saved trip intact: '+text,()=>{
 const event={role:'user',content:text},owner=api.createPlatformScopeOwner();
 const request=api.platformUserRequest(event,[],saved,owner);
 assert.equal(api.findPlatformDriveOffers(event.content,pricing,saved,undefined,request).length,0);
 assert.equal(saved.budget,800);
});
for(const text of [
 'Do not change my budget from 800 SAR to 1000 EUR',
 'لا تغير ميزانيتي من 800 ريال إلى 1000 يورو',
 'Do not set my car budget to 1000 EUR per day',
 'لا تجعل ميزانية السيارة 1000 يورو يومياً'
]) test('a rejected budget target is not a positive display selection: '+text,()=>{
 const c=api.platformCurrencySelection(text);
 assert.notEqual(c.requested,'EUR');
 assert.equal(Array.from(c.excluded).includes('EUR'),false);
});
for(const text of ['Do not use my budget of 800 SAR','لا تستخدم ميزانيتي 800 ريال']) {
 test('rejecting the amount alone does not reject SAR as display currency: '+text,()=>{
  assert.equal(Array.from(api.platformCurrencySelection(text).excluded).includes('SAR'),false);
 });
}
test('an explicit later display choice can select EUR',()=>{
 const c=api.platformCurrencySelection('Do not change my budget from 800 SAR to 1000 EUR, show prices in EUR');
 assert.equal(c.requested,'EUR');
});
for(const text of ['show cars in Cairo in EUR','اعرض السيارات في القاهرة في اليورو']) {
 test('known Cairo and EUR remain distinct in synthetic prefill: '+text,()=>{
  const event={role:'user',content:text},owner=api.createPlatformScopeOwner();
  const request=api.platformUserRequest(event,[],null,owner);
  const params=new URL(api.preparePlatformEntryForUserRequest('drive',request,'en','EUR').deliver(),'https://example.invalid').searchParams;
  assert.equal(params.get('pickup'),'cairo');
 });
}
for(const text of ['I need a transfer from Giza to Cairo','أحتاج توصيل من الجيزة إلى القاهرة']) {
 test('explicit transfer pickup is independent of saved trip origin: '+text,()=>{
  const event={role:'user',content:text},owner=api.createPlatformScopeOwner();
  const request=api.platformUserRequest(event,[],saved,owner);
  const params=new URL(api.preparePlatformEntryForUserRequest('drive',request,'en').deliver(),'https://example.invalid').searchParams;
  assert.equal(params.get('pickup'),'giza');assert.equal(params.get('dropoff'),'cairo');
 });
}
for(const text of ['in Paris, I need a driver in EUR','في باريس أريد سائق باليورو']) {
 test('an unknown destination detaches saved context: '+text,()=>{
  assert.equal(api.platformConversationScope(text,[],saved).trip,null);
 });
}
