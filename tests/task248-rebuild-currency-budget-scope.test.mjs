import test from 'node:test';
import assert from 'node:assert/strict';
import {driveDialogue} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const p={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const en=['I need a car with a driver','my car budget is 800 SAR per day'];
const ar=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
const run=(base,text)=>driveDialogue([...base,text].map(norm),p);
for(const [base,text] of [
 [en,'show prices in EUR'],
 [en,'EUR is not acceptable'],
 [en,'I do not want to use EUR'],
 [ar,'اعرض الأسعار باليورو'],
 [ar,'اليورو غير مقبول'],
 [ar,'لا أريد استخدام اليورو']
]) test('a display-currency choice or refusal does not change the budget denomination: '+text,()=>{
 const s=run(base,text);assert.equal(s?.budget?.amount,'800');assert.equal(s?.budget?.currency,'SAR');assert.equal(s?.budget?.basis,'day');
});
for(const [base,text] of [
 [en,'my car budget is in EUR'],
 [ar,'ميزانية السيارة باليورو']
]) test('an explicit budget-currency reassignment retains the numeric amount: '+text,()=>{
 const s=run(base,text);assert.equal(s?.budget?.amount,'800');assert.equal(s?.budget?.currency,'EUR');assert.equal(s?.budget?.basis,'day');
});
