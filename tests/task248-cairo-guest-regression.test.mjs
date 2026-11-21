import test from 'node:test';
import assert from 'node:assert/strict';
import { agentIntent } from '../lib/dabra/agent-contract.ts';
import { tripTurnDecision } from '../lib/dabra/trip-turn-decision.mjs';

test('Task248 Arabic adult word does not become cancellation support',()=>{
 assert.equal(agentIntent('سيارة لشخصين بالغين').tool,'discover');
 for(const message of ['ألغي طلبي','الغي الطلب','الغيه','اريد الغاء الحجز','payment support','my requests','REQ-12345678'])
  assert.notEqual(agentIntent(message).tool,'discover',message);
});
for(const message of ['قصدي تخطيط رحلة جديدة: سيارة مع سائق في القاهرة','أقصد تخطيط رحلة جديدة: سيارة مع سائق'])
 test('Task248 explicit Arabic correction starts a fresh trip: '+message,()=>assert.equal(tripTurnDecision(message).kind,'new'));
for(const message of ['إذا كان قصدي تخطيط رحلة جديدة: سيارة مع سائق','هل تقصد تخطيط رحلة جديدة؟','ليس قصدي تخطيط رحلة جديدة','لا أريد تخطيط رحلة جديدة','أفكر في تخطيط رحلة جديدة'])
 test('Task248 uncertain or negated planning is not a new-trip command: '+message,()=>assert.notEqual(tripTurnDecision(message).kind,'new'));
test('Task248 later saved-trip refusal remains effective',()=>{
 const decision=tripTurnDecision('قصدي تخطيط رحلة جديدة؛ لا تستخدم الرحلة المحفوظة');
 assert.equal(decision.refused,true);
});
