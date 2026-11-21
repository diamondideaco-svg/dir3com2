import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي');
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={platformContext,platformContextText,platformConversationScope};';
const globals={cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage,
 conversationTopicChange:text=>/new trip|رحله جديده/.test(norm(text))?text:null,conversationIntent:()=>null,validSearchDate:()=>true,
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null};
const api=runInNewContext(code,globals);
const saved=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']});
const history=[{role:'user',content:'I need a car with a driver'},{role:'user',content:'my car budget is 800 SAR per day'}];
for(const text of ['do not start a new trip','لا تبدأ رحلة جديدة','start a new trip, actually keep this trip','ابدأ رحلة جديدة، بل ابق على هذه الرحلة']) {
 test('keeping the trip preserves its authorized synthetic context: '+text,()=>{
  const scoped=api.platformConversationScope(text,history,saved);assert.equal(scoped.trip,saved);assert.equal(scoped.history.length,2);
  const context=api.platformContextText(api.platformContext(text,history,saved));assert.match(context,/2026-12-12/);assert.match(context,/2026-12-14/);
 });
}
test('an explicit new trip does not carry old dates',()=>{
 const context=api.platformContextText(api.platformContext('start a new trip',history,saved));assert.doesNotMatch(context,/2026-12-12|2026-12-14/);
});
