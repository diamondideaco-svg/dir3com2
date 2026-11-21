import test from 'node:test';
import assert from 'node:assert/strict';
import { driveDialogue } from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const prefs={city:'cairo',ambiguous:false,dates:['2026-12-10','2026-12-13'],party:'4',durationDays:3};
const state=(...turns)=>driveDialogue(turns.map(norm),prefs);
test('published direct contract: 1000 SAR for three whole days is a complete trip budget',()=>{
 const x=state('أحتاج سيارة مع سائق','1000 ريال سعودي للثلاثة أيام كاملة');
 assert.ok(x);
 assert.equal(x.kind,'ready');
 assert.deepEqual(x.budget,{kind:'amount',amount:'1000',currency:'SAR',basis:'trip'});
});
test('published direct contract: reject 8000 and correct to 1000 total with a car explicitly requested',()=>{
 const x=state('I need a car with a driver and budget 8000 SAR per day','Not 8000 SAR, 1000 SAR total');
 assert.ok(x);
 assert.equal(x.budget?.kind,'amount');
 assert.equal(x.budget?.amount,'1000');
 assert.equal(x.budget?.basis,'trip');
});
test('published direct contract: replace a rejected daily basis with trip basis',()=>{
 const x=state('I need a car with a driver and budget 8000 SAR per day','not per day, for the whole trip');
 assert.ok(x);
 assert.equal(x.budget?.amount,'8000');
 assert.equal(x.budget?.basis,'trip');
});
for (const text of ['لا أريد 8000 ريال','لا أريد الميزانية 8000 ريال']) {
 test('published direct contract: rejected amount remains absent: '+text,()=>{
  const x=state('أحتاج سيارة مع سائق وميزانية 8000 ريال للرحلة',text);
  assert.ok(x);
  assert.equal(x.budget,null);
 });
}
test('published direct contract: Arabic correction after rejecting a value',()=>{
 const x=state('أحتاج سيارة مع سائق وميزانية 8000 ريال للرحلة','لا أريد 8000 ريال، أريد 1000 ريال للرحلة');
 assert.ok(x);
 assert.equal(x.budget?.amount,'1000');
});
