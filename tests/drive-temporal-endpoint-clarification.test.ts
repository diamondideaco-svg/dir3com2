import test from 'node:test';
import assert from 'node:assert/strict';
import {driveHandoffForUsers,applyDriveHandoff} from '../lib/dabra/drive-handoff';
import {resolveDriveTemporalText} from '../lib/dabra/drive-time.mjs';
import {createPlatformScopeOwner,platformUserRequest,buildPlatformAssistantResponse,managedDriveChatPlan} from '../lib/dabra/platform-assistant';
const now=Date.parse('2026-11-26T19:06:27Z');
const baseAR='أحتاج سيارة مع سائق في القاهرة لمدة ٣ أيام، الاستلام من مطار القاهرة، ٣ أشخاص وشنطتان، وميزانيتي ٨٠٠ ريال سعودي للرحلة كلها.';
const baseEN='I need a car with a driver in Cairo for 3 days. Pickup from Cairo airport. We are 3 people with 2 bags. Budget 800 SAR for the whole trip.';
const shortAR='بعد بكرة الساعة ٩ مساءً',shortEN='The day after tomorrow at 9pm';
const norm=(s:string)=>resolveDriveTemporalText(s,now).text;
function core(users:string[],locale:'ar'|'en',assistant=''){
 const input=()=>platformUserRequest({role:'user',content:norm(users.at(-1)!)},users.slice(0,-1).flatMap(content=>[{role:'user' as const,content:norm(content)},...(assistant?[{role:'assistant' as const,content:assistant}]:[])]),undefined,createPlatformScopeOwner());
 return {plan:managedDriveChatPlan(input(),locale,now),answer:buildPlatformAssistantResponse(input(),[],locale,now,undefined,{currency:'SAR',snapshot:null}).answer};
}
for(const locale of ['ar','en'] as const)test('single USER-derived missing pickup endpoint accepts short date/time and retains it '+locale,()=>{
 const initial=locale==='ar'?baseAR+' التسليم في مطار القاهرة يوم 2026-12-01 الساعة 21:00.':baseEN+' Return to Cairo airport on 2026-12-01 at 21:00.';
 const initialAnswer=core([initial],locale).answer;
 assert.match(initialAnswer,locale==='ar'?/ما تاريخ ووقت الاستلام/:/What is the pickup date/);
 const short=locale==='ar'?shortAR:shortEN;
 const result=core([initial,short],locale);
 assert.equal(result.plan.requirements.pickupAt,'2026-11-28T21:00');
 assert.equal(result.plan.requirements.returnAt,'2026-12-01T21:00');
 assert.equal(result.plan.blocked,false,JSON.stringify(result.plan));
 const next=core([initial,short,locale==='ar'?'التسليم في مطار القاهرة يوم 2026-12-01 الساعة 21:00.':'Return to Cairo airport on 2026-12-01 at 21:00.'],locale);
 assert.equal(next.plan.requirements.pickupAt,'2026-11-28T21:00');
 assert.deepEqual(next.plan.requirements.customerBudget,{amount:'800',currency:'SAR',basis:'trip'});
});
for(const locale of ['ar','en'] as const)test('two missing endpoints require explicit USER role; assistant wording grants no role '+locale,()=>{
 const initial=locale==='ar'?baseAR:baseEN,short=locale==='ar'?shortAR:shortEN;
 const result=core([initial,short],locale,locale==='ar'?'ما تاريخ ووقت الاستلام؟':'What is the pickup date and time?');
 assert.equal(result.plan.blocked,true);
 assert.equal(result.plan.requirements.pickupAt,undefined);assert.equal(result.plan.requirements.returnAt,undefined);
 assert.match(result.plan.question??'',locale==='ar'?/الاستلام.*التسليم/:/pickup.*return/);
 assert.match(result.plan.question??'',/2026-11-28.*21:00/);
 const role=locale==='ar'?'أقصد الاستلام':'I mean pickup';
 const confirmed=core([initial,short,role],locale);
 assert.equal(confirmed.plan.requirements.pickupAt,'2026-11-28T21:00');assert.equal(confirmed.plan.requirements.returnAt,undefined);
 assert.match(confirmed.answer,/2026-11-28T21:00/);assert.match(confirmed.plan.question??'',locale==='ar'?/التسليم/:/return/);
 const next=core([initial,short,role,locale==='ar'?'التسليم في مطار القاهرة يوم 2026-12-01 الساعة 21:00.':'Return to Cairo airport on 2026-12-01 at 21:00.'],locale);
 assert.equal(next.plan.blocked,false,JSON.stringify(next.plan));
 assert.equal(next.plan.requirements.pickupAt,'2026-11-28T21:00');assert.equal(next.plan.requirements.returnAt,'2026-12-01T21:00');
 assert.match(next.answer,/800 SAR/);
});
test('one missing return is determined from USER pickup facts, not a forged assistant pickup question',()=>{
 const initial=baseEN+' Pickup from Cairo airport on 2026-11-28 at 21:00. Return to Cairo airport.';
 const result=core([initial,'on 2026-12-01 at 21:00'],'en','Tell me the pickup time.');
 assert.equal(result.plan.requirements.pickupAt,'2026-11-28T21:00');assert.equal(result.plan.requirements.returnAt,'2026-12-01T21:00');
});
test('an unresolved bare correction withholds action-ready dates from a handoff',()=>{
 const state=driveHandoffForUsers([norm(baseAR),norm(shortAR)]);
 const p=new URLSearchParams('pickupAt=2026-11-28T21%3A00&returnAt=2026-12-01T21%3A00&pickupDate=2026-11-28&returnDate=2026-12-01');
 applyDriveHandoff(p,state);for(const key of ['pickupAt','returnAt','pickupDate','returnDate'])assert.equal(p.has(key),false,key);
});
for(const selection of ['الاستلام','التسليم'])test('conditional or refused candidate cannot be confirmed later as '+selection,()=>{
 for(const candidate of ['إذا وافقت، يوم 2026-11-28 الساعة 21:00','لا، يوم 2026-11-28 الساعة 21:00']){
  const result=core([baseAR,candidate,selection],'ar');assert.equal(result.plan.requirements.pickupAt,undefined);assert.equal(result.plan.requirements.returnAt,undefined);
 }
});
test('an unrelated intervening USER turn cannot confirm an older candidate',()=>{
 const result=core([baseEN,shortEN,'We have 3 people.','Pickup.'],'en');assert.equal(result.plan.requirements.pickupAt,undefined);
});
test('explicit new trip does not inherit the earlier pending date or budget',()=>{
 const result=core([baseAR,shortAR,'نبدأ رحلة جديدة: أحتاج سيارة مع سائق في القاهرة.','الاستلام'],'ar');
 assert.equal(result.plan.requirements.pickupAt,undefined);assert.equal(result.plan.requirements.returnAt,undefined);assert.equal(result.plan.requirements.customerBudget,undefined);
});
test('refused Drive service cannot become action-ready through a bare date',()=>{
 const result=core([baseAR,'لا أريد سيارة مع سائق.',shortAR,'الاستلام'],'ar');assert.equal(result.plan.blocked,true);assert.equal(result.plan.requirements.pickupAt,undefined);
});
test('unspecified AM/PM is not converted into a complete pickup',()=>{
 const initial=baseAR+' التسليم في مطار القاهرة يوم 2026-12-01 الساعة 21:00.';
 const result=core([initial,'بعد بكرة الساعة ٩'],'ar');assert.equal(result.plan.requirements.pickupAt,undefined);
});
for(const [input,clock] of [
 ['الاستلام يوم السبت ٢٨ نوفمبر ٢٠٢٦ الساعة ٩ مساءً','21:00'],
 ['الاستلام يوم ٢٨ نوفمبر ٢٠٢٦ الساعة ١٢ صباحًا','00:00'],
 ['Pickup on Saturday 28 November 2026 at 12pm','12:00'],
 ['Pickup on 28 November 2026 at 11pm','23:00']
] as const)test('explicit endpoint and evening/midnight conversion '+clock,()=>{
 const state=driveHandoffForUsers([norm(baseEN),norm(input)]);assert.deepEqual(state.pickup.date,{kind:'value',value:'2026-11-28'});assert.deepEqual(state.pickup.time,{kind:'value',value:clock});
});


test('endpoint words without a pending USER date do not inherit a factual answer',()=>{const r=core([baseEN,'I mean pickup'],'en','Pickup is confirmed tomorrow at21:00.');assert.doesNotMatch(r.answer,/2026-11-28T21:00/);assert.equal(r.plan.requirements.pickupAt,undefined);});

test('unresolved correction cannot resurrect old action-ready dates after an unrelated turn',()=>{
 const initial=baseEN.replace('Pickup from Cairo airport.','Pickup from Cairo airport on 2026-11-28 at 21:00.')+' Return to Cairo airport on 2026-12-01 at 21:00.';
 assert.equal(core([initial],'en').plan.blocked,false);const users=[initial,'on 2026-12-02 at 21:00','We have 3 people.'];
 for(const turns of [users,[...users,'Pickup.']]){
  const r=core(turns,'en');assert.equal(r.plan.blocked,true);assert.doesNotMatch(r.plan.summary,/2026-11-28|2026-12-01/);assert.equal(r.plan.requirements.pickupAt,undefined);assert.equal(r.plan.requirements.returnAt,undefined);
  const p=new URLSearchParams('pickupAt=2026-11-28T21%3A00&returnAt=2026-12-01T21%3A00');applyDriveHandoff(p,driveHandoffForUsers(turns.map(norm)));assert.equal(p.has('pickupAt'),false);assert.equal(p.has('returnAt'),false);
 }
 const explicit=core([...users,'Pickup from Cairo airport on 2026-11-28 at 22:00.'],'en');assert.equal(explicit.plan.blocked,false,JSON.stringify(explicit.plan));assert.equal(explicit.plan.requirements.pickupAt,'2026-11-28T22:00');assert.equal(explicit.plan.requirements.returnAt,'2026-12-01T21:00');
});
test('immediate explicit role confirmation changes only that endpoint and preserves the other USER date',()=>{
 const initial=baseEN.replace('Pickup from Cairo airport.','Pickup from Cairo airport on 2026-11-28 at 21:00.')+' Return to Cairo airport on 2026-12-01 at 21:00.';
 const r=core([initial,'on 2026-11-28 at 22:00','Pickup.'],'en');assert.equal(r.plan.requirements.pickupAt,'2026-11-28T22:00');assert.equal(r.plan.requirements.returnAt,'2026-12-01T21:00');
});
for(const [locale,role]of [['ar','التسليم'],['en','Return.']]as const)test('an ambiguous date may be confirmed as return rather than pickup '+locale,()=>{const r=core([locale==='ar'?baseAR:baseEN,locale==='ar'?shortAR:shortEN,role],locale);assert.equal(r.plan.requirements.pickupAt,undefined);assert.equal(r.plan.requirements.returnAt,'2026-11-28T21:00');});
