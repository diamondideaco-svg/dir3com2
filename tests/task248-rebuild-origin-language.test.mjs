import test from 'node:test';
import assert from 'node:assert/strict';
import {cityRoles,refineRoutingTrip} from '../lib/dabra/trip-routing.ts';
const trip={origin:'Cairo',destination:'Cairo',families:['drive']};
for(const text of [
 'من فضلك اعرض السيارات في القاهرة',
 'أريد سيارة من دون سائق في القاهرة',
 'Please show cars in Cairo from EUR'
]) test('a courtesy, service preference or currency is not a departure: '+text,()=>{
 assert.equal(cityRoles(text).unknownOrigin,false);
 assert.equal(refineRoutingTrip(trip,text).origin,'Cairo');
});
for(const text of ['I need a transfer from an airport to Cairo','أريد توصيل من المطار إلى القاهرة']) {
 test('an unsupported airport departure is unresolved: '+text,()=>{
  assert.equal(cityRoles(text).unknownOrigin,true);
  assert.equal(refineRoutingTrip(trip,text).origin,null);
 });
}
