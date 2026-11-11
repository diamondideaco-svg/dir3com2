import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInternalAgentTask } from '../lib/dabra/agent-handoff';
import { createSyntheticSuccessfulTaskRunner, successfulTaskInputDigest } from '../lib/dabra/successful-task-development';
import type { FundingRpc } from '../lib/dabra/dialogue-funding-store';
import { successfulTaskRuntimeFixture, syntheticProviderEnvironment } from './fixtures/task237-runtime-synthetic';
import { successfulTaskReplayResponse } from '../lib/dabra/successful-task-replay';
import { POST as replayRoute } from '../app/api/dabra/tasks/route';

test('runtime replay endpoint is hard-disabled, private and no-store regardless of env',async()=>{
 const prior=process.env.DABRA_SUCCESSFUL_TASK_ENABLED;process.env.DABRA_SUCCESSFUL_TASK_ENABLED='true';
 try{const r=await replayRoute(new Request('https://synthetic.invalid/api/dabra/tasks',{method:'POST'}));assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal((await r.json()).enabled,false);}
 finally{if(prior===undefined)delete process.env.DABRA_SUCCESSFUL_TASK_ENABLED;else process.env.DABRA_SUCCESSFUL_TASK_ENABLED=prior;}
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
  const request=()=>new Request('https://synthetic.invalid/api/dabra/tasks',{method:'POST',body:JSON.stringify({requestId:f.requestId,actorId:'IGNORED-CLIENT-IDENTITY'})});
  const rpc:FundingRpc=async(name,p)=>{calls++;assert.equal(p.p_actor_id,publicActor());
   if(name==='read_dabra_successful_task')return {error:null,data:{state:'succeeded',answer:'SYNTHETIC saved answer',language:'en'}};
   assert.equal(name,'get_dabra_successful_task_allowance');return {error:null,data:{dailySucceeded:1,monthlySucceeded:1,dailyPending:1,monthlyPending:1,accountHeldCostMicros:922,totalHeldCostMicros:922}};
  };
  function publicActor(){const a=f.context.taskAuthority;return a&&a.kind!=='guest'?a.actorId:null;}
  const deps={dataScope:'synthetic-only' as const,rpc,resolveInput:async()=>input};
  const response=await successfulTaskReplayResponse(request(),deps);assert.equal(response.status,200);
  assert.equal((await response.json()).answer,'SYNTHETIC saved answer');assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  assert.equal(JSON.parse(response.headers.get('X-DABRA-Successful-Task-Allowance')!).dailyPending,1);assert.equal(f.stats().models,0);assert.equal(calls,2);
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
