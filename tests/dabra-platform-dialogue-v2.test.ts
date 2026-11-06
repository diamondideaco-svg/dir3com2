import test from 'node:test';import assert from 'node:assert/strict';
import {composePlatformDialogue as compose,platformDialoguePayload as payload,publicDialogueTrip} from '../lib/dabra/agent-platform-dialogue';
import {parseSavedTrip} from '../lib/dabra/continuity-contract';
const units=['Server fact; not paid.','What dates?'];
test('new dialogue preserves all Core facts/questions verbatim in order',()=>{
 for(const language of ['ar','en'] as const){const guidance=language==='ar'?'خلينا نرتب التفاصيل خطوة بخطوة ونركز على احتياجك.':'Let us work through your needs step by step.';assert.equal(compose(JSON.stringify({kind:'platform-dialogue-v2',guidance,units:[0,1]}),units,language),[guidance,...units].join('\n\n'));}
});
test('new parser rejects facts, tools, links, omitted/reordered facts and schema drift',()=>{
 for(const change of [{guidance:'Your booking is confirmed.'},{guidance:'Only 10 USD for your trip.'},{guidance:'Open https://evil.invalid now.'},{units:[1,0]},{units:[0]},{units:[0,0]},{tool:'pay'},{kind:'platform-units-v1'}])assert.equal(compose(JSON.stringify({kind:'platform-dialogue-v2',guidance:'Let us work through your needs step by step.',units:[0,1],...change}),units,'en'),null);
});
test('owned trip projection removes record identity and rejects malformed continuity',()=>{
 const trip=parseSavedTrip({id:'11111111-1111-4111-8111-111111111111',origin:null,destination:'Cairo',startDate:null,endDate:null,adults:2,children:0,rooms:1,budget:null,currency:'USD',families:['stay']});assert.ok(trip);
 const before=JSON.stringify(trip),projected=publicDialogueTrip(trip);assert.ok(projected);assert.equal('id'in projected,false);assert.equal(JSON.stringify(trip),before);
 assert.equal(publicDialogueTrip({...trip,adults:999}),null);
 const p=payload('en','email me at qa@example.invalid account-id',units,trip,'account-id');assert.doesNotMatch(JSON.stringify(p),/qa@example|account-id|11111111/);
});
