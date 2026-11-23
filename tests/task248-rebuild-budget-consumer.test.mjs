import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from './fixtures/task258-platform-vm.mjs';
import { cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities } from '../lib/dabra/trip-routing.ts';
import { driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage } from '../lib/dabra/drive-planning.ts';

// Dependency-free consumer probe. Catalogue/pricing are synthetic; this is not POST or a provider call.
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner,platformUserRequest,findPlatformDriveOffers};';
const globals={URL,URLSearchParams,cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,
 driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage,validSearchDate:()=>true,
 conversationTopicChange:()=>null,conversationIntent:()=>null,conversationReply:()=>null,withoutNegativeActions:x=>x,
 DRIVE_OFFERS:[{id:'synthetic-1',currency:'SAR',chauffeur:500,airport:500}],
 vehicleFor:()=>({make:'Toyota',model:'Corolla',ar:'تويوتا',passengers:4}),
 displayPrice:(amount,currency)=>({amount,currency,unavailable:false}),
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null};
const api=runInNewContext(code,globals);
const pricing={currency:'SAR',snapshot:null};
test('synthetic direct offer consumer with an unambiguous cap reaches the catalogue',()=>{
 const event={role:'user',content:'I need a car in Cairo, budget 800 SAR per day'};
 const owner=api.createPlatformScopeOwner();
 const request=api.platformUserRequest(event,[],null,owner);
 const offers=api.findPlatformDriveOffers(event.content,pricing,null,undefined,request);
 assert.equal(offers.length,1);
});
for (const text of [
 'I need a car in Cairo, budget 800 SAR per day; if I approve the car budget is 1000 SAR per day',
 'أحتاج سيارة في القاهرة، ميزانية السيارة 800 ريال يومياً؛ إذا وافقت ميزانية السيارة 1000 ريال يومياً',
 'I need a car in Cairo, budget 800 SAR per day; I can spend 1000 EUR on a villa'
]) {
 test('unresolved budget blocks direct matching: '+text,()=>{
  const event={role:'user',content:text};
  const owner=api.createPlatformScopeOwner();
  const request=api.platformUserRequest(event,[],null,owner);
  assert.equal(api.findPlatformDriveOffers(event.content,pricing,null,undefined,request).length,0);
 });
}
