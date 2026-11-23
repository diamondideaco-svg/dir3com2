import * as driveHandoff from '../lib/dabra/drive-handoff.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities } from '../lib/dabra/trip-routing.ts';
import { driveDialogue,driveQuantities,dateWithdrawalIndex,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage } from '../lib/dabra/drive-planning.ts';

// This bounded VM keeps the published routing and entry code; unavailable services are stubs.
// It is not a browser, POST, authentication, catalogue, or provider integration test.
function stripped(path) {
 return stripTypeScriptTypes(readFileSync(new URL(path,import.meta.url),'utf8'),{mode:'strip'})
   .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'');
}
const globals={...driveHandoff,URL,URLSearchParams,driveDialogue,cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,driveQuantities,dateWithdrawalIndex,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage,
 conversationTopicChange:()=>null,conversationIntent:()=>null,conversationReply:()=>null,
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null,
 isComingSoonMarketplaceFamily:()=>false,
 familyContextFields:{drive:[],stay:[],fly:[],vip:[],concierge:[]},
 canonicalCity:()=>null, partySize:()=>null, validSearchDate:()=>true};
const code=stripped('../lib/drive/customer-budget.ts')+'\n'+stripped('../lib/marketplace/public-entry.ts')+'\n'+stripped('../lib/dabra/platform-assistant.ts')
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner,platformUserRequest,platformUserRequestScope,preparePlatformEntryForUserRequest};';
const api=runInNewContext(code,globals);
const saved=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Cairo',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']});
for(const text of ['I need a transfer from Paris to Cairo','أحتاج توصيل من باريس إلى القاهرة']) {
 test('unknown origin detaches saved context and does not prefill Cairo as pickup: '+text,()=>{
  const event={role:'user',content:text};const owner=api.createPlatformScopeOwner();
  const request=api.platformUserRequest(event,[],saved,owner);const scoped=api.platformUserRequestScope(request);
  assert.equal(scoped.trip,null);
  const params=new URL(api.preparePlatformEntryForUserRequest('drive',request,'en').deliver(),'https://example.invalid').searchParams;
  assert.equal(params.has('pickup'),false);
  assert.equal(saved.origin,'Cairo');
 });
}
for(const text of ['I need a transfer from Giza to Cairo','أحتاج توصيل من الجيزة إلى القاهرة']) {
 test('explicit transfer supplies origin as pickup, separate from destination: '+text,()=>{
  const event={role:'user',content:text};const owner=api.createPlatformScopeOwner();
  const request=api.platformUserRequest(event,[],null,owner);
  const params=new URL(api.preparePlatformEntryForUserRequest('drive',request,'en').deliver(),'https://example.invalid').searchParams;
  assert.equal(params.get('pickup'),'giza');
  assert.equal(params.get('dropoff'),'cairo');
 });
}
test('a saved trip origin alone is not promoted to an explicit transfer pickup',()=>{
 const trip={...saved,origin:'Giza'};
 const event={role:'user',content:'show cars in Cairo'};const owner=api.createPlatformScopeOwner();
 const request=api.platformUserRequest(event,[],trip,owner);
 const params=new URL(api.preparePlatformEntryForUserRequest('drive',request,'en').deliver(),'https://example.invalid').searchParams;
 assert.equal(params.get('pickup'),'cairo');
});
