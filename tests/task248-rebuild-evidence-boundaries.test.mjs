import test from 'node:test';
import assert from 'node:assert/strict';
import { driveBudgetState } from '../lib/dabra/drive-planning.ts';
import { cityRoles,refineRoutingTrip } from '../lib/dabra/trip-routing.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
for(const turns of [
 ['no driver','1000 SAR per day'],
 ['I need a hotel with no driver','1000 SAR per day'],
 ['show cars only if I approve','1000 SAR per day'],
 ['اعرض السيارات إذا وافقت','1000 ريال يومياً']
]) test('a short amount needs an actual current user request for the service: '+turns.join(' / '),()=>{
 const s=driveBudgetState(turns.map(norm));
 assert.equal(s.confirmed,null);
 assert.ok(s.pending.length>0);
});
for(const turns of [['I need a car with a driver','1000 SAR per day'],['أحتاج سيارة مع سائق','1000 ريال يومياً']]) {
 test('an explicit current user car request can scope a short amount: '+turns.join(' / '),()=>{
  const s=driveBudgetState(turns.map(norm));
  assert.equal(s.confirmed?.amount,'1000');
  assert.equal(s.pending.length,0);
 });
}
for(const text of ['I need a transfer from the airport to Cairo','أحتاج توصيل من المطار إلى القاهرة']) {
 test('an unrecognised airport origin does not inherit a saved city: '+text,()=>{
  assert.equal(cityRoles(text).unknownOrigin,true);
  assert.equal(refineRoutingTrip({origin:'Cairo',destination:'Cairo',families:['drive']},text).origin,null);
 });
}
