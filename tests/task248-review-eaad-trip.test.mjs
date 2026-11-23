import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from './fixtures/task258-platform-vm.mjs';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveBudgetState} from '../lib/dabra/drive-planning.ts';
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={platformConversationScope,platformProtectedTripScope,platformContext,platformContextText};';
const api=runInNewContext(code,{cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,driveBudgetState,conversationTopicChange:()=>null});
const trip=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']});
const old=[{role:'user',content:'I need a car in Cairo'},{role:'user',content:'my car budget is 800 SAR per day'}];
for(const text of [
 'resume the saved trip but do not use the saved trip',
 'استأنف الرحلة المحفوظة لكن لا تستخدم الرحلة المحفوظة'
]) test('a final refusal takes precedence over an earlier resume in one turn: '+text,()=>{
 const d=newTripRequested.decision(text);assert.equal(d.refused,true);
 const scoped=api.platformConversationScope(text,old,trip);assert.equal(scoped.trip,null);assert.equal(scoped.history.length,0);
 const later=api.platformConversationScope('show cars',[...old,{role:'user',content:text}],trip);assert.equal(later.trip,null);
});
for(const text of [
 'do not use the saved trip but resume the saved trip',
 'لا تستخدم الرحلة المحفوظة لكن استأنف الرحلة المحفوظة'
]) test('a final explicit same-turn resume can be evaluated before a boundary is applied: '+text,()=>{
 const d=newTripRequested.decision(text);assert.equal(d.kind,'continue');assert.equal(d.refused,false);
 const scoped=api.platformConversationScope(text,old,trip);assert.equal(scoped.trip,trip);
});
for(const text of [
 'if I approve start a new trip; never use the saved trip under any circumstances',
 'if I approve start a new trip; actually never use the saved trip under any circumstances',
 'إذا وافقت ابدأ رحلة جديدة؛ لا تستخدم الرحلة المحفوظة أبداً تحت أي ظرف'
]) test('an independent absolute trip refusal survives an earlier conditional proposal: '+text,()=>{
 const d=newTripRequested.decision(text);assert.equal(d.refused,true);
 const scoped=api.platformConversationScope(text,old,trip);assert.equal(scoped.trip,null);
 const later=api.platformConversationScope('show cars',[...old,{role:'user',content:text}],trip);assert.equal(later.trip,null);
});
for(const text of [
 'if I approve; actually never use the saved trip under any circumstances',
 'إذا وافقت؛ بل لا تستخدم الرحلة المحفوظة أبداً تحت أي ظرف'
]) test('a dangling condition is not cancelled solely by a correction marker: '+text,()=>{
 const d=newTripRequested.decision(text);assert.equal(d.kind,'uncertain');assert.equal(d.refused,false);assert.equal(d.contested,true);
 const original=api.platformProtectedTripScope(text,old,trip);
 assert.equal(original.status,'contested');assert.equal(original.anchor,trip);
 assert.equal(original.budget.confirmed.kind,'amount');assert.equal(original.budget.confirmed.amount,'800');
 assert.equal(original.budget.confirmed.currency,'SAR');assert.equal(original.budget.confirmed.basis,'day');
 const originalProjection=api.platformConversationScope(text,old,trip);
 assert.equal(originalProjection.trip,null);assert.equal(originalProjection.history.length,0);assert.equal(originalProjection.tripStatus,'contested');
 const history=[...old,{role:'user',content:'if I approve my car budget is 1000 EUR per day'}];
 const protectedState=api.platformProtectedTripScope(text,history,trip);
 assert.equal(protectedState.status,'contested');assert.equal(protectedState.anchor,trip);
 assert.equal(protectedState.budget.confirmed.kind,'amount');assert.equal(protectedState.budget.confirmed.amount,'800');
 assert.equal(protectedState.budget.confirmed.currency,'SAR');assert.equal(protectedState.budget.confirmed.basis,'day');
 assert.ok(protectedState.budget.pending.some(item=>item.scope==='drive'&&item.reason==='conditional'&&item.value.kind==='amount'&&item.value.amount==='1000'&&item.value.currency==='EUR'&&item.value.basis==='day'));
 const scoped=api.platformConversationScope(text,history,trip);
 assert.equal(scoped.trip,null);assert.equal(scoped.history.length,0);assert.equal(scoped.tripStatus,'contested');
 assert.doesNotMatch(JSON.stringify(scoped),/2026-12-12|11111111-1111|800|1000/);
 assert.equal(api.platformContextText(api.platformContext(text,history,trip)),'trip context requires clarification');
 const nextHistory=[...history,{role:'user',content:text}];
 const next=api.platformConversationScope('show cars',nextHistory,trip);
 assert.equal(next.trip,null);assert.equal(next.history.length,0);assert.equal(next.tripStatus,'contested');
 const retained=api.platformProtectedTripScope('resume the saved trip',nextHistory,trip);
 assert.equal(retained.status,'revalidation');assert.equal(retained.anchor,trip);assert.equal(retained.budget.confirmed.amount,'800');
 assert.ok(retained.budget.pending.some(item=>item.value.kind==='amount'&&item.value.amount==='1000'&&item.value.currency==='EUR'));
 const waiting=api.platformConversationScope('resume the saved trip',nextHistory,trip);
 assert.equal(waiting.trip,null);assert.equal(waiting.history.length,0);assert.equal(waiting.tripStatus,'revalidation');
 assert.doesNotMatch(JSON.stringify(waiting),/2026-12-12|11111111-1111|800|1000/);
});
test('a previous-turn refusal is never undone by a text-only resume',()=>{
 const scoped=api.platformConversationScope('resume the saved trip',[...old,{role:'user',content:'do not use the saved trip'}],trip);
 assert.equal(scoped.trip,null);
});
