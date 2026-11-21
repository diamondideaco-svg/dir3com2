import test from 'node:test';
import assert from 'node:assert/strict';
import {driveDialogue} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const p={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const en=['I need a car with a driver','my car budget is 800 SAR per day'];
const ar=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
for(const [base,text] of [
 [en,'set my car budget to 1000 SAR'],
 [ar,'اجعل ميزانية السيارة 1000 ريال']
]) test('a new confirmed amount without a stated basis requires clarification: '+text,()=>{
 const s=driveDialogue([...base,text].map(norm),p);
 assert.equal(s?.budget?.amount,'1000');assert.equal(s?.budget?.currency,'SAR');assert.equal(s?.budget?.basis,null);assert.equal(s?.kind,'clarify');
});
for(const [base,text] of [
 [en,'set my car budget to 1000 per day'],
 [ar,'اجعل ميزانية السيارة 1000 يومياً']
]) test('a new confirmed amount without a stated currency requires clarification: '+text,()=>{
 const s=driveDialogue([...base,text].map(norm),p);
 assert.equal(s?.budget?.amount,'1000');assert.equal(s?.budget?.currency,null);assert.equal(s?.budget?.basis,'day');assert.equal(s?.kind,'clarify');
});
