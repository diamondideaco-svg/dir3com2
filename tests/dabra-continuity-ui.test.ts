import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ReactElement} from 'react';
import ts from 'typescript';
import * as contract from '../lib/dabra/continuity-contract';
import * as service from '../lib/dabra/continuity-service';
import {ContinuityRequests} from '../lib/dabra/continuity-requests';

// Executes the actual component and event handlers with controlled hook slots
// and network IO. Semantic UI evidence only, not browser/pixel-layout evidence.
function fixture(language:'ar'|'en',expired=false){
 const preferences={replyLanguage:'en',displayCurrency:'USD',travelClass:'business',lodgingStyle:'hotel',itineraryPace:'relaxed'};
 const trip={id:'11111111-1111-4111-8111-111111111111',origin:'Cairo',destination:'Riyadh',startDate:null,endDate:null,adults:2,children:0,rooms:1,budget:5000,currency:'USD',families:['stay']};
 const expiry=new Date(Date.now()+(expired?-1:86400000)).toISOString();
 const snapshot={revision:1,generation:0,consentEnabled:true,consentVersion:'task187-v1',preferences,preferencesExpiresAt:expiry,trip,tripExpiresAt:expiry,updatedAt:new Date().toISOString()};
 const slots:unknown[]=[snapshot,true,preferences,trip,true,false,false,'idle',new ContinuityRequests()];let index=0;const refs:{current:unknown}[]=[];let refIndex=0;
 const callbacks={resumed:null as unknown,applied:null as unknown,forgotten:0};let calls=0;const payloads:unknown[]=[];
 const compiled=ts.transpileModule(readFileSync(new URL('../components/dabra/DabraContinuity.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const require=createRequire(import.meta.url);const exports={} as {default:(props:unknown)=>ReactElement};
 const dependencies:Record<string,unknown>={
  react:{useState:(initial:unknown)=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],(v:unknown)=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef:(initial:unknown)=>{const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useEffect:()=>{}},
  '@/lib/supabase/client':{supabase:{}},'@/lib/dabra/continuity-contract':{...contract,parseSavedTrip:(value:unknown)=>contract.parseSavedTrip(JSON.parse(JSON.stringify(value)))},'@/lib/dabra/continuity-service':service,'@/lib/dabra/continuity-requests':{ContinuityRequests},'./DabraContinuity.module.css':{default:{panel:'panel',grid:'grid',actions:'actions'}},
 };
 runInNewContext(compiled,{exports,require:(id:string)=>id in dependencies?dependencies[id]:require(id),crypto:globalThis.crypto,Date,AbortController,JSON,fetch:async(_url:string,options:{body?:string})=>{calls++;if(options.body)payloads.push(JSON.parse(options.body));return {ok:true,status:200,json:async()=>({enabled:true,ownerId:'user:test',state:{...snapshot,revision:2,preferences:null,preferencesExpiresAt:null,trip:null,tripExpiresAt:null,consentEnabled:false,consentVersion:null}})};}},{filename:'DabraContinuity.tsx'});
 const render=()=>{index=0;refIndex=0;return exports.default({ownerId:'user:test',language,onResume:(intent:unknown,prefs:unknown)=>{callbacks.resumed={intent,prefs};},onApply:(prefs:unknown)=>{callbacks.applied=prefs;},onForget:()=>{callbacks.forgotten++;}});};
 type Element={type:unknown;props:Record<string,unknown>};
 const elements=(node:unknown):Element[]=>{if(Array.isArray(node))return node.flatMap(elements);if(!node||typeof node!=='object'||!('props' in node))return [];const el=node as Element;return [el,...elements(el.props.children)];};
 const button=(label:string)=>{const found=elements(render()).find(el=>el.type==='button'&&el.props.children===label);assert.ok(found,`button ${label}`);return found.props;};
 return {render,button,elements,slots,callbacks,calls:()=>calls,trip,payloads};
}
test('actual AR/EN controls render consent unchecked and saving disabled',()=>{
 for(const language of ['ar','en'] as const){const f=fixture(language);const tree=f.render();const html=renderToStaticMarkup(tree);assert.match(html,language==='ar'?/dir="rtl"/:/dir="ltr"/);assert.match(html,/type="date"/);assert.match(html,/Riyadh/);
  const checkbox=f.elements(tree).filter(el=>el.type==='input'&&el.props.type==='checkbox').at(-1);assert.equal(checkbox?.props.checked,false);
  assert.equal(f.button(language==='ar'?'تأكيد وحفظ':'Confirm and save').disabled,true);
 }
});
test('preference-only display currency edit never relabels a 5000 USD trip budget',async()=>{
 const f=fixture('en');f.slots[2]={...(f.slots[2] as object),displayCurrency:'SAR'};f.slots[5]=true;
 (f.button('Confirm and save').onClick as ()=>void)();await new Promise<void>(resolve=>setImmediate(resolve));
 const request=f.payloads[0] as {payload:{trip:{currency:string;budget:number};preferences:{displayCurrency:string}}};
 assert.equal(request.payload.preferences.displayCurrency,'SAR');assert.equal(request.payload.trip.currency,'USD');assert.equal(request.payload.trip.budget,5000);
});
test('only an explicit trip budget currency edit can change its denomination',async()=>{
 const f=fixture('en');const select=f.elements(f.render()).find(el=>el.type==='select'&&el.props['aria-label']==='Trip budget currency');assert.ok(select);
 (select.props.onChange as (e:unknown)=>void)({target:{value:'SAR'}});assert.equal(f.slots[5],false);f.slots[5]=true;
 (f.button('Confirm and save').onClick as ()=>void)();await new Promise<void>(resolve=>setImmediate(resolve));
 const request=f.payloads[0] as {payload:{trip:{currency:string;budget:number}}};assert.equal(request.payload.trip.currency,'SAR');assert.equal(request.payload.trip.budget,5000);
});
test('resume stages the same safe intent without any network call; expired state cannot resume',()=>{
 const f=fixture('en');(f.button('Resume trip').onClick as ()=>void)();assert.deepEqual(JSON.parse(JSON.stringify(f.callbacks.resumed)),{intent:f.trip,prefs:f.slots[2]});assert.equal(f.calls(),0);
 const expired=fixture('en',true);(expired.button('Resume trip').onClick as ()=>void)();assert.equal(expired.callbacks.resumed,null);assert.equal(expired.calls(),0);
 (expired.button('Use choices').onClick as ()=>void)();assert.equal(expired.callbacks.applied,null);
});
test('revoke performs one account mutation then detaches local planning state',async()=>{
 const f=fixture('en');(f.button('Disable memory and delete all').onClick as ()=>void)();await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(f.calls(),1);assert.equal(f.callbacks.forgotten,1);assert.equal((f.slots[0] as {consentEnabled:boolean}).consentEnabled,false);assert.equal(f.slots[5],false);
});
