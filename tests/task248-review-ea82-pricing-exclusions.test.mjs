import test, {beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveDialogue,driveDialogueCopy,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage} from '../lib/dabra/drive-planning.ts';
// Bounded synthetic consumer only; no live provider, POST, browser, Auth or RLS.
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner,platformUserRequest,buildPlatformAssistantResponse};';
const globals={URL,URLSearchParams,cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,
 driveDialogue,driveDialogueCopy,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage,
 conversationTopicChange:()=>null,conversationIntent:()=>null,conversationReply:()=>null,withoutNegativeActions:x=>x,validSearchDate:()=>true,
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null,
 DRIVE_OFFERS:[{id:'synthetic',currency:'SAR',chauffeur:500,airport:500}],
 vehicleFor:()=>({make:'Toyota',model:'Corolla',ar:'تويوتا',passengers:4}),vehicleTitle:()=> 'Synthetic car',
 displayPrice:(amount,currency,target)=>({amount:currency===target?amount:amount/4,currency:target,unavailable:false,converted:currency!==target}),
 driveOwnerAvailabilityCopy:()=>'',driveModelReferenceCopy:()=>null,cairoInstant:()=>null,
 serviceEntryHref:(family,params)=>'/marketplace?'+params.toString(),serverReplyLink:label=>label,
 serverReplySegments:()=>({segments:[],push(...v){this.segments.push(...v)}}),renderServerReply:segments=>segments.join(' '),
 CORE_REQUIRED_DIALOGUE_UNITS:'requiredUnits',AI2_DABRA_CONVERSATION_COPY:{en:{},ar:{}}};
const api=runInNewContext(code,globals);
let testOwner;
beforeEach(()=>{testOwner=api.createPlatformScopeOwner()});
const buildFromUser=api.buildPlatformAssistantResponse;
api.buildPlatformAssistantResponse=(message,history,locale,now,family,pricing,trip)=>buildFromUser(api.platformUserRequest(message,history,trip,testOwner),[],locale,now,family,pricing);
const trip=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'EUR',families:['drive']});
const history=['I need a car with a driver','my car budget is 800 SAR per day'].map(content=>({role:'user',content}));
for(const message of ['if I approve show prices in USD; do not use EUR','إذا وافقت اعرض الأسعار بالدولار؛ لا تستخدم اليورو']) {
 test('a stale empty pricing exclusion does not override a current refusal: '+message,()=>{
  const r=api.buildPlatformAssistantResponse(message,history,'en',Date.now(),undefined,{currency:'EUR',snapshot:null,excludedCurrencies:[]},trip);
  assert.doesNotMatch(r.answer,/\d+(?:\.\d+)?\s*EUR/);
 });
}
test('a plain unopposed display choice may show a synthetic EUR price',()=>{
 const r=api.buildPlatformAssistantResponse('show prices in EUR',history,'en',Date.now(),undefined,{currency:'EUR',snapshot:null,excludedCurrencies:[]},trip);
 assert.match(r.answer,/\d+(?:\.\d+)?\s*EUR/);
});
