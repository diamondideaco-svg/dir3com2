import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { parseQualificationProof, qualificationAuthorityBindingSha256, qualificationBatchReservation, type QualificationAccountChargeProof } from '../lib/dabra/dialogue-qualification';
import { parseBilingualQualificationAuthority, validQualificationPlanAuthority, validBilingualQualificationDaily, BILINGUAL_QUALIFICATION_DAILY } from '../lib/dabra/qualification-authority';
import { validFundingDailyLimits } from '../lib/dabra/dialogue-funding';
import { loadFundingQualification, runFundingQualification, type FundingRpc } from '../lib/dabra/dialogue-funding-store';
import { syntheticBilingualAuthority, rebindSyntheticBilingualAuthority, bilingualSubject, bilingualSource, bilingualCredential } from './fixtures/task217-bilingual-authority-synthetic';
import { waitForQualificationDispatch } from '../lib/dabra/agent-measurement';

test('repository runner launches bilingual qualification with the react-server condition',()=>{
  const launches:string[][]=[];
  // Exercise selection/arguments without spawning tsx, other tests or any process.
  const runner=readFileSync(new URL('../scripts/run-tests.mjs',import.meta.url),'utf8')
    .replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
  runInNewContext(runner,{URL,readdirSync:()=>['dabra-bilingual-qualification.test.ts'],
    spawnSync:(_command:string,args:string[])=>{launches.push(args);return {status:0};},
    process:{execPath:process.execPath,exit:()=>{throw Error('unexpected runner exit');}}});
  assert.equal(launches.length,1);
  assert.deepEqual([...launches[0]],['--conditions=react-server','--import','tsx','--test','tests/dabra-bilingual-qualification.test.ts']);
});

test('new authority binds seven exact bilingual plans and preserves historical counts',()=>{
  const {authority,proofs}=syntheticBilingualAuthority();
  assert.ok(parseBilingualQualificationAuthority(authority,Date.now()));assert.equal(authority.maxAttempts,69);assert.equal(authority.maxCostMicros,1000000);
  for(const proof of proofs){assert.ok(parseQualificationProof(proof,Date.now()));assert.equal(proof.limitedOperation.permit.cases.length,8);
    assert.equal(validQualificationPlanAuthority(proof,authority,Date.now()),true);assert.equal(validQualificationPlanAuthority(proof,undefined,Date.now()),false);}
  assert.equal(validBilingualQualificationDaily(BILINGUAL_QUALIFICATION_DAILY),true);
  assert.equal(validFundingDailyLimits(BILINGUAL_QUALIFICATION_DAILY,4096,1024),false);
});
test('whole batch uses pinned token costs plus explicit extras within the shared dollar, not 56 maximum-cost requests',()=>{
  const now=Date.now(),base=syntheticBilingualAuthority(now),batch=qualificationBatchReservation(base.proofs,base.authority,now);
  assert.ok(batch);assert.equal(batch.costMicros,309832);assert.equal(batch.costMicros+base.authority.baseline.heldCostMicros,451702);
  const extras={openai:1000,gemini:2000,anthropic:0,xai:100,deepseek:10,qwen:20,mistral:30};
  const withExtras=syntheticBilingualAuthority(now,base.authority.baseline,extras);
  assert.equal(qualificationBatchReservation(withExtras.proofs,withExtras.authority,now)?.costMicros,309832+8*Object.values(extras).reduce((a,n)=>a+n,0));
  const anthropicExtra=syntheticBilingualAuthority(now,base.authority.baseline,{...extras,anthropic:1});
  assert.equal(qualificationBatchReservation(anthropicExtra.proofs,anthropicExtra.authority,now),null,'a positive Anthropic extra exceeds the unchanged per-call cap');
  const exact=syntheticBilingualAuthority(now,{...base.authority.baseline,attempts:17,heldCostMicros:1000000-309832,
    providerAttempts:{...base.authority.baseline.providerAttempts,openai:10}});
  assert.equal(exact.authority.maxAttempts,73);assert.ok(qualificationBatchReservation(exact.proofs,exact.authority,now));
  const over=syntheticBilingualAuthority(now,{...exact.authority.baseline,heldCostMicros:exact.authority.baseline.heldCostMicros+1});
  assert.equal(qualificationBatchReservation(over.proofs,over.authority,now),null);
  const lower=syntheticBilingualAuthority(now,base.authority.baseline,undefined,500000);
  assert.ok(qualificationBatchReservation(lower.proofs,lower.authority,now),'a lower fitting budget is accepted without widening');
  for(const missing of [undefined,base.proofs.slice(0,6),[...base.proofs].reverse(),
    base.proofs.map((p,i)=>i===6?{...p,accountTerms:{...p.accountTerms,allInChargeBound:undefined}}:p),
    base.proofs.map((p,i)=>i===6?{...p,accountTerms:{...p.accountTerms,allInChargeBound:{...p.accountTerms.allInChargeBound,evidenceSha256:''}}}:p)])
    assert.equal(qualificationBatchReservation(missing,base.authority,now),null);
});
test('batch rejects a cross-provider request collision even when every plan and authority is validly bound',async()=>{
  const base=syntheticBilingualAuthority();
  base.proofs[1]={...base.proofs[1],limitedOperation:{...base.proofs[1].limitedOperation,permit:{...base.proofs[1].limitedOperation.permit,
    cases:base.proofs[1].limitedOperation.permit.cases.map((c,i)=>i===7?{...c,requestId:base.proofs[0].limitedOperation.permit.cases[0].requestId}:c)}}};
  const duplicate=rebindSyntheticBilingualAuthority(base);
  for(const p of duplicate.proofs)assert.ok(parseQualificationProof(p,Date.now()));
  assert.ok(parseBilingualQualificationAuthority(duplicate.authority,Date.now()));
  assert.equal(qualificationBatchReservation(duplicate.proofs,duplicate.authority,Date.now()),null);
  let calls=0;const old=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('unexpected HTTP');};
  try{const rpc:FundingRpc=async()=>({data:{schema:'task217-stored-qualification-plan-v2',proof:duplicate.proofs[0],proofs:duplicate.proofs,
    authority:duplicate.authority,dailyLimits:duplicate.authority.dailyLimits,maxCostMicros:18432},error:null});
    const result=await runFundingQualification(bilingualSubject,duplicate.proofs[0].limitedOperation.permit.planId,new AbortController().signal,rpc,
      {sourceSha:()=>bilingualSource,configuration:()=>null,dispatch:async()=>{calls++;throw Error('unexpected dispatch');}},'platform-dialogue-v2');
    assert.equal(result.kind,'blocked');assert.equal(calls,0);
  }finally{globalThis.fetch=old;}
});
test('absent, disabled, widened, re-dated, or unbound authority is rejected',()=>{
  const {authority,proofs}=syntheticBilingualAuthority();
  for(const invalid of [null,undefined,{...authority,enabled:false},{...authority,extra:true},{...authority,maxAttempts:70},
    {...authority,maxCostMicros:1000001},{...authority,runTimeoutMs:120001},{...authority,expiresAtMs:Date.now()-1},
    {...authority,baseline:{...authority.baseline,attempts:0}},{...authority,plans:[...authority.plans].reverse()}])
    assert.equal(parseBilingualQualificationAuthority(invalid,Date.now()),null);
  const p=proofs[0],replacement:QualificationAccountChargeProof={...p,grantId:randomUUID()};
  assert.equal(validQualificationPlanAuthority(replacement,authority,Date.now()),false);
  assert.equal(validQualificationPlanAuthority({...p,accountId:'SYNTHETIC-other'},authority,Date.now()),false);
});
test('v2 proof cannot relabel a legacy one-language recipe or lose authority binding',()=>{
  const {proofs}=syntheticBilingualAuthority(),p=proofs[0];
  const invalid:QualificationAccountChargeProof={...p,limitedOperation:{...p.limitedOperation,permit:{...p.limitedOperation.permit,languages:['ar'],cases:p.limitedOperation.permit.cases.slice(0,4)}}};
  const bound={...invalid,limitedOperation:{...invalid.limitedOperation,bindingSha256:qualificationAuthorityBindingSha256(invalid)}};
  assert.equal(parseQualificationProof(bound,Date.now()),null);
  const loose={...p.limitedOperation};if('authoritySha256' in loose)delete (loose as Partial<typeof loose>).authoritySha256;
  assert.equal(parseQualificationProof({...p,limitedOperation:loose},Date.now()),null);
});
test('loader needs the exact stored authority and cannot promote a v1 response',async()=>{
  const {authority,proofs}=syntheticBilingualAuthority(),proof=proofs[0],signal=new AbortController().signal;
  const response={schema:'task217-stored-qualification-plan-v2',proof,proofs,dailyLimits:authority.dailyLimits,maxCostMicros:18432,authority};
  const read=(data:unknown):FundingRpc=>async()=>({data,error:null});
  const load=(data:unknown)=>loadFundingQualification(bilingualSubject,proof.limitedOperation.permit.planId,bilingualSource,signal,read(data),'platform-dialogue-v2');
  assert.ok(await load(response));
  for(const data of [{...response,authority:null},{...response,authority:{...authority,enabled:false}},{...response,maxCostMicros:18433},
    {...response,proofs:undefined},{...response,proofs:proofs.slice(0,6)},{...response,maxCostMicros:18431},
    {...response,schema:'task217-stored-qualification-plan-v1'},{...response,dailyLimits:{...authority.dailyLimits,requestsTotal:57}},
    {...response,proof:{...proof,projectId:'SYNTHETIC-other'}}])assert.equal(await load(data),null);
});
test('missing extras, an incomplete batch or insufficient total budget blocks before any HTTP or provider dispatch',async()=>{
  const originalFetch=globalThis.fetch;let http=0,dispatches=0,claims=0;
  globalThis.fetch=async()=>{http++;throw Error('unexpected HTTP');};
  try{
    const base=syntheticBilingualAuthority(),over=syntheticBilingualAuthority(Date.now(),{...base.authority.baseline,heldCostMicros:690169});
    const variants=[{...base,proofs:base.proofs.slice(0,6)},over,
      {...base,proofs:base.proofs.map((p,i)=>i===6?{...p,accountTerms:{...p.accountTerms,allInChargeBound:undefined}}:p)}];
    for(const item of variants){const proof=item.proofs[0];
      const rpc:FundingRpc=async(name)=>{if(name!=='get_dabra_dialogue_qualification_plan')claims++;
        return {data:{schema:'task217-stored-qualification-plan-v2',proof,proofs:item.proofs,authority:item.authority,dailyLimits:item.authority.dailyLimits,maxCostMicros:18432},error:null};};
      const result=await runFundingQualification(bilingualSubject,proof.limitedOperation.permit.planId,new AbortController().signal,rpc,{
        sourceSha:()=>bilingualSource,configuration:()=>null,dispatch:async()=>{dispatches++;throw Error('unexpected provider dispatch');},
      },'platform-dialogue-v2');
      assert.equal(result.kind,'blocked');assert.equal(result.observations.length,0);
    }
    assert.equal(http,0);assert.equal(dispatches,0);assert.equal(claims,0);
  }finally{globalThis.fetch=originalFetch;}
});
test('eight synthetic cases can exceed 60 seconds within the stored 120-second bound; unknown claim never dispatches',async t=>{
  const realNow=Date.now,realFetch=globalThis.fetch;let now=Date.parse('2026-11-11T09:00:00.000Z');Date.now=()=>now;
  const timeouts:number[]=[];const actualTimeout=AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal,'timeout',(ms:number)=>{timeouts.push(ms);return actualTimeout(ms);});
  try {
    const {authority,proofs}=syntheticBilingualAuthority(now),proof=proofs[0];let claims=0,dispatches=0,held=141870,lost=false,rateLimited=false;
    const rpc:FundingRpc=async(name,params)=>{
      if(name==='get_dabra_dialogue_qualification_plan')return {data:{schema:'task217-stored-qualification-plan-v2',proof,proofs,authority,dailyLimits:authority.dailyLimits,maxCostMicros:18432},error:null};
      claims++;held+=Number(params.p_cost_micros);
      return lost?{data:null,error:'SYNTHETIC_COMMITTED_UNKNOWN'}:{data:{decision:'admitted',attempt_id:params.p_attempt_id,pricing_expires_at_ms:now+12000},error:null};
    };
    globalThis.fetch=async input=>Object.defineProperty(new Response(readFileSync('tests/fixtures/task217-approved-openai-pricing.md','utf8'),
      {headers:{'content-type':'text/markdown'}}),'url',{value:String(input)});
    const runtime={sourceSha:()=>bilingualSource,configuration:()=>({apiKey:bilingualCredential,model:proof.model}),
      dispatch:async(_p:unknown,_c:unknown,message:string)=>{dispatches++;now+=11000;const payload=JSON.parse(message);
        return {ok:!rateLimited,model:proof.model,answer:rateLimited?'SYNTHETIC_HTTP_429':JSON.stringify({kind:'platform-dialogue-v2',guidance:'plan',units:payload.units.map((_:unknown,i:number)=>i)}),citations:[],inputTokens:32,outputTokens:24};}};
    const started=now;
    const result=await runFundingQualification(bilingualSubject,proof.limitedOperation.permit.planId,new AbortController().signal,rpc,runtime,'platform-dialogue-v2');
    assert.equal(result.kind,'candidate');assert.equal(result.qualified,false);assert.equal(result.observations.length,8);assert.equal(claims,8);assert.equal(dispatches,8);
    assert.ok(timeouts.includes(120000));assert.equal(now-started,88000);const previous=held;
    lost=true;claims=0;dispatches=0;
    const failed=await runFundingQualification(bilingualSubject,proof.limitedOperation.permit.planId,new AbortController().signal,rpc,runtime,'platform-dialogue-v2');
    assert.equal(failed.kind,'stopped');assert.equal(claims,1);assert.equal(dispatches,0);assert.ok(held>previous);
    lost=false;rateLimited=true;claims=0;dispatches=0;
    const throttled=await runFundingQualification(bilingualSubject,proof.limitedOperation.permit.planId,new AbortController().signal,rpc,runtime,'platform-dialogue-v2');
    assert.equal(throttled.kind,'stopped');assert.equal(claims,1);assert.equal(dispatches,1);
  }finally{Date.now=realNow;globalThis.fetch=realFetch;}
});

test('new Mistral pacing waits 600ms, is cancelable and leaves other or legacy runs alone',async t=>{
 const now=Date.now();t.mock.timers.enable({apis:['setTimeout','Date'],now});
 const {authority,proofs}=syntheticBilingualAuthority(now),proof=proofs.find(p=>p.provider==='mistral');assert.ok(proof);
 const signal=new AbortController().signal;let done=false;
 const pending=waitForQualificationDispatch({proof,authority},now,signal).then(()=>{done=true;});
 t.mock.timers.tick(599);await Promise.resolve();assert.equal(done,false);
 t.mock.timers.tick(1);await pending;assert.equal(done,true);assert.equal(Date.now()-now,600);
 const controller=new AbortController(),before=Date.now();
 const cancelled=waitForQualificationDispatch({proof,authority},before,controller.signal);controller.abort();await cancelled;
 assert.equal(Date.now(),before);
 await waitForQualificationDispatch({proof},before,signal);
 await waitForQualificationDispatch({proof:proofs[0],authority},before,signal);assert.equal(Date.now(),before);
});
