import { syntheticContractMeasurement, syntheticOutputAcceptances } from './fixtures/task217-output-qualification-synthetic';
import type { AgentCapabilityProfile } from '../lib/dabra/agent-capabilities';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFundingDialoguePolicy, type FundingRpc } from '../lib/dabra/dialogue-funding-store';
import { loadPublicDialoguePolicy } from '../lib/dabra/public-dialogue-store';
import { PUBLIC_DIALOGUE_POLICY } from '../lib/dabra/public-dialogue-policy';
import { AGENT_DIALOGUE_PROMPT, DEFAULT_AGENT_DIALOGUE_POLICY, PUBLIC_DIALOGUE_DAILY_LIMITS, getAgentDialoguePolicy, prepareAgentProviderAttempt } from '../lib/dabra/agent-dialogue';
import type { AgentContext } from '../lib/dabra/agent-contract';

const context:AgentContext={role:'customer',taskAuthority:{kind:'customer',actorId:'synthetic-config-customer',ownerId:'synthetic-config-customer'},isTaskAuthorityCurrent:async()=>true,isDialogueFundingProjectCurrent:()=>true,readRequests:async()=>({kind:'forbidden'})};
const profile:AgentCapabilityProfile={provider:'gemini',measurement:{capability:'discover',language:'en',model:'qualification-fixture-model',environment:'provider-benchmark',sourceSha:'a'.repeat(40),...syntheticContractMeasurement('discover','en'),measuredAtMs:Date.now()-1,expiresAtMs:Date.now()+600000,latencyMs:1,inputTokenCeiling:4096,outputTokenCeiling:1024,costCeilingUsd:0}};
// TEST-ONLY qualification evidence and RPC seam, not a live benchmark or PostgreSQL engine.
const proof={grantId:'33333333-3333-4333-8333-333333333333',provider:'gemini',model:'qualification-fixture-model',environment:'provider-benchmark',accountId:'synthetic-config-account',projectId:'synthetic-config-project',evidenceSha256:'c'.repeat(64),credentialSha256:'d'.repeat(64),verifiedAtMs:Date.now()-1,expiresAtMs:Date.now()+600000,quotaWindowStartMs:Date.now()-1000,quotaWindowEndMs:Date.now()+3600000,remainingRequests:1000,remainingInputTokens:1000000,remainingOutputTokens:1000000,autoReload:'off',postpaid:'blocked',overdraft:'blocked',concurrentAccountUsage:'bounded',mode:'no-new-charge',enforcement:'provider-hard-no-new-charge'};
const lower={uniqueUsers:2,requestsPerUser:3,requestsTotal:6,inputTokensPerUser:12288,outputTokensPerUser:3072,inputTokensTotal:24576,outputTokensTotal:6144};
const payload={language:'en',units:['SYNTHETIC configuration question']};
const outputAcceptances=syntheticOutputAcceptances([profile]);
for(const [name,daily]of [['default',PUBLIC_DIALOGUE_DAILY_LIMITS],['lower',lower],['twenty',{...PUBLIC_DIALOGUE_DAILY_LIMITS,uniqueUsers:20}]]as const)test('Task217 quota config: '+name+' is propagated exactly from server to admission',async()=>{
 let claims=0;
 const p=await loadFundingDialoguePolicy(context,undefined,async(name,params)=>{
  if(name==='get_dabra_dialogue_funding_policy')return{error:null,data:{enabled:true,profiles:[profile],proofs:[proof],outputAcceptances,maxCostMicros:0,dailyLimits:daily}};
  assert.equal(name,'reserve_dabra_dialogue_attempt');assert.deepEqual(params.p_limits,daily);claims++;
  return{error:null,data:{decision:'admitted',attempt_id:params.p_attempt_id}};
 });
 assert.deepEqual(p.daily,daily);assert.equal(p.profiles.length,1);assert.equal(p.trial,true);assert.deepEqual(p.outputAcceptances,outputAcceptances);
 const permit=await prepareAgentProviderAttempt(context,'en',p,{capability:'discover',message:JSON.stringify(payload),prompt:AGENT_DIALOGUE_PROMPT,inputDigestValue:payload},Date.now()+1000);
 assert.ok(permit);assert.equal(claims,1);
});

for(const [name,acceptances,prompt,message]of [
 ['missing output acceptance',[],AGENT_DIALOGUE_PROMPT,JSON.stringify(payload)],
 ['non-canonical prompt',outputAcceptances,'public synthetic config',JSON.stringify(payload)],
 ['malformed payload',outputAcceptances,AGENT_DIALOGUE_PROMPT,'{}'],
]as const)test('Task217 quota config: '+name+' rejects before reservation',async()=>{
 let claims=0;
 const p=await loadFundingDialoguePolicy(context,undefined,async(name,params)=>{
  if(name==='get_dabra_dialogue_funding_policy')return{error:null,data:{enabled:true,profiles:[profile],proofs:[proof],outputAcceptances:acceptances,maxCostMicros:0,dailyLimits:PUBLIC_DIALOGUE_DAILY_LIMITS}};
  assert.equal(name,'reserve_dabra_dialogue_attempt');claims++;
  return{error:null,data:{decision:'admitted',attempt_id:params.p_attempt_id}};
 });
 const permit=await prepareAgentProviderAttempt(context,'en',p,{capability:'discover',message,prompt,inputDigestValue:payload},Date.now()+1000);
 assert.equal(permit,null);assert.equal(claims,0);
});

for(const [name,daily]of [['missing',undefined],['fraction',{...lower,requestsPerUser:1.5}],['too-many-users',{...lower,uniqueUsers:21}],['global-cap',{...PUBLIC_DIALOGUE_DAILY_LIMITS,requestsTotal:61}],['missing-field',{uniqueUsers:2}],['null',null],['extra-field',{...lower,override:true}]]as const)test('Task217 quota config: '+name+' is blocked without active defaults or legacy escape',async()=>{
 const p=await loadFundingDialoguePolicy(context,undefined,async()=>({error:null,data:{enabled:true,profiles:[profile],proofs:[],maxCostMicros:0,dailyLimits:daily}}));
 assert.equal(p.trial,true);assert.equal(p.profiles.length,0);assert.equal(p.funding?.proofs.length,0);
});
test('Task217 policy config: explicit invalid mode blocks; absence preserves existing legacy policy',async()=>{
 const saved=process.env.DABRA_DIALOGUE_FUNDING_POLICY;
 try{
  delete process.env.DABRA_DIALOGUE_FUNDING_POLICY;assert.equal(await getAgentDialoguePolicy(context),DEFAULT_AGENT_DIALOGUE_POLICY);
  process.env.DABRA_DIALOGUE_FUNDING_POLICY='misconfigured-new-policy';
  const p=await getAgentDialoguePolicy(context);assert.equal(p.trial,true);assert.equal(p.profiles.length,0);
 }finally{if(saved===undefined)delete process.env.DABRA_DIALOGUE_FUNDING_POLICY;else process.env.DABRA_DIALOGUE_FUNDING_POLICY=saved;}
});

for(const outcome of ['denied','aborted','timeout'] as const)
test('closed admission wait diagnostic: '+outcome,async()=>{
 const savedWarn=console.warn,savedFetch=globalThis.fetch;const events:unknown[][]=[];
 const controller=new AbortController();let claims=0,network=0;let waiting!:()=>void;
 const started=new Promise<void>(resolve=>{waiting=resolve;});
 let keepAlive:ReturnType<typeof setTimeout>|undefined;
 try{
  console.warn=(...args:unknown[])=>{events.push(args);};
  globalThis.fetch=async()=>{network++;throw Error('UNEXPECTED_NETWORK');};
  const p=await loadFundingDialoguePolicy(context,undefined,async(name)=>{
   assert.equal(name,'get_dabra_dialogue_funding_policy');
   return{error:null,data:{enabled:true,profiles:[profile],proofs:[proof],outputAcceptances,maxCostMicros:0,dailyLimits:PUBLIC_DIALOGUE_DAILY_LIMITS}};
  });
  const selected={...p,funding:{...p.funding!,admission:{reserve:async()=>{
   claims++;waiting();
   return outcome==='denied'?{kind:'denied' as const}:new Promise<never>(()=>{});
  }}}};
  const unchanged=JSON.stringify(selected);
  const pending=prepareAgentProviderAttempt(context,'en',selected,{capability:'discover',message:JSON.stringify(payload),
   prompt:AGENT_DIALOGUE_PROMPT,inputDigestValue:payload},Date.now()+(outcome==='timeout'?500:10000),controller.signal,()=>null);
  await started;
  if(outcome==='aborted')controller.abort('SYNTHETIC-PRIVATE-ABORT');
  // AbortSignal.timeout timers are unref'd; keep this isolated test alive.
  if(outcome==='timeout')keepAlive=setTimeout(()=>{},1500);
  assert.equal(await pending,null);assert.equal(claims,1);assert.equal(network,0);
  assert.equal(JSON.stringify(selected),unchanged);
  assert.deepEqual(events,[['DABRA_AGENT_PREPARATION',JSON.stringify({capability:'discover',
   reason:outcome==='denied'?'admission_unavailable':outcome==='timeout'?'admission_wait_timeout':'admission_wait_aborted',
   reservation:'unknown',stage:'admission'})]]);
 }finally{if(keepAlive)clearTimeout(keepAlive);console.warn=savedWarn;globalThis.fetch=savedFetch;}
});

for (const failure of ['selection', 'contract', 'configuration', 'actor', 'logger', 'abort', 'deadline'] as const)
test('closed preparation diagnostic retains pre-admission denial: ' + failure, async () => {
 const savedWarn = console.warn, savedFetch = globalThis.fetch;
 const events: unknown[][] = [];
 let claims = 0, network = 0, configurationChecks = 0;
 try {
  console.warn = (...args: unknown[]) => { if (failure === 'logger') throw Error('SYNTHETIC-PRIVATE-LOGGER'); events.push(args); };
  globalThis.fetch = async () => { network++; throw Error('UNEXPECTED_NETWORK'); };
  const p = await loadFundingDialoguePolicy(context, undefined, async (name, params) => {
   if (name === 'get_dabra_dialogue_funding_policy') return { error:null, data:{enabled:true,profiles:[profile],proofs:[proof],outputAcceptances,maxCostMicros:0,dailyLimits:PUBLIC_DIALOGUE_DAILY_LIMITS} };
   claims++;
   return {error:null,data:{decision:'admitted',attempt_id:params.p_attempt_id}};
  });
  const unchanged = JSON.stringify(p);
  const selected = failure === 'selection' ? {...p,profiles:[]} : p;
  const cancellation = new AbortController();
  if (failure === 'abort') cancellation.abort('SYNTHETIC-PRIVATE-CANCELLATION');
  const result = await prepareAgentProviderAttempt(failure === 'actor' ? {...context,isTaskAuthorityCurrent:undefined} : context, 'en', selected,
   {capability:'discover',message:JSON.stringify(payload),prompt:failure === 'contract' ? 'SYNTHETIC-PRIVATE-PROMPT' : AGENT_DIALOGUE_PROMPT,inputDigestValue:payload},
   // Exercise loss of the selected binding, after the new pre-ranking check.
   failure === 'deadline' ? Date.now()-1 : Date.now()+1000, cancellation.signal, () => ++configurationChecks===1?null:'model_mismatch');
  assert.equal(result,null);
  assert.equal(claims,0,'diagnostics must not reserve or refund');
  assert.equal(network,0,'diagnostics must not dispatch or fetch');
  assert.equal(JSON.stringify(p),unchanged,'policy and proof remain unchanged');
  if (failure === 'logger') assert.equal(events.length,0);
  else {
   assert.equal(events.length,1);
   assert.equal(events[0][0],'DABRA_AGENT_PREPARATION');
   const event = JSON.parse(String(events[0][1]));
   assert.deepEqual(Object.keys(event).sort(),['capability','reason','reservation','stage']);
   assert.equal(event.reason, failure === 'selection' ? 'provider_selection_unavailable' : failure === 'contract' ? 'output_contract_unavailable' : failure === 'actor' ? 'policy_or_actor_unavailable' : failure === 'abort' ? 'request_aborted' : failure === 'deadline' ? 'request_deadline_expired' : 'model_mismatch');
   assert.equal(event.stage,'preflight'); assert.equal(event.reservation,'not_attempted');
   assert.equal(event.capability,'discover');
   for (const privateValue of [context.taskAuthority && 'actorId' in context.taskAuthority ? context.taskAuthority.actorId : '', proof.accountId, proof.credentialSha256, profile.measurement.model, 'SYNTHETIC-PRIVATE-PROMPT']) {
    assert.equal(String(events[0][1]).includes(privateValue),false);
   }
  }
 } finally {console.warn=savedWarn;globalThis.fetch=savedFetch;}
});

for(const trial of [false,true]) test('ordinary guest Core path is silent, funded failures stay diagnostic: trial='+trial,async()=>{
 const savedWarn=console.warn;const events:unknown[][]=[];
 let claims=0;
 try{
  console.warn=(...args:unknown[])=>{events.push(args);};
  const guest:AgentContext={role:'guest',taskAuthority:{kind:'guest'},readRequests:async()=>({kind:'authentication_required'})};
  const p={...DEFAULT_AGENT_DIALOGUE_POLICY,trial,admission:{reserve:async()=>{claims++;return 'denied' as const;}}};
  const result=await prepareAgentProviderAttempt(guest,'en',p,{capability:'discover',message:JSON.stringify(payload),prompt:AGENT_DIALOGUE_PROMPT,inputDigestValue:payload},Date.now()+1000);
  assert.equal(result,null);assert.equal(events.length,0);assert.equal(claims,0);
 }finally{console.warn=savedWarn;}
});

for(const failure of ['authentication_required','forbidden','unavailable'] as const) for(const trial of [false,true])
test('context outcome remains distinct from an ordinary guest: '+failure+'/trial='+trial,async()=>{
 const savedWarn=console.warn,savedFetch=globalThis.fetch;const events:unknown[][]=[];
 let claims=0,network=0,privateReads=0,runtimeChecks=0;
 try{
  console.warn=(...args:unknown[])=>{events.push(args);};
  globalThis.fetch=async()=>{network++;throw Error('UNEXPECTED_NETWORK');};
  const guest:AgentContext={role:'guest',taskAuthority:{kind:'guest'},taskAuthorityFailure:failure,
   readRequests:async()=>{privateReads++;throw Error('SYNTHETIC-PRIVATE-CONTEXT-ERROR');}};
  const p={...DEFAULT_AGENT_DIALOGUE_POLICY,trial,admission:{reserve:async()=>{claims++;return 'denied' as const;}}};
  const result=await prepareAgentProviderAttempt(guest,'en',p,{capability:'discover',message:JSON.stringify(payload),prompt:AGENT_DIALOGUE_PROMPT,inputDigestValue:payload},Date.now()+1000,undefined,()=>{runtimeChecks++;return null;});
  assert.equal(result,null);assert.equal(claims,0);assert.equal(network,0);assert.equal(privateReads,0);assert.equal(runtimeChecks,0);
  assert.equal(events.length,failure==='unavailable'?1:0);
  if(failure==='unavailable'){
   assert.equal(events[0][0],'DABRA_AGENT_PREPARATION');
   assert.deepEqual(JSON.parse(String(events[0][1])),{capability:'discover',reason:'context_unavailable',reservation:'not_attempted',stage:'preflight'});
   assert.equal(JSON.stringify(events).includes('SYNTHETIC-PRIVATE-CONTEXT-ERROR'),false);
   assert.equal(JSON.stringify(events).includes(payload.units[0]),false);
  }
 }finally{console.warn=savedWarn;globalThis.fetch=savedFetch;}
});
test('caller AbortSignal timeout before task deadline is request_timeout, never explicit cancellation',async()=>{
 const savedWarn=console.warn;const events:unknown[][]=[];let claims=0;
 const signal=AbortSignal.timeout(1);
 await new Promise<void>(resolve=>{const keepAlive=setTimeout(resolve,100);signal.addEventListener('abort',()=>{clearTimeout(keepAlive);resolve();},{once:true});});
 assert.equal(signal.aborted,true);
 const deadline=Date.now()+10000;
 try{
  console.warn=(...args:unknown[])=>{events.push(args);};
  const p={...DEFAULT_AGENT_DIALOGUE_POLICY,trial:true,admission:{reserve:async()=>{claims++;return 'denied' as const;}}};
  const result=await prepareAgentProviderAttempt(context,'en',p,{capability:'discover',message:JSON.stringify(payload),prompt:AGENT_DIALOGUE_PROMPT,inputDigestValue:payload},deadline,signal);
  assert.equal(result,null);assert.equal(claims,0);assert.ok(Date.now()<deadline);
  assert.equal(events.length,1);
  assert.deepEqual(JSON.parse(String(events[0][1])),{capability:'discover',reason:'request_timeout',reservation:'not_attempted',stage:'preflight'});
 }finally{console.warn=savedWarn;}
});

for(const fault of ['missing','mismatch']as const)test('legacy funding project '+fault+' blocks before its first RPC',async()=>{
 let calls=0;
 const selected={...context,isDialogueFundingProjectCurrent:fault==='missing'?undefined:()=>false};
 const p=await loadFundingDialoguePolicy(selected,undefined,async()=>{calls++;throw Error('MUST_NOT_READ_OTHER_PROJECT');});
 assert.equal(p.profiles.length,0);assert.equal(p.funding?.proofs.length,0);assert.equal(calls,0);
});

for(const outcome of ['abort','timeout']as const)test('uncooperative legacy policy revalidation after a claim ends caller wait: '+outcome,{timeout:2000},async()=>{
 const controller=new AbortController(),savedFetch=globalThis.fetch;
 let reads=0,claims=0,network=0,ready!:()=>void,finishLate!:()=>void;
 const started=new Promise<void>(resolve=>{ready=resolve;});
 const holds:Array<{attempt:string;cost:number}>=[];
 const data={enabled:true,profiles:[profile],proofs:[proof],outputAcceptances,maxCostMicros:0,dailyLimits:PUBLIC_DIALOGUE_DAILY_LIMITS};
 let keepAlive:ReturnType<typeof setTimeout>|undefined;
 try{
  globalThis.fetch=async()=>{network++;throw Error('UNEXPECTED_NETWORK');};
  const p=await loadFundingDialoguePolicy(context,undefined,async(name,params)=>{
   if(name==='get_dabra_dialogue_funding_policy'){
    reads++;
    if(claims){ready();return new Promise<{data:typeof data;error:null}>(resolve=>{finishLate=()=>resolve({data,error:null});});}
    return {data,error:null};
   }
   assert.equal(name,'reserve_dabra_dialogue_attempt');claims++;
   holds.push({attempt:String(params.p_attempt_id),cost:Number(params.p_cost_micros)});
   return {data:{decision:'admitted',attempt_id:params.p_attempt_id},error:null};
  });
  const pending=prepareAgentProviderAttempt(context,'en',p,{capability:'discover',message:JSON.stringify(payload),prompt:AGENT_DIALOGUE_PROMPT,inputDigestValue:payload},Date.now()+(outcome==='timeout'?500:10000),controller.signal,()=>null);
  await started;assert.equal(claims,1);const retained=JSON.stringify(holds);
  if(outcome==='abort')controller.abort();else keepAlive=setTimeout(()=>{},1500);
  assert.equal(await pending,null);assert.equal(claims,1);assert.equal(reads,3);assert.equal(network,0);
  assert.equal(JSON.stringify(holds),retained);
  finishLate();await Promise.resolve();await Promise.resolve();
  assert.equal(claims,1);assert.equal(reads,3);assert.equal(network,0);assert.equal(JSON.stringify(holds),retained);
 }finally{if(keepAlive)clearTimeout(keepAlive);globalThis.fetch=savedFetch;}
});

for (const hangAt of [1,2,3,4,5,6]) for (const outcome of ['abort','timeout'] as const)
test('uncooperative identity check '+hangAt+' ends preparation or permit revalidation: '+outcome,{timeout:2000},async()=>{
 const controller=new AbortController(),savedFetch=globalThis.fetch;
 let reads=0,claims=0,identityChecks=0,dispatches=0,network=0,ready!:()=>void,finishLate!:(valid:boolean)=>void;
 const started=new Promise<void>(resolve=>{ready=resolve;});
 const holds:Array<{attempt:string;cost:number}>=[];
 const data={enabled:true,profiles:[profile],proofs:[proof],outputAcceptances,maxCostMicros:0,dailyLimits:PUBLIC_DIALOGUE_DAILY_LIMITS};
 let keepAlive:ReturnType<typeof setTimeout>|undefined;
 try {
  globalThis.fetch=async()=>{network++;throw Error('UNEXPECTED_NETWORK');};
  const p=await loadFundingDialoguePolicy(context,undefined,async(name,params)=>{
   if(name==='get_dabra_dialogue_funding_policy'){reads++;return {data,error:null};}
   assert.equal(name,'reserve_dabra_dialogue_attempt');claims++;
   holds.push({attempt:String(params.p_attempt_id),cost:Number(params.p_cost_micros)});
   return {data:{decision:'admitted',attempt_id:params.p_attempt_id},error:null};
  });
  const actor:AgentContext={...context,isTaskAuthorityCurrent:async()=>{
   identityChecks++;
   if(identityChecks===hangAt){ready();return new Promise<boolean>(resolve=>{finishLate=resolve;});}
   return true;
  }};
  const unchanged=JSON.stringify(p);
  const pending=(async()=>{
   const permit=await prepareAgentProviderAttempt(actor,'en',p,{capability:'discover',message:JSON.stringify(payload),prompt:AGENT_DIALOGUE_PROMPT,inputDigestValue:payload},Date.now()+(outcome==='timeout'?500:10000),controller.signal,()=>null);
   // Checks 1/2 precede the claim, 3/4 follow it, and 5/6 revalidate the returned permit.
   if(hangAt>4){assert.ok(permit);return await permit.isCurrent()&&permit.isReadyToDispatch()?permit:null;}
   return permit;
  })().then(permit=>{if(permit)dispatches++;return permit;});
  await started;
  const expectedClaims=hangAt>=3?1:0,expectedReads=1+Math.floor(hangAt/2),retained=JSON.stringify(holds);
  assert.equal(claims,expectedClaims);assert.equal(identityChecks,hangAt);assert.equal(reads,expectedReads);
  if(outcome==='abort')controller.abort();else keepAlive=setTimeout(()=>{},1500);
  assert.equal(await pending,null);
  assert.equal(identityChecks,hangAt);assert.equal(claims,expectedClaims);assert.equal(reads,expectedReads);
  assert.equal(dispatches,0);assert.equal(network,0);assert.equal(JSON.stringify(holds),retained);assert.equal(JSON.stringify(p),unchanged);
  finishLate(true);await Promise.resolve();await Promise.resolve();
  assert.equal(identityChecks,hangAt);assert.equal(claims,expectedClaims);assert.equal(reads,expectedReads);
  assert.equal(dispatches,0);assert.equal(network,0);assert.equal(JSON.stringify(holds),retained);assert.equal(JSON.stringify(p),unchanged);
 } finally {if(keepAlive)clearTimeout(keepAlive);globalThis.fetch=savedFetch;}
});

for (const loader of ['legacy','public'] as const) for (const hangAt of [1,2]) for (const outcome of ['abort','timeout'] as const)
test('uncooperative '+loader+' policy-loader identity check '+hangAt+' respects its existing bound: '+outcome,{timeout:3000},async()=>{
 const controller=new AbortController(),savedFetch=globalThis.fetch;
 let identityChecks=0,reads=0,network=0,ready!:()=>void,finishLate!:(valid:boolean)=>void;
 const started=new Promise<void>(resolve=>{ready=resolve;}),actorId='11111111-1111-4111-8111-111111111111';
 const actor:AgentContext={...context,taskAuthority:{kind:'customer',actorId,ownerId:actorId},isTaskAuthorityCurrent:async()=>{
  identityChecks++;
  if(identityChecks===hangAt){ready();return new Promise<boolean>(resolve=>{finishLate=resolve;});}
  return true;
 }};
 let keepAlive:ReturnType<typeof setTimeout>|undefined;
 try {
  globalThis.fetch=async()=>{network++;throw Error('UNEXPECTED_NETWORK');};
  const rpc:FundingRpc=async(name)=>{
   assert.equal(name,loader==='legacy'?'get_dabra_dialogue_funding_policy':'get_dabra_public_dialogue_policy');reads++;
   return {error:null,data:loader==='legacy'?{enabled:true,profiles:[profile],proofs:[proof],outputAcceptances,maxCostMicros:0,dailyLimits:PUBLIC_DIALOGUE_DAILY_LIMITS}:{policyId:PUBLIC_DIALOGUE_POLICY.id,authorities:[]}};
  };
  const pending=loader==='legacy'?loadFundingDialoguePolicy(actor,controller.signal,rpc):loadPublicDialoguePolicy(actor,controller.signal,'22222222-2222-4222-8222-222222222222',rpc);
  await started;assert.equal(identityChecks,hangAt);assert.equal(reads,hangAt-1);
  if(outcome==='abort')controller.abort();else keepAlive=setTimeout(()=>{},2000);
  const blocked=await pending;
  assert.equal(blocked.trial,true);assert.deepEqual(blocked.profiles,[]);assert.equal(identityChecks,hangAt);assert.equal(reads,hangAt-1);assert.equal(network,0);
  finishLate(true);await Promise.resolve();await Promise.resolve();
  assert.deepEqual(blocked.profiles,[]);assert.equal(identityChecks,hangAt);assert.equal(reads,hangAt-1);assert.equal(network,0);
 } finally {if(keepAlive)clearTimeout(keepAlive);globalThis.fetch=savedFetch;}
});
