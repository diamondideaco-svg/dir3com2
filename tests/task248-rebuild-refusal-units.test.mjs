import test from 'node:test';
import assert from 'node:assert/strict';
import {driveDialogue} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const p={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const en=['I need a car with a driver','my car budget is 800 SAR per day'];
const ar=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
const run=(base,...turns)=>driveDialogue([...base,...turns].map(norm),p);
for(const [base,text] of [
 [en,'do not use my car budget 800 EUR per day'],
 [ar,'لا تستخدم ميزانية السيارة 800 يورو يومياً']
]) test('a rejected amount in a different currency does not delete the current cap: '+text,()=>{
 const s=run(base,text);assert.equal(s.budget?.amount,'800');assert.equal(s.budget?.currency,'SAR');
});
for(const [base,text] of [
 [en,'do not use my car budget 800 SAR total'],
 [ar,'لا تستخدم ميزانية السيارة 800 ريال للرحلة']
]) test('a rejected amount with a different time basis does not delete the daily cap: '+text,()=>{
 const s=run(base,text);assert.equal(s.budget?.amount,'800');assert.equal(s.budget?.basis,'day');
});
test('a specific day rejection does not resolve a pending value with an unknown basis',()=>{
 const s=run(en,'if I approve my car budget is 1000 SAR','do not use my car budget 1000 SAR per day');
 assert.equal(s.budget?.amount,'800');assert.ok(s.pendingBudgets.length);assert.equal(s.kind,'clarify');
});
test('rejecting a car proposal does not discard another service proposal',()=>{
 const s=run(en,'I can spend 1000 EUR on a villa','if I approve my car budget is 1000 EUR per day','do not use my car budget 1000 EUR per day');
 assert.equal(s.budget?.amount,'800');assert.ok(s.pendingBudgets.some(x=>x.scope==='other'));assert.equal(s.kind,'clarify');
});
test('rejecting hotel budget use does not erase the car budget',()=>{
 const s=run(en,'do not use my hotel budget of 800 SAR per day');
 assert.equal(s.budget?.amount,'800');assert.equal(s.budget?.currency,'SAR');
});
test('a budget change rejection followed by an explicit correction applies the correction',()=>{
 const s=run(en,'do not change my budget from 800 SAR to 1000 EUR','set my car budget to 900 SAR per day');
 assert.equal(s.budget?.amount,'900');assert.equal(s.budget?.currency,'SAR');
});
