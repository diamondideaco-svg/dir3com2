import test from 'node:test';
import assert from 'node:assert/strict';
import {driveDialogue} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const p={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const en=['I need a car with a driver','my car budget is 800 SAR per day'];
const ar=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
const run=(base,...turns)=>driveDialogue([...base,...turns].map(norm),p);
for(const [base,reject,follow] of [
 [en,'do not use my car budget of 800 SAR per day','resume the saved trip'],
 [ar,'لا تستخدم ميزانية السيارة 800 ريال يومياً','استأنف الرحلة المحفوظة']
]) test('a text-only resume cannot rehydrate a budget into the pure reducer: '+reject,()=>{
 const s=run(base,reject,follow);assert.equal(s?.budget,null);assert.equal(s?.kind,'clarify');
});
for(const [base,text] of [
 [en,'do not use my budget of 800 SAR per day and show hotels'],
 [ar,'لا تستخدم ميزانيتي 800 ريال يومياً واعرض الفنادق']
]) test('a separate hotel request does not swallow the budget withdrawal: '+text,()=>{
 const s=run(base,text);assert.equal(s?.budget,null);assert.equal(s?.kind,'clarify');
});
for(const [base,text] of [
 [en,'do not use my hotel budget of 800 SAR per day and show cars'],
 [ar,'لا تستخدم ميزانية الفندق 800 ريال يومياً واعرض السيارات']
]) test('a hotel-only withdrawal does not erase the car budget: '+text,()=>{
 const s=run(base,text);assert.equal(s?.budget?.amount,'800');assert.equal(s?.budget?.currency,'SAR');
});
test('an explicit correction can follow a withdrawal without reviving the old value',()=>{
 const s=run(en,'do not use my car budget of 800 SAR per day','set my car budget to 900 SAR per day');
 assert.equal(s?.budget?.amount,'900');assert.equal(s?.budget?.currency,'SAR');
});
