import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from './fixtures/task258-platform-vm.mjs';
import {cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities} from '../lib/dabra/trip-routing.ts';
import {driveDialogue} from '../lib/dabra/drive-planning.ts';

const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const prefs={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
const base=['I need a car with a driver','my car budget is 800 SAR per day'];
for(const [text,kind] of [
 ['start a new trip','new'],['ابدأ رحلة جديدة','new'],
 ['do not start a new trip','continue'],['لا تبدأ رحلة جديدة','continue'],
 ['should I start a new trip?','uncertain'],['هل أبدأ رحلة جديدة؟','uncertain'],
 ['if I approve start a new trip','uncertain'],['إذا وافقت ابدأ رحلة جديدة','uncertain'],
 ['start a new trip, actually keep this trip','continue'],['ابدأ رحلة جديدة، بل ابق على هذه الرحلة','continue'],
 ['start a new trip, actually no driver','new'],['ابدأ رحلة جديدة، بل بدون سائق','new'],
 ['if I approve; actually start a new trip','uncertain'],
 ['start a new trip; perhaps keep this trip','uncertain'],
 ['Can you start a new trip?','new']
]) test('whole-turn trip decision: '+text,()=>{
 const d=newTripRequested.decision?.(text);
 assert.equal(d?.kind,kind);
 assert.equal(newTripRequested(text),kind==='new');
});
for(const text of ['do not start a new trip','لا تبدأ رحلة جديدة','start a new trip, actually keep this trip','ابدأ رحلة جديدة، بل ابق على هذه الرحلة']) {
 test('the drive reducer preserves confirmed budget when the current trip remains: '+text,()=>{
  const s=driveDialogue([...base,text].map(norm),prefs);assert.equal(s?.budget?.amount,'800');assert.equal(s?.kind,'ready');
 });
}
for(const text of ['should I start a new trip?','هل أبدأ رحلة جديدة؟','if I approve start a new trip']) {
 test('uncertain scope retains the budget but blocks readiness: '+text,()=>{
  const s=driveDialogue([...base,text].map(norm),prefs);assert.equal(s?.budget?.amount,'800');assert.equal(s?.kind,'clarify');assert.equal(s?.question,'trip');
 });
}
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={platformConversationScope};';
const api=runInNewContext(code,{cityRoles,newTripRequested,routingPlace,refineRoutingTrip,withoutRoutingCities,
 conversationTopicChange:text=>/new trip|رحله جديده/.test(norm(text))?text:null});
const saved=Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Giza',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']});
const history=base.map(content=>({role:'user',content}));
for(const text of ['do not start a new trip','should I start a new trip?','start a new trip, actually keep this trip','لا تبدأ رحلة جديدة']) {
 test('consumer does not cut trip or history for a non-new decision: '+text,()=>{
  const scoped=api.platformConversationScope(text,history,saved);assert.equal(scoped.trip,saved);assert.equal(scoped.history.length,history.length);
 });
}
test('an explicit new trip cuts the old context',()=>{
 const scoped=api.platformConversationScope('start a new trip',history,saved);assert.equal(scoped.trip,null);assert.equal(scoped.history.length,0);
});
test('text alone cannot restore an anchor after an earlier explicit new trip',()=>{
 const scoped=api.platformConversationScope('resume the saved trip',[{role:'user',content:'start a new trip'},{role:'user',content:'show cars'}],saved);
 assert.equal(scoped.trip,null);
});
