import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveDialogue,driveDialogueCopy,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage} from '../lib/dabra/drive-planning.ts';
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={createPlatformScopeOwner,platformUserRequest,buildPlatformAssistantResponse};';
const globals={URL,URLSearchParams,cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,driveDialogue,driveDialogueCopy,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage,
 conversationTopicChange:()=>null,conversationIntent:()=>null,conversationReply:()=>null,withoutNegativeActions:x=>x,validSearchDate:()=>true,
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null,
 DRIVE_OFFERS:[{id:'synthetic',currency:'SAR',chauffeur:500,airport:500}],vehicleFor:()=>({make:'Toyota',model:'Corolla',ar:'تويوتا',passengers:2}),vehicleTitle:()=> 'Synthetic car',
 displayPrice:(amount,currency,target)=>({amount,currency:target,unavailable:false,converted:false}),driveOwnerAvailabilityCopy:()=>'',driveModelReferenceCopy:()=>null,cairoInstant:()=>null,
 serviceEntryHref:(family,params)=>'/marketplace?'+params.toString(),serverReplyLink:label=>label,serverReplySegments:()=>({segments:[],push(...v){this.segments.push(...v)}}),renderServerReply:segments=>segments.join(' '),
 CORE_REQUIRED_DIALOGUE_UNITS:'requiredUnits',AI2_DABRA_CONVERSATION_COPY:{en:{},ar:{}}};
const api=runInNewContext(code,globals);
const trip={id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:4,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']};
const history=['I need a car with a driver','my car budget is 800 SAR per day'].map(content=>({role:'user',content}));
test('known but insufficient capacity is not described as undocumented capacity',()=>{
 const owner=api.createPlatformScopeOwner();
 const event={role:'user',content:'show cars'},request=api.platformUserRequest(event,history,trip,owner);
 const r=api.buildPlatformAssistantResponse(request,[],'en',Date.now(),undefined,{currency:'SAR',snapshot:null});
 assert.doesNotMatch(r.answer,/Passenger capacity is not documented/i);
 assert.match(r.answer,/No listed option has documented capacity for this party/i);
});
