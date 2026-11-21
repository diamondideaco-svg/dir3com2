import test from 'node:test';
import assert from 'node:assert/strict';
import {newTripRequested} from '../lib/dabra/trip-routing.ts';
for(const text of [
 'not the same trip',
 "I do not want the same trip",
 'لا أريد نفس الرحلة',
 'ليست نفس الرحلة',
 'مو نفس الرحلة',
 'do not use the saved trip',
 'لا تستخدم الرحلة المحفوظة'
]) test('a rejected trip cannot become a continuation: '+text,()=>{
 assert.equal(newTripRequested.decision(text).kind,'uncertain');
});
for(const text of ['same trip, no driver','نفس الرحلة لا أريد سائق','resume the saved trip','استأنف الرحلة المحفوظة']) {
 test('a separate driver refusal or explicit resume is not a trip rejection: '+text,()=>{
  assert.equal(newTripRequested.decision(text).kind,'continue');
 });
}
