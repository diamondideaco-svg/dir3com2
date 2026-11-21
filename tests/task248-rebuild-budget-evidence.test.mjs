import test from 'node:test';
import assert from 'node:assert/strict';
import { driveDialogue } from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const p={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const base=['I need a car with a driver','my car budget is 800 SAR per day'];
const run=(...turns)=>driveDialogue([...base,...turns].map(norm),p);
test('an unknown pending unit is not inferred from the old confirmed cap',()=>{
 const s=run('if I approve my car budget is 1000 SAR');
 assert.equal(s.budget?.amount,'800');
 assert.equal(s.pendingBudgets[0]?.value.basis,null);
 assert.equal(s.kind,'clarify');
});
test('a named rejection with a specific basis cannot resolve an unknown pending basis',()=>{
 const s=run('if I approve my car budget is 1000 SAR','do not use the car budget 1000 SAR per day');
 assert.equal(s.budget?.amount,'800');
 assert.ok(s.pendingBudgets.length>0);
 assert.equal(s.kind,'clarify');
});
test('a rejection scoped to a week cannot resolve the pending proposal',()=>{
 const s=run('if I approve my car budget is 1000 SAR per day','do not use the car budget 1000 SAR per day for a week');
 assert.equal(s.budget?.amount,'800');
 assert.ok(s.pendingBudgets.length>0);
 assert.equal(s.kind,'clarify');
});
test('a later named final rejection can resolve a fully specified pending proposal',()=>{
 const s=run('if I approve my car budget is 1000 SAR per day','do not use the car budget 1000 SAR per day');
 assert.equal(s.budget?.amount,'800');
 assert.equal(s.pendingBudgets.length,0);
 assert.equal(s.kind,'ready');
});
test('correcting the car budget does not erase a different service pending proposal',()=>{
 const s=run('I can spend 1000 EUR on a villa','set my car budget to 700 SAR per day');
 assert.equal(s.budget?.amount,'700');
 assert.ok(s.pendingBudgets.some(x=>x.scope==='other'));
 assert.equal(s.kind,'clarify');
});
