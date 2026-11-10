import { syntheticClassifierContext, syntheticClassifierPolicy } from './fixtures/task217-classifier-governance-synthetic';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as identity from '../lib/auth/identity';
import * as team from '../lib/auth/team-access';

import * as requests from '../lib/marketplace/customer-requests';
import * as contract from '../lib/dabra/agent-contract';
import * as dashboardContract from '../lib/integration/executive-dashboard-contract';
import { isCredentialBindingCoreProject } from '../lib/dabra/credential-binding';
import { runInternalAgent } from '../lib/dabra/agent';
import { planInternalAgentTool } from '../lib/dabra/agent-planner';

function planGovernedInternalAgentTool(message: string) {
 return planInternalAgentTool(message, undefined, {
  policy: syntheticClassifierPolicy('qa-placeholder'), context: syntheticClassifierContext(),
 });
}

function loadModule<T>(file:string, dependencies:Record<string,unknown>):T {
 const exports={};
 runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(id:string)=>{
  if(Object.hasOwn(dependencies,id))return dependencies[id];
  throw new Error('Unexpected mapped VM dependency: '+id);
 },Date,AbortSignal},{filename:file});
 return exports as T;
}
const admin=loadModule<typeof import('../lib/auth/admin')>('lib/auth/admin.ts',{
 'server-only':{},'@/lib/auth/identity':identity,'@/lib/auth/team-access':team,
 '@/lib/supabase/server':{},'next/navigation':{redirect:()=>{throw new Error('Unexpected page redirect');},notFound:()=>{throw new Error('Unexpected page guard');}},
});

const customerId='11111111-1111-4111-8111-111111111111';
const otherId='22222222-2222-4222-8222-222222222222';
type Fixture = { role: string; id?: string; active?: boolean; grant?: boolean; country?: string; permission?: string; authError?: boolean; dataError?: boolean; revoked?: boolean; project?: string|null; adminProject?: string|null; adminPresent?: boolean; contactRows?: number; contactError?: boolean; badContactStatus?: boolean; metricsError?: boolean; missingCount?: boolean; onDataRead?:()=>void };
function setup(config: Fixture) {
 const id=config.id??customerId;
 const seen: URL[]=[];
 const transport: typeof fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input:input.url);seen.push(url);
  assert.ok(['GET','HEAD'].includes(init?.method??'GET'),'all data access is read only');
  let data: unknown=null;
  if(url.pathname.endsWith('/profiles')) data=config.active===false?null:{id,role:config.role,status:'active',deleted_at:null,full_name:'QA'};
  else if(url.pathname.endsWith('/team_access_grants')) data=config.grant?{id:'grant',invited_user_id:id,email:'staff@example.invalid',access_level:'scoped_staff',country_scope:[config.country??'EG'],permissions:[config.permission??'operations:read'],status:config.revoked?'inactive':'active'}:null;
  else if(url.pathname.endsWith('/marketplace_requests')) {
   if(config.dataError)return Response.json({message:'private DB error with sensitive data'},{status:500});
   const rows=[{user_id:customerId,request_reference:'REQ-12345678',status:'awaiting_payment',quote_amount:100,quote_currency:'USD'}, {user_id:otherId,request_reference:'REQ-87654321',status:'request_submitted',quote_amount:200,quote_currency:'USD'}];
   const scoped=rows.filter(row=>(!url.searchParams.has('user_id')||url.searchParams.get('user_id')===`eq.${row.user_id}`)&&(!url.searchParams.has('request_reference')||url.searchParams.get('request_reference')===`eq.${row.request_reference}`));
   data=String(new Headers(init?.headers).get('accept')).includes('object')?(scoped[0]??null):scoped;
  } else if(url.pathname.endsWith('/bookings')) {
   assert.equal(url.port,'59999','metrics must use the authenticated request client');
   assert.equal(url.searchParams.get('synthetic'),'eq.false');assert.equal(url.searchParams.get('environment'),'eq.production');assert.equal(url.searchParams.get('deleted_at'),'is.null');
   config.onDataRead?.();
   if(config.metricsError)return Response.json({message:'PRIVATE_QUERY_ERROR'},{status:500});
   data=[{id:'PRIVATE_BOOKING_ID',booking_reference:'LIVE-PRIVATE',status:'confirmed',payment_status:'paid',total_amount:125,currency:'SAR',synthetic:false,environment:'production',source_channel:'marketplace'},
     {id:'SYNTHETIC_ROW',status:'confirmed',payment_status:'paid',total_amount:9999,currency:'SAR',synthetic:true,environment:'sandbox'}];
  } else if(['/partner_settlements','/refund_requests','/verification_requests'].some(p=>url.pathname.endsWith(p))) {
   assert.equal(url.port,'59999');assert.equal(init?.method,'HEAD');
   config.onDataRead?.();
   return new Response(null,{headers:config.missingCount?{}:{'content-range':'0-0/2'}});
  } else if(url.pathname.endsWith('/contact_enquiries')) {
   assert.equal(url.port,'59998','the existing privileged inbox is gated and separate');
   assert.equal(url.searchParams.get('select'),'status');assert.equal(url.searchParams.get('limit'),'101');
   assert.match(url.searchParams.get('country')??'',/EG/);assert.doesNotMatch(url.searchParams.get('country')??'',/SA/);
   config.onDataRead?.();
   if(config.contactError)return Response.json({message:'PRIVATE_CONTACT_ERROR'},{status:500});
   data=Array.from({length:config.contactRows??3},(_,i)=>({status:config.badContactStatus?'not-a-state':['received','in_progress','closed'][i%3]}));
  } else throw new Error(`Unexpected table ${url.pathname}`);
  return Response.json(data);
 };
 const client=createClient('http://127.0.0.1:59999','test-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:transport}});
 const adminClient=createClient('http://127.0.0.1:59998','SYNTHETIC-NOT-A-KEY',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:transport}});
 const coreHost='ynupwivgvwcyrsdhtkcc.supabase.co';

 const dashboard=loadModule<typeof import('../lib/integration/dashboard-engine')>('lib/integration/dashboard-engine.ts',{
  'server-only':{},'@/lib/supabase/server':{createSupabaseServerClient:async()=>{throw new Error('Metrics must use the actual request client, not ambient cookies');}},
  '@/lib/integration/executive-dashboard-contract':dashboardContract,
 });
 const require=createRequire(import.meta.url);const exports: Record<string,unknown>={};
 const dependencies:Record<string,unknown>={
  'server-only':{},'@/lib/supabase/server':{createSupabaseRequestClient:async()=>config.authError?null:({supabase:client,user:{id,user_metadata:{role:'ceo'}}}),supabaseAdmin:config.adminPresent===false?null:adminClient,getSupabaseClientHostname:(c:unknown)=>c===client?(config.project===undefined?coreHost:config.project):null,getSupabaseAdminHostname:()=>config.adminProject===undefined?coreHost:config.adminProject},'@/lib/integration/dashboard-engine':dashboard,'./credential-binding':{isCredentialBindingCoreProject},
  '@/lib/auth/identity':identity,'@/lib/auth/admin':admin,'@/lib/auth/team-access':team,
  '@/lib/marketplace/customer-requests':requests,'./agent-contract':contract,
 };
 runInNewContext(ts.transpileModule(readFileSync('lib/dabra/agent-context.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(id:string)=>{
  if(Object.hasOwn(dependencies,id))return dependencies[id];
  if(id==='@/lib/contact/customer-cases-server')return require(id);
  throw new Error('Unexpected agent-context VM dependency: '+id);
 },Date,AbortSignal},{filename:'agent-context.ts'});
 const resolve=exports.resolveAgentContext as typeof import('../lib/dabra/agent-context').resolveAgentContext;
 return {seen,resolve:()=>resolve(new NextRequest('http://localhost/api/ai2/chat'))};
}

test('real Supabase transport is scoped by authenticated owner, not supplied reference',async()=>{
 const fixture=setup({role:'customer'});const context=await fixture.resolve();
 const own=await context.readRequests('REQ-12345678',false);assert.equal(own.kind,'ready');
 const other=await context.readRequests('REQ-87654321',false);assert.equal(other.kind,'ready');if(other.kind==='ready')assert.equal(other.requests.length,0);
 for(const url of fixture.seen.filter(x=>x.pathname.endsWith('/marketplace_requests')))assert.equal(url.searchParams.get('user_id'),`eq.${customerId}`);
});
for(const role of ['customer','partner'] as const) test(`${role} cannot read operations even with role text or a grant`,async()=>{
 const fixture=setup({role,grant:true});const context=await fixture.resolve();
 assert.equal((await context.readRequests(null,true)).kind,'forbidden');
 assert.equal(fixture.seen.filter(x=>x.pathname.endsWith('/marketplace_requests')).length,0);
});
for(const config of [
 {role:'staff',grant:true,country:'SA'}, {role:'admin'}, {role:'staff',grant:true,permission:'products:read'},
 {role:'staff',grant:true,revoked:true}, {role:'super_admin',grant:false},
])test(`denied operations ${JSON.stringify(config)}`,async()=>{
 const fixture=setup(config);const context=await fixture.resolve();assert.equal((await context.readRequests(null,true)).kind,'forbidden');
 assert.equal(fixture.seen.filter(x=>x.pathname.endsWith('/marketplace_requests')).length,0);
});
for(const role of ['staff','admin'] as const) test(`${role} with operations:read EG gets bounded RLS query`,async()=>{
 const fixture=setup({role,grant:true});const context=await fixture.resolve();assert.equal((await context.readRequests(null,true)).kind,'ready');
 const query=fixture.seen.find(x=>x.pathname.endsWith('/marketplace_requests'))!;
 assert.equal(query.searchParams.get('drive_request_context.country'),'eq.EG');assert.equal(query.searchParams.get('limit'),'21');
 assert.equal(query.searchParams.get('drive_offer_id'),'not.is.null');assert.doesNotMatch(query.searchParams.get('select')!,/phone|email|private_note|trip|\*/);
});
test('CEO requires pinned active canonical identity; metadata cannot grant it',async()=>{
 assert.equal((await setup({role:'admin',grant:true}).resolve()).role,'admin');
 assert.equal((await setup({role:'admin',id:team.CEO_USER_ID}).resolve()).role,'ceo');
 assert.equal((await setup({role:'customer',id:team.CEO_USER_ID}).resolve()).role,'customer');
 assert.equal((await setup({role:'admin',id:team.CEO_USER_ID,active:false}).resolve()).role,'guest');
});
test('revocation applies to the next chat request',async()=>{
 const config:Fixture={role:'staff',grant:true};const fixture=setup(config);
 assert.equal((await (await fixture.resolve()).readRequests(null,true)).kind,'ready');config.revoked=true;
 assert.equal((await (await fixture.resolve()).readRequests(null,true)).kind,'forbidden');
});
test('auth missing and database failure are separate, with no private error disclosure',async()=>{
 assert.equal((await (await setup({role:'customer',authError:true}).resolve()).readRequests(null,false)).kind,'authentication_required');
 const context=await setup({role:'customer',dataError:true}).resolve();
 const answer=await runInternalAgent({message:'my requests',locale:'en',history:[],context});
 assert.equal(answer.agent.state,'unavailable');assert.doesNotMatch(answer.answer,/sensitive|private DB error|No matching/);
});
test('optional model classifier has no web tools, no private records, and validates output',async()=>{
 const before={enabled:process.env.DABRA_INTERNAL_AI_ENABLED,key:process.env.OPENAI_API_KEY,model:process.env.DABRA_INTERNAL_AI_MODEL};const originalFetch=globalThis.fetch;
 try{
  delete process.env.DABRA_INTERNAL_AI_ENABLED;
  globalThis.fetch=async()=>{throw new Error('Disabled model called network');};
  assert.equal((await planGovernedInternalAgentTool('hello')).status,'disabled');
  process.env.DABRA_INTERNAL_AI_ENABLED='true';delete process.env.OPENAI_API_KEY;
  assert.equal((await planGovernedInternalAgentTool('hello')).status,'not_configured');
  process.env.OPENAI_API_KEY='qa-placeholder';process.env.DABRA_INTERNAL_AI_MODEL='test-model';
  let content='{"tool":"operations"}';
  globalThis.fetch=async(url,init)=>{
   assert.equal(String(url),'https://api.openai.com/v1/chat/completions');
   const payload=JSON.parse(String(init?.body));assert.equal(payload.tools,undefined);assert.equal(payload.messages.length,2);
   assert.equal(payload.messages[1].content,'show work queue');assert.equal(payload.model,'test-model');
   assert.equal(payload.max_tokens,700);assert.equal(payload.temperature,0);
   assert.equal(payload.max_completion_tokens,undefined);assert.equal(payload.reasoning_effort,undefined);
   return Response.json({model:process.env.DABRA_INTERNAL_AI_MODEL,usage:{prompt_tokens:16,completion_tokens:16},choices:[{message:{content}}]});
  };
  assert.equal((await planGovernedInternalAgentTool('show work queue')).tool,'operations');
  content='{"tool":"executive","role":"ceo"}';assert.equal((await planGovernedInternalAgentTool('show work queue')).status,'invalid');
 }finally{
  globalThis.fetch=originalFetch;
  for(const [key,value]of Object.entries({DABRA_INTERNAL_AI_ENABLED:before.enabled,OPENAI_API_KEY:before.key,DABRA_INTERNAL_AI_MODEL:before.model}))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});

test('approved GPT-5 classifier uses bounded compatible parameters without retries or web tools',async()=>{
 const before={enabled:process.env.DABRA_INTERNAL_AI_ENABLED,key:process.env.OPENAI_API_KEY,model:process.env.DABRA_INTERNAL_AI_MODEL};
 const originalFetch=globalThis.fetch;
 try{
  process.env.DABRA_INTERNAL_AI_ENABLED='true';process.env.OPENAI_API_KEY='qa-placeholder';
  let calls=0;
  globalThis.fetch=async(url,init)=>{
   calls++;
   assert.equal(String(url),'https://api.openai.com/v1/chat/completions');
   const payload=JSON.parse(String(init?.body));
   assert.equal(payload.max_tokens,undefined);assert.equal(payload.temperature,undefined);
   assert.equal(payload.max_completion_tokens,700);assert.equal(payload.reasoning_effort,'minimal');
   assert.equal(payload.tools,undefined);assert.equal(payload.messages.length,2);
   assert.equal(payload.messages[1].content.length,500);
   assert.ok(init?.signal);
   return Response.json({model:process.env.DABRA_INTERNAL_AI_MODEL,usage:{prompt_tokens:16,completion_tokens:16},choices:[{message:{content:'{"tool":"my_requests"}'}}]});
  };
  for(const model of ['gpt-5','gpt-5-2025-08-07','gpt-5-mini','gpt-5-nano']){
   process.env.DABRA_INTERNAL_AI_MODEL=model;
   const result = await planGovernedInternalAgentTool('x'.repeat(600));
   assert.equal(result.tool, 'my_requests'); assert.equal(result.status, 'ok');
   assert.deepEqual(result.attempts, [{ provider: 'openai', model, outcome: 'ok' }]);
  }
  assert.equal(calls,4);
  globalThis.fetch=async()=>{calls++;return Response.json({error:{code:'invalid_request_error'}},{status:400});};
  const rejected = await planGovernedInternalAgentTool('hello');
  assert.equal(rejected.tool, null); assert.equal(rejected.status, 'unavailable');
  assert.equal(rejected.attempts?.[0].outcome, 'invalid_request');
  assert.equal(calls,5,'a rejected classifier request is not retried');
 }finally{
  globalThis.fetch=originalFetch;
  for(const [key,value]of Object.entries({DABRA_INTERNAL_AI_ENABLED:before.enabled,OPENAI_API_KEY:before.key,DABRA_INTERNAL_AI_MODEL:before.model}))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});


test('Task217: canonical customer identity supplies owner scope and rejects mid-task profile deactivation', async () => {
 const config: Fixture = { role: 'customer' }; const fixture = setup(config); const context = await fixture.resolve();
 assert.equal(context.taskAuthority?.kind, 'customer');
 if (context.taskAuthority?.kind === 'customer') {
  assert.equal(context.taskAuthority.actorId, customerId); assert.equal(context.taskAuthority.ownerId, customerId);
 }
 assert.equal(await context.isTaskAuthorityCurrent?.(), true); config.active = false;
 assert.equal(await context.isTaskAuthorityCurrent?.(), false);
 assert.equal(fixture.seen.filter(url => url.pathname.endsWith('/marketplace_requests')).length, 0);
});

test('Task217: role change revokes an already-created task authority', async () => {
 const config: Fixture = { role: 'customer' }; const context = await setup(config).resolve();
 config.role = 'partner'; assert.equal(await context.isTaskAuthorityCurrent?.(), false);
});

test('Task217: Egypt operation authority is server-derived and its revoked grant cannot complete a task', async () => {
 const config: Fixture = { role: 'staff', grant: true, country: 'EG' }; const fixture = setup(config); const context = await fixture.resolve();
 assert.equal(context.taskAuthority?.kind, 'operator');
 if (context.taskAuthority?.kind === 'operator') { assert.equal(context.taskAuthority.country, 'EG'); assert.equal(context.taskAuthority.actorId, customerId); }
 assert.equal(await context.isTaskAuthorityCurrent?.(), true); config.revoked = true;
 assert.equal(await context.isTaskAuthorityCurrent?.(), false);
 assert.equal(fixture.seen.filter(url => url.pathname.endsWith('/marketplace_requests')).length, 0);
});

test('Task217: non-Egypt and absent authentication do not gain a country/owner task authority', async () => {
 const otherCountry = await setup({ role: 'staff', grant: true, country: 'SA' }).resolve();
 assert.equal(otherCountry.taskAuthority?.kind, 'operator');
 if (otherCountry.taskAuthority?.kind === 'operator') assert.equal(otherCountry.taskAuthority.country, null);
 const guest = await setup({ role: 'customer', authError: true }).resolve();
 assert.equal(guest.taskAuthority?.kind, 'guest'); assert.equal(guest.taskAuthorityFailure, 'authentication_required');
});

test('Task217: executive product authority retains canonical CEO verification', async () => {
 const regular = await setup({ role: 'admin', grant: true }).resolve();
 assert.equal(regular.taskAuthority?.kind, 'operator');
 if (regular.taskAuthority?.kind === 'operator') assert.equal(regular.taskAuthority.role, 'admin');
 const ceo = await setup({ role: 'admin', id: team.CEO_USER_ID }).resolve();
 assert.equal(ceo.taskAuthority?.kind, 'operator');
 if (ceo.taskAuthority?.kind === 'operator') assert.equal(ceo.taskAuthority.role, 'ceo');
 assert.equal(await ceo.isTaskAuthorityCurrent?.(), true);
});

test('Task217 role delta: CEO metrics use the same actual request client and return aggregates only',async()=>{
 const fixture=setup({role:'admin',id:team.CEO_USER_ID});const context=await fixture.resolve();
 const result=await context.readExecutiveMetrics!();assert.equal(result.kind,'ready');
 if(result.kind==='ready'){
  assert.deepEqual(result.metrics.productionBookings,{status:'available',value:1});
  assert.deepEqual(result.metrics.confirmedProductionRevenue,{status:'available',value:125});
  assert.deepEqual(JSON.parse(JSON.stringify(result.metrics.failedNotifications)),{status:'unavailable'});
 }
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|LIVE-PRIVATE|SYNTHETIC_ROW|9999/);
 assert.equal(fixture.seen.filter(u=>u.pathname.endsWith('/bookings')).length,1);
});
for(const config of [
 {role:'customer'},{role:'partner'},{role:'admin',grant:true},
 {role:'admin',id:team.CEO_USER_ID,active:false},
])test('Task217 role delta: non-CEO cannot read dashboard '+JSON.stringify(config),async()=>{
 const fixture=setup(config);const context=await fixture.resolve();const result=await context.readExecutiveMetrics?.();
 assert.ok(!result||result.kind==='forbidden');assert.equal(fixture.seen.filter(u=>u.pathname.endsWith('/bookings')).length,0);
});
for(const config of [
 {project:'wrong.supabase.co',adminProject:'wrong.supabase.co'},
 {project:null},{adminProject:null},{adminProject:'wrong.supabase.co'},{adminPresent:false},
])test('Task217 role delta: unknown or non-Core inbox provenance rejects before data '+JSON.stringify(config),async()=>{
 const fixture=setup({role:'staff',grant:true,...config});const context=await fixture.resolve();
 assert.equal((await context.readContactInbox!()).kind,'unavailable');
 assert.equal(fixture.seen.filter(u=>u.pathname.endsWith('/contact_enquiries')).length,0);
});
test('Task217 role delta: CEO metrics require the actual pinned Core client',async()=>{
 const fixture=setup({role:'admin',id:team.CEO_USER_ID,project:'wrong.supabase.co'});const context=await fixture.resolve();
 assert.equal((await context.readExecutiveMetrics!()).kind,'unavailable');assert.equal(fixture.seen.filter(u=>u.pathname.endsWith('/bookings')).length,0);
});
for(const role of ['staff','admin'] as const)test('Task217 role delta: scoped inbox returns bounded state counts only, '+role,async()=>{
 const fixture=setup({role,grant:true,contactRows:101});const context=await fixture.resolve();
 const result=await context.readContactInbox!();assert.equal(result.kind,'ready');
 if(result.kind==='ready'){assert.equal(result.displayed,100);assert.equal(result.truncated,true);assert.equal(result.country,'EG');assert.equal(Object.values(result.counts).reduce((a,b)=>a+b,0),100);}
 assert.doesNotMatch(JSON.stringify(result),/email|phone|message|internal_note|user_id/i);
});
for(const config of [
 {role:'customer',grant:true},{role:'partner',grant:true},{role:'staff',grant:true,country:'SA'},
 {role:'staff',grant:true,permission:'products:read'},{role:'staff',grant:false},
])test('Task217 role delta: inbox ownership/country/permission deny '+JSON.stringify(config),async()=>{
 const fixture=setup(config);const context=await fixture.resolve();
 assert.equal((await context.readContactInbox!()).kind,'forbidden');assert.equal(fixture.seen.filter(u=>u.pathname.endsWith('/contact_enquiries')).length,0);
});
for(const error of ['contactError','badContactStatus'] as const)test('Task217 role delta: inbox '+error+' is unavailable, never empty',async()=>{
 const fixture=setup({role:'staff',grant:true,[error]:true});const context=await fixture.resolve();
 assert.equal((await context.readContactInbox!()).kind,'unavailable');
});
test('Task217 role delta: missing metrics evidence remains unavailable, never zero',async()=>{
 const fixture=setup({role:'admin',id:team.CEO_USER_ID,metricsError:true,missingCount:true});const context=await fixture.resolve();
 const result=await context.readExecutiveMetrics!();assert.equal(result.kind,'ready');
 if(result.kind==='ready')for(const metric of Object.values(result.metrics))assert.deepEqual(JSON.parse(JSON.stringify(metric)),{status:'unavailable'});
});
test('Task217 role delta: post-await grant revocation discards inbox data',async()=>{
 const config:Fixture={role:'staff',grant:true};config.onDataRead=()=>{config.revoked=true;};
 const fixture=setup(config);const context=await fixture.resolve();
 assert.equal((await context.readContactInbox!()).kind,'forbidden');
});
test('Task217 role delta: post-await CEO deactivation discards metrics',async()=>{
 const config:Fixture={role:'admin',id:team.CEO_USER_ID};config.onDataRead=()=>{config.active=false;};
 const fixture=setup(config);const context=await fixture.resolve();
 assert.equal((await context.readExecutiveMetrics!()).kind,'forbidden');
});
