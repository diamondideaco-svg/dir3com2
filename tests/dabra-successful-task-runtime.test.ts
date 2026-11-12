import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import { runInternalAgentTask } from '../lib/dabra/agent-handoff';
import { boundedSuccessfulTaskRpc, createSyntheticSuccessfulTaskRunner, successfulTaskInputDigest } from '../lib/dabra/successful-task-development';
import type { FundingRpc } from '../lib/dabra/dialogue-funding-store';
import { successfulTaskRuntimeFixture, syntheticProviderEnvironment } from './fixtures/task237-runtime-synthetic';
import { successfulTaskReplayResponse } from '../lib/dabra/successful-task-replay';
import { SUCCESSFUL_TASK_POLICY } from '../lib/dabra/successful-task-contract';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { readSuccessfulTaskProductionPolicy } from '../lib/dabra/successful-task-production-policy';

test('synchronous RPC throw settles once without leaking an abort listener or delayed rejection', async () => {
 const failure = new Error('SYNTHETIC synchronous RPC failure');
 let calls = 0, bounded: AbortSignal | undefined;
 // Deliberately not async: the dependency throws before returning a promise.
 const rpc: FundingRpc = (_name, _params, signal) => { calls++; bounded = signal; throw failure; };
 await assert.rejects(boundedSuccessfulTaskRpc(rpc, 'read_dabra_successful_task', {}), error => error === failure);
 assert.ok(bounded);
 const listenersAfterFailure = getEventListeners(bounded, 'abort').length;
 // Keep the process alive past the real deadline. node:test fails this test if
 // the abandoned timeout promise later emits an unhandled rejection.
 await new Promise(resolve => setTimeout(resolve, 1100));
 assert.equal(bounded.aborted, true);
 assert.equal(calls, 1);
 assert.equal(listenersAfterFailure, 0);
 assert.equal(getEventListeners(bounded, 'abort').length, 0);
});

test('runtime replay endpoint is hard-disabled, private and no-store regardless of env',async()=>{
 // Execute the real route without loading the production session/Next navigation
 // graph into bare react-server Node. The unselected boundary must never run.
 let productionCalls=0,ioCalls=0;
 const route:{POST?:(request:Request)=>Promise<Response>}={};
 const dependencies:Record<string,unknown>={
  'next/server':{NextRequest},
  '@/lib/dabra/successful-task-production-policy':{readSuccessfulTaskProductionPolicy},
  '@/lib/dabra/successful-task-replay':{successfulTaskReplayResponse},
  '@/lib/dabra/successful-task-production-replay':{successfulTaskProductionReplay:()=>{productionCalls++;throw new Error('Unexpected production IO boundary');}},
 };
 vm.runInNewContext(ts.transpileModule(readFileSync('app/api/dabra/tasks/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports:route,Response,require:(id:string)=>{if(!Object.hasOwn(dependencies,id))throw new Error('Unexpected route dependency '+id);return dependencies[id];},
 });
 assert.ok(route.POST);
 const replayRoute=route.POST;
 const previousFetch=globalThis.fetch;
 globalThis.fetch=async()=>{ioCalls++;throw new Error('Unexpected network IO');};
 const prior=process.env.DABRA_SUCCESSFUL_TASK_ENABLED;process.env.DABRA_SUCCESSFUL_TASK_ENABLED='true';
 try{const r=await replayRoute(new Request('https://synthetic.invalid/api/dabra/tasks',{method:'POST'}));assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal((await r.json()).enabled,false);}
 finally{globalThis.fetch=previousFetch;if(prior===undefined)delete process.env.DABRA_SUCCESSFUL_TASK_ENABLED;else process.env.DABRA_SUCCESSFUL_TASK_ENABLED=prior;}
 assert.equal(productionCalls,0);assert.equal(ioCalls,0);
 assert.ok(!readFileSync('app/api/ai2/chat/route.ts','utf8').includes('createSyntheticSuccessfulTaskRunner'));
});

for(const fault of ['', 'invalid-answer', 'network-unknown', 'body-unknown', 'denied', 'lost-save', 'lost-admission', 'no-authority'])test('synthetic actual handoff and saved-answer outcome: '+(fault||'success'),async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  const f=successfulTaskRuntimeFixture('customer',fault==='denied'?'denied':''),input={message:'hotel in Cairo',history:[],locale:'en' as const,context:f.context,intent:{tool:'discover' as const,reference:null,draft:false}};
  let row:Record<string,unknown>|null=null,finishes=0,executions=0;
  const actualFetch=globalThis.fetch;
  if(fault==='invalid-answer')globalThis.fetch=async(url,init)=>String(url).includes('api.openai.com')
   ? Response.json({model:'gpt-6-luna',usage:{prompt_tokens:16,completion_tokens:16},choices:[{message:{content:'SYNTHETIC invalid output'}}]}) : actualFetch(url,init);
  if(fault==='network-unknown')globalThis.fetch=async(url,init)=>{if(String(url).includes('api.openai.com'))throw new TypeError('SYNTHETIC connection lost after possible dispatch');return actualFetch(url,init);};
  if(fault==='body-unknown')globalThis.fetch=async(url,init)=>String(url).includes('api.openai.com')?new Response(new ReadableStream({start(c){c.error(new TypeError('SYNTHETIC body interrupted'));}}),{status:200}):actualFetch(url,init);
  const rpc:FundingRpc=async(name,p,signal)=>{
   if(name==='read_dabra_successful_task')return {error:null,data:!row?{state:'absent'}:row.digest!==p.p_input_digest?{state:'conflict'}:row};
   if(name==='get_dabra_successful_task_policy')return fault==='no-authority'?{error:null,data:{policyId:'dabra-public-monthly-v1',authorities:[]}}:f.rpc('get_dabra_public_dialogue_policy',p,signal);
   if(name==='reserve_dabra_successful_task'){
    if(row)return{error:null,data:{decision:'existing'}};
    const result=await f.rpc('reserve_dabra_public_dialogue_attempt',p,signal);
    if(fault==='denied')return result;
    row={state:'pending',digest:p.p_input_digest};return fault==='lost-admission'?{error:'lost',data:null}:result;
   }
   assert.equal(name,'finish_dabra_successful_task');finishes++;
   row={...row,state:p.p_outcome,answer:p.p_answer,language:p.p_language};
   return fault==='lost-save'?{error:'lost',data:null}:{error:null,data:{state:p.p_outcome}};
  };
  const run=createSyntheticSuccessfulTaskRunner({dataScope:'synthetic-only',rpc,execute:async(i,p,s)=>{
   executions++;return runInternalAgentTask(i,{dialogue:p,signal:s,responseContract:'platform-dialogue'});
  }});
  const result=await run(input,f.requestId,new AbortController().signal);
  if(!fault){assert.equal(result.kind,'answer');assert.equal(result.saved,true);assert.equal(f.stats().models,1);}
  if(fault==='invalid-answer'){assert.equal(result.kind,'failed');assert.equal(result.saved,false);assert.equal(f.stats().holds.length,1);}
  if(fault==='network-unknown'||fault==='body-unknown'){assert.equal(result.kind,'unknown');assert.equal((row as Record<string,unknown>|null)?.state,'unknown');assert.equal(f.stats().holds.length,1);}
  if(fault==='denied'){assert.equal(result.kind,'core');assert.equal(finishes,0);assert.equal(f.stats().models,0);assert.equal(f.stats().holds.length,0);if(result.kind==='core'){assert.equal(result.result.kind,'response');if(result.result.kind==='response')assert.equal(result.result.response.provider,'local');}return;}
  if(fault==='lost-save'){assert.equal(result.kind,'unknown');assert.equal(f.stats().models,1);}
  if(fault==='lost-admission'){assert.equal(result.kind,'pending');assert.equal(f.stats().models,0);}
  if(fault==='no-authority'){assert.equal(result.kind,'core');assert.equal(finishes,0);assert.equal(f.stats().models,0);return;}
  const before=f.stats();const retry=await run(input,f.requestId,new AbortController().signal);
  assert.equal(executions,1);assert.equal(f.stats().claims,1);assert.equal(f.stats().models,before.models);
  if(!fault||fault==='lost-save'){assert.equal(retry.kind,'answer');if(retry.kind==='answer')assert.equal(retry.replay,true);}
  assert.equal((await run({...input,message:'different input'},f.requestId,new AbortController().signal)).kind,'conflict');
  f.revoke();assert.equal((await run(input,f.requestId,new AbortController().signal)).kind,'unavailable');
 } finally {restore();}
});
test('server digest binds identity, language, history and context; synthetic runner rejects non-test runtime',()=>{
 const restore=syntheticProviderEnvironment();
 try{const f=successfulTaskRuntimeFixture(),i={message:'SYNTHETIC',history:[],locale:'en' as const,context:f.context};
  const a=successfulTaskInputDigest(i);assert.notEqual(a,successfulTaskInputDigest({...i,locale:'ar'}));
  assert.notEqual(a,successfulTaskInputDigest({...i,context:{...f.context,taskAuthority:{kind:'customer',actorId:randomUUID(),ownerId:randomUUID()}}}));
  Object.assign(process.env,{NODE_ENV:'production'});
  assert.throws(()=>createSyntheticSuccessfulTaskRunner({dataScope:'synthetic-only',rpc:async()=>({data:null,error:null}),execute:async()=>{throw Error('never');}}),/SYNTHETIC_ONLY/);
 }finally{restore();}
});

test('owner replay route retrieves saved answer with no execution, no-cache and separate pending allowance',async()=>{
 const restore=syntheticProviderEnvironment();
 try{
  const f=successfulTaskRuntimeFixture(),input={message:'SYNTHETIC',history:[],locale:'en' as const,context:f.context};let calls=0;
  const totalHeldCostMicros=SUCCESSFUL_TASK_POLICY.monthlyCostMicros+123_456;
  const request=()=>new Request('https://synthetic.invalid/api/dabra/tasks',{method:'POST',body:JSON.stringify({requestId:f.requestId,actorId:'IGNORED-CLIENT-IDENTITY'})});
  const rpc:FundingRpc=async(name,p)=>{calls++;assert.equal(p.p_actor_id,publicActor());
   if(name==='read_dabra_successful_task')return {error:null,data:{state:'succeeded',answer:'SYNTHETIC saved answer',language:'en'}};
   assert.equal(name,'get_dabra_successful_task_allowance');return {error:null,data:{dailySucceeded:1,monthlySucceeded:1,dailyPending:1,monthlyPending:1,accountHeldCostMicros:922,totalHeldCostMicros}};
  };
  function publicActor(){const a=f.context.taskAuthority;return a&&a.kind!=='guest'?a.actorId:null;}
  const deps={dataScope:'synthetic-only' as const,rpc,resolveInput:async()=>input};
  const response=await successfulTaskReplayResponse(request(),deps);assert.equal(response.status,200);
  const payload=await response.text(),raw=response.headers.get('X-DABRA-Successful-Task-Allowance')!;
  assert.equal(JSON.parse(payload).answer,'SYNTHETIC saved answer');assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.deepEqual(JSON.parse(raw),{dailyRemaining:8,monthlyRemaining:48,dailyPending:1,monthlyPending:1,accountHeldCostMicros:922,costAvailable:false});
  assert.ok(raw.length<=1024);assert.ok([...raw].every(char=>char.charCodeAt(0)<=0x7f));
  for(const serialized of [raw,payload]){assert.ok(!serialized.includes('totalHeldCostMicros'));assert.ok(!serialized.includes(String(totalHeldCostMicros)));}
  assert.equal(f.stats().models,0);assert.equal(calls,2);
  f.revoke();assert.equal((await successfulTaskReplayResponse(request(),deps)).status,404);assert.equal(calls,2);
 }finally{restore();}
});

for(const hang of ['read','allowance'])test('replay deadline actually settles an uncooperative '+hang+' RPC without retry',async()=>{
 const restore=syntheticProviderEnvironment(),keepAlive=setTimeout(()=>{},1800);
 try{
  const f=successfulTaskRuntimeFixture(),input={message:'SYNTHETIC',history:[],locale:'en' as const,context:f.context};let calls=0;
  const rpc:FundingRpc=async(name)=>{calls++;
   if(hang==='read'||name==='get_dabra_successful_task_allowance')return new Promise(()=>{});
   return {error:null,data:{state:'succeeded',answer:'SYNTHETIC',language:'en'}};
  };
  const started=Date.now();const response=await successfulTaskReplayResponse(new Request('https://synthetic.invalid/tasks',{method:'POST',body:JSON.stringify({requestId:f.requestId})}),{dataScope:'synthetic-only',rpc,resolveInput:async()=>input});
  assert.equal(response.status,503);assert.ok(Date.now()-started<1700);assert.equal(calls,hang==='read'?1:2);assert.equal(f.stats().models,0);
 }finally{clearTimeout(keepAlive);restore();}
});
for(const changeAt of ['read','allowance','identity'])test('replay fences a changed project during '+changeAt,async()=>{
 const restore=syntheticProviderEnvironment();
 try{
  const f=successfulTaskRuntimeFixture();let project=true,identities=0;
  const context={...f.context,isDialogueFundingProjectCurrent:()=>project,isTaskAuthorityCurrent:async()=>{identities++;if(changeAt==='identity'&&identities===2)project=false;return true;}};
  const input={message:'SYNTHETIC',history:[],locale:'en' as const,context};
  const rpc:FundingRpc=async(name)=>{
   if(name==='read_dabra_successful_task'){if(changeAt==='read')project=false;return {error:null,data:{state:'succeeded',answer:'SYNTHETIC private answer',language:'en'}};}
   if(changeAt==='allowance')project=false;
   return {error:null,data:{dailySucceeded:1,monthlySucceeded:1,dailyPending:0,monthlyPending:0,accountHeldCostMicros:922,totalHeldCostMicros:922}};
  };
  const response=await successfulTaskReplayResponse(new Request('https://synthetic.invalid/tasks',{method:'POST',body:JSON.stringify({requestId:f.requestId})}),{dataScope:'synthetic-only',rpc,resolveInput:async()=>input});
  assert.ok([404,503].includes(response.status));assert.equal((await response.json()).answer,undefined);assert.equal(f.stats().models,0);
 }finally{restore();}
});

import { callInternalAgentProvider } from '../lib/ai2/runtime/agent-provider-dispatch';
for (const provider of ['openai','gemini','anthropic','xai','deepseek','qwen','mistral'] as const) {
 test('single-attempt '+provider+' distinguishes interrupted body from fully read invalid JSON', async () => {
  const previous=globalThis.fetch; let calls=0;
  try {
   globalThis.fetch=async()=>{calls++;return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));controller.error(new TypeError('SYNTHETIC body disconnected'));}}),{status:200});};
   const invoke=()=>callInternalAgentProvider(provider,{apiKey:'SYNTHETIC',model:'synthetic-model'},'SYNTHETIC',{prompt:'SYNTHETIC',language:'en',timeoutMs:1000,maxOutputTokens:100});
   const interrupted=await invoke();assert.equal(interrupted.ok,false);assert.equal(interrupted.errorCategory,'malformed_response');assert.equal('bodyInterrupted' in interrupted && interrupted.bodyInterrupted,true);assert.equal('status' in interrupted ? interrupted.status : undefined,200);assert.equal(calls,1);
   globalThis.fetch=async()=>{calls++;return new Response('{invalid',{status:200});};
   const invalid=await invoke();assert.equal(invalid.ok,false);assert.equal(invalid.errorCategory,'malformed_response');assert.notEqual('bodyInterrupted' in invalid && invalid.bodyInterrupted,true);assert.equal('status' in invalid ? invalid.status : undefined,200);assert.equal(calls,2);
  }finally{globalThis.fetch=previous;}
 });
}

for (const branch of ['no-authority','denied']) for (const revoke of ['account','project']) test('Core '+branch+' is fenced after '+revoke+' changes during execution', async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  const f=successfulTaskRuntimeFixture('customer',branch==='denied'?'denied':'');let project=true;
  const input={message:'hotel in Cairo',history:[],locale:'en' as const,context:{...f.context,isDialogueFundingProjectCurrent:()=>project},intent:{tool:'discover' as const,reference:null,draft:false}};
  const rpc:FundingRpc=async(name,p,signal)=>{
   if(name==='read_dabra_successful_task')return{error:null,data:{state:'absent'}};
   if(name==='get_dabra_successful_task_policy')return branch==='no-authority'?{error:null,data:{policyId:'dabra-public-monthly-v1',authorities:[]}}:f.rpc('get_dabra_public_dialogue_policy',p,signal);
   assert.equal(name,'reserve_dabra_successful_task');return f.rpc('reserve_dabra_public_dialogue_attempt',p,signal);
  };
  const run=createSyntheticSuccessfulTaskRunner({dataScope:'synthetic-only',rpc,execute:async(i,p,s)=>{
   const result=await runInternalAgentTask(i,{dialogue:p,signal:s,responseContract:'platform-dialogue'});
   if(revoke==='account')f.revoke();else project=false;return result;
  }});
  assert.deepEqual(await run(input,f.requestId,new AbortController().signal),{kind:'unavailable',saved:false});assert.equal(f.stats().models,0);assert.equal(f.stats().holds.length,0);
 }finally{restore();}
});

for(const hang of ['resolve','initial-identity','final-identity'])test('one replay deadline bounds '+hang+' even when it ignores cancellation',async()=>{
 const restore=syntheticProviderEnvironment(),keepAlive=setTimeout(()=>{},1800);
 try {
  const f=successfulTaskRuntimeFixture();let identities=0;let boundedSignal:AbortSignal|undefined;
  const context={...f.context,isTaskAuthorityCurrent:async()=>{identities++;if((hang==='initial-identity'&&identities===1)||(hang==='final-identity'&&identities===5))return new Promise<boolean>(()=>{});return true;}};
  const input={message:'SYNTHETIC',history:[],locale:'en' as const,context};
  const rpc:FundingRpc=async(name)=>({error:null,data:name==='read_dabra_successful_task'?{state:'succeeded',answer:'SYNTHETIC private',language:'en'}:{dailySucceeded:1,monthlySucceeded:1,dailyPending:0,monthlyPending:0,accountHeldCostMicros:922,totalHeldCostMicros:922}});
  const started=Date.now();const response=await successfulTaskReplayResponse(new Request('https://synthetic.invalid/tasks',{method:'POST',body:JSON.stringify({requestId:f.requestId})}),{dataScope:'synthetic-only',rpc,resolveInput:async(_request,signal)=>{boundedSignal=signal;return hang==='resolve'?new Promise(()=>{}):input;}});
  assert.equal(response.status,503);assert.ok(Date.now()-started<1700);assert.equal(boundedSignal?.aborted,true);assert.equal((await response.json()).answer,undefined);assert.equal(f.stats().models,0);
 }finally{clearTimeout(keepAlive);restore();}
});

import { createSyntheticSuccessfulTaskStoreAdapter } from '../lib/dabra/successful-task-store-adapter';
import { readSyntheticSuccessfulTaskAllowance } from '../lib/dabra/successful-task-development';
function storeAdapterFixture(transport: FundingRpc, configure?: (input: Parameters<typeof successfulTaskInputDigest>[0]) => void) {
 const actor=randomUUID(),requestId=randomUUID(),lease=randomUUID(),attempt=randomUUID(),authority=randomUUID();
 let active=true,project=true;
 const input={message:'SYNTHETIC',history:[],locale:'en' as const,context:{role:'customer' as const,
  taskAuthority:{kind:'customer' as const,actorId:actor,ownerId:actor},
  isTaskAuthorityCurrent:async()=>active,isDialogueFundingProjectCurrent:()=>project,readRequests:async()=>({kind:'forbidden' as const})}};
 const identity={p_actor_id:actor,p_request_id:requestId,p_input_digest:successfulTaskInputDigest(input)};
 const reserve={...identity,p_lease_token:lease,p_attempt_id:attempt,p_authority_id:authority,p_input_tokens:1,p_output_tokens:1,p_cost_micros:1,
  p_execution:{schema:'dabra-public-execution-v1',authorityId:authority,profileSha256:'a'.repeat(64),attemptId:attempt,requestId,observation:{synthetic:true}}};
 const finish={...identity,p_lease_token:lease,p_outcome:'failed',p_answer:null,p_language:null};
 configure?.(input);
 const rpc=createSyntheticSuccessfulTaskStoreAdapter({dataScope:'synthetic-only',input,requestId,transport});
 return {input,identity,reserve,finish,rpc,requestId,revoke:()=>{active=false;},changeProject:()=>{project=false;}};
}

test('store adapter preserves all five names and exact parameters without remapping or defaults',async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  const seen:Array<[string,Record<string,unknown>]> = [];
  const f=storeAdapterFixture(async(n,p)=>{seen.push([n,p]);return {data:{synthetic:true},error:null};});
  const calls:Array<[string,Record<string,unknown>]>=[['get_dabra_successful_task_policy',{p_actor_id:f.identity.p_actor_id}],
   ['get_dabra_successful_task_allowance',{p_actor_id:f.identity.p_actor_id}],['read_dabra_successful_task',f.identity],
   ['reserve_dabra_successful_task',f.reserve],['finish_dabra_successful_task',f.finish]];
  for(const [n,p] of calls) assert.deepEqual(await f.rpc(n,p,new AbortController().signal),{data:{synthetic:true},error:null});
  assert.deepEqual(seen,calls);assert.notEqual(seen[3][1],f.reserve);
 }finally{restore();}
});
test('store adapter rejects unknown names, extra keys and malformed bindings before transport',async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  let calls=0;const f=storeAdapterFixture(async()=>{calls++;throw Error('never');});
  const invalid:Array<[string,Record<string,unknown>]>=[
   ...['purge_dabra_successful_task_answers','reserve_dabra_public_dialogue_attempt','get_dabra_dialogue_funding_policy','toString','__proto__'].map(n=>[n,f.identity] as [string,Record<string,unknown>]),
   ['read_dabra_successful_task',{...f.identity,extra:true}],['read_dabra_successful_task',{...f.identity,p_actor_id:randomUUID()}],
   ['read_dabra_successful_task',{...f.identity,p_request_id:randomUUID()}],['read_dabra_successful_task',{...f.identity,p_input_digest:'b'.repeat(64)}],
   ['reserve_dabra_successful_task',{...f.reserve,p_lease_token:'bad'}],['reserve_dabra_successful_task',{...f.reserve,p_cost_micros:250001}],
   ['reserve_dabra_successful_task',{...f.reserve,p_execution:{...f.reserve.p_execution,requestId:randomUUID()}}],
   ['reserve_dabra_successful_task',{...f.reserve,p_execution:{...f.reserve.p_execution,extra:true}}],
   ['finish_dabra_successful_task',{...f.finish,p_outcome:'succeeded'}],['finish_dabra_successful_task',{...f.finish,p_answer:'not allowed'}],
  ];
  for(const [n,p] of invalid) {const r=await f.rpc(n,p,new AbortController().signal);assert.equal(r.data,null);assert.ok(r.error);}
  assert.equal(calls,0);
  Object.assign(process.env,{NODE_ENV:'production'});
  assert.throws(()=>storeAdapterFixture(async()=>({data:null,error:null})),/SYNTHETIC_ONLY/);
  assert.ok((await f.rpc('read_dabra_successful_task',f.identity,new AbortController().signal)).error);assert.equal(calls,0);
  Object.assign(process.env,{NODE_ENV:'test'});
  assert.throws(()=>createSyntheticSuccessfulTaskStoreAdapter({dataScope:'live' as 'synthetic-only',input:f.input,requestId:f.requestId,transport:async()=>({data:null,error:null})}),/SYNTHETIC_ONLY/);
 }finally{restore();}
});
for(const boundary of ['before','transport','identity','final-identity'])for(const revoke of ['authority','project'])test('store adapter fences '+revoke+' at '+boundary,async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  let calls=0;const change=()=>revoke==='authority'?f.revoke():f.changeProject();
  const f=storeAdapterFixture(async()=>{calls++;if(boundary==='transport')change();return {data:{answer:'SYNTHETIC private'},error:null};},input=>{
   if(boundary==='identity'||boundary==='final-identity') {let checks=0;const original=input.context.isTaskAuthorityCurrent!;input.context.isTaskAuthorityCurrent=async()=>{if(++checks===(boundary==='identity'?1:2))change();return original();};}
  });
  if(boundary==='before')change();
  const result=await f.rpc('read_dabra_successful_task',f.identity,new AbortController().signal);
  assert.equal(result.data,null);assert.ok(result.error);assert.equal(calls,boundary==='transport'||boundary==='final-identity'?1:0);
 }finally{restore();}
});
test('store adapter snapshots arguments across waits and refuses changed server actor',async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  let seen:Record<string,unknown>|undefined;
  let changeActor=false;
  const f=storeAdapterFixture(async(_n,p)=>{seen=p;return {data:{state:'failed'},error:null};},input=>{input.context.isTaskAuthorityCurrent=async()=>{if(changeActor)f.input.context.taskAuthority.actorId=randomUUID();else f.finish.p_lease_token=randomUUID();return true;};});
  const originalLease=f.finish.p_lease_token;
  await f.rpc('finish_dabra_successful_task',f.finish,new AbortController().signal);
  assert.equal(seen?.p_lease_token,originalLease);
  seen=undefined;
  changeActor=true;
  assert.ok((await f.rpc('read_dabra_successful_task',f.identity,new AbortController().signal)).error);assert.equal(seen,undefined);
 }finally{restore();}
});
for(const fault of ['throw','hang','abort','already-aborted'])test('store adapter bounds '+fault+' without retry or leaked listener',async()=>{
 const restore=syntheticProviderEnvironment(),keepAlive=setTimeout(()=>{},1800);
 try {
  let calls=0,bounded:AbortSignal|undefined;const controller=new AbortController();
  const f=storeAdapterFixture((_n,_p,s)=>{calls++;bounded=s;if(fault==='throw')throw Error('SYNTHETIC');if(fault==='abort')controller.abort();return new Promise(()=>{});});
  if(fault==='already-aborted')controller.abort();
  const start=Date.now(),result=await f.rpc('read_dabra_successful_task',f.identity,controller.signal);
  assert.equal(result.data,null);assert.ok(result.error);assert.equal(calls,fault==='already-aborted'?0:1);assert.ok(Date.now()-start<1700);
  if(bounded)assert.equal(getEventListeners(bounded,'abort').length,0);
 }finally{clearTimeout(keepAlive);restore();}
});
test('store adapter retains independent failed finish after original cancellation and input change',async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  let calls=0;const f=storeAdapterFixture(async()=>{calls++;return {data:{state:'failed'},error:null};});
  const original=new AbortController();original.abort();
  assert.ok((await f.rpc('finish_dabra_successful_task',f.finish,original.signal)).error);
  // A failed completion uses the captured original digest, not a new digest.
  f.input.message='SYNTHETIC changed after execution';
  assert.deepEqual(await f.rpc('finish_dabra_successful_task',f.finish,new AbortController().signal),{data:{state:'failed'},error:null});
  assert.equal(calls,1);
 }finally{restore();}
});
test('store adapter lost admission stays unknown with one reserve and no funded fallback',async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  const f=successfulTaskRuntimeFixture();
  const input={message:'hotel in Cairo',history:[],locale:'en' as const,context:f.context,intent:{tool:'discover' as const,reference:null,draft:false}};
  let reserves=0,reads=0;const names:string[]=[];
  const rpc=createSyntheticSuccessfulTaskStoreAdapter({dataScope:'synthetic-only',input,requestId:f.requestId,transport:async(n,p,s)=>{
   names.push(n);
   if(n==='read_dabra_successful_task')return {data:{state:++reads===1?'absent':'pending'},error:null};
   if(n==='get_dabra_successful_task_policy')return f.rpc('get_dabra_public_dialogue_policy',p,s);
   assert.equal(n,'reserve_dabra_successful_task');reserves++;
   await f.rpc('reserve_dabra_public_dialogue_attempt',p,s);
   return {data:{decision:'denied'},error:'SYNTHETIC lost response'};
  }});
  const run=createSyntheticSuccessfulTaskRunner({dataScope:'synthetic-only',rpc,execute:async(i,p,s)=>runInternalAgentTask(i,{dialogue:p,signal:s,responseContract:'platform-dialogue'})});
  assert.deepEqual(await run(input,f.requestId,new AbortController().signal),{kind:'pending',saved:false});
  assert.equal(reserves,1);assert.equal(f.stats().claims,1);assert.equal(f.stats().holds.length,1);assert.equal(f.stats().models,0);
  assert.ok(names.every(n=>n.includes('successful_task')));
 }finally{restore();}
});
test('store adapter allowance keeps platform totals server-only and routes remain uninstalled',async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  const f=storeAdapterFixture(async()=>({error:null,data:{dailySucceeded:1,monthlySucceeded:1,dailyPending:0,monthlyPending:0,accountHeldCostMicros:1,totalHeldCostMicros:25_000_001}}));
  const allowance=await readSyntheticSuccessfulTaskAllowance(f.rpc,f.input,new AbortController().signal);
  assert.deepEqual(allowance,{dailyRemaining:9,monthlyRemaining:49,dailyPending:0,monthlyPending:0,accountHeldCostMicros:1,costAvailable:false});
  assert.ok(!JSON.stringify(allowance).includes('totalHeldCostMicros'));
  for(const file of ['app/api/ai2/chat/route.ts','app/api/dabra/tasks/route.ts','lib/dabra/successful-task-chat.ts','lib/dabra/successful-task-replay.ts'])
   assert.ok(!readFileSync(file,'utf8').includes('successful-task-store-adapter'));
 }finally{restore();}
});
for(const phase of ['initial','final'])test('store adapter bounds uncooperative '+phase+' authority wait',async()=>{
 const restore=syntheticProviderEnvironment(),keepAlive=setTimeout(()=>{},1800);
 try {
  let calls=0,checks=0;const f=storeAdapterFixture(async()=>{calls++;return {data:{answer:'SYNTHETIC private'},error:null};},input=>{input.context.isTaskAuthorityCurrent=async()=>++checks===(phase==='initial'?1:2)?new Promise<boolean>(()=>{}):true;});
  const started=Date.now(),result=await f.rpc('read_dabra_successful_task',f.identity,new AbortController().signal);
  assert.equal(result.data,null);assert.ok(result.error);assert.ok(Date.now()-started<1700);assert.equal(calls,phase==='initial'?0:1);
 }finally{clearTimeout(keepAlive);restore();}
});
for(const boundary of ['before','identity','transport'])test('store adapter rejects valid same-actor role change at '+boundary,async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  let calls=0;const change=()=>Object.assign(f.input.context,{role:'partner',taskAuthority:{kind:'partner',actorId:f.identity.p_actor_id}});
  const f=storeAdapterFixture(async()=>{calls++;if(boundary==='transport')change();return {data:{state:'failed'},error:null};},input=>{if(boundary==='identity')input.context.isTaskAuthorityCurrent=async()=>{change();return true;};});
  if(boundary==='before')change();
  assert.ok((await f.rpc('finish_dabra_successful_task',f.finish,new AbortController().signal)).error);
  assert.equal(calls,boundary==='transport'?1:0);
 }finally{restore();}
});
test('store adapter rejects coercible non-string finish outcomes before transport',async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  let calls=0;const f=storeAdapterFixture(async()=>{calls++;return {data:{state:'failed'},error:null};});
  for(const outcome of [['failed'],['unknown'],new String('failed')]) {
   const result=await f.rpc('finish_dabra_successful_task',{...f.finish,p_outcome:outcome},new AbortController().signal);
   assert.equal(calls,0,'non-string outcome must not reach transport');
   assert.equal(result.data,null);assert.ok(result.error);
  }
 }finally{restore();}
});
for(const field of ['actor','outcome','hidden-key'])test('store adapter validates the transmitted snapshot for '+field,async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  const seen:Record<string,unknown>[]=[];const f=storeAdapterFixture(async(_n,p)=>{seen.push(p);return {data:{state:'failed'},error:null};});
  const p:Record<string,unknown>={...f.finish};let reads=0;
  if(field==='actor')Object.defineProperty(p,'p_actor_id',{enumerable:true,get:()=>++reads===1?f.identity.p_actor_id:randomUUID()});
  if(field==='outcome')Object.defineProperty(p,'p_outcome',{enumerable:true,get:()=>++reads<=3?'failed':['failed']});
  if(field==='hidden-key'){Object.defineProperty(p,'p_actor_id',{enumerable:false,value:f.identity.p_actor_id});p.extra=true;}
  await f.rpc('finish_dabra_successful_task',p,new AbortController().signal);
  if(field==='hidden-key')assert.equal(seen.length,0);
  else {assert.equal(seen.length,1);assert.equal(seen[0].p_actor_id,f.identity.p_actor_id);assert.equal(seen[0].p_outcome,'failed');assert.equal(reads,1);}
 }finally{restore();}
});
for(const replacement of ['authority','project','context'])test('store adapter rejects replaced '+replacement+' checker after transport wait',async()=>{
 const restore=syntheticProviderEnvironment();
 try {
  let calls=0;const f=storeAdapterFixture(async()=>{
   calls++;
   if(replacement==='authority') {f.revoke();f.input.context.isTaskAuthorityCurrent=async()=>true;}
   if(replacement==='project') {f.changeProject();f.input.context.isDialogueFundingProjectCurrent=()=>true;}
   if(replacement==='context'){f.revoke();f.changeProject();f.input.context={...f.input.context,isTaskAuthorityCurrent:async()=>true,isDialogueFundingProjectCurrent:()=>true};}
   return {data:{answer:'SYNTHETIC private'},error:null};
  });
  const result=await f.rpc('read_dabra_successful_task',f.identity,new AbortController().signal);
  assert.equal(calls,1);assert.equal(result.data,null);assert.ok(result.error);
 }finally{restore();}
});

for(const lostFinishReply of [false,true])test('store adapter successful lifecycle '+(lostFinishReply?'recovers after committed finish timeout':'saves and replays without redispatch'),async()=>{
 const restore=syntheticProviderEnvironment(),keepAlive=lostFinishReply?setTimeout(()=>{},1800):undefined;
 try {
  const f=successfulTaskRuntimeFixture();
  const input={message:'hotel in Cairo',history:[],locale:'en' as const,context:f.context,intent:{tool:'discover' as const,reference:null,draft:false}};
  let saved:{state:'succeeded';answer:string;language:'en'}|undefined;
  let reservation:Record<string,unknown>|undefined,finishes=0,executions=0,reads=0;
  const attempts:string[]=[];
  const rpc=createSyntheticSuccessfulTaskStoreAdapter({dataScope:'synthetic-only',input,requestId:f.requestId,transport:async(name,p,signal)=>{
   if(name==='read_dabra_successful_task'){reads++;return {error:null,data:saved?{...saved}:reservation?{state:'pending'}:{state:'absent'}};}
   if(name==='get_dabra_successful_task_policy')return f.rpc('get_dabra_public_dialogue_policy',p,signal);
   if(name==='reserve_dabra_successful_task') {
    assert.equal(reservation,undefined,'one admission only');reservation=p;attempts.push(String(p.p_attempt_id));
    return f.rpc('reserve_dabra_public_dialogue_attempt',p,signal);
   }
   assert.equal(name,'finish_dabra_successful_task');finishes++;
   assert.ok(reservation);
   for(const key of ['p_actor_id','p_request_id','p_input_digest','p_lease_token'])assert.equal(p[key],reservation[key]);
   assert.equal(p.p_outcome,'succeeded');assert.equal(p.p_language,'en');assert.equal(typeof p.p_answer,'string');assert.ok(String(p.p_answer).trim());
   saved={state:'succeeded',answer:String(p.p_answer),language:'en'};
   // Persistence succeeds, but transport never delivers the receipt or observes abort.
   return lostFinishReply?new Promise(()=>{}):{error:null,data:{state:'succeeded'}};
  }});
  const run=createSyntheticSuccessfulTaskRunner({dataScope:'synthetic-only',rpc,execute:async(i,p,s)=>{
   executions++;return runInternalAgentTask(i,{dialogue:p,signal:s,responseContract:'platform-dialogue'});
  }});
  const first=await run(input,f.requestId,new AbortController().signal);
  assert.ok(saved);assert.equal(finishes,1);assert.equal(executions,1);assert.equal(attempts.length,1);
  assert.equal(f.stats().claims,1);assert.equal(f.stats().models,1);assert.equal(f.stats().holds.length,1);
  const before=structuredClone(f.stats());assert.ok(before.holds[0].cost>0);assert.equal(before.holds[0].cost,reservation!.p_cost_micros);
  if(lostFinishReply)assert.deepEqual(first,{kind:'unknown',saved:false});
  else assert.deepEqual(first,{kind:'answer',answer:saved.answer,language:'en',saved:true,replay:false});
  assert.equal(reads,lostFinishReply?1:2,'normal success verifies the stored answer before delivery');
  const replay=await run(input,f.requestId,new AbortController().signal);
  assert.deepEqual(replay,{kind:'answer',answer:saved.answer,language:'en',saved:true,replay:true});
  assert.equal(reads,lostFinishReply?2:3);assert.equal(finishes,1);assert.equal(executions,1);assert.equal(attempts.length,1);
  assert.deepEqual(f.stats(),before,'replay adds no claim, hold, cost, model or pricing call');
 }finally{if(keepAlive)clearTimeout(keepAlive);restore();}
});
