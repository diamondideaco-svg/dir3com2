import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/task265-live-roles.json';
import {buildPlatformAssistantResponse,platformContext,managedDriveChatPlan} from './fixtures/task248-platform-request';
import {resolveDriveTemporalText} from '../lib/dabra/drive-time.mjs';
const now=Date.parse('2026-11-25T19:06:27Z');
type Turn={role:'user'|'assistant';content:string};
const history:Turn[]=fixture.oldHistory as Turn[];
for(const [group,turns]of [['case1',fixture.case1],['case2',fixture.case2]] as const)for(const [i,turn]of turns.entries()){
 test(`literal ${group}/${i+1}: sole fresh Drive scope and Cairo pickup`,()=>{
  const answer=buildPlatformAssistantResponse(turn.prompt,history,'ar',now).answer;
  assert.match(answer,/2026-11-27T21:00/);assert.match(answer,/800 SAR/);assert.match(answer,/3 أشخاص/);assert.match(answer,/2 قطع/);
  assert.match(answer,/تاريخ ووقت التسليم/);assert.doesNotMatch(answer,/نبدأ رحلة جديدة|هل ميزانيات|2026-11-25|2026-11-28|طلباً منفصلاً/);
  history.push({role:'user',content:resolveDriveTemporalText(turn.prompt,now).text},{role:'assistant',content:answer});
 });
}
test('completed USER return retains pickup, whole trip budget and chauffeur mode',()=>{
 const first=resolveDriveTemporalText(fixture.case2[0].prompt,now).text;
 const plan=managedDriveChatPlan(platformContext('التسليم في مطار القاهرة يوم 2026-11-30 الساعة 21:00.',[{role:'user',content:first}]),'ar',now);
 assert.equal(plan.blocked,false,JSON.stringify(plan));assert.equal(plan.requirements.pickupAt,'2026-11-27T21:00');assert.equal(plan.requirements.returnAt,'2026-11-30T21:00');
 assert.equal(plan.requirements.mode,'chauffeur');assert.equal(plan.requirements.passengers,3);assert.equal(plan.requirements.luggage,2);
 assert.deepEqual(plan.requirements.customerBudget,{amount:'800',currency:'SAR',basis:'trip'});
});
test('English USER endpoints use same existing plan without form defaults',()=>{
 const message='Start a new trip. I need a car with a driver in Cairo for 3 days. Pickup from Cairo airport on 2026-11-27 at 21:00. Return to Cairo airport on 2026-11-30 at 21:00. We are 3 people with 2 bags. The budget is 800 SAR for the whole trip, not per day.';
 const plan=managedDriveChatPlan(platformContext(message),'en',now);
 assert.equal(plan.blocked,false,JSON.stringify(plan));assert.equal(plan.requirements.mode,'chauffeur');assert.equal(plan.requirements.pickupAt,'2026-11-27T21:00');assert.equal(plan.requirements.returnAt,'2026-11-30T21:00');
 assert.deepEqual(plan.requirements.customerBudget,{amount:'800',currency:'SAR',basis:'trip'});
});
test('unknown return time cannot reuse prior action-ready time',()=>{
 const initial='I need a car with a driver in Cairo for 3 days. Pickup from Cairo airport on 2026-11-27 at 21:00. Return to Cairo airport on 2026-11-30 at 21:00. We are 3 people with 2 bags. Budget 800 SAR for the whole trip.';
 const plan=managedDriveChatPlan(platformContext('The return time is unknown.',[{role:'user',content:initial}]),'en',now);
 assert.equal(plan.blocked,true);assert.equal(plan.requirements.returnAt,undefined);
});

test('relative-trip USER bags survive an unrelated question and later return answer',()=>{
 const first=resolveDriveTemporalText(fixture.case1[0].prompt,now).text;
 const plan=managedDriveChatPlan(platformContext('التسليم في مطار القاهرة يوم 2026-11-30 الساعة 21:00.',[{role:'user',content:first}]),'ar',now);
 assert.equal(plan.blocked,false,JSON.stringify(plan));assert.equal(plan.requirements.luggage,2);
});
for(const [text,value]of [['Actually I may bring 4 bags if my family joins.',undefined],['Shall I bring 4 bags?',undefined],['No bags.',0]] as const)test('scoped USER baggage retains conditional and zero guards: '+text,()=>{
 const first='I need a car with a driver in Cairo for 3 days. Pickup from Cairo airport on 2026-11-27 at 21:00. Return to Cairo airport on 2026-11-30 at 21:00. We are 3 people with 2 bags. Budget 800 SAR for the whole trip.';
 const plan=managedDriveChatPlan(platformContext(text,[{role:'user',content:first},{role:'assistant',content:'The customer has 9 bags.'}]),'en',now);
 assert.equal(plan.requirements.luggage,value,JSON.stringify(plan));assert.equal(plan.blocked,value===undefined);
});

test('explicit airport transfer is withheld from the chauffeur-only inline plan',()=>{
 const text='I need an airport transfer in Cairo with a driver. Pickup from Cairo airport on 2026-11-27 at 21:00. Return to Cairo hotel on 2026-11-28 at 21:00. We are 3 people with 2 bags. Budget 800 SAR for the whole trip.';
 const plan=managedDriveChatPlan(platformContext(text),'en',now);
 assert.equal(plan.requirements.mode,'airport');assert.equal(plan.blocked,true);assert.match(plan.question??'',/flight number and arrival time/);
});
