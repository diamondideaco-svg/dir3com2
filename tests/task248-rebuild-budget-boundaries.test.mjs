import test from 'node:test';
import assert from 'node:assert/strict';
import { driveDialogue } from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const prefs={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const base=['I need a car with a driver','my car budget is 800 SAR per day'];
const ar=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
const run=(initial,...turns)=>driveDialogue([...initial,...turns].map(norm),prefs);
function blockedWith800(s){assert.equal(s.budget?.amount,'800');assert.equal(s.kind,'clarify');assert.ok(s.pendingBudgets.length>0);}
for(const [initial,text] of [
 [base,'if I approve; actually my car budget is 1000 SAR per day'],
 [ar,'إذا وافقت؛ بل ميزانية السيارة 1000 ريال يومياً']
]) test('a same-turn correction marker does not cancel a condition: '+text,()=>blockedWith800(run(initial,text)));
for(const [initial,text] of [
 [base,'my car budget is 900 SAR per day, and if it rains the car costs 300 SAR'],
 [ar,'ميزانية السيارة 900 ريال يومياً، وإذا أمطرت سعر السيارة 300 ريال']
]) test('a separate later conditional service price does not alter a confirmed budget: '+text,()=>{
 const s=run(initial,text);
 assert.equal(s.budget?.amount,'900');
 assert.equal(s.kind,'ready');
});
for(const [initial,proposal,rejection] of [
 [base,'if I approve my car budget is 1000 SAR per day','do not use 1000 SAR this week'],
 [ar,'إذا وافقت ميزانية السيارة 1000 ريال يومياً','لا تستخدم 1000 ريال هذا الأسبوع']
]) test('temporary rejection preserves both the confirmed cap and unresolved proposal: '+rejection,()=>blockedWith800(run(initial,proposal,rejection)));
test('a later unconditional approximation can be an explicit budget correction',()=>{
 const s=run(base,'change my car budget to about 1000 EUR per day');
 assert.equal(s.budget?.amount,'1000');
 assert.equal(s.budget?.currency,'EUR');
 assert.equal(s.kind,'ready');
});
