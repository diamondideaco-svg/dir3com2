import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import * as identity from '../lib/auth/identity';
import * as cases from '../lib/contact/customer-cases';
import * as contract from '../lib/contact/contract';
import * as contactHandler from '../lib/contact/handler';
import { isCredentialBindingCoreProject } from '../lib/dabra/credential-binding';
import { runInternalAgentTask } from '../lib/dabra/agent-handoff';

const actor='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const caseId='33333333-3333-4333-8333-333333333333',key='44444444-4444-4444-8444-444444444444';
const reference='CASE-'+caseId,now='2026-11-04T00:00:00.000Z';
const input={name:'SYNTHETIC_CUSTOMER',email:'synthetic-case@example.invalid',phone:'',subject:'service',country:'EG',message:'PRIVATE_CASE_MESSAGE'};
function record() { return {reference,status:'received',subject:'service',country:'EG',createdAt:now,updatedAt:now,events:[{status:'received',createdAt:now}]}; }
function envelope() { return {kind:'ready',cases:[record()],truncated:false,retrievedAt:now}; }
function moduleFor<T>(path:string,deps:Record<string,unknown>):T {
 const require=createRequire(import.meta.url),exports={};
 runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,require:(id:string)=>id in deps?deps[id]:require(id),Date,AbortSignal,URL,Object},{filename:path});
 return exports as T;
}
type Config={auth?:boolean;role?:string;active?:boolean;host?:string|null;adminHost?:string|null;admin?:boolean;rpcError?:boolean;extraDTO?:boolean;onRPC?:()=>void};
function fixture(config:Config={}) {
 const calls:Array<{name:string;body:Record<string,unknown>}>=[];
 const transport:typeof fetch=async(value,init)=>{
  const url=new URL(typeof value==='string'?value:value instanceof URL?value:value.url);
  if(url.pathname.endsWith('/profiles')) return Response.json(config.active===false?null:{id:actor,role:config.role??'customer',status:'active',deleted_at:null,full_name:'SYNTHETIC'});
  if(!url.pathname.includes('/rpc/'))throw Error('Unapproved external SDK target');
  const body=JSON.parse(String(init?.body)),name=url.pathname.split('/').at(-1)!;calls.push({name,body});
  assert.equal(body.p_actor,actor,'RPC actor must come from verified Auth, not JSON');
  config.onRPC?.();
  if(config.rpcError)return Response.json({message:'PRIVATE_DATABASE_DETAILS'},{status:500});
  if(name==='receive_customer_contact_enquiry')return Response.json({kind:'saved',reference:caseId,replay:false});
  assert.equal(name,'get_customer_contact_cases');
  const data=envelope();if(config.extraDTO)Object.assign(data.cases[0],{email:'PRIVATE_EMAIL',internal_note:'PRIVATE_NOTE'});
  return Response.json(data);
 };
 const client=createClient('http://127.0.0.1:59991','SYNTHETIC-NOT-A-KEY',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:transport}});
 const admin=createClient('http://127.0.0.1:59992','SYNTHETIC-NOT-A-KEY',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:transport}});
 const host='ynupwivgvwcyrsdhtkcc.supabase.co';
 const server=moduleFor<typeof import('../lib/contact/customer-cases-server')>('lib/contact/customer-cases-server.ts',{
  'server-only':{},'@/lib/supabase/server':{createSupabaseRequestClient:async()=>config.auth===false?null:{supabase:client,user:{id:actor,user_metadata:{role:'ceo'}}},
   supabaseAdmin:config.admin===false?null:admin,getSupabaseClientHostname:(c:unknown)=>c===client?(config.host===undefined?host:config.host):null,
   getSupabaseAdminHostname:()=>config.adminHost===undefined?host:config.adminHost},
  '@/lib/auth/identity':identity,'@/lib/dabra/credential-binding':{isCredentialBindingCoreProject},
  './contract':contract,'./customer-cases':cases,
 });
 const route=moduleFor<typeof import('../app/api/support/cases/route')>('app/api/support/cases/route.ts',{
  'next/server':{NextRequest,NextResponse},'@/lib/contact/customer-cases-server':server,
  '@/lib/contact/customer-cases':cases,'@/lib/contact/handler':contactHandler,
 });
 return {calls,route,server};
}
function request(method:'GET'|'POST',body:unknown=input,query='') {
 return new NextRequest('http://localhost/api/support/cases'+query,{method,...(method==='POST'?{
  headers:{'content-type':'application/json','idempotency-key':key},body:JSON.stringify(body),
 }:{})});
}
test('case DTO rejects references, unexpected contacts/notes/actor fields and malformed event data',()=>{
 assert.equal(cases.parseCustomerCaseReference(caseId),null);assert.equal(cases.parseCustomerCaseReference('CASE-../../../secret'),null);
 assert.ok(cases.parseCustomerCaseRead(envelope()));
 for(const patch of [{email:'PRIVATE'}, {owner_user_id:other}, {fingerprint:'PRIVATE'}, {events:[{status:'received',createdAt:now,internal_note:'PRIVATE'}]}, {status:'admin'}]) {
  const data=envelope();Object.assign(data.cases[0],patch);assert.equal(cases.parseCustomerCaseRead(data),null);
 }
});
test('actual Case POST uses normal validated input and Auth actor, ignoring forged owner/role fields',async()=>{
 const f=fixture();const response=await f.route.POST(request('POST',{...input,owner_user_id:other,actorId:other,role:'ceo'}));
 assert.equal(response.status,201);assert.match(response.headers.get('cache-control')??'',/private.*no-store/);
 assert.deepEqual(await response.json(),{reference,status:'received',externalDelivery:false});
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'receive_customer_contact_enquiry');
 assert.equal(f.calls[0].body.p_key,key);assert.deepEqual(f.calls[0].body.p_input,input);
 assert.doesNotMatch(JSON.stringify(f.calls[0].body),/owner_user_id|actorId|ceo/);
});
test('actual Case GET returns only explicit owner DTO through a server-bound RPC filter',async()=>{
 const f=fixture(),response=await f.route.GET(request('GET',undefined,'?reference='+reference));
 assert.equal(response.status,200);const value=await response.json();assert.equal(value.cases[0].reference,reference);
 assert.equal(f.calls[0].body.p_case,caseId);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|owner|actor|fingerprint|email|phone|message/);
});
for(const config of [{auth:false},{role:'admin'},{role:'partner'},{active:false},{host:null},{host:'wrong.supabase.co',adminHost:'wrong.supabase.co'},{adminHost:'wrong.supabase.co'},{admin:false}]) {
 test('actual Case API denies auth/role/provenance before RPC '+JSON.stringify(config),async()=>{
  const f=fixture(config);for(const method of ['GET','POST'] as const){
   const response=await f.route[method](request(method));assert.ok([401,403,503].includes(response.status));assert.doesNotMatch(await response.text(),/PRIVATE_|CASE-/);
  }assert.equal(f.calls.length,0);
 });
}
test('actual Case API rejects corrupt DTO and hides internal query errors',async()=>{
 for(const config of [{extraDTO:true},{rpcError:true}]){
  const f=fixture(config),response=await f.route.GET(request('GET'));assert.equal(response.status,503);
  assert.doesNotMatch(await response.text(),/PRIVATE_|CASE-/);
 }
});
for(const method of ['GET','POST'] as const)test('actual Case '+method+' discards data after actor deactivation during RPC',async()=>{
 const config:Config={};config.onRPC=()=>{config.active=false;};const f=fixture(config);
 const response=await f.route[method](request(method));assert.ok([403,503].includes(response.status));
 assert.doesNotMatch(await response.text(),/PRIVATE_|CASE-/);
});
test('actual Case POST retains the existing origin/key/body validation without an anonymous fallback',async()=>{
 const f=fixture();
 const foreign=new NextRequest('http://localhost/api/support/cases',{method:'POST',headers:{origin:'https://external.invalid','content-type':'application/json','idempotency-key':key},body:JSON.stringify(input)});
 assert.equal((await f.route.POST(foreign)).status,403);
 assert.equal((await f.route.POST(request('POST',{...input,message:''}))).status,400);
 assert.equal((await f.route.GET(request('GET',undefined,'?owner='+other))).status,400);
 assert.equal(f.calls.length,0);
});
for(const locale of ['ar','en'] as const)test('Core own Case handoff '+locale+' uses only state DTO and never a provider',async()=>{
 const fetch=globalThis.fetch;let network=0;
 globalThis.fetch=async()=>{network++;throw Error('No live/provider calls');};
 try{
  const result=await runInternalAgentTask({message:locale==='ar'?'جهز ملخص قضية الدعم '+reference:'Draft my support case '+reference,locale,history:[],
   context:{role:'customer',taskAuthority:{kind:'customer',actorId:actor,ownerId:actor},isTaskAuthorityCurrent:async()=>true,
    readRequests:async()=>{throw Error('Case must not read marketplace requests');},
    readSupportCases:async ref=>{assert.equal(ref,reference);const v=cases.parseCustomerCaseRead(envelope());assert.ok(v);return v;},
   }});
  assert.equal(result.kind,'response');if(result.kind==='response'){
   assert.equal(result.response.agent.tool,'support_cases');assert.equal(result.response.agent.mutations,0);
   assert.match(result.response.answer,/CASE-/);assert.match(result.response.answer,/\/support\/cases/);
   assert.doesNotMatch(result.response.answer,/PRIVATE_|example.invalid/);assert.equal(result.response.provider,'local');
  }assert.equal(network,0);
 }finally{globalThis.fetch=fetch;}
});
