import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage} from '../lib/dabra/drive-planning.ts';
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={platformContext,platformContextText,platformCurrencySelection};';
const globals={cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,bareDriveParty,bareDrivePartyWithLuggage,conversationTopicChange:()=>null,conversationIntent:()=>null,validSearchDate:()=>true,
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null};
const api=runInNewContext(code,globals);
for(const [first,denial,question] of [
 ['I need a car in Cairo','do not use EUR','if I approve show cars in EUR'],
 ['أحتاج سيارة في القاهرة','لا تستخدم اليورو','إذا وافقت اعرض السيارات باليورو']
]) test('user history retains currency refusal across a conditional request: '+question,()=>{
 const history=[{role:'user',content:first},{role:'user',content:denial}];
 const context=api.platformContextText(api.platformContext(question,history,null));
 const c=api.platformCurrencySelection(context);
 assert.notEqual(c.requested,'EUR');assert.equal(Array.from(c.excluded).includes('EUR'),true);
});
for(const [first,denial,choice] of [
 ['I need a car in Cairo','do not use EUR','show prices in EUR'],
 ['أحتاج سيارة في القاهرة','لا تستخدم اليورو','اعرض الأسعار باليورو']
]) test('a later unconditioned user request can change the display currency: '+choice,()=>{
 const history=[{role:'user',content:first},{role:'user',content:denial}];
 const context=api.platformContextText(api.platformContext(choice,history,null));
 const c=api.platformCurrencySelection(context);
 assert.equal(c.requested,'EUR');assert.equal(Array.from(c.excluded).includes('EUR'),false);
});
