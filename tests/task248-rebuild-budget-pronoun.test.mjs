import test from 'node:test';
import assert from 'node:assert/strict';
import {driveDialogue} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const p={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const en=['I need a car with a driver','my car budget is 800 SAR per day'];
const ar=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
for(const [base,text] of [
 [en,'my budget is 800 SAR; do not set it to 1000 EUR'],
 [en,"Don't change my 800 SAR budget to 1000 EUR"],
 [en,'Do not change my budget of 800 SAR to 1000 EUR'],
 [ar,'ميزانيتي 800 ريال؛ لا تحولها إلى 1000 يورو'],
 [ar,'لا تغير ميزانيتي البالغة 800 ريال إلى 1000 يورو']
]) test('a negated change retains its stated source rather than adopting its target: '+text,()=>{
 const s=driveDialogue([...base,text].map(norm),p);
 assert.equal(s?.budget?.amount,'800');assert.equal(s?.budget?.currency,'SAR');assert.equal(s?.budget?.basis,'day');
});
