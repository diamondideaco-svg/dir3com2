import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import type * as Binding from '../lib/admin/drive-worker-binding';
import type * as Common from '../lib/notifications/drive-whatsapp';
import type * as Identity from '../lib/auth/identity';
import type * as Team from '../lib/auth/team-access';
import type * as Diagnostic from '../lib/admin/server-binding-diagnostic';
import type * as Route from '../app/api/admin/drive-whatsapp/worker-binding/route';

function load<T>(path: string, dependencies: Record<string, unknown>, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Buffer, URL, Request, Response, AbortSignal, Error,
    fetch: async () => assert.fail('External I/O forbidden'),
    require(name: string) {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return crypto;
      if (name in dependencies) return dependencies[name];
      throw Error('Unexpected dependency: ' + name);
    }, ...globals });
  return exports as T;
}
const common = load<typeof Common>('lib/notifications/drive-whatsapp.ts', {});
const binding = load<typeof Binding>('lib/admin/drive-worker-binding.ts', { '@/lib/notifications/drive-whatsapp': common });
const identity = load<typeof Identity>('lib/auth/identity.ts', {});
const team = load<typeof Team>('lib/auth/team-access.ts', { '@/lib/auth/identity': identity });
const id = '00000000-0000-4000-8000-000000000166';
const secretId = '00000000-0000-4000-8000-000000000167';
const hostname = 'ynupwivgvwcyrsdhtkcc.supabase.co';
const sourceSha = 'a'.repeat(40);
const deploymentId = 'dpl_SYNTHETIC1660000';
const worker = 'SYNTHETIC-ONLY-NOT-A-REAL-WORKER-CREDENTIAL';
const url = 'https://www.dir3com.com/api/admin/drive-whatsapp/worker-binding';
const ready = { code: 'READY', approvalId: id, sourceSha, deploymentId,
  referenceName: 'task166_existing_worker_bearer', secretId: null };
const bound = { ...ready, code: 'BOUND', secretId };

function request(body: unknown = { approvalId: id }, changes: Record<string, string | null> = {}, target = url, method = 'POST') {
  const headers = new Headers({ origin: 'https://www.dir3com.com', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' });
  for (const [k,v] of Object.entries(changes)) { if (v === null) headers.delete(k); else headers.set(k,v); }
  return new Request(target, { method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
}
function fixture() {
  const counts = { auth: 0, state: 0, worker: 0, bind: 0 };
  const outcomes: { preflight: unknown; result: unknown; rpcError: unknown; allowed: boolean; runtime: boolean;
    adminHost: string; publicHost: string; currentWorker: string | undefined } = {
    preflight: ready, result: bound, rpcError: null, allowed: true, runtime: true,
    adminHost: hostname, publicHost: hostname, currentWorker: worker,
  };
  const ctx: Binding.BindingContext = {
    authorize: async () => { counts.auth++; return outcomes.allowed ? {
      adminHostname: outcomes.adminHost, publicHostname: outcomes.publicHost,
      readState: async (approvalId) => { counts.state++; assert.equal(approvalId,id); return { data: outcomes.preflight, error: null }; },
      bind: async (args) => { counts.bind++; assert.equal(JSON.stringify(args), JSON.stringify({ approvalId:id,sourceSha,deploymentId,worker }));
        return { data: outcomes.result, error: outcomes.rpcError }; },
    } : null; },
    runtime: () => outcomes.runtime ? { deploymentId, sha: sourceSha, deploymentUrl: 'https://synthetic166.vercel.app' } : null,
    readWorker: () => { counts.worker++; return outcomes.currentWorker; },
  };
  return { ctx, counts, outcomes };
}
async function code(response: Response) { return (await response.json()).code; }

test('binding matches the approved runtime before reading the worker and emits only safe metadata', async () => {
  const f = fixture();
  const response = await binding.bindExistingWorkerAsCeo(request(), f.ctx);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(), { code:'BOUND_NOT_ACTIVATED',approvalId:id,secretId });
  assert.deepEqual(f.counts, { auth:1,state:1,worker:1,bind:1 });
  assert.match(response.headers.get('cache-control') ?? '',/private, no-store/);
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
});

for (const [name, req] of [
  ['missing origin', () => request(undefined,{origin:null})],
  ['cross origin', () => request(undefined,{origin:'https://evil.invalid'})],
  ['cross-site', () => request(undefined,{'sec-fetch-site':'cross-site'})],
  ['preview host', () => request(undefined,{},'https://synthetic.vercel.app/api/admin/drive-whatsapp/worker-binding')],
  ['query', () => request(undefined,{},url+'?approvalId='+id)],
  ['method', () => request(undefined,{},url,'GET')],
  ['content type', () => request(undefined,{'content-type':'text/plain'})],
  ['extra worker field', () => request({approvalId:id,p_worker:worker})],
  ['malformed approval', () => request({approvalId:'not-an-id'})],
  ['oversized body', () => request({approvalId:id,extra:'x'.repeat(300)})],
] as const) test('binding rejects '+name+' without accessing worker', async () => {
  const f=fixture(); const r=await binding.bindExistingWorkerAsCeo(req(),f.ctx);
  assert.ok(r.status>=400); assert.equal(f.counts.worker,0); assert.equal(f.counts.bind,0);
});

test('unauthorized actor cannot read permit or worker', async () => {
  const f=fixture(); f.outcomes.allowed=false;
  assert.equal(await code(await binding.bindExistingWorkerAsCeo(request(),f.ctx)),'FORBIDDEN');
  assert.deepEqual(f.counts,{auth:1,state:0,worker:0,bind:0});
});
for (const mismatch of ['sourceSha','deploymentId','approvalId','referenceName'] as const) test('permit '+mismatch+' mismatch never reads worker',async()=>{
  const f=fixture(); f.outcomes.preflight={...ready,[mismatch]:mismatch==='sourceSha'?'b'.repeat(40):mismatch==='approvalId'?secretId:'wrong'};
  assert.ok((await binding.bindExistingWorkerAsCeo(request(),f.ctx)).status>=400);
  assert.equal(f.counts.worker,0); assert.equal(f.counts.bind,0);
});
for (const reason of ['EXPIRED','REVOKED','NOT_APPROVED','CONFLICT_STOP','INCONSISTENT_STOP','UNCONFIRMED_CHECK_METADATA']) test('permit '+reason+' is not a binding authorization',async()=>{
  const f=fixture(); f.outcomes.preflight={code:reason};
  assert.equal(await code(await binding.bindExistingWorkerAsCeo(request(),f.ctx)),'NOT_READY_CHECK_METADATA');
  assert.equal(f.counts.worker,0); assert.equal(f.counts.bind,0);
});
test('consumed permit short-circuits without re-reading or re-transmitting worker',async()=>{
  const f=fixture(); f.outcomes.preflight=bound;
  assert.equal(await code(await binding.bindExistingWorkerAsCeo(request(),f.ctx)),'ALREADY_BOUND_NO_RETRY');
  assert.equal(f.counts.worker,0); assert.equal(f.counts.bind,0);
});
for (const issue of ['adminHost','publicHost','runtime'] as const) test('unverified '+issue+' fails before state or worker',async()=>{
  const f=fixture(); if(issue==='runtime')f.outcomes.runtime=false;else f.outcomes[issue]='wrong.supabase.co';
  assert.equal(await code(await binding.bindExistingWorkerAsCeo(request(),f.ctx)),'BINDING_IDENTITY_UNVERIFIED');
  assert.equal(f.counts.state,0); assert.equal(f.counts.worker,0);
});
test('unavailable runtime worker is not transmitted',async()=>{
  const f=fixture();f.outcomes.currentWorker=undefined;
  assert.equal(await code(await binding.bindExistingWorkerAsCeo(request(),f.ctx)),'WORKER_UNAVAILABLE');assert.equal(f.counts.bind,0);
});
test('lost/error/malformed write outcomes are scrubbed and never retried',async()=>{
  for(const value of [null,{...bound,sourceSha:'b'.repeat(40)},{code:'BOUND',raw:worker}]){
    const f=fixture();f.outcomes.result=value;
    const text=await(await binding.bindExistingWorkerAsCeo(request(),f.ctx)).text();
    assert.match(text,/UNCONFIRMED_CHECK_METADATA/);assert.ok(!text.includes(worker));assert.equal(f.counts.bind,1);
  }
  const f=fixture();f.outcomes.rpcError={message:worker,details:worker};
  assert.equal(await code(await binding.bindExistingWorkerAsCeo(request(),f.ctx)),'UNCONFIRMED_CHECK_METADATA');assert.equal(f.counts.bind,1);
});
test('transport pins project, POST RPC, redirect error, no-store and one fetch',async()=>{
  let calls=0;
  const transport=binding.bindingTransport(async(input,init)=>{calls++;assert.equal(String(input),`https://${hostname}/rest/v1/rpc/bind_task166_existing_worker`);
    assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');assert.ok(init?.signal);
    return Response.json({ok:true});});
  await transport(`https://${hostname}/rest/v1/rpc/bind_task166_existing_worker`,{method:'POST',body:JSON.stringify({p_worker:worker})});
  assert.equal(calls,1);
});
test('transport rejects alternate destination/query/method before I/O',async()=>{
  let calls=0;const transport=binding.bindingTransport(async()=>{calls++;return Response.json({});});
  for(const [target,method] of [[`https://evil.invalid/rest/v1/rpc/bind_task166_existing_worker`,'POST'],
    [`http://${hostname}/rest/v1/rpc/bind_task166_existing_worker`,'POST'],
    [`https://${hostname}/rest/v1/rpc/bind_task166_existing_worker?key=synthetic`,'POST'],
    [`https://${hostname}/rest/v1/rpc/bind_task166_existing_worker`,'GET'],
    [`https://${hostname}/rest/v1/rpc/arbitrary_rpc`,'POST']]){
    await assert.rejects(transport(target,{method}),/BINDING_TRANSPORT_UNCONFIRMED/);
  }assert.equal(calls,0);
});
test('redirect and network failure cannot fall back, retry or expose a raw error',async()=>{
  for(const response of [new Response(null,{status:302,headers:{Location:'https://evil.invalid'}}),null]){
    let calls=0;const transport=binding.bindingTransport(async()=>{calls++;if(!response)throw Error(worker);return response;});
    await assert.rejects(transport(`https://${hostname}/rest/v1/rpc/bind_task166_existing_worker`,{method:'POST'}),error=>{
      assert.ok(error instanceof Error);assert.equal(error.message,'BINDING_TRANSPORT_UNCONFIRMED');assert.ok(!String(error).includes(worker));return true;
    });assert.equal(calls,1);
  }
});
test('actual route reuses canonical actor guard and protected cookie client, never service_role RPC',async()=>{
  let uid:string=team.CEO_USER_ID;let profileRole='admin';let active=true;let workerReads=0;let binds=0;
  const retries:boolean[]=[];const env:Record<string,string|undefined>={VERCEL:'1',VERCEL_ENV:'production',VERCEL_DEPLOYMENT_ID:deploymentId,
    VERCEL_URL:'synthetic166.vercel.app',VERCEL_GIT_COMMIT_SHA:sourceSha,NEXT_PUBLIC_SUPABASE_URL:`https://${hostname}`};
  Object.defineProperty(env,'DIR3COM_WHATSAPP_WORKER_SECRET',{get(){workerReads++;return worker;}});
  const client={auth:{getUser:async()=>({data:{user:{id:uid}},error:null})},from:()=>{
    const query={select:()=>query,eq:()=>query,is:()=>query,maybeSingle:async()=>({data:{id:uid,role:profileRole,status:active?'active':'inactive',deleted_at:null},error:null})};return query;},
    rpc(name:string,args:Record<string,unknown>){if(name==='bind_task166_existing_worker'){binds++;assert.equal(args.p_worker,worker);}
      return {retry(enabled:boolean){retries.push(enabled);return Promise.resolve({data:name==='get_task166_worker_binding_state'?ready:bound,error:null});}};}};
  const server={createSupabaseServerClient:async(transport:typeof fetch)=>{assert.equal(typeof transport,'function');return client;},getSupabaseAdminHostname:()=>hostname};
  const diagnostic=load<typeof Diagnostic>('lib/admin/server-binding-diagnostic.ts',{'@/lib/supabase/server':server,'@/lib/auth/team-access':team});
  const route=load<typeof Route>('app/api/admin/drive-whatsapp/worker-binding/route.ts',{'@/lib/supabase/server':server,
    '@/lib/auth/team-access':team,'@/lib/admin/server-binding-diagnostic':diagnostic,'@/lib/admin/drive-worker-binding':binding},{process:{env}});
  assert.equal(await code(await route.POST(request())),'BOUND_NOT_ACTIVATED');assert.deepEqual(retries,[false,false]);
  assert.equal(workerReads,1);assert.equal(binds,1);
  for(const role of ['customer','partner','staff','admin']){uid=secretId;profileRole=role;
    assert.equal(await code(await route.POST(request())),'FORBIDDEN');}
  uid=team.CEO_USER_ID;profileRole='admin';active=false;
  assert.equal(await code(await route.POST(request())),'FORBIDDEN');assert.equal(workerReads,1);assert.equal(binds,1);
});

test('real PostgREST client traverses exact canonical profiles read and both RPCs through protected transport',async()=>{
  const paths:string[]=[];let workerReads=0;
  const fetcher:typeof fetch=async(input,init)=>{
    const target=new URL(String(input));paths.push(target.pathname);
    assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
    if(target.pathname==='/rest/v1/profiles'){
      assert.equal(init?.method,'GET');assert.equal(target.searchParams.get('id'),'eq.'+team.CEO_USER_ID);
      assert.equal(init?.body,undefined);
      return Response.json({id:team.CEO_USER_ID,role:'admin',status:'active',deleted_at:null,full_name:'Synthetic CEO'});
    }
    assert.equal(init?.method,'POST');
    if(target.pathname.endsWith('/get_task166_worker_binding_state'))return Response.json(ready);
    assert.equal(target.pathname,'/rest/v1/rpc/bind_task166_existing_worker');
    assert.equal(JSON.parse(String(init?.body)).p_worker,worker);return Response.json(bound);
  };
  const env:Record<string,string|undefined>={VERCEL:'1',VERCEL_ENV:'production',VERCEL_DEPLOYMENT_ID:deploymentId,
    VERCEL_URL:'synthetic166.vercel.app',VERCEL_GIT_COMMIT_SHA:sourceSha,NEXT_PUBLIC_SUPABASE_URL:`https://${hostname}`};
  Object.defineProperty(env,'DIR3COM_WHATSAPP_WORKER_SECRET',{get(){workerReads++;return worker;}});
  const runtimeBinding=load<typeof Binding>('lib/admin/drive-worker-binding.ts',{'@/lib/notifications/drive-whatsapp':common},{fetch:fetcher});
  const server={createSupabaseServerClient:async(transport:typeof fetch)=>{
    assert.equal(typeof transport,'function');
    const rest=createClient(`https://${hostname}`,'sb_publishable_SYNTHETIC_NOT_REAL_166',{
      accessToken:async()=>null,global:{fetch:transport},auth:{persistSession:false,autoRefreshToken:false},
    });
    return {auth:{getUser:async()=>({data:{user:{id:team.CEO_USER_ID}},error:null})},from:rest.from.bind(rest),rpc:rest.rpc.bind(rest)};
  },getSupabaseAdminHostname:()=>hostname};
  const diagnostic=load<typeof Diagnostic>('lib/admin/server-binding-diagnostic.ts',{'@/lib/supabase/server':server,'@/lib/auth/team-access':team});
  const route=load<typeof Route>('app/api/admin/drive-whatsapp/worker-binding/route.ts',{'@/lib/supabase/server':server,
    '@/lib/auth/team-access':team,'@/lib/admin/server-binding-diagnostic':diagnostic,'@/lib/admin/drive-worker-binding':runtimeBinding},{process:{env}});
  assert.equal(await code(await route.POST(request())),'BOUND_NOT_ACTIVATED');assert.equal(workerReads,1);
  assert.deepEqual(paths,['/rest/v1/profiles','/rest/v1/rpc/get_task166_worker_binding_state','/rest/v1/rpc/bind_task166_existing_worker']);
});
