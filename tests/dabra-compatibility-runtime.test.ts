import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { planInternalAgentTool } from '../lib/dabra/agent-planner';
import * as service from '../lib/dabra/continuity-service';
import * as continuity from '../lib/dabra/continuity-chat';
import type { SavedTrip } from '../lib/dabra/continuity-contract';

const trip: SavedTrip = { id: '11111111-1111-4111-8111-111111111111', origin: 'Cairo', destination: 'Riyadh', startDate: '2026-12-12', endDate: '2026-12-14', adults: 2, children: 0, rooms: 1, budget: null, currency: 'USD', families: ['stay'] };
const snapshot = { revision: 1, generation: 0, consentEnabled: true, consentVersion: 'task187-v1', preferences: null, preferencesExpiresAt: null, trip, tripExpiresAt: '2027-01-01T00:00:00Z', updatedAt: null };
function fixture() {
  const require = createRequire(import.meta.url);
  const state: { value: unknown; error: {message: string} | null; role: string } = { value: snapshot, error: null, role: 'customer' };
  let authReads = 0;
  const serverDependencies: Record<string, unknown> = {
    '../supabase/server': { createSupabaseRequestClient: async () => ({ user: {id: 'authenticated-A'}, supabase: { rpc: async () => { authReads++; return {data: state.value, error: state.error}; } } }) },
    '../auth/identity': { resolveCanonicalActiveProfile: async () => ({role: state.role}) },
    './continuity-service': service, './continuity-chat': continuity,
  };
  const serverExports = {};
  runInNewContext(ts.transpileModule(readFileSync('lib/dabra/continuity-chat-server.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports:serverExports,require:(id:string)=>{assert.ok(id in serverDependencies,id);return serverDependencies[id];},process,Date});
  const dependencies: Record<string, unknown> = {
    '@/lib/dabra/continuity-chat-server': serverExports,
    '@/lib/dabra/agent-context': {resolveAgentContext:async()=>({role:'customer',taskAuthority:{kind:'customer',actorId:'authenticated-A',ownerId:'authenticated-A'},isTaskAuthorityCurrent:async()=>state.role==='customer',readRequests:async()=>({kind:'unavailable'})})},
    '@/lib/dabra/agent-planner': {planInternalAgentTool},
  };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync('app/api/ai2/chat/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:(id:string)=>dependencies[id]??require(id),process,Date});
  return { post:(exports as typeof import('../app/api/ai2/chat/route')).POST,state,reads:()=>authReads };
}
const envNames = ['DABRA_CONTINUITY_ENABLED','DABRA_INTERNAL_AI_ENABLED','DABRA_AI_PROVIDER','DABRA_PROVIDER_FALLBACK_ENABLED','DABRA_QWEN_MODEL','QWEN_API_KEY','DASHSCOPE_API_KEY','OPENAI_API_KEY','DABRA_INTERNAL_AI_MODEL','GOOGLE_GENERATIVE_AI_API_KEY','GEMINI_API_KEY','ANTHROPIC_API_KEY','XAI_API_KEY','DEEPSEEK_API_KEY','MISTRAL_API_KEY'];
const initial = Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
const fetchBefore = globalThis.fetch, realNow = Date.now;
let now = Date.parse('2026-10-10T00:00:00Z');
test.beforeEach(()=>{
  now+=3600001; Date.now=()=>now;
  for(const name of envNames)delete process.env[name];
  Object.assign(process.env,{DABRA_CONTINUITY_ENABLED:'true',DABRA_INTERNAL_AI_ENABLED:'true',DABRA_AI_PROVIDER:'qwen',DABRA_PROVIDER_FALLBACK_ENABLED:'true',DABRA_QWEN_MODEL:'synthetic-model',QWEN_API_KEY:'synthetic-key',OPENAI_API_KEY:'synthetic-key',DABRA_INTERNAL_AI_MODEL:'synthetic-model'});
});
test.afterEach(()=>{globalThis.fetch=fetchBefore;Date.now=realNow;for(const [name,value]of Object.entries(initial))if(value===undefined)delete process.env[name];else process.env[name]=value;});
const failures = [
  {status:429,error:{code:'Throttling',message:'PRIVATE_PROVIDER_DETAIL'}},
  {status:429,error:{code:'Throttling.AllocationQuota',message:'Free allocated quota exceeded.'}},
  {status:429,error:{code:'Arrearage',message:'PRIVATE_PROVIDER_DETAIL'}},
  {status:429,error:{code:'Unknown.Quota',message:'PRIVATE_PROVIDER_DETAIL'}},
  {status:503,error:{code:'Throttling.RateQuota',message:'PRIVATE_PROVIDER_DETAIL'}},
];
function request(locale:'ar'|'en',stream:boolean,message:string,refinedTrip=trip) {
  return new NextRequest('http://localhost/api/ai2/chat',{method:'POST',body:JSON.stringify({locale,stream,message,
    continuityTrip:{revision:1,generation:0,trip:refinedTrip},history:[{role:'user',content:'hotel Cairo 2026-12-12 2026-12-14 2 adults 1 room'},{role:'assistant',content:'Booked PRIVATE_HISTORY_MARKER Dubai 9 adults'}]})});
}
async function answer(response:Response,stream:boolean){if(stream)return response.text();const body=await response.json();assert.equal(body.agent.mutations,0);assert.equal(body.provider,'local');return body.answer as string;}
function stayParams(text:string){const match=text.match(/\((\/marketplace[^)]+)\)/);assert.ok(match,text);return new URL(match[1],'https://local.invalid').searchParams;}
for(const locale of ['ar','en'] as const)for(const stream of [false,true])for(const failure of failures){
 test(`${locale} stream=${stream} ${failure.status}/${failure.error.code}: saved trip survives recovery and correction with one inference`,async()=>{
  const f=fixture();let calls=0;
  globalThis.fetch=async(input,init)=>{calls++;assert.match(String(input),/chat\/completions$/);assert.doesNotMatch(String(init?.body),/PRIVATE_HISTORY_MARKER|Riyadh|Cairo/);
    return calls===1?Response.json({error:failure.error},{status:failure.status}):Response.json({choices:[{message:{content:'{"tool":"discover"}'}}]});};
  const response=await f.post(request(locale,stream,locale==='en'?'2 rooms':'2 غرف'));assert.equal(response.status,200);
  const text=await answer(response,stream);assert.ok(text.startsWith(locale==='en'?'You can continue through the platform options below':'يمكنك المتابعة عبر خيارات المنصة أدناه'));
  const params=stayParams(text);assert.equal(params.get('destination'),'riyadh');assert.equal(params.get('checkIn'),'2026-12-12');assert.equal(params.get('checkOut'),'2026-12-14');assert.equal(params.get('adults'),'2');assert.equal(params.get('rooms'),'2');
  assert.doesNotMatch(text,/PRIVATE_|Booked|Dubai|booking confirmed/);assert.equal(calls,1);assert.equal(f.reads(),1);assert.equal(trip.rooms,1,'saved snapshot not mutated');
  const corrected=await f.post(request(locale,stream,locale==='en'?'hotels in Jeddah':'فنادق في جدة',{...trip,rooms:2}));assert.equal(corrected.status,200);
  const next=stayParams(await answer(corrected,stream));assert.equal(next.get('destination'),'jeddah');assert.equal(next.get('rooms'),'2');assert.equal(next.get('checkIn'),'2026-12-12');assert.equal(calls,1,'explicit service correction adds no classifier inference');
 });
}
for(const locale of ['ar','en'] as const)for(const stream of [false,true])for(const change of ['delete','revoke','expiry','account','read-error'] as const){
 test(`${locale} stream=${stream} ${change}: invalid continuity fails closed before classifier`,async()=>{
  const f=fixture();if(change==='delete')f.state.value={...snapshot,trip:null,tripExpiresAt:null};if(change==='revoke')f.state.value={...snapshot,generation:1,consentEnabled:false,trip:null};if(change==='expiry')f.state.value={...snapshot,tripExpiresAt:'2020-01-01T00:00:00Z'};if(change==='account')f.state.value={...snapshot,trip:{...trip,id:'22222222-2222-4222-8222-222222222222'}};if(change==='read-error')f.state.error={message:'PRIVATE_DATABASE_MARKER'};
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected paid request');};
  const response=await f.post(request(locale,stream,locale==='en'?'2 rooms':'2 غرف'));assert.equal(response.status,409);assert.match(response.headers.get('cache-control')!,/private, no-store/);assert.doesNotMatch(await response.text(),/PRIVATE_|Riyadh|Cairo/);assert.equal(calls,0);
 });
}
for(const locale of ['ar','en'] as const)for(const stream of [false,true])test(`${locale} stream=${stream} unavailable request read is truthful`,async()=>{
 const f=fixture();let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected inference');};
 const response=await f.post(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',body:JSON.stringify({locale,stream,message:locale==='en'?'my requests':'طلباتي'})}));assert.equal(response.status,200);
 const text=await answer(response,stream);assert.match(text,/could not be read|تعذر قراءة/);assert.match(text,/\/my-requests/);assert.doesNotMatch(text,/No matching request|booking confirmed|تم الحجز|PRIVATE_/);assert.equal(calls,0);
});
