import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalOutputContract } from '../lib/dabra/agent-output-contract';
import { PLATFORM_UNITS_QUALIFICATION_CASES, PLATFORM_UNITS_CASE_SET_SHA256, qualificationInputSha256 } from '../lib/dabra/agent-qualification-cases';
import { qualificationAuthorityBindingSha256, parseQualificationPermit, parseQualificationProof, type QualificationAccountChargeProof } from '../lib/dabra/dialogue-qualification';
import { loadFundingQualification, runFundingQualification, loadFundingDialoguePolicy, type FundingRpc } from '../lib/dabra/dialogue-funding-store';
import { approvedPublicPricingContract } from '../lib/dabra/dialogue-pricing-refresh';
import { APPROVED_DIALOGUE_STANDARD_PRICING } from '../lib/dabra/dialogue-pricing-approvals';
import { AGENT_PROVIDER_IDS, type AgentProviderId } from '../lib/dabra/agent-capabilities';
import { fundingSubject } from '../lib/dabra/dialogue-funding';
import { internalAgentConfiguration, callInternalAgentProvider } from '../lib/ai2/runtime/agent-provider-dispatch';

const actualNow=Date.now,actualFetch=globalThis.fetch;
const credential='SYNTHETIC-QUALIFICATION-ONLY',sourceSha='a'.repeat(40),subject='SYNTHETIC-QUALIFICATION';
const daily={uniqueUsers:10,requestsPerUser:6,requestsTotal:60,inputTokensPerUser:24576,outputTokensPerUser:6144,inputTokensTotal:245760,outputTokensTotal:61440};
const originalKey=process.env.OPENAI_API_KEY;
let clock=actualNow();
test.beforeEach(()=>{clock+=1000000;Date.now=()=>clock;process.env.OPENAI_API_KEY=credential;});
test.afterEach(()=>{Date.now=actualNow;globalThis.fetch=actualFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;});
function proofFor(provider:AgentProviderId='openai',languages:readonly ('ar'|'en')[]=['ar','en']):QualificationAccountChargeProof {
 const rate=APPROVED_DIALOGUE_STANDARD_PRICING.find(r=>r.provider===provider&&approvedPublicPricingContract(provider,r.model,r.sha256));assert.ok(rate);
 const pricing=approvedPublicPricingContract(provider,rate.model,rate.sha256);assert.ok(pricing);
 const q={schema:'task217-platform-units-measurement-v1' as const,purpose:'profile-qualification' as const,planId:randomUUID(),
  sourceSha,caseSetSha:PLATFORM_UNITS_CASE_SET_SHA256,subjectHash:fundingSubject(subject),languages,authorizedAtMs:clock-1,expiresAtMs:clock+300000,
  inputTokenCeiling:4096,outputTokenCeiling:1024,
  cases:PLATFORM_UNITS_QUALIFICATION_CASES.filter(c=>languages.includes(c.language)).map(c=>({
   caseId:c.caseId,requestId:randomUUID(),stage:c.stage,language:c.language,inputSha256:qualificationInputSha256(c),
   contractSha256:canonicalOutputContract('platform-units-v1',c.language).digest,
  }))};
 const unbound:QualificationAccountChargeProof={mode:'bounded-account-qualification',grantId:randomUUID(),provider,model:rate.model,
  environment:'provider-benchmark',accountId:'SYNTHETIC-account',projectId:'SYNTHETIC-project',
  credentialSha256:createHash('sha256').update(credential).digest('hex'),evidenceSha256:'b'.repeat(64),currency:'USD',serviceTier:'standard',pricingEvidenceSha256:rate.sha256,
  accountTerms:{schema:'task217-account-charge-terms-v1',observedAtMs:clock-2,evidenceSha256:'c'.repeat(64),validity:'until-contract-change',
   risks:{autoReload:'unknown',postpaid:'allowed',overdraft:'unknown',concurrentAccountUsage:'unknown'},
   fundingChargeProtection:{kind:'documented-manual-funding-only',evidenceSha256:'d'.repeat(64)},
   allInChargeBound:{schema:'all-in-account-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-tax-fx-and-funding-charges',maxAdditionalMicros:100,evidenceSha256:'e'.repeat(64)}},
  limitedOperation:{schema:'task217-profile-qualification-authority-v1',authorizationId:randomUUID(),taskId:'task217-text-pilot-2026-11-01',
   dataScope:'canonical-synthetic-measurement',maxCostMicros:1000000,maxAttempts:28,authorizedAtMs:clock-1,contractSha256:pricing.digest,permit:q,bindingSha256:'0'.repeat(64)}};
 return {...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:qualificationAuthorityBindingSha256(unbound)}};
}
type Fault='none'|'lost-claim'|'expired-receipt'|'credential'|'source'|'revoked'|'cancel'|'invalid-output'|'unknown-provider'|'bad-pricing'|'non-string-opening';
function fixture(languages:readonly ('ar'|'en')[]=['ar','en'],fault:Fault='none') {
 const proof=proofFor('openai',languages),controller=new AbortController();
 let claims=0,queries=0,dispatches=0,publicReads=0,held=61719,currentSource=sourceSha;
 const payloads:unknown[]=[];const stored={schema:'task217-stored-qualification-plan-v1',proof,dailyLimits:daily,maxCostMicros:1000000};
 const rpc:FundingRpc=async(name,p,signal)=>{
  if(name==='get_dabra_dialogue_funding_policy')return {data:{enabled:true,profiles:[],proofs:[proof],dailyLimits:daily,maxCostMicros:1000000,outputAcceptances:[]},error:null};
  if(name==='get_dabra_dialogue_qualification_plan'){
   queries++;assert.equal(p.p_plan_id,proof.limitedOperation.permit.planId);assert.equal(p.p_subject_hash,fundingSubject(subject));
   return {data:fault==='revoked'&&claims>0?null:stored,error:null};
  }
  assert.equal(name,'reserve_dabra_dialogue_attempt');assert.equal(signal.aborted,false);claims++;
  // This fake external RPC response is not PostgreSQL durability/atomicity evidence.
  const serialized=p.p_proof;assert.ok(serialized&&typeof serialized==='object'&&'executionPricing' in serialized);
  held+=Number(p.p_cost_micros);payloads.push(serialized);
  if(fault==='lost-claim')return {data:null,error:'SYNTHETIC_LOST_COMMITTED_RESPONSE'};
  if(fault==='credential')process.env.OPENAI_API_KEY='SYNTHETIC_CHANGED';
  if(fault==='source')currentSource='f'.repeat(40);
  if(fault==='cancel')controller.abort();
  return {data:{decision:'admitted',attempt_id:p.p_attempt_id,pricing_expires_at_ms:fault==='expired-receipt'?clock-1:clock+10000},error:null};
 };
 globalThis.fetch=async(value,options)=>{
  const url=typeof value==='string'?value:value instanceof URL?value.href:value.url;
  if(url==='https://developers.openai.com/api/docs/models/gpt-6-luna.md'){
   publicReads++;assert.equal(options?.credentials,'omit');assert.equal(options?.redirect,'error');
   assert.equal(new Headers(options?.headers).has('Authorization'),false);
   const response=new Response(fault==='bad-pricing'?'CHANGED':readFileSync('tests/fixtures/task217-approved-openai-pricing.md','utf8'),
    {headers:{'content-type':'text/markdown'}});
   return Object.defineProperty(response,'url',{value:url});
  }
  assert.equal(url,'https://api.openai.com/v1/chat/completions');dispatches++;
  const body=JSON.parse(String(options?.body));assert.equal(body.model,proof.model);assert.equal(body.tools,undefined);assert.equal(body.service_tier,'default');
  assert.equal(body.max_completion_tokens,1024);assert.equal(body.reasoning_effort,'none');
  const input=JSON.parse(body.messages.at(-1).content);
  assert.deepEqual(Object.keys(input).sort(),['language','units']);assert.match(input.units[0],/SYNTHETIC|اصطناعية/);
  const answer=fault==='invalid-output'?JSON.stringify({opening:'none',paragraphs:[[0]],price:0}):JSON.stringify({opening:fault==='non-string-opening'?['none']:'none',paragraphs:input.units.map((_:unknown,i:number)=>[i])});
  if(fault==='unknown-provider')throw Error('SYNTHETIC_UNKNOWN');
  return Response.json({model:proof.model,choices:[{message:{content:answer}}],usage:{prompt_tokens:32,completion_tokens:24,completion_tokens_details:{reasoning_tokens:0}}});
 };
 const run=()=>runFundingQualification(subject,proof.limitedOperation.permit.planId,controller.signal,rpc,
  {configuration:internalAgentConfiguration,dispatch:callInternalAgentProvider,sourceSha:()=>currentSource});
 return {run,proof,rpc,controller,payloads,counts:()=>({claims,queries,dispatches,publicReads,held})};
}

for(const languages of [['ar'],['en'],['ar','en']] as const)test('actual qualification loader/reserve/dispatch uses complete canonical language cases '+languages.join('/'),async()=>{
 const f=fixture(languages),result=await f.run();
 assert.equal(result.kind,'candidate');assert.equal(result.qualified,false);assert.equal(result.semanticReview,'required');
 assert.ok('scope' in result);assert.equal(result.scope.provider,f.proof.provider);assert.equal(result.scope.approvedModel,f.proof.model);
 assert.equal(result.scope.sourceSha,sourceSha);assert.equal(result.scope.caseSetSha,PLATFORM_UNITS_CASE_SET_SHA256);assert.deepEqual(result.scope.languages,languages);
 assert.equal(result.observations.length,languages.length*2);assert.ok(result.observations.every(o=>o.schemaValid&&o.transportOk));
 assert.deepEqual(result.observations.map(o=>o.caseId),f.proof.limitedOperation.permit.cases.map(c=>c.caseId));
 assert.equal(f.counts().dispatches,languages.length*2);assert.equal(f.counts().claims,languages.length*2);assert.equal(f.counts().publicReads,1);
 assert.ok(f.counts().queries>f.counts().claims);assert.ok(f.counts().held>61719);
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC-account|credentialSha256|accountTerms|authorizationId|profileSha256/);
});

for(const provider of AGENT_PROVIDER_IDS)test('qualification financial proof is independent of an accepted runtime profile: '+provider,()=>{
 const p=proofFor(provider);assert.ok(parseQualificationProof(p,clock));assert.equal('acceptedProfileSha256s' in p.limitedOperation,false);
 assert.equal('authorizedCreditMicros' in p,false);assert.equal('remainingCreditMicros' in p,false);
});

test('canonical permits reject partial-language, prompt/input/contract/ID swaps and extra purpose tags',()=>{
 const p=proofFor().limitedOperation.permit;
 for(const invalid of [{...p,purpose:'customer'}, {...p,prompt:'override'}, {...p,languages:['en','ar']},
  {...p,cases:p.cases.slice(0,1)}, {...p,cases:p.cases.map((c,i)=>i===0?{...c,inputSha256:'f'.repeat(64)}:c)},
  {...p,cases:p.cases.map((c,i)=>i===0?{...c,contractSha256:'f'.repeat(64)}:c)},
  {...p,cases:p.cases.map(c=>({...c,requestId:p.cases[0].requestId}))}])assert.equal(parseQualificationPermit(invalid),null);
});

test('valid qualification proof does not enter the normal Customer funding loader',async()=>{
 const f=fixture(['en']);
 const policy=await loadFundingDialoguePolicy({role:'customer',taskAuthority:{kind:'customer',actorId:subject,ownerId:subject},
  isTaskAuthorityCurrent:async()=>true,isDialogueFundingProjectCurrent:()=>true,readRequests:async()=>({kind:'forbidden'})},f.controller.signal,f.rpc,randomUUID());
 assert.equal(policy.funding?.proofs.length,0);assert.equal(f.counts().dispatches,0);assert.equal(f.counts().claims,0);
});
for(const fault of ['lost-claim','expired-receipt','credential','source','revoked','cancel'] as const)test('qualification stops after one reserved/unknown attempt without dispatch or retry: '+fault,async()=>{
 const f=fixture(['ar'],fault),result=await f.run();assert.notEqual(result.kind,'candidate');assert.equal(result.qualified,false);
 assert.equal(f.counts().claims,1);assert.equal(f.counts().dispatches,0);assert.ok(f.counts().held>61719);assert.equal(result.observations.length,0);
});
for(const fault of ['invalid-output','unknown-provider'] as const)test('invalid or unknown canonical reply is not qualification and cannot repeat: '+fault,async()=>{
 const f=fixture(['en'],fault),result=await f.run();assert.equal(result.kind,'stopped');assert.equal(result.qualified,false);
 assert.equal(f.counts().dispatches,1);assert.equal(f.counts().claims,1);assert.ok(f.counts().held>61719);
 if(fault==='invalid-output')assert.equal(result.observations[0].answer,'');
});
test('unrecognized public tariff blocks before admission/provider transport',async()=>{
 const f=fixture(['en'],'bad-pricing');assert.equal((await f.run()).kind,'blocked');assert.equal(f.counts().claims,0);assert.equal(f.counts().dispatches,0);
});
test('a plan ID or client-shaped JSON cannot replace stored purpose/subject/source authority',async()=>{
 const f=fixture();assert.equal(await loadFundingQualification(subject,f.proof.limitedOperation.permit.planId,'f'.repeat(40),f.controller.signal,f.rpc),null);
 const data={schema:'task217-stored-qualification-plan-v1',proof:{...f.proof,prompt:'override'},dailyLimits:daily,maxCostMicros:1000000};
 assert.equal(await loadFundingQualification(subject,f.proof.limitedOperation.permit.planId,sourceSha,f.controller.signal,async()=>({data,error:null})),null);
 assert.equal(f.counts().claims,0);assert.equal(f.counts().dispatches,0);
});

for(const language of ['ar','en'] as const)test('T217-QUAL-F1 actual qualification rejects array opening '+language,async()=>{
 const f=fixture([language],'non-string-opening'),result=await f.run();
 assert.equal(result.kind,'stopped');assert.equal(result.qualified,false);assert.equal(result.semanticReview,'required');
 assert.equal(result.observations.length,1);assert.equal(result.observations[0].caseId,'platform-'+language+'-initial');
 assert.equal(result.observations[0].transportOk,true);assert.equal(result.observations[0].schemaValid,false);
 assert.equal(result.observations[0].answer,'');
 assert.equal(f.counts().dispatches,1);assert.equal(f.counts().claims,1);
 assert.ok(f.counts().held>61719,'invalid output retains its reservation and stops before the follow-up');
});
