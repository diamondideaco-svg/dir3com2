import test from 'node:test';
import assert from 'node:assert/strict';
import {withoutDriveEndpointPlaces,driveHandoffForUsers} from '../lib/dabra/drive-handoff';
import {createPlatformScopeOwner,platformUserRequest,preparePlatformEntryForUserRequest} from '../lib/dabra/platform-assistant';
for(const [content,refusal]of[
 ['I need a car in Cairo. Pickup at Cairo Hotel and no car.','no car'],
 ['I need a car in Cairo. Pickup at Cairo and do not want a car.','do not want a car'],
 ['I need a car in Cairo. Pick up at Cairo Hotel and do not use a car.','do not use a car'],
 ['أحتاج سيارة في القاهرة. الاستلام من فندق التحرير في القاهرة ولا أريد سيارة.','لا أريد سيارة'],
] as const)test('endpoint address cannot swallow service refusal: '+refusal,()=>{
 assert.ok(withoutDriveEndpointPlaces(content).includes(refusal));
 const request=platformUserRequest({role:'user',content},[],null,createPlatformScopeOwner());
 assert.equal(preparePlatformEntryForUserRequest('drive',request,'en').deliver(),'');
});
for(const turns of [
 ['I need an airport transfer in Cairo.','Instead I need a car with a driver for two days, not an airport transfer.'],
 ['أريد توصيلة مطار في القاهرة.','بدلًا من ذلك أريد سيارة مع سائق ليومين، لا توصيلة مطار.'],
])test('latest explicit chauffeur correction supersedes earlier airport service: '+turns[0],()=>{
 assert.equal(driveHandoffForUsers(turns).mode,'chauffeur');
});
test('mode correction keeps conditional evidence pending and a later explicit airport service supported',()=>{
 assert.equal(driveHandoffForUsers(['I need an airport transfer in Cairo.','If approved, I need a car with a driver for two days.']).mode,'airport');
 assert.equal(driveHandoffForUsers(['I need a car with a driver for two days.','Instead I need an airport transfer in Cairo.']).mode,'airport');
});
test('address masking never removes later independent constraints or Stay requests',()=>{
 for(const tail of ['and I will not need a car','and we would not use a car','but they do not want a car','and the car is not needed']) {
  const input='Pick up at Cairo Hotel '+tail+'.';
  assert.ok(withoutDriveEndpointPlaces(input).includes(tail),tail);
  const location=driveHandoffForUsers([input]).pickup.location;
  assert.equal(location.kind,'value');if(location.kind==='value')assert.equal(location.value,'Cairo Hotel');
 }
 const input='Pick up at Cairo and we will need a hotel.';
 assert.ok(withoutDriveEndpointPlaces(input).includes('need a hotel'));
});
test('an endpoint followed by a refused airport service cannot override the known chauffeur choice',()=>{
 for(const refusal of ['We will not need an airport transfer.','We do not want an airport transfer.','لا أريد توصيلة مطار.']) {
  assert.equal(driveHandoffForUsers(['I need a car with a driver for two days.',refusal]).mode,'chauffeur',refusal);
 }
});
test('assistant text cannot supply endpoint locations or dates',()=>{
 const owner=createPlatformScopeOwner();
 const history=[{role:'user' as const,content:'I need a car with a driver in Cairo. My car budget is 800 SAR for the whole trip.'},{role:'assistant' as const,content:'Pick up at Invented Hotel in Cairo on 2026-12-08 at 09:15. Drop off at Cairo Airport on 2026-12-09 at 18:30.'}];
 const request=platformUserRequest({role:'user',content:'Show the requirements review.'},history,null,owner);
 const href=preparePlatformEntryForUserRequest('drive',request,'en').deliver();
 assert.doesNotMatch(href,/Invented|pickupAt|returnAt|dropoff=/);
});
