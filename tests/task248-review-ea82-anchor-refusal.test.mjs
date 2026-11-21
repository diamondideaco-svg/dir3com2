import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveBudgetState} from '../lib/dabra/drive-planning.ts';
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={platformConversationScope};';
const api=runInNewContext(code,{cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,conversationTopicChange:()=>null});
const trip=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']});
const history=[{role:'user',content:'I need a car with a driver'},{role:'user',content:'my car budget is 800 SAR per day'}];
for(const refusal of ['do not use the saved trip','لا تستخدم الرحلة المحفوظة']) {
 test('an explicit refusal does not forward or textually restore the saved anchor: '+refusal,()=>{
  const d=newTripRequested.decision(refusal);assert.equal(d.refused,true);
  const scoped=api.platformConversationScope(refusal,history,trip);assert.equal(scoped.trip,null);assert.equal(scoped.history.length,0);
  const later=api.platformConversationScope('resume the saved trip',[...history,{role:'user',content:refusal}],trip);assert.equal(later.trip,null);
 });
}
test('a prior trip refusal cuts the old budget from the shared reducer',()=>{
 const s=driveBudgetState(['i need a car with a driver','my car budget is 800 sar per day','do not use the saved trip','show cars']);
 assert.equal(s.confirmed,null);
});
test('a conditional refusal does not count as an already detached anchor',()=>{
 const d=newTripRequested.decision('if I approve do not use the saved trip');
 assert.equal(d.kind,'uncertain');assert.equal(d.refused,false);
});
