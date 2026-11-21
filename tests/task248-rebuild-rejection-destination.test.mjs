import test from 'node:test';
import assert from 'node:assert/strict';
import {driveDialogue,driveBudgetState} from '../lib/dabra/drive-planning.ts';
import {cityRoles,refineRoutingTrip} from '../lib/dabra/trip-routing.ts';

const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const prefs={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const en=['I need a car with a driver','my car budget is 800 SAR per day'];
const ar=['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'];
const dialogue=(base,...turns)=>driveDialogue([...base,...turns].map(norm),prefs);
function cap(s,amount='800',currency='SAR'){assert.equal(s?.budget?.kind,'amount');assert.equal(s.budget.amount,amount);assert.equal(s.budget.currency,currency);assert.equal(s.budget.basis,'day');}

for(const [base,text] of [
 [en,'Do not change my budget from 800 SAR to 1000 EUR'],
 [en,'Do not set my car budget to 1000 EUR per day'],
 [en,'I do not want my budget changed from 800 SAR to 1000 EUR'],
 [ar,'لا تغير ميزانيتي من 800 ريال إلى 1000 يورو'],
 [ar,'لا تجعل ميزانية السيارة 1000 يورو يومياً'],
 [ar,'لا أريد تغيير ميزانيتي من 800 ريال إلى 1000 يورو']
]) test('rejecting a budget change preserves the confirmed source: '+text,()=>{
 const s=dialogue(base,text);cap(s);assert.equal(s.kind,'ready');
 cap(dialogue(base,text,base===en?'show cars':'اعرض السيارات'));
});
for(const [base,text] of [
 [en,"I do not want my budget of 800 SAR to be used"],
 [en,'Do not use my budget of 800 SAR per day'],
 [en,'I do not want to use my car budget of 800 SAR per day'],
 [ar,'لا أريد استخدام ميزانيتي البالغة 800 ريال'],
 [ar,'لا تستخدم ميزانية السيارة 800 ريال يومياً'],
 [ar,'لا أريد أن يتم استخدام ميزانيتي 800 ريال']
]) test('rejecting use of the current budget withdraws it until clarified: '+text,()=>{
 const s=dialogue(base,text);assert.equal(s?.budget,null);assert.equal(s?.kind,'clarify');
 const later=dialogue(base,text,base===en?'show cars':'اعرض السيارات');assert.equal(later?.budget,null);assert.equal(later?.kind,'clarify');
});
for(const [base,text] of [
 [en,'if I approve do not use my car budget of 800 SAR per day'],
 [ar,'إذا وافقت لا تستخدم ميزانية السيارة 800 ريال يومياً']
]) test('a conditional withdrawal does not discard the confirmed budget: '+text,()=>{
 const s=dialogue(base,text);cap(s);assert.equal(s.kind,'clarify');assert.ok(s.pendingBudgets.length);
});
test('a rejected target does not revive a previously rejected current budget',()=>{
 const s=dialogue(en,'Do not use my car budget of 800 SAR per day','Do not set my car budget to 1000 EUR per day');
 assert.equal(s?.budget,null);assert.equal(s?.kind,'clarify');
});
test('a later explicit correction is applied after rejecting a change',()=>{
 const s=dialogue(en,'Do not change my budget from 800 SAR to 1000 EUR','Set my car budget to 900 SAR per day');
 cap(s,'900');assert.equal(s.kind,'ready');
});
test('an unrelated pending service survives withdrawal of the car budget',()=>{
 const s=dialogue(en,'I can spend 1000 EUR on a villa','Do not use my car budget of 800 SAR per day');
 assert.equal(s?.budget,null);assert.ok(s.pendingBudgets.some(p=>p.scope==='other'));assert.equal(s.kind,'clarify');
});
for(const text of ['show cars in Cairo in EUR','show cars in Cairo in euros','اعرض السيارات في القاهرة في اليورو','show cars in Cairo in English','show cars in Cairo in three days']) {
 test('destination remains known when a non-place follows: '+text,()=>{
  const role=cityRoles(text);assert.equal(role.city,'cairo');assert.equal(role.unknownDestination,false);
 });
}
for(const text of ['show cars in Paris in EUR','in Paris, I need a driver in EUR','اعرض السيارات في باريس في اليورو','في باريس أريد سائق باليورو']) {
 test('an unknown destination remains guarded in either order: '+text,()=>assert.equal(cityRoles(text).unknownDestination,true));
}
for(const text of ['show cars in Cairo, not in Paris','اعرض سيارات في القاهرة، لا في باريس']) {
 test('a rejected place is not a positive destination: '+text,()=>assert.equal(cityRoles(text).unknownDestination,false));
}
for(const text of ['I need a transfer from Paris to Cairo','أحتاج توصيل من باريس إلى القاهرة']) {
 test('unknown departure does not reuse a saved origin: '+text,()=>{
  const trip={origin:'Cairo',destination:'Cairo',families:['drive']};
  assert.equal(cityRoles(text).unknownOrigin,true);assert.equal(refineRoutingTrip(trip,text).origin,null);assert.equal(trip.origin,'Cairo');
 });
}
for(const text of ['I need a transfer from Giza to Cairo','أحتاج توصيل من الجيزة إلى القاهرة']) {
 test('known transfer origin and destination stay distinct: '+text,()=>{
  const roles=cityRoles(text);assert.equal(roles.origin,'giza');assert.equal(roles.destination,'cairo');assert.equal(roles.unknownOrigin,false);
 });
}
