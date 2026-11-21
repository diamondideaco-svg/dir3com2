import assert from 'node:assert/strict';
import test from 'node:test';
import {driveBudgetState} from '../lib/dabra/drive-planning';
import {normalizePlatformQuery} from '../lib/dabra/platform-assistant';
const fold=(...turns:string[])=>driveBudgetState(turns.map(normalizePlatformQuery));
const cap={kind:'amount',amount:'900',currency:'SAR',basis:'trip'};
const car='قصدي تخطيط رحلة جديدة: سيارة مع سائق في القاهرة لمدة ٣ أيام لشخصين وشنطتين.';
for(const declaration of [car,car.replace('سيارة مع سائق','أحتاج سيارة مع سائق'),'New trip: car with a driver in Cairo for two people.'])test('Task251 nominal declared car binds later same-trip cap: '+declaration,()=>{
 assert.deepEqual(fold(declaration+' الحد الأعلى ٩٠٠ ريال سعودي إجماليًا.'),{confirmed:cap,pending:[]});
 assert.deepEqual(fold(declaration+' الحد الأعلى ٩٠٠ ريال سعودي إجماليًا.','من ٨ إلى ١٠ ديسمبر ٢٠٢٦. بسقف ٩٠٠ ريال للرحلة كلها.'),{confirmed:cap,pending:[]});
});
for(const text of [
 'إذا وافقت قصدي تخطيط رحلة جديدة: سيارة مع سائق. 900 SAR total',
 'هل أبدأ رحلة جديدة: سيارة مع سائق؟ 900 SAR total',
 'قصدي تخطيط رحلة جديدة: لا أريد سيارة مع سائق. 900 SAR total',
 'قصدي تخطيط رحلة جديدة: فندق في القاهرة. 900 SAR total',
 'قصدي تخطيط رحلة جديدة: سيارة وفندق. 900 SAR total',
 'سيارة مع سائق. 900 SAR total',
 'أفكر في سيارة مع سائق. 900 SAR total',
])test('Task251 no unproven sole active car service: '+text,()=>assert.equal(fold(text.replace(' 900 SAR total',''),'900 SAR total').confirmed,null));
test('Task251 conditional budget stays pending after affirmative nominal car request',()=>{
 const state=fold(car,'إذا وافقت ميزانية السيارة 900 ريال للرحلة');assert.equal(state.confirmed,null);assert.ok(state.pending.some(p=>p.reason==='conditional'));
});
test('Task251 general mixed budget and another-service proposal remain unresolved',()=>{
 const state=fold(car,'my hotel budget is 200 EUR total','overall trip budget is 900 SAR total');
 assert.equal(state.confirmed,null);assert.ok(state.pending.some(p=>p.scope==='other'));assert.ok(state.pending.some(p=>p.scope==='unknown'));
});
test('Task251 fresh trip never inherits a previous car cap',()=>assert.deepEqual(fold('I need a car. my car budget is 800 SAR per day',car),{confirmed:null,pending:[]}));
test('Task251 cancelled car does not bind later bare amount',()=>assert.equal(fold(car,'لا أريد السيارة','900 SAR total').confirmed,null));
test('Task251 conditional and other-service proposals are not erased by a confirmed car cap',()=>{
 const state=fold(car,'if I approve my car budget is 1000 SAR per day','my hotel budget is 200 EUR total','900 SAR total');
 assert.deepEqual(state.confirmed,cap);assert.ok(state.pending.some(p=>p.reason==='conditional'));assert.ok(state.pending.some(p=>p.scope==='other'));
});
