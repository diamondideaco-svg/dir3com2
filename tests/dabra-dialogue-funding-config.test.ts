import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFundingDialoguePolicy } from '../lib/dabra/dialogue-funding-store';
import { DEFAULT_AGENT_DIALOGUE_POLICY, PUBLIC_DIALOGUE_DAILY_LIMITS, getAgentDialoguePolicy, prepareAgentProviderAttempt } from '../lib/dabra/agent-dialogue';
import type { AgentContext } from '../lib/dabra/agent-contract';

const context:AgentContext={role:'customer',taskAuthority:{kind:'customer',actorId:'synthetic-config-customer',ownerId:'synthetic-config-customer'},isTaskAuthorityCurrent:async()=>true,readRequests:async()=>({kind:'forbidden'})};
const profile={provider:'gemini',measurement:{capability:'discover',language:'en',model:'qualification-fixture-model',environment:'provider-benchmark',sourceSha:'a'.repeat(40),caseSetSha:'b'.repeat(64),cases:1,passed:1,measuredAtMs:Date.now()-1,expiresAtMs:Date.now()+600000,latencyMs:1,inputTokenCeiling:4096,outputTokenCeiling:1024,costCeilingUsd:0}};
// TEST-ONLY qualification evidence and RPC seam, not a live benchmark or PostgreSQL engine.
const proof={grantId:'33333333-3333-4333-8333-333333333333',provider:'gemini',model:'qualification-fixture-model',environment:'provider-benchmark',accountId:'synthetic-config-account',projectId:'synthetic-config-project',evidenceSha256:'c'.repeat(64),credentialSha256:'d'.repeat(64),verifiedAtMs:Date.now()-1,expiresAtMs:Date.now()+600000,quotaWindowStartMs:Date.now()-1000,quotaWindowEndMs:Date.now()+3600000,remainingRequests:1000,remainingInputTokens:1000000,remainingOutputTokens:1000000,autoReload:'off',postpaid:'blocked',overdraft:'blocked',concurrentAccountUsage:'bounded',mode:'no-new-charge',enforcement:'provider-hard-no-new-charge'};
const lower={uniqueUsers:2,requestsPerUser:3,requestsTotal:6,inputTokensPerUser:12288,outputTokensPerUser:3072,inputTokensTotal:24576,outputTokensTotal:6144};
for(const [name,daily]of [['default',PUBLIC_DIALOGUE_DAILY_LIMITS],['lower',lower],['twenty',{...PUBLIC_DIALOGUE_DAILY_LIMITS,uniqueUsers:20}]]as const)test('Task217 quota config: '+name+' is propagated exactly from server to admission',async()=>{
 let claims=0;
 const p=await loadFundingDialoguePolicy(context,undefined,async(name,params)=>{
  if(name==='get_dabra_dialogue_funding_policy')return{error:null,data:{enabled:true,profiles:[profile],proofs:[proof],maxCostMicros:0,dailyLimits:daily}};
  assert.equal(name,'reserve_dabra_dialogue_attempt');assert.deepEqual(params.p_limits,daily);claims++;
  return{error:null,data:{decision:'admitted',attempt_id:params.p_attempt_id}};
 });
 assert.deepEqual(p.daily,daily);assert.equal(p.profiles.length,1);assert.equal(p.trial,true);
 const permit=await prepareAgentProviderAttempt(context,'en',p,{capability:'discover',message:'{}',prompt:'public synthetic config',inputDigestValue:{}},Date.now()+1000);
 assert.ok(permit);assert.equal(claims,1);
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
