import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PLATFORM_DIALOGUE_CASES, PLATFORM_DIALOGUE_CASE_SET_SHA256 } from '../lib/dabra/platform-dialogue-cases';
import { PLATFORM_DIALOGUE_QUALIFICATION_CASES } from '../lib/dabra/platform-dialogue-qualification-cases';
import { PLATFORM_DIALOGUE_PROMPT, platformDialoguePayload, composePlatformDialogue } from '../lib/dabra/agent-platform-dialogue';
import { platformConversationScope } from '../lib/dabra/platform-assistant';
import { qualificationInputSha256 } from '../lib/dabra/agent-qualification-cases';
import { canonicalOutputContract } from '../lib/dabra/agent-output-contract';
import { qualificationRecipe, parseQualificationPermit, parseQualificationProof, qualificationAuthorityBindingSha256,
 type QualificationAccountChargeProof, type QualificationContract } from '../lib/dabra/dialogue-qualification';
import { measurePlatformDialogueProfile, measurePlatformUnitsProfile } from '../lib/dabra/agent-measurement';
import { loadFundingQualification, runFundingQualification, type FundingRpc } from '../lib/dabra/dialogue-funding-store';
import { fundingSubject } from '../lib/dabra/dialogue-funding';
import { approvedPublicPricingContract } from '../lib/dabra/dialogue-pricing-refresh';
import { APPROVED_DIALOGUE_STANDARD_PRICING } from '../lib/dabra/dialogue-pricing-approvals';
import { main, platformDialogueQualificationMain } from '../scripts/dabra-provider-certification';

const sourceSha='a'.repeat(40),subject='SYNTHETIC-DIALOGUE-V2',credential='SYNTHETIC-DIALOGUE-V2-ONLY';
const daily={uniqueUsers:10,requestsPerUser:6,requestsTotal:60,inputTokensPerUser:24576,outputTokensPerUser:6144,inputTokensTotal:245760,outputTokensTotal:61440};
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const actualFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=actualFetch;});
function proofFor(languages:readonly ('ar'|'en')[]=['ar'],contractId:QualificationContract='platform-dialogue-v2'):QualificationAccountChargeProof {
 const recipe=qualificationRecipe(contractId==='platform-dialogue-v2'?'task217-platform-dialogue-measurement-v2':'task217-platform-units-measurement-v1');assert.ok(recipe);
 const rate=APPROVED_DIALOGUE_STANDARD_PRICING.find(r=>r.provider==='openai'&&approvedPublicPricingContract(r.provider,r.model,r.sha256));assert.ok(rate);
 const pricing=approvedPublicPricingContract('openai',rate.model,rate.sha256);assert.ok(pricing);const now=Date.now();
 const permit={schema:contractId==='platform-dialogue-v2'?'task217-platform-dialogue-measurement-v2' as const:'task217-platform-units-measurement-v1' as const,
  purpose:'profile-qualification' as const,planId:randomUUID(),sourceSha,caseSetSha:recipe.caseSetSha,subjectHash:fundingSubject(subject),languages,
  authorizedAtMs:now-1,expiresAtMs:now+300000,inputTokenCeiling:4096,outputTokenCeiling:1024,
  cases:recipe.cases.filter(c=>languages.includes(c.language)).map(c=>({caseId:c.caseId,requestId:randomUUID(),stage:c.stage,language:c.language,
   inputSha256:qualificationInputSha256(c),contractSha256:canonicalOutputContract(contractId,c.language).digest}))};
 const proof:QualificationAccountChargeProof={mode:'bounded-account-qualification',grantId:randomUUID(),provider:'openai',model:rate.model,
  environment:'provider-benchmark',accountId:'SYNTHETIC-account',projectId:'SYNTHETIC-project',credentialSha256:createHash('sha256').update(credential).digest('hex'),
  evidenceSha256:'b'.repeat(64),currency:'USD',serviceTier:'standard',pricingEvidenceSha256:rate.sha256,
  accountTerms:{schema:'task217-account-charge-terms-v1',observedAtMs:now-2,evidenceSha256:'c'.repeat(64),validity:'until-contract-change',
   risks:{autoReload:'unknown',postpaid:'allowed',overdraft:'unknown',concurrentAccountUsage:'unknown'},
   fundingChargeProtection:{kind:'documented-manual-funding-only',evidenceSha256:'d'.repeat(64)},
   allInChargeBound:{schema:'all-in-account-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-tax-fx-and-funding-charges',maxAdditionalMicros:100,evidenceSha256:'e'.repeat(64)}},
  limitedOperation:{schema:'task217-profile-qualification-authority-v1',authorizationId:randomUUID(),taskId:'task217-text-pilot-2026-11-01',
   dataScope:'canonical-synthetic-measurement',maxCostMicros:1000000,maxAttempts:28,authorizedAtMs:now-1,contractSha256:pricing.digest,permit,bindingSha256:'0'.repeat(64)}};
 return {...proof,limitedOperation:{...proof.limitedOperation,bindingSha256:qualificationAuthorityBindingSha256(proof)}};
}
type Fault='none'|'lost-claim'|'expired-receipt'|'source'|'credential'|'revoked'|'cancel'|'old-output'|'extra-output'|'omitted-unit'|'unoffered-guidance'|'wrong-model'|'unknown-provider'|'bad-pricing'|'envelope-exhausted';
function fixture(language:'ar'|'en'='ar',fault:Fault='none',contractId:QualificationContract='platform-dialogue-v2') {
 const proof=proofFor([language],contractId),permit=proof.limitedOperation.permit,controller=new AbortController();
 let claims=0,dispatches=0,held=141870,currentSource=sourceSha,currentCredential=credential;
 const observed:string[]=[];
 const rpc:FundingRpc=async(name,params)=>{
  if(name==='get_dabra_dialogue_qualification_plan')return {data:fault==='revoked'&&claims>0?null:
   {schema:'task217-stored-qualification-plan-v1',proof,dailyLimits:daily,maxCostMicros:1000000},error:null};
  assert.equal(name,'reserve_dabra_dialogue_attempt');claims++;
  if(fault==='envelope-exhausted')return {data:{decision:'denied'},error:null};
  const q=params.p_proof as Record<string,unknown>,e=q.executionPricing as Record<string,unknown>;
  assert.equal(e.caseId,permit.cases[claims-1].caseId);assert.equal(e.inputSha256,permit.cases[claims-1].inputSha256);
  assert.equal(e.contractSha256,permit.cases[claims-1].contractSha256);assert.equal(params.p_request_id,permit.cases[claims-1].requestId);
  held+=Number(params.p_cost_micros);
  if(fault==='lost-claim')return {data:null,error:'SYNTHETIC_UNKNOWN_COMMIT'};
  if(fault==='source')currentSource='f'.repeat(40);if(fault==='credential')currentCredential='SYNTHETIC_CHANGED';if(fault==='cancel')controller.abort();
  return {data:{decision:'admitted',attempt_id:params.p_attempt_id,pricing_expires_at_ms:Date.now()+(fault==='expired-receipt'?-1:10000)},error:null};
 };
 globalThis.fetch=async(value)=>{
  const url=String(value);assert.equal(url,'https://developers.openai.com/api/docs/models/gpt-6-luna.md');
  return Object.defineProperty(new Response(fault==='bad-pricing'?'SYNTHETIC_CHANGED':readFileSync('tests/fixtures/task217-approved-openai-pricing.md','utf8'),
   {headers:{'content-type':'text/markdown'}}),'url',{value:url});
 };
 const runtime={sourceSha:()=>currentSource,configuration:()=>({apiKey:currentCredential,model:proof.model}),
  dispatch:async(_provider:unknown,_config:unknown,message:string,options:{prompt:string;maxOutputTokens?:number;signal?:AbortSignal})=>{
   dispatches++;assert.equal(options.signal?.aborted,false);assert.equal(options.maxOutputTokens,1024);
   const fixed=qualificationRecipe(permit.schema)!.cases[contractId==='platform-dialogue-v2'?(language==='en'?4:0)+dispatches-1:
    (language==='en'?1:0)+(dispatches-1)*2];
   assert.equal(options.prompt,fixed.prompt);assert.equal(message,fixed.message);observed.push(fixed.caseId);
   if(fault==='unknown-provider')throw Error('SYNTHETIC_UNKNOWN_SEND');
   const payload=JSON.parse(message),indices=payload.units.map((_:unknown,i:number)=>i);
   const answer=contractId==='platform-units-v1'||fault==='old-output'?{opening:'none',paragraphs:indices.map((i:number)=>[i])}:
    {kind:'platform-dialogue-v2',guidance:fault==='unoffered-guidance'?'packing-family':'plan',units:fault==='omitted-unit'?[]:indices,
     ...(fault==='extra-output'?{price:0}:{})};
   return {ok:true,model:fault==='wrong-model'?'SYNTHETIC_OTHER':proof.model,answer:JSON.stringify(answer),citations:[],inputTokens:32,outputTokens:24};
  }};
 return {proof,permit,rpc,runtime,controller,observed,counts:()=>({claims,dispatches,held}),
  run:(target:QualificationContract=contractId)=>runFundingQualification(subject,permit.planId,controller.signal,rpc,runtime,target)};
}

test('dialogue measurement uses eight immutable canonical cases and the actual bounded runtime payload',()=>{
 assert.equal(sha(PLATFORM_DIALOGUE_CASES),PLATFORM_DIALOGUE_CASE_SET_SHA256);assert.equal(PLATFORM_DIALOGUE_QUALIFICATION_CASES.length,8);
 for(const [i,fixed]of PLATFORM_DIALOGUE_QUALIFICATION_CASES.entries()){
  const c=PLATFORM_DIALOGUE_CASES[i],trip=c.trip?{...c.trip,id:'00000000-0000-4000-8000-000000000001',families:[...c.trip.families]}:null;
  const scoped=platformConversationScope(c.question,[],trip);
  assert.equal(fixed.prompt,PLATFORM_DIALOGUE_PROMPT);assert.equal(fixed.message,JSON.stringify(platformDialoguePayload(c.language,scoped.message,c.units,scoped.trip,'',scoped.history)));
  assert.ok(Object.isFrozen(fixed)&&Object.isFrozen(fixed.units)&&Object.isFrozen(fixed.guidanceOptions));
  assert.ok(Buffer.byteLength(fixed.prompt+fixed.message,'utf8')+128<=4096);
  assert.ok(!fixed.message.includes('00000000-0000-4000-8000-000000000001'));
 }
});
test('topic-change measurement matches production scope in AR and EN and rejects the obsolete input digest',()=>{
 for(const language of ['ar','en']as const){
  const c=PLATFORM_DIALOGUE_CASES.find(c=>c.caseId===`dialogue-${language}-topic-change`)!;
  const fixed=PLATFORM_DIALOGUE_QUALIFICATION_CASES.find(item=>item.caseId===c.caseId)!;
  const scoped=platformConversationScope(c.question),expected=platformDialoguePayload(language,scoped.message,c.units,scoped.trip,'',scoped.history);
  const obsolete=JSON.stringify(platformDialoguePayload(language,c.question,c.units,null));
  assert.ok(expected);assert.notEqual(scoped.message,c.question);assert.equal(scoped.trip,null);
  assert.doesNotMatch(expected.question,/hotel|فندق/i);assert.equal(fixed.message,JSON.stringify(expected));assert.notEqual(fixed.message,obsolete);
  const p=proofFor([language]).limitedOperation.permit,oldInput=qualificationInputSha256({...fixed,message:obsolete});
  assert.notEqual(qualificationInputSha256(fixed),oldInput);
  assert.equal(parseQualificationPermit({...p,cases:p.cases.map(item=>item.caseId===fixed.caseId?{...item,inputSha256:oldInput}:item)}),null);
 }
});
test('new permits require four complete cases per selected language and do not relabel old evidence',()=>{
 for(const languages of [['ar'],['en'],['ar','en']]as const){const p=proofFor(languages);assert.ok(parseQualificationProof(p,Date.now()));assert.equal(p.limitedOperation.permit.cases.length,languages.length*4);}
 const old=proofFor(['ar'],'platform-units-v1').limitedOperation.permit,p=proofFor().limitedOperation.permit;
 assert.ok(parseQualificationPermit(old));
 for(const bad of [{...old,schema:p.schema},{...p,schema:old.schema},{...p,cases:p.cases.slice(0,2)},
  {...p,cases:[...p.cases].reverse()},{...p,cases:p.cases.map((c,i)=>i===1?p.cases[0]:c)},
  {...p,cases:p.cases.map(c=>({...c,requestId:p.cases[0].requestId}))},
  {...p,cases:p.cases.map(c=>({...c,inputSha256:'0'.repeat(64)}))},
  {...p,cases:p.cases.map(c=>({...c,contractSha256:canonicalOutputContract('platform-units-v1',c.language).digest}))},
  {...p,caseSetSha:old.caseSetSha},{...p,inputTokenCeiling:1},{...p,prompt:'override'},{...p,languages:['en','ar']},
  {...p,schema:'unknown'},{...p,purpose:'runtime'}])assert.equal(parseQualificationPermit(bad),null);
 const changed={...proofFor(),limitedOperation:{...proofFor().limitedOperation,maxAttempts:29}};assert.equal(parseQualificationProof(changed,Date.now()),null);
});
for(const language of ['ar','en']as const)test('actual loader and guarded measurement yield four unqualified dialogue candidates '+language,async()=>{
 const f=fixture(language),result=await f.run();assert.equal(result.kind,'candidate');assert.equal(result.qualified,false);assert.equal(result.semanticReview,'required');
 assert.equal(result.observations.length,4);assert.equal(f.counts().dispatches,4);assert.equal(f.counts().claims,4);
 assert.deepEqual(f.observed,f.permit.cases.map(c=>c.caseId));assert.ok('scope'in result);assert.equal(result.scope.contractId,'platform-dialogue-v2');
 for(const [i,o]of result.observations.entries()){assert.equal(o.requestId,f.permit.cases[i].requestId);assert.equal(o.schemaValid,true);assert.equal(o.model,f.proof.model);
  const c=PLATFORM_DIALOGUE_QUALIFICATION_CASES.find(c=>c.caseId===o.caseId)!;assert.ok(composePlatformDialogue(o.answer,c.units,language,c.guidanceOptions));}
});
test('legacy loader and measurement remain explicitly units-only; neither route accepts the other permit',async()=>{
 const f=fixture(),g=fixture('ar','none','platform-units-v1');
 assert.equal(await loadFundingQualification(subject,f.permit.planId,sourceSha,f.controller.signal,f.rpc),null);
 assert.equal(await loadFundingQualification(subject,g.permit.planId,sourceSha,g.controller.signal,g.rpc,'platform-dialogue-v2'),null);
 assert.equal((await f.run('platform-units-v1')).kind,'blocked');assert.equal(f.counts().claims,0);
 assert.equal((await g.run('platform-dialogue-v2')).kind,'blocked');assert.equal(g.counts().claims,0);
 const plan=await loadFundingQualification(subject,f.permit.planId,sourceSha,f.controller.signal,f.rpc,'platform-dialogue-v2');assert.ok(plan);
 const deps={...f.runtime,admission:{reserveQualification:async()=>{throw Error('must not reserve');}},authorityCurrent:async()=>true};
 assert.equal((await measurePlatformUnitsProfile(plan,deps)).kind,'blocked');
 assert.equal((await measurePlatformDialogueProfile({...plan,kind:'platform-units-qualification'},deps)).kind,'blocked');
 const result=await g.run();assert.equal(result.kind,'candidate');assert.equal(result.observations.length,2);assert.equal(g.counts().dispatches,2);
});
for(const fault of ['lost-claim','expired-receipt','source','credential','revoked','cancel']as const)test('dialogue-v2 stops after the first held or unknown admission: '+fault,async()=>{
 const f=fixture('ar',fault),result=await f.run();assert.notEqual(result.kind,'candidate');assert.equal(result.qualified,false);
 assert.equal(f.counts().claims,1);assert.equal(f.counts().dispatches,0);assert.ok(f.counts().held>141870);assert.equal(result.observations.length,0);
});
for(const fault of ['old-output','extra-output','omitted-unit','unoffered-guidance','wrong-model','unknown-provider']as const)test('dialogue-v2 rejects invalid output and unknown sends without replay: '+fault,async()=>{
 const f=fixture('ar',fault),result=await f.run();assert.equal(result.kind,'stopped');assert.equal(result.qualified,false);
 assert.equal(f.counts().claims,1);assert.equal(f.counts().dispatches,1);assert.ok(f.counts().held>141870);
 if(fault!=='wrong-model'&&fault!=='unknown-provider')assert.equal(result.observations[0].answer,'');
});
test('pricing or existing-envelope denial cannot dispatch, reset holds or retry',async()=>{
 // Expire the genuine in-process pricing cache before testing a changed source.
 const realNow=Date.now,clock=realNow()+1000000;Date.now=()=>clock;
 try {
  const p=fixture('ar','bad-pricing');assert.equal((await p.run()).kind,'blocked');assert.deepEqual(p.counts(),{claims:0,dispatches:0,held:141870});
  const f=fixture('ar','envelope-exhausted');assert.equal((await f.run()).kind,'stopped');assert.deepEqual(f.counts(),{claims:1,dispatches:0,held:141870});
 } finally { Date.now=realNow; }
});
test('CLI reserved dialogue namespace rejects extras and lacks a legacy live fallback',async()=>{
 for(const args of [['--measure-platform-dialogue','--live'],['--measure-platform-dialogue','--measure-platform-units'],['--measure-platform-dialogue','--prompt=custom'],['--measure-platform-dialogue-unknown']])
  await assert.rejects(()=>main(args),/unsupported_measurement_argument/);
 await assert.rejects(()=>platformDialogueQualificationMain(['--measure-platform-units']),/unsupported_measurement_argument/);
});

const prior='supabase/migrations/20261106225730_task217_public_dialogue_monthly_policy.sql';
const forward='supabase/migrations/20261110220000_task217_dialogue_v2_qualification.sql';
const read=(p:string)=>readFileSync(p,'utf8');
test('forward manifest adds only exact dialogue measurement inputs and preserves all historical contracts/cases/pricing',()=>{
 const before=JSON.parse(read(prior).match(/\$manifest\$([\s\S]*?)\$manifest\$/)![1]);
 const after=JSON.parse(read(forward).match(/\$manifest\$([\s\S]*?)\$manifest\$/)![1]);
 assert.deepEqual(after,{...before,cases:[...before.cases,...PLATFORM_DIALOGUE_QUALIFICATION_CASES.map(c=>({caseId:c.caseId,stage:c.stage,language:c.language,
  inputSha256:qualificationInputSha256(c),contractSha256:canonicalOutputContract('platform-dialogue-v2',c.language).digest,inputBytes:Buffer.byteLength(c.prompt+c.message,'utf8')+128}))]});
 assert.equal(createHash('sha256').update(readFileSync(prior)).digest('hex'),'595ce6d1b513300b6e3a195dc1ef7917defc99fe5d4c0aff5ff3f981b5a97639');
});
test('forward changes only qualification recipe resolution; financial, authority and binding guards are byte-preserved',()=>{
 const body=(p:string)=>read(p).match(/CREATE OR REPLACE FUNCTION private\.valid_dabra_qualification_proof\(p jsonb,p_now bigint\)[\s\S]*?\nEND \$\$;/)![0];
 const old=body(prior),next=body(forward);
 const block=" -- Explicit recipes only: legacy permits retain two cases per language;\n -- dialogue-v2 requires its own schema and four canonical cases per language.\n CASE q->>'schema'\n  WHEN 'task217-platform-units-measurement-v1' THEN contract_id:='platform-units-v1';cases_per_language:=2;\n  WHEN 'task217-platform-dialogue-measurement-v2' THEN contract_id:='platform-dialogue-v2';cases_per_language:=4;\n  ELSE RETURN false;\n END CASE;\n IF q->>'purpose' IS DISTINCT FROM 'profile-qualification'";
 assert.ok(next.includes(block));
 const restored=next.replace(' contract_id text; cases_per_language integer;','')
  .replace(block," IF q->>'schema' IS DISTINCT FROM 'task217-platform-units-measurement-v1' OR q->>'purpose' IS DISTINCT FROM 'profile-qualification'")
  .replace("jsonb_array_length(q->'cases')<>cases_per_language*jsonb_array_length(q->'languages')","jsonb_array_length(q->'cases')<>2*jsonb_array_length(q->'languages')")
  .replace('-- Each declared language must supply the complete recipe under one contract.','-- Each declared language must supply exactly two cases under one contract.')
  .replace("WHERE chosen->>'language'=declared.language)<>cases_per_language","WHERE chosen->>'language'=declared.language)<>2")
  .replace("WHERE contract->>'id'=contract_id\n    AND contract->'cases'=to_jsonb(cases_per_language)","WHERE contract->>'id'='platform-units-v1'");
 assert.equal(restored,old);
 const sql=read(forward);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|GRANT|REVOKE)\b/);
 assert.deepEqual([...sql.matchAll(/CREATE OR REPLACE FUNCTION ([^(]+)/g)].map(m=>m[1]),['private.task217_output_contract_manifest','private.valid_dabra_qualification_proof']);
 const row=JSON.parse(read('docs/post-cutover-migrations.json')).filter((r:{path:string})=>r.path===forward);assert.equal(row.length,1);
 assert.equal(row[0].production_apply_authorized,false);assert.equal(row[0].sha256,createHash('sha256').update(readFileSync(forward)).digest('hex'));
});
