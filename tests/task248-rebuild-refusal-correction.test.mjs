import test from 'node:test';
import assert from 'node:assert/strict';
import {driveDialogue} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const p={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const en=['I need a car with a driver','my car budget is 800 SAR per day'];
const ar=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
for(const [base,text] of [
 [en,'Do not change my budget from 800 SAR to 1000 EUR, my car budget is 900 SAR per day'],
 [en,'Do not set my car budget to 1000 EUR but set my car budget to 900 SAR per day'],
 [ar,'لا تغير ميزانيتي من 800 ريال إلى 1000 يورو، ميزانية السيارة 900 ريال يومياً'],
 [ar,'لا تجعل ميزانية السيارة 1000 يورو لكن اجعل ميزانية السيارة 900 ريال يومياً']
]) test('an explicit subsequent correction in the same turn is retained: '+text,()=>{
 const s=driveDialogue([...base,text].map(norm),p);
 assert.equal(s?.budget?.kind,'amount');assert.equal(s?.budget?.amount,'900');assert.equal(s?.budget?.currency,'SAR');assert.equal(s?.budget?.basis,'day');
});
