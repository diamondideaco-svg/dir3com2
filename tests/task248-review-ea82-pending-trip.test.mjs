import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from './fixtures/task258-platform-vm.mjs';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveDialogue,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const prefs={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={findPlatformDriveOffers};';
const api=runInNewContext(code,{cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,driveDialogue,driveQuantities,dateWithdrawalIndex,driveBudgetState,isRejectedBudgetChangeCurrency,validSearchDate:()=>true,
 DRIVE_OFFERS:[{id:'synthetic',currency:'SAR',chauffeur:500,airport:500}],vehicleFor:()=>({make:'Toyota',model:'Corolla',ar:'تويوتا',passengers:4}),displayPrice:(amount,currency)=>({amount,currency,unavailable:false}),
 parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null});
for(const [turns,uncertain,keep] of [
 [['I need a car with a driver','my car budget is 800 SAR per day','if I approve my car budget is 1000 SAR per day'],'start a new trip; perhaps keep this trip','keep this trip'],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً','إذا وافقت ميزانية السيارة 1000 ريال يومياً'],'ابدأ رحلة جديدة؛ ربما استمر في نفس الرحلة','استمر في نفس الرحلة']
]) test('uncertain trip scope keeps the pending cap and blocks matching: '+uncertain,()=>{
 const plan=driveDialogue([...turns,uncertain].map(norm),prefs);
 assert.equal(plan?.budget?.amount,'800');assert.ok(plan?.pendingBudgets.length);assert.equal(plan?.question,'trip');
 assert.equal(api.findPlatformDriveOffers('show cars in Cairo',{currency:'SAR',snapshot:null},null,plan).length,0);
 const continued=driveDialogue([...turns,uncertain,keep].map(norm),prefs);
 assert.equal(continued?.budget?.amount,'800');assert.ok(continued?.pendingBudgets.length);assert.equal(continued?.question,'budget');
});
