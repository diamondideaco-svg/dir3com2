import test from 'node:test';
import assert from 'node:assert/strict';
import {publicDialogueActor,publicDialogueCalendar,publicDialogueBudgetAllows as allows,PUBLIC_DIALOGUE_POLICY as policy} from '../lib/dabra/public-dialogue-policy';
import type {AgentContext} from '../lib/dabra/agent-contract';
const empty={monthlyCostMicros:0,accountMonthlyCostMicros:0,accountMonthlyRequests:0,accountDailyRequests:0};
test('approved caps are distinct from and do not redefine the pilot',()=>{
 assert.equal(policy.monthlyCostMicros,25_000_000);assert.equal(policy.accountMonthlyCostMicros,250_000);
 assert.equal(policy.accountMonthlyRequests,100);assert.equal(policy.accountDailyRequests,10);
 assert.equal(allows(empty,250_000),true);assert.equal(allows(empty,250_001),false);
});
test('every cap fails closed independently and exactly at its boundary',()=>{
 for(const usage of [{...empty,monthlyCostMicros:25_000_000},{...empty,accountMonthlyCostMicros:250_000},{...empty,accountMonthlyRequests:100},{...empty,accountDailyRequests:10}])assert.equal(allows(usage,1),false);
 assert.equal(allows({...empty,monthlyCostMicros:24_999_999,accountMonthlyCostMicros:249_999,accountMonthlyRequests:99,accountDailyRequests:9},1),true);
 for(const cost of [0,-1,NaN,Infinity,0.5])assert.equal(allows(empty,cost),false);
 assert.equal(allows({...empty,accountDailyRequests:-1},1),false);
});
test('Riyadh day/month uses the same boundary across workers including leap year and December',()=>{
 for(const [timestamp,month]of [['2026-11-30T20:59:59.999Z','2026-10-31T21:00:00.000Z'],['2026-11-30T21:00:00.000Z','2026-11-30T21:00:00.000Z'],['2026-12-31T21:00:00.000Z','2026-12-31T21:00:00.000Z'],['2028-02-28T21:00:00.000Z','2028-01-31T21:00:00.000Z']])assert.equal(new Date(publicDialogueCalendar(Date.parse(timestamp)).monthStartMs).toISOString(),month);
 assert.throws(()=>publicDialogueCalendar(NaN));
});
test('all active canonical roles can converse without receiving customer or operator privileges',()=>{
 for(const role of ['customer','partner','staff','admin','ceo']as const){
  const context:AgentContext={role,isTaskAuthorityCurrent:async()=>true,taskAuthority:role==='customer'?{kind:'customer',actorId:'synthetic',ownerId:'synthetic'}:role==='partner'?{kind:'partner',actorId:'synthetic'}:{kind:'operator',role,actorId:'synthetic',country:null},readRequests:async()=>({kind:'forbidden'})};
  const snapshot=JSON.stringify(context.taskAuthority);assert.equal(publicDialogueActor(context),'synthetic');assert.equal(JSON.stringify(context.taskAuthority),snapshot);
  assert.equal(publicDialogueActor({...context,taskAuthorityFailure:'forbidden'}),null);assert.equal(publicDialogueActor({...context,isTaskAuthorityCurrent:undefined}),null);
 }
 assert.equal(publicDialogueActor({role:'guest',taskAuthority:{kind:'guest'},readRequests:async()=>({kind:'authentication_required'})}),null);
 assert.equal(publicDialogueActor({role:'customer',taskAuthority:{kind:'customer',actorId:'a',ownerId:'b'},isTaskAuthorityCurrent:async()=>true,readRequests:async()=>({kind:'forbidden'})}),null);
});
