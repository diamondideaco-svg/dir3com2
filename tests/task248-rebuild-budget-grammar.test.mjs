import test from 'node:test';
import assert from 'node:assert/strict';
import { driveDialogue } from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const p={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const en=['I need a car with a driver','my car budget is 800 SAR per day'];
const ar=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
const run=(base,...turns)=>driveDialogue([...base,...turns].map(norm),p);
for(const [base,text] of [
 [en,'Is my car budget 1000 EUR per day?'],
 [en,'I do not think I can spend 1000 EUR per day on the car'],
 [ar,'هل أستطيع إنفاق 1000 يورو يومياً على السيارة؟'],
 [ar,'وإذا وافقت ميزانية السيارة 1000 ريال يومياً']
]) test('a question or uncertainty cannot set the confirmed budget: '+text,()=>{
 const s=run(base,text);
 assert.equal(s.budget?.amount,'800');
 assert.equal(s.kind,'clarify');
});
for(const [base,text] of [
 [en,'my car budget is SAR 900 per day'],
 [ar,'ميزانية السيارة ريال 900 يومياً']
]) test('explicit currency-before-amount correction retains the correct value: '+text,()=>{
 const s=run(base,text);
 assert.equal(s.budget?.amount,'900');
 assert.equal(s.budget?.currency,'SAR');
 assert.equal(s.kind,'ready');
});
test('an independently described hotel cost does not replace a car budget',()=>{
 const s=run(en,'my car budget is 900 SAR per day and Hilton is about 1000 EUR');
 assert.equal(s.budget?.amount,'900');
 assert.equal(s.budget?.currency,'SAR');
});
test('a final named rejection resolves only the matching pending car proposal',()=>{
 const s=run(en,'if I approve my car budget is 1000 SAR per day','do not use the car budget 1000 SAR per day');
 assert.equal(s.budget?.amount,'800');
 assert.equal(s.pendingBudgets.length,0);
 assert.equal(s.kind,'ready');
});
