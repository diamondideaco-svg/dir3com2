import test from 'node:test';
import assert from 'node:assert/strict';
import { driveDialogue } from '../lib/dabra/drive-planning.ts';

function normalized(s){ return s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim(); }
const preferences={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const en=['I need a car with a driver','my car budget is 800 SAR per day'];
const ar=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
function dialogue(turns) { return driveDialogue(turns.map(normalized),preferences); }
function assertPending(previous,current){
 const state=dialogue([...previous,current]);
 assert.ok(state);
 assert.deepEqual(state.budget,{kind:'amount',amount:'800',currency:'SAR',basis:'day'});
 assert.equal(state.kind,'clarify');
 assert.equal(state.question,'budget');
}
for (const text of ['if I approve my car budget is 1000 SAR per day','my car budget is 1000 SAR per day if I approve','I doubt I can spend 1000 SAR per day on the car']) {
 test('uncertain car amount retains the confirmed cap: '+text,()=>assertPending(en,text));
}
for (const text of ['إذا وافقت ميزانية السيارة 1000 ريال يومياً','ميزانية السيارة 1000 ريال يومياً إذا وافقت','ربما أستطيع إنفاق 1000 ريال على السيارة يومياً']) {
 test('مبلغ السيارة غير المؤكد يبقي الحد المؤكد: '+text,()=>assertPending(ar,text));
}
for(const text of ['I can spend 1000 EUR on a villa','for a villa I can spend 1000 EUR']){
 test('other-service amount does not overwrite the car cap: '+text,()=>assertPending(en,text));
}
test('explicit 900 remains confirmed when another approximate amount is unbound',()=>{
 const state=dialogue([...en,'set my car budget to 900 SAR per day and about 1000 EUR']);
 assert.ok(state);
 assert.deepEqual(state.budget,{kind:'amount',amount:'900',currency:'SAR',basis:'day'});
 assert.equal(state.kind,'clarify');
 assert.equal(state.question,'budget');
});
test('later explicit correction to the same car budget remains possible',()=>{
 const state=dialogue([...en,'if I approve my car budget is 1000 SAR per day','set my car budget to 700 SAR per day']);
 assert.ok(state);
 assert.deepEqual(state.budget,{kind:'amount',amount:'700',currency:'SAR',basis:'day'});
 assert.equal(state.kind,'ready');
});
test('a conditional hotel price after an explicit car correction is not that budget',()=>{
 const state=dialogue([...en,'my car budget is 900 SAR per day, and if it rains the hotel costs 300 EUR']);
 assert.ok(state);
 assert.deepEqual(state.budget,{kind:'amount',amount:'900',currency:'SAR',basis:'day'});
});
