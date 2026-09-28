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
import { runInternalAgent } from '../lib/dabra/agent';
import { planInternalAgentTool } from '../lib/dabra/agent-planner';

function loadModule<T>(file:string, dependencies:Record<string,unknown>):T {
 const require=createRequire(import.meta.url);const exports={};
 runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(id:string)=>id in dependencies?dependencies[id]:require(id),Date},{filename:file});
 return exports as T;
}
const admin=loadModule<typeof import('../lib/auth/admin')>('lib/auth/admin.ts',{
 'server-only':{},'@/lib/auth/identity':identity,'@/lib/auth/team-access':team,
 '@/lib/supabase/server':{},'next/navigation':{redirect:()=>{throw new Error('Unexpected page redirect');},notFound:()=>{throw new Error('Unexpected page guard');}},
});

const customerId='11111111-1111-4111-8111-111111111111';
const otherId='22222222-2222-4222-8222-222222222222';
type Fixture = { role: string; id?: string; active?: boolean; grant?: boolean; country?: string; permission?: string; authError?: boolean; dataError?: boolean; revoked?: boolean };
function setup(config: Fixture) {
 const id=config.id??customerId;
 const seen: URL[]=[];
 const transport: typeof fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input:input.url);seen.push(url);
  assert.equal(init?.method??'GET','GET','all data access is read only');
  let data: unknown=null;
  if(url.pathname.endsWith('/profiles')) data=config.active===false?null:{id,role:config.role,status:'active',deleted_at:null,full_name:'QA'};
  else if(url.pathname.endsWith('/team_access_grants')) data=config.grant?{id:'grant',invited_user_id:id,email:'staff@example.invalid',access_level:'scoped_staff',country_scope:[config.country??'EG'],permissions:[config.permission??'operations:read'],status:config.revoked?'inactive':'active'}:null;
  else if(url.pathname.endsWith('/marketplace_requests')) {
   if(config.dataError)return Response.json({message:'private DB error with sensitive data'},{status:500});
   const rows=[{user_id:customerId,request_reference:'REQ-12345678',status:'awaiting_payment',quote_amount:100,quote_currency:'USD'}, {user_id:otherId,request_reference:'REQ-87654321',status:'request_submitted',quote_amount:200,quote_currency:'USD'}];
   const scoped=rows.filter(row=>(!url.searchParams.has('user_id')||url.searchParams.get('user_id')===`eq.${row.user_id}`)&&(!url.searchParams.has('request_reference')||url.searchParams.get('request_reference')===`eq.${row.request_reference}`));
   data=String(new Headers(init?.headers).get('accept')).includes('object')?(scoped[0]??null):scoped;
  } else throw new Error(`Unexpected table ${url.pathname}`);
  return Response.json(data);
 };
 const client=createClient('http://127.0.0.1:59999','test-public-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:transport}});
 const require=createRequire(import.meta.url);const exports: Record<string,unknown>={};
 const dependencies:Record<string,unknown>={
  'server-only':{},'@/lib/supabase/server':{createSupabaseRequestClient:async()=>config.authError?null:({supabase:client,user:{id,user_metadata:{role:'ceo'}}})},
  '@/lib/auth/identity':identity,'@/lib/auth/admin':admin,'@/lib/auth/team-access':team,
  '@/lib/marketplace/customer-requests':requests,'./agent-contract':contract,
 };
 runInNewContext(ts.transpileModule(readFileSync('lib/dabra/agent-context.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(id:string)=>id in dependencies?dependencies[id]:require(id),Date},{filename:'agent-context.ts'});
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
  assert.equal((await planInternalAgentTool('hello')).status,'disabled');
  process.env.DABRA_INTERNAL_AI_ENABLED='true';delete process.env.OPENAI_API_KEY;
  assert.equal((await planInternalAgentTool('hello')).status,'not_configured');
  process.env.OPENAI_API_KEY='qa-placeholder';process.env.DABRA_INTERNAL_AI_MODEL='test-model';
  let content='{"tool":"operations"}';
  globalThis.fetch=async(url,init)=>{
   assert.equal(String(url),'https://api.openai.com/v1/chat/completions');
   const payload=JSON.parse(String(init?.body));assert.equal(payload.tools,undefined);assert.equal(payload.messages.length,2);
   assert.equal(payload.messages[1].content,'show work queue');assert.equal(payload.model,'test-model');
   return Response.json({choices:[{message:{content}}]});
  };
  assert.equal((await planInternalAgentTool('show work queue')).tool,'operations');
  content='{"tool":"executive","role":"ceo"}';assert.equal((await planInternalAgentTool('show work queue')).status,'invalid');
 }finally{
  globalThis.fetch=originalFetch;
  for(const [key,value]of Object.entries({DABRA_INTERNAL_AI_ENABLED:before.enabled,OPENAI_API_KEY:before.key,DABRA_INTERNAL_AI_MODEL:before.model}))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
