import test from 'node:test';import assert from 'node:assert/strict';
import {composePlatformDialogue as compose,platformDialoguePayload as payload,publicDialogueTrip} from '../lib/dabra/agent-platform-dialogue';
import {parseSavedTrip} from '../lib/dabra/continuity-contract';
const units=['Server fact; not paid.','What dates?'];
test('new dialogue preserves all Core facts/questions verbatim in order',()=>{
 for(const language of ['ar','en'] as const){const expected=language==='ar'?'نرتّب ما تحتاجه خطوة بخطوة.':'Let us work through your needs step by step.';assert.equal(compose(JSON.stringify({kind:'platform-dialogue-v2',guidance:'plan',units:[0,1]}),units,language),[expected,...units].join('\n\n'));}
});
test('new parser rejects facts, tools, links, omitted/reordered facts and schema drift',()=>{
 for(const change of [{guidance:'Your booking is confirmed.'},{guidance:'Only 10 USD for your trip.'},{guidance:'Open https://evil.invalid now.'},{guidance:'Your driver has been scheduled to pick you up.'},{guidance:'Let us work through your needs step by step.'},{units:[1,0]},{units:[0]},{units:[0,0]},{tool:'pay'},{kind:'platform-units-v1'}])assert.equal(compose(JSON.stringify({kind:'platform-dialogue-v2',guidance:'plan',units:[0,1],...change}),units,'en'),null);
});
test('owned trip projection removes record identity and rejects malformed continuity',()=>{
 const trip=parseSavedTrip({id:'11111111-1111-4111-8111-111111111111',origin:null,destination:'Cairo',startDate:null,endDate:null,adults:2,children:0,rooms:1,budget:null,currency:'USD',families:['stay']});assert.ok(trip);
 const before=JSON.stringify(trip),projected=publicDialogueTrip(trip);assert.ok(projected);assert.equal('id'in projected,false);assert.equal(JSON.stringify(trip),before);
 assert.equal(publicDialogueTrip({...trip,adults:999}),null);
 const p=payload('en','email me at qa@example.invalid account-id',units,trip,'account-id');assert.doesNotMatch(JSON.stringify(p),/qa@example|account-id|11111111/);
});
test('packing advice is useful content, allowed only by the current public topic, with every Core unit retained',()=>{
 for(const language of ['ar','en']as const){
  const question=language==='ar'?'ساعدني في تجهيز حقيبة السفر':'Help me pack my suitcase';
  const p=payload(language,question,units);assert.ok(p);assert.ok(p.guidanceOptions.includes('packing-essentials'));
  const answer=compose(JSON.stringify({kind:'platform-dialogue-v2',guidance:'packing-essentials',units:[0,1]}),units,language,p.guidanceOptions);
  assert.ok(answer);assert.match(answer,language==='ar'?/الشواحن.*أكياس صغيرة/:/toiletries and chargers.*small pouches/);
  assert.ok(answer.endsWith(units.join('\n\n')));
  assert.equal(compose(JSON.stringify({kind:'platform-dialogue-v2',guidance:'packing-family',units:[0,1]}),units,language,p.guidanceOptions),null);
  const commercial=payload(language,language==='ar'?'أريد سيارة في القاهرة':'car in Cairo',units);assert.ok(commercial);
  assert.equal(compose(JSON.stringify({kind:'platform-dialogue-v2',guidance:'packing-essentials',units:[0,1]}),units,language,commercial.guidanceOptions),null);
 }
 const family=payload('en','Help me pack for the children',units);assert.ok(family);assert.ok(family.guidanceOptions.includes('packing-family'));
});
test('known synthetic secret and phone formats are removed from question and place, and private Core units block composition',()=>{
 const secret='AIza'+'SYNTHETIC'.repeat(4),phone='201234567890';
 const trip=parseSavedTrip({id:'11111111-1111-4111-8111-111111111111',origin:'Cairo '+secret,destination:'Cairo '+phone,startDate:null,endDate:null,adults:2,children:0,rooms:1,budget:null,currency:'USD',families:['stay']});assert.ok(trip);
 const before=JSON.stringify(trip),p=payload('en','packing '+secret+' '+phone,units,trip);assert.ok(p);
 assert.equal(JSON.stringify(p).includes(secret),false);assert.equal(JSON.stringify(p).includes(phone),false);assert.equal(JSON.stringify(trip),before);
 assert.equal(payload('en','packing',[...units,secret],trip),null);
});
