import test from 'node:test';
import assert from 'node:assert/strict';
import {driveBudgetState} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
for(const turns of [
 ['show cars after I get approval','1000 SAR per day'],
 ['show cars only after I get approval','1000 SAR per day'],
 ['اعرض السيارات بشرط موافقتي','1000 ريال يومياً'],
 ['اعرض السيارات بعد موافقتي','1000 ريال يومياً']
]) test('approval-dependent service is not current service evidence: '+turns.join(' / '),()=>{
 const s=driveBudgetState(turns.map(norm));
 assert.equal(s.confirmed,null);
 assert.ok(s.pending.length);
});
for(const turns of [
 ['show cars','cancel it; no driver','1000 SAR per day'],
 ['اعرض السيارات','ألغ طلبي؛ لا أريد سائق','1000 ريال يومياً']
]) test('cancellation is not undone by a driver preference: '+turns.join(' / '),()=>{
 const s=driveBudgetState(turns.map(norm));
 assert.equal(s.confirmed,null);
 assert.ok(s.pending.length);
});
