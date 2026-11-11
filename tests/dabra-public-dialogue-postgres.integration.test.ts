import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {Client} from 'pg';
import {disposableTarget} from '../scripts/sandbox/apply-core-migration-to-db.mjs';
import {canonicalOutputContract} from '../lib/dabra/agent-output-contract';
import {durableAuthorityBindingSha256,durableProfileSha256,type DurableAccountChargeProof} from '../lib/dabra/dialogue-durable-authority';
import {approvedPublicPricingContract} from '../lib/dabra/dialogue-pricing-refresh';
import {publicDialogueCalendar} from '../lib/dabra/public-dialogue-policy';
import {qualificationRecipe,qualificationAuthorityBindingSha256,qualificationCaseKey,qualificationBatchReservation,type QualificationAccountChargeProof,type QualificationPermit} from '../lib/dabra/dialogue-qualification';
import {qualificationInputSha256} from '../lib/dabra/agent-qualification-cases';
import {fundingSubject} from '../lib/dabra/dialogue-funding';
import {syntheticBilingualAuthority,rebindSyntheticBilingualAuthority,bilingualSubject,bilingualSource} from './fixtures/task217-bilingual-authority-synthetic';
import {bilingualQualificationBindingSha256,type BilingualQualificationAuthority} from '../lib/dabra/qualification-authority';
import {FIRST_PROFILE_CASES,FIRST_PROFILE_CASE_SET_SHA,parseFirstProfilePermit} from '../lib/dabra/agent-measurement';

const sql=(file:string)=>readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
const parents=['20261028174710_task217_dialogue_funding_admission.sql','20261101102846_task217_first_profile_measurement_guard.sql','20261101153907_task217_seven_provider_pilot_envelope.sql','20261102043035_task217_pilot_ledger_funding_scope.sql','20261102182200_task217_saved_funding_snapshot_use.sql','20261103000000_task217_limited_customer_funding.sql','20261103170449_task217_credential_binding_readonly.sql','20261103205926_task217_durable_account_charge.sql','20261104133500_task217_output_contract_acceptance.sql','20261104134000_task217_qualification_bootstrap.sql','20261105193011_task217_qualification_provider_bound.sql'];
function target(value:string|undefined){
 assert.ok(value,'CONTINUITY_TEST_DATABASE_URL required; actual SQL evidence cannot silently skip');
 const config=disposableTarget({DATABASE_URL:value,SANDBOX_DISPOSABLE_DATABASE:'true',NODE_ENV:process.env.NODE_ENV});
 assert.ok(['127.0.0.1','::1'].includes(config.host));assert.equal(config.database,'dir3com_test');return config;
}
test('public monthly PG target rejects live/remote/missing/override selectors before connecting',()=>{
 const good='postgresql://postgres:postgres@127.0.0.1:5432/dir3com_test';assert.equal(target(good).database,'dir3com_test');
 for(const value of [undefined,good+'?host=external.invalid',good+'#override',good.replace('127.0.0.1','ynupwivgvwcyrsdhtkcc.supabase.co'),good.replace('dir3com_test','postgres')])assert.throws(()=>target(value));
});

function legacyQualificationProof(p:QualificationAccountChargeProof):QualificationAccountChargeProof {
   const q=p.limitedOperation.permit;
   const legacy:QualificationAccountChargeProof={...p,grantId:randomUUID(),limitedOperation:{schema:'task217-profile-qualification-authority-v1',
    authorizationId:randomUUID(),taskId:p.limitedOperation.taskId,dataScope:p.limitedOperation.dataScope,authorizedAtMs:p.limitedOperation.authorizedAtMs,
    contractSha256:p.limitedOperation.contractSha256,maxCostMicros:1000000,maxAttempts:28,bindingSha256:'0'.repeat(64),
    permit:{...q,planId:randomUUID(),languages:['ar'],cases:q.cases.slice(0,4).map(c=>({...c,requestId:randomUUID()}))}}};
   return {...legacy,limitedOperation:{...legacy.limitedOperation,bindingSha256:qualificationAuthorityBindingSha256(legacy)}};
}

test('bilingual authority PostgreSQL: snapshot-bound one-time limits, all 56 cases and committed-unknown replay',{timeout:300000},async t=>{
 const config=target(process.env.CONTINUITY_TEST_DATABASE_URL),database='dir3com_bilingual_'+randomUUID().replaceAll('-',''),root=new Client(config);
 let db:Client|undefined,created=false;await root.connect();
 try{
  await root.query('CREATE DATABASE '+database);created=true;db=new Client({...config,database});await db.connect();const client=db;
  await client.query(['anon','authenticated','service_role'].map(r=>'DO $$ BEGIN CREATE ROLE '+r+' NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;').join('\n'));
  await client.query('CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,is_anonymous boolean DEFAULT false,banned_until timestamptz);CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),role text,status text,deleted_at timestamptz);');
  await client.query(sql(parents[0]));
  const marker={schema:'task217-seven-provider-pilot-v1',id:'task217-text-pilot-2026-11-01',maxCostMicros:1000000,maxAttempts:28};
  const oldIds:string[]=[];
  // Keep the historical totals, including a separate unreferenced ordinary hold.
  // Pilot proofs must also remain valid for the legacy grant UPDATE guard.
  for(const [provider,count,held]of [['openai',6,61219],['anthropic',7,80151]]as const){
   const id=randomUUID();oldIds.push(id);
   const measurementPermit={schema:'task217-first-profile-v1',planId:randomUUID(),sourceSha:bilingualSource,caseSetSha:FIRST_PROFILE_CASE_SET_SHA,
    subjectHash:'a'.repeat(64),expiresAtMs:3600000,inputTokenCeiling:4096,outputTokenCeiling:1024,
    cases:FIRST_PROFILE_CASES.map(c=>({caseId:c.caseId,requestId:randomUUID(),stage:c.stage,language:c.language}))};
   assert.ok(parseFirstProfilePermit(measurementPermit));
   const proof={pilotEnvelope:marker,measurementPermit,grantId:id,provider,model:'SYNTHETIC-historical-model',environment:'provider-benchmark',
    accountId:'SYNTHETIC-old',projectId:'SYNTHETIC-old',mode:'existing-credit',credentialSha256:'c'.repeat(64),evidenceSha256:'d'.repeat(64),
    currency:'USD',serviceTier:'standard',pricing:'synthetic',authorizedCreditMicros:1000000,remainingCreditMicros:1000000-held,
    verifiedAtMs:0,expiresAtMs:3600000,quotaWindowStartMs:0,quotaWindowEndMs:3600000,remainingRequests:28,remainingInputTokens:114688,remainingOutputTokens:28672,
    autoReload:'off',postpaid:'blocked',overdraft:'blocked',concurrentAccountUsage:'bounded'};
   await client.query("INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,reserved_credit_micros,proof,authorized_at) VALUES($1,$2,'SYNTHETIC-old','SYNTHETIC-old','existing-credit',1000000,$3,$4,clock_timestamp())",[id,provider,held,proof]);
   for(let i=0;i<count;i++)await client.query("INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros) VALUES($1,$2,'discover',repeat('a',64),$3,0,0,1,1,1,1)",[randomUUID(),randomUUID(),id]);
  }
  const ordinaryHold=randomUUID();
  await client.query("INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,reserved_credit_micros,proof,authorized_at) VALUES($1,'openai','SYNTHETIC-excess','SYNTHETIC-excess','existing-credit',1000000,500,'{}'::jsonb,clock_timestamp())",[ordinaryHold]);
  for(const p of parents.slice(1))await client.query(sql(p));
  await client.query(sql('20261106225730_task217_public_dialogue_monthly_policy.sql'));
  await client.query(sql('20261110220000_task217_dialogue_v2_qualification.sql'));
  const history=async()=>({grants:(await client.query('SELECT * FROM private.dabra_dialogue_funding_grants ORDER BY id')).rows,admissions:(await client.query('SELECT * FROM private.dabra_dialogue_admissions ORDER BY attempt_id')).rows});
  const original=await history(),control=(await client.query('SELECT to_jsonb(c) AS v FROM private.dabra_dialogue_funding_control c')).rows[0].v;
  const aclSql="SELECT oid,proowner,proacl::text,prosecdef,proconfig FROM pg_proc WHERE oid=ANY(ARRAY['public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)'::regprocedure,'public.get_dabra_dialogue_qualification_plan(uuid,text)'::regprocedure,'private.reserve_dabra_qualification_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)'::regprocedure]) ORDER BY oid";
  const acl=(await client.query(aclSql)).rows;
  await client.query(sql('20261111003000_task217_bilingual_qualification_authority.sql'));
  assert.deepEqual(await history(),original);assert.deepEqual((await client.query(aclSql)).rows,acl);
  const after=(await client.query('SELECT to_jsonb(c) AS v FROM private.dabra_dialogue_funding_control c')).rows[0].v;
  assert.deepEqual(after,{...control,qualification_authority:null});
  assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_public_dialogue_control')).rows[0].n,0);
  const databaseNow=async()=>Number((await client.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS n')).rows[0].n);
  let now=await databaseNow();
  const remaining=publicDialogueCalendar(now).dayStartMs+86400000-now;
  // Keep real PostgreSQL clocks and production guards intact. Only when setup
  // lands in the final three minutes, wait once for the next safe fixture window.
  if(remaining<=180000){t.diagnostic('Waiting for the next Riyadh day before creating qualification fixtures');
   await new Promise(resolve=>setTimeout(resolve,remaining+100));now=await databaseNow();}
  assert.ok(publicDialogueCalendar(now).dayStartMs+86400000-now>180000);
  const day=publicDialogueCalendar(now).dayStartMs;
  const grantSql='INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,input_rate_micros_per_million,output_rate_micros_per_million,enabled,proof,authorized_at) VALUES($1,$2,$3,$4,$5,0,$6,$7,$8,$9::jsonb,to_timestamp($10::numeric/1000))';
  const grantArgs=(p:QualificationAccountChargeProof,enabled=true)=>{const rate=approvedPublicPricingContract(p.provider,p.model,p.pricingEvidenceSha256);assert.ok(rate);
   return [p.grantId,p.provider,p.accountId,p.projectId,p.mode,rate.inputMicrosPerMillion,rate.outputMicrosPerMillion,enabled,p,p.limitedOperation.authorizedAtMs];};
  await t.test('legacy v1 plan reads do not wait for the new v2 shared lock',async()=>{
   const legacy=legacyQualificationProof(syntheticBilingualAuthority(now).proofs[1]),blocker=new Client({...config,database});await blocker.connect();
   await client.query('UPDATE private.dabra_dialogue_funding_control SET enabled=true,max_attempt_cost_micros=18432');await client.query(grantSql,grantArgs(legacy));
   try{
    await blocker.query('BEGIN');await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0))");
    await client.query("SET statement_timeout='500ms'");
    const loaded=(await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[legacy.limitedOperation.permit.planId,fundingSubject(bilingualSubject)])).rows[0].v;
    assert.equal(loaded?.schema,'task217-stored-qualification-plan-v1');
   }finally{await blocker.query('ROLLBACK');await blocker.end();await client.query('SET statement_timeout=0');}
  });
  const baselineHistory=await history();
  const baseline:BilingualQualificationAuthority['baseline']=(await client.query('SELECT private.task217_qualification_history() AS v')).rows[0].v;
  assert.equal(baseline.attempts,13);assert.equal(baseline.heldCostMicros,141870);assert.equal(baseline.providerAttempts.openai,6);assert.equal(baseline.providerAttempts.anthropic,7);
  const f=syntheticBilingualAuthority(now,baseline);
  const batch=qualificationBatchReservation(f.proofs,f.authority,now);assert.ok(batch);assert.equal(batch.costMicros,309832);
  const installAuthority=(authority=f.authority)=>client.query('UPDATE private.dabra_dialogue_funding_control SET enabled=true,max_attempt_cost_micros=18432,qualification_authority=$1::jsonb',[authority]);
  const install=async(bundle:ReturnType<typeof syntheticBilingualAuthority>=f)=>{await installAuthority(bundle.authority);for(const p of bundle.proofs)await client.query(grantSql,grantArgs(p));};
  const request=(p:QualificationAccountChargeProof,index=0,runId=randomUUID())=>{
   const q=p.limitedOperation.permit,c=q.cases[index],attemptId=index===0?runId:randomUUID(),rate=approvedPublicPricingContract(p.provider,p.model,p.pricingEvidenceSha256);assert.ok(rate);
   const cost=Math.ceil((4096*rate.inputMicrosPerMillion+1024*rate.outputMicrosPerMillion)/1000000)+p.accountTerms.allInChargeBound.maxAdditionalMicros;
   const observation={schema:'task217-public-pricing-observation-v1',provider:p.provider,model:p.model,approvedPricingDigest:p.pricingEvidenceSha256,approvedContractDigest:rate.digest,
    currency:'USD',unitTokens:1000000,inputMicrosPerMillion:rate.inputMicrosPerMillion,outputMicrosPerMillion:rate.outputMicrosPerMillion,observedAtMs:now,expiresAtMs:now+600000,bodySha256:'b'.repeat(64)};
   const executionPricing={schema:'task217-qualification-execution-v1',observation,authorityBindingSha256:p.limitedOperation.bindingSha256,planId:q.planId,caseId:c.caseId,runId,
    inputSha256:c.inputSha256,contractSha256:c.contractSha256,qualificationKey:qualificationCaseKey(p,c.caseId),attemptId,requestId:c.requestId,subjectHash:q.subjectHash,stage:c.stage,language:c.language,inputTokenCeiling:4096,outputTokenCeiling:1024};
   return {attemptId,runId,cost,p,index,executionPricing,args:[attemptId,c.requestId,c.stage,q.subjectHash,p.grantId,{...p,measurementRequest:{planId:q.planId,caseId:c.caseId,runId},executionPricing},4096,1024,cost,f.authority.dailyLimits,day]};
  };
  const reserve=async(r:ReturnType<typeof request>,connection=client)=>{
   await connection.query('SET LOCAL ROLE service_role');try{return (await connection.query('SELECT public.reserve_dabra_dialogue_attempt($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11) AS v',r.args)).rows[0].v;}
   finally{await connection.query('RESET ROLE');}
  };
  const directSql='INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros,execution_pricing) VALUES($1,$2,\'discover\',$3,$4,$5,$6,$7,4096,1024,$8,$9::jsonb)';
  const directArgs=(r:ReturnType<typeof request>)=>[r.attemptId,r.p.limitedOperation.permit.cases[r.index].requestId,f.authority.subjectHash,r.p.grantId,day,r.p.limitedOperation.authorizedAtMs,r.p.limitedOperation.permit.expiresAtMs,r.cost,r.executionPricing];
  const rejected=async(sqlText:string,args:unknown[],pattern:RegExp)=>{await client.query('SAVEPOINT rejected');try{await assert.rejects(()=>client.query(sqlText,args),pattern);}finally{await client.query('ROLLBACK TO SAVEPOINT rejected');await client.query('RELEASE SAVEPOINT rejected');}};
  const isolated=async(run:()=>Promise<void>)=>{await client.query('BEGIN');try{await run();}finally{await client.query('ROLLBACK');}};
  await t.test('NULL authority preserves the legacy ordinary-grant deletion behavior',async()=>{
   await isolated(async()=>{await client.query('DELETE FROM private.dabra_dialogue_funding_grants WHERE id=$1',[ordinaryHold]);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_dialogue_funding_grants WHERE id=$1',[ordinaryHold])).rows[0].n,0);});
   assert.deepEqual(await history(),baselineHistory);
  });
  await t.test('missing authority, altered snapshot and unprivileged control writes fail closed',async()=>{
   await isolated(async()=>{
    await client.query('SET LOCAL ROLE service_role');assert.equal((await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[f.proofs[0].limitedOperation.permit.planId,fundingSubject(bilingualSubject)])).rows[0].v,null);await client.query('RESET ROLE');
    await client.query('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=reserved_credit_micros+1 WHERE id=$1',[oldIds[0]]);
    assert.equal((await client.query('SELECT private.task217_qualification_history() AS v')).rows[0].v.heldCostMicros,141871);
    await rejected('UPDATE private.dabra_dialogue_funding_control SET qualification_authority=$1::jsonb',[f.authority],/APPROVAL_SNAPSHOT_REQUIRED/);
    for(const role of ['anon','authenticated','service_role'])assert.equal((await client.query("SELECT has_column_privilege($1,'private.dabra_dialogue_funding_control','qualification_authority','UPDATE') AS ok",[role])).rows[0].ok,false);
   });
  });
  await t.test('whole campaign or eight-case group cannot start without cumulative room; direct insert cannot bypass it',async()=>{
   await isolated(async()=>{
    await install();const excess=f.authority.maxCostMicros-baseline.heldCostMicros-batch.costMicros+1;
    await client.query('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=reserved_credit_micros+$2 WHERE id=$1',[oldIds[0],excess]);
    const r=request(f.proofs[0]),before=await history();assert.equal((await reserve(r)).decision,'denied');assert.deepEqual(await history(),before);
    assert.equal((await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[r.p.limitedOperation.permit.planId,f.authority.subjectHash])).rows[0].v,null);
    await client.query('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=$2 WHERE id=$1',[r.p.grantId,r.cost]);
    await rejected(directSql,directArgs(r),/QUALIFICATION_ENVELOPE/);
   });
  });
  await t.test('all seven plans and their account extras are required before the first admission',async()=>{
   await isolated(async()=>{
    await installAuthority();for(const p of f.proofs.slice(0,6))await client.query(grantSql,grantArgs(p));
    const last=f.proofs[6],invalid:unknown[]=grantArgs(last);
    invalid[8]={...last,accountTerms:{...last.accountTerms,allInChargeBound:undefined}};
    await rejected(grantSql,invalid,/AUTHORITY_INVALID/);
    const before=await history();assert.equal((await reserve(request(f.proofs[0]))).decision,'denied');
    assert.equal((await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[f.proofs[0].limitedOperation.permit.planId,f.authority.subjectHash])).rows[0].v,null);
    assert.deepEqual(await history(),before);
   });
   await isolated(async()=>{
    const overPerCall=syntheticBilingualAuthority(now,baseline,{openai:0,gemini:0,anthropic:1,xai:0,deepseek:0,qwen:0,mistral:0});
    await install(overPerCall);const before=await history();
    assert.equal((await reserve(request(overPerCall.proofs[0]))).decision,'denied');
    assert.equal((await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[overPerCall.proofs[0].limitedOperation.permit.planId,overPerCall.authority.subjectHash])).rows[0].v,null);
    assert.deepEqual(await history(),before);
   });
  });
  await t.test('all seven complete both languages once; counters retain history and old daily fields remain unchanged',async()=>{
   await isolated(async()=>{
    await install();let addedCost=0;
    const loaded=(await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[f.proofs[0].limitedOperation.permit.planId,fundingSubject(bilingualSubject)])).rows[0].v;
    assert.equal(loaded.schema,'task217-stored-qualification-plan-v2');assert.equal(loaded.authority.bindingSha256,f.authority.bindingSha256);assert.equal(loaded.proof.limitedOperation.permit.sourceSha,bilingualSource);assert.equal(loaded.proofs.length,7);
    for(const p of f.proofs){const first=request(p);for(let i=0;i<8;i++){const r=i===0?first:request(p,i,first.runId);assert.equal((await reserve(r)).decision,'admitted');addedCost+=r.cost;
      assert.equal((await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[p.limitedOperation.permit.planId,f.authority.subjectHash])).rows[0].v?.schema,'task217-stored-qualification-plan-v2','same anchored run remains readable after each claim');}
     assert.equal((await reserve(first)).decision,'denied');assert.equal((await reserve(request(p))).decision,'denied');
     assert.equal((await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[p.limitedOperation.permit.planId,f.authority.subjectHash])).rows[0].v?.schema,'task217-stored-qualification-plan-v2','post-claim authority reads do not require a ninth reservation');}
    const state=(await client.query('SELECT private.task217_qualification_history() AS v')).rows[0].v;
    assert.equal(state.attempts,69);assert.equal(state.heldCostMicros,141870+addedCost);assert.equal(addedCost,309832);assert.ok(state.heldCostMicros<=1000000);
    assert.equal(state.providerAttempts.openai,14);assert.equal(state.providerAttempts.anthropic,15);
    assert.deepEqual((await client.query('SELECT daily_limits FROM private.dabra_dialogue_funding_control')).rows[0].daily_limits,control.daily_limits);
    assert.deepEqual((await client.query('SELECT * FROM private.dabra_dialogue_admissions WHERE grant_id=ANY($1::uuid[]) ORDER BY attempt_id',[oldIds])).rows,original.admissions);
   });
  });
  await t.test('batch identifiers are checked across providers and historical requests before the first admission',async()=>{
   for(const historical of [false,true])await isolated(async()=>{
    const bundle=syntheticBilingualAuthority(now,baseline),p=bundle.proofs[1];
    bundle.proofs[1]={...p,limitedOperation:{...p.limitedOperation,permit:{...p.limitedOperation.permit,
     cases:p.limitedOperation.permit.cases.map((c,i)=>i===7?{...c,requestId:historical?original.admissions[0].request_id:bundle.proofs[0].limitedOperation.permit.cases[0].requestId}:c)}}};
    const bound=rebindSyntheticBilingualAuthority(bundle);await install(bound);const before=await history();
    assert.equal((await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[bound.proofs[0].limitedOperation.permit.planId,bound.authority.subjectHash])).rows[0].v,null);
    assert.equal((await reserve(request(bound.proofs[0]))).decision,'denied');assert.deepEqual(await history(),before);
   });
  });
  await t.test('historical qualification keys block a replacement campaign before it spends any attempts',async()=>{
   await isolated(async()=>{
    const legacy=legacyQualificationProof(f.proofs[1]);await client.query('UPDATE private.dabra_dialogue_funding_control SET enabled=true,max_attempt_cost_micros=18432');
    await client.query(grantSql,grantArgs(legacy));const prior=request(legacy);prior.args[9]=control.daily_limits;
    assert.equal((await reserve(prior)).decision,'admitted');
    const current:BilingualQualificationAuthority['baseline']=(await client.query('SELECT private.task217_qualification_history() AS v')).rows[0].v;
    const fresh=syntheticBilingualAuthority(now,current);await install(fresh);const before=await history();
    assert.equal((await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[fresh.proofs[0].limitedOperation.permit.planId,fresh.authority.subjectHash])).rows[0].v,null);
    assert.equal((await reserve(request(fresh.proofs[0]))).decision,'denied');assert.deepEqual(await history(),before);
   });
  });
  await t.test('an unstarted provider group must fit before its plan can be read, even after another group completed',async()=>{
   await isolated(async()=>{
    await install();const first=request(f.proofs[0]);for(let i=0;i<8;i++)assert.equal((await reserve(i===0?first:request(f.proofs[0],i,first.runId))).decision,'admitted');
    const next=request(f.proofs[1]),held=(await client.query('SELECT private.task217_qualification_history() AS v')).rows[0].v.heldCostMicros;
    const extra=f.authority.maxCostMicros-held-next.cost*8+1;
    await client.query('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=reserved_credit_micros+$2 WHERE id=$1',[oldIds[0],extra]);
    assert.equal((await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[next.p.limitedOperation.permit.planId,f.authority.subjectHash])).rows[0].v,null);
    assert.equal((await client.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[first.p.limitedOperation.permit.planId,f.authority.subjectHash])).rows[0].v?.schema,'task217-stored-qualification-plan-v2');
    const before=await history();assert.equal((await reserve(next)).decision,'denied');assert.deepEqual(await history(),before);
   });
  });
  await t.test('revocation cannot re-enable, reset, delete, truncate or replace authority',async()=>{
   await isolated(async()=>{
    await install();const widened={...f.authority,maxAttempts:70};widened.bindingSha256=bilingualQualificationBindingSha256(widened);
    for(const [statement,args]of [
     ['UPDATE private.dabra_dialogue_funding_control SET qualification_authority=NULL',[]],
     ['UPDATE private.dabra_dialogue_funding_control SET qualification_authority=$1::jsonb',[widened]],
     ['DELETE FROM private.dabra_dialogue_funding_control',[]],['TRUNCATE private.dabra_dialogue_funding_control',[]],
    ]as const)await rejected(statement,[...args],/AUTHORITY_IMMUTABLE/);
    await client.query("UPDATE private.dabra_dialogue_funding_control SET qualification_authority=jsonb_set(qualification_authority,'{enabled}','false'::jsonb)");
    assert.equal((await reserve(request(f.proofs[0]))).decision,'denied');
    await rejected('UPDATE private.dabra_dialogue_funding_control SET qualification_authority=$1::jsonb',[f.authority],/AUTHORITY_IMMUTABLE/);
   });
  });
  await t.test('shared history and unreferenced excess holds survive deletion and TRUNCATE attempts, including after revocation',async()=>{
   await isolated(async()=>{
    await install();const before=await history();
    for(const revoked of [false,true]){
     if(revoked)await client.query("UPDATE private.dabra_dialogue_funding_control SET qualification_authority=jsonb_set(qualification_authority,'{enabled}','false'::jsonb)");
     for(const statement of ['TRUNCATE private.dabra_dialogue_admissions CASCADE','TRUNCATE private.dabra_dialogue_funding_grants CASCADE'])
      await rejected(statement,[],/HISTORY_IMMUTABLE/);
     await rejected('DELETE FROM private.dabra_dialogue_funding_grants WHERE id=$1',[ordinaryHold],/HISTORY_IMMUTABLE/);
     await rejected('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=0 WHERE id=$1',[ordinaryHold],/IMMUTABLE/);
     assert.deepEqual(await history(),before);
    }
   });
  });
  await t.test('v2 initial enablement is insertion under the matching authority; disabling an unused grant is terminal',async()=>{
   await isolated(async()=>{
    await rejected(grantSql,grantArgs(f.proofs[0]),/AUTHORITY_INVALID/);
    await installAuthority();await rejected(grantSql,grantArgs(f.proofs[0],false),/INITIAL_ENABLE_REQUIRED/);
    await client.query(grantSql,grantArgs(f.proofs[0]));
    await client.query('UPDATE private.dabra_dialogue_funding_grants SET enabled=false WHERE id=$1',[f.proofs[0].grantId]);
    await rejected('UPDATE private.dabra_dialogue_funding_grants SET enabled=true WHERE id=$1',[f.proofs[0].grantId],/GRANT_REVOKED/);
    assert.equal((await reserve(request(f.proofs[0]))).decision,'denied');
   });
  });
  await t.test('competing committed first calls admit one; lost outcome retains the hold and forbids replay/refund',async()=>{
   await client.query('BEGIN');await install();await client.query('COMMIT');
   const left=new Client({...config,database}),right=new Client({...config,database});await left.connect();await right.connect();
   const one=request(f.proofs[0]),two=request(f.proofs[0]);
   const committed=async(connection:Client,r:ReturnType<typeof request>)=>{await connection.query('BEGIN');try{const result=await reserve(r,connection);await connection.query('COMMIT');return result;}catch(e){await connection.query('ROLLBACK');throw e;}};
   try{assert.deepEqual((await Promise.all([committed(left,one),committed(right,two)])).map(r=>r.decision).sort(),['admitted','denied']);}
   finally{await left.end();await right.end();}
   // Do not use the winning response. A committed admission is the retained unknown outcome.
   const retained=(await client.query('SELECT * FROM private.dabra_dialogue_admissions WHERE grant_id=$1',[f.proofs[0].grantId])).rows;assert.equal(retained.length,1);
   const held=Number((await client.query('SELECT reserved_credit_micros AS n FROM private.dabra_dialogue_funding_grants WHERE id=$1',[f.proofs[0].grantId])).rows[0].n);assert.equal(held,one.cost);
   await client.query('BEGIN');try{
    assert.equal((await reserve(one)).decision,'denied');assert.equal((await reserve(two)).decision,'denied');
    await rejected('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=0 WHERE id=$1',[f.proofs[0].grantId],/IMMUTABLE/);
    await rejected('DELETE FROM private.dabra_dialogue_admissions WHERE attempt_id=$1',[retained[0].attempt_id],/IMMUTABLE/);
    await rejected('TRUNCATE private.dabra_dialogue_admissions CASCADE',[],/HISTORY_IMMUTABLE/);
    await rejected('TRUNCATE private.dabra_dialogue_funding_grants CASCADE',[],/HISTORY_IMMUTABLE/);
    await client.query('UPDATE private.dabra_dialogue_funding_grants SET enabled=false WHERE id=$1',[f.proofs[0].grantId]);
    await rejected('UPDATE private.dabra_dialogue_funding_grants SET enabled=true WHERE id=$1',[f.proofs[0].grantId],/GRANT_REVOKED/);
    assert.equal((await reserve(request(f.proofs[0],1,retained[0].attempt_id))).decision,'denied');
   }finally{await client.query('ROLLBACK');}
   assert.deepEqual((await client.query('SELECT * FROM private.dabra_dialogue_admissions WHERE grant_id=$1',[f.proofs[0].grantId])).rows,retained);
   assert.equal(Number((await client.query('SELECT reserved_credit_micros AS n FROM private.dabra_dialogue_funding_grants WHERE id=$1',[f.proofs[0].grantId])).rows[0].n),held);
  });
  await t.test('a queued direct insert reads the grant only after the disabling transaction commits',async()=>{
   const queued=new Client({...config,database});await queued.connect();
   const r=request(f.proofs[1]),pid=Number((await queued.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
   let pending:Promise<{error:unknown}>|undefined;
   try{
    await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0))");
    await client.query('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=$2 WHERE id=$1',[r.p.grantId,r.cost]);
    await client.query('UPDATE private.dabra_dialogue_funding_grants SET enabled=false WHERE id=$1',[r.p.grantId]);
    await queued.query('BEGIN');await queued.query("SET LOCAL statement_timeout='10s'");
    pending=queued.query(directSql,directArgs(r)).then(()=>({error:null}),(error:unknown)=>({error}));
    let blocked=false;const deadline=Date.now()+5000;
    while(Date.now()<deadline){
     blocked=(await client.query('SELECT pg_backend_pid()=ANY(pg_blocking_pids($1)) AS blocked',[pid])).rows[0].blocked;
     if(blocked)break;await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(blocked,true,'the direct write must actually wait behind the shared lock');
    await client.query('COMMIT');
    const outcome=await pending;assert.ok(outcome.error instanceof Error);assert.match(outcome.error.message,/QUALIFICATION_EXECUTION_INVALID/);
    assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_dialogue_admissions WHERE grant_id=$1',[r.p.grantId])).rows[0].n,0);
    const grant=(await client.query('SELECT enabled,reserved_credit_micros FROM private.dabra_dialogue_funding_grants WHERE id=$1',[r.p.grantId])).rows[0];
    assert.equal(grant.enabled,false);assert.equal(Number(grant.reserved_credit_micros),r.cost);
   }finally{await client.query('ROLLBACK');if(pending)await pending;await queued.query('ROLLBACK');await queued.end();}
  });
  await t.test('v2 plan reads wait for the shared lock and then re-read committed grant disablement',async()=>{
   const reader=new Client({...config,database});await reader.connect();const p=f.proofs[3];
   const pid=Number((await reader.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);let pending:Promise<unknown>|undefined;
   try{
    await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0))");
    await client.query('UPDATE private.dabra_dialogue_funding_grants SET enabled=false WHERE id=$1',[p.grantId]);
    await reader.query("SET statement_timeout='10s'");
    pending=reader.query('SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[p.limitedOperation.permit.planId,f.authority.subjectHash]).then(r=>r.rows[0].v);
    let blocked=false;const deadline=Date.now()+5000;
    while(Date.now()<deadline){blocked=(await client.query('SELECT pg_backend_pid()=ANY(pg_blocking_pids($1)) AS blocked',[pid])).rows[0].blocked;
     if(blocked)break;await new Promise(resolve=>setTimeout(resolve,10));}
    assert.equal(blocked,true);await client.query('COMMIT');assert.equal(await pending,null);
   }finally{await client.query('ROLLBACK');if(pending)await pending;await reader.end();}
  });
 }finally{if(db)await db.end();if(created)await root.query('DROP DATABASE '+database+' WITH (FORCE)');await root.end();}
});

test('actual PostgreSQL public monthly policy: atomic caps, role scope, idempotency and retained unknown holds',async t=>{
 const config=target(process.env.CONTINUITY_TEST_DATABASE_URL),database='dir3com_public_'+randomUUID().replaceAll('-',''),root=new Client(config);
 let db:Client|undefined,created=false;await root.connect();
 try{
  await root.query('CREATE DATABASE '+database);created=true;db=new Client({...config,database});await db.connect();const client=db;
  await client.query(['anon','authenticated','service_role'].map(r=>'DO $$ BEGIN CREATE ROLE '+r+' NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;').join('\n'));
  await client.query("CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,is_anonymous boolean DEFAULT false,banned_until timestamptz);CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),role text,status text,deleted_at timestamptz);");
  await client.query(sql(parents[0]));const historical=randomUUID();
  const marker={schema:'task217-seven-provider-pilot-v1',id:'task217-text-pilot-2026-11-01',maxCostMicros:1000000,maxAttempts:28};
  await client.query("INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,reserved_credit_micros,proof,authorized_at) VALUES($1,'openai','SYNTHETIC-old','SYNTHETIC-old','existing-credit',1000000,61719,$2,clock_timestamp())",[historical,{pilotEnvelope:marker}]);
  await client.query("INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros) VALUES($1,$2,'discover',repeat('a',64),$3,0,0,1,1,1,2141)",[randomUUID(),randomUUID(),historical]);
  for(const p of parents.slice(1))await client.query(sql(p));
  const snapshot=async()=>({grants:(await client.query('SELECT * FROM private.dabra_dialogue_funding_grants ORDER BY id')).rows,admissions:(await client.query('SELECT * FROM private.dabra_dialogue_admissions ORDER BY attempt_id')).rows});
  const old=await snapshot(),aclSql="SELECT oid,proowner,proacl::text,prosecdef,proconfig FROM pg_proc WHERE oid='public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)'::regprocedure",acl=(await client.query(aclSql)).rows;
  const forward=readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(n=>n.endsWith('_task217_public_dialogue_monthly_policy.sql'));assert.ok(forward);await client.query(sql(forward));
  assert.deepEqual(await snapshot(),old);assert.deepEqual((await client.query(aclSql)).rows,acl);
  const now=Number((await client.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS n')).rows[0].n),calendar=publicDialogueCalendar(now);
  assert.equal(Number((await client.query('SELECT private.dabra_monthly_liability($1,$2) AS n',[calendar.monthStartMs,calendar.monthEndMs])).rows[0].n),61719);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_public_dialogue_control')).rows[0].n,0,'no policy enabled by migration');
  const grantId=randomUUID(),authorityId=randomUUID(),actor=randomUUID(),pricingDigest='f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a';
  const price=approvedPublicPricingContract('openai','gpt-6-luna',pricingDigest);assert.ok(price);
  const dialoguePlans:QualificationAccountChargeProof[]=[];
  await t.test('dialogue-v2 forward preserves history and validates only its complete, bound canonical recipe',async()=>{
   const state=await snapshot(),beforeACL=(await client.query("SELECT oid,proowner,proacl::text,prosecdef,proconfig FROM pg_proc WHERE oid=ANY(ARRAY['private.task217_output_contract_manifest()'::regprocedure,'private.valid_dabra_qualification_proof(jsonb,bigint)'::regprocedure]) ORDER BY oid")).rows;
   await client.query(sql('20261110220000_task217_dialogue_v2_qualification.sql'));
   assert.deepEqual(await snapshot(),state);
   assert.deepEqual((await client.query("SELECT oid,proowner,proacl::text,prosecdef,proconfig FROM pg_proc WHERE oid=ANY(ARRAY['private.task217_output_contract_manifest()'::regprocedure,'private.valid_dabra_qualification_proof(jsonb,bigint)'::regprocedure]) ORDER BY oid")).rows,beforeACL);
   const validate=async(p:unknown)=>(await client.query('SELECT private.valid_dabra_qualification_proof($1::jsonb,$2) AS valid',[p,now])).rows[0].valid;
   for(const schema of ['task217-platform-units-measurement-v1','task217-platform-dialogue-measurement-v2']as const){
    const recipe=qualificationRecipe(schema);assert.ok(recipe);
    for(const languages of [['ar'],['en'],['ar','en']]as const){
     const permit:QualificationPermit={schema,purpose:'profile-qualification' as const,planId:randomUUID(),sourceSha:'a'.repeat(40),caseSetSha:recipe.caseSetSha,subjectHash:fundingSubject('SYNTHETIC-DIALOGUE-V2'),languages,
      authorizedAtMs:now-1,expiresAtMs:now+300000,inputTokenCeiling:4096,outputTokenCeiling:1024,
      cases:recipe.cases.filter(c=>languages.some(l=>l===c.language)).map(c=>({caseId:c.caseId,requestId:randomUUID(),stage:c.stage,language:c.language,inputSha256:qualificationInputSha256(c),contractSha256:canonicalOutputContract(recipe.contractId,c.language).digest}))};
     const unbound:QualificationAccountChargeProof={mode:'bounded-account-qualification',grantId:randomUUID(),provider:'openai',model:'gpt-6-luna',environment:'provider-benchmark',accountId:'SYNTHETIC-qualification',projectId:'SYNTHETIC-project',credentialSha256:'b'.repeat(64),evidenceSha256:'c'.repeat(64),currency:'USD',serviceTier:'standard',pricingEvidenceSha256:pricingDigest,
      accountTerms:{schema:'task217-account-charge-terms-v1',observedAtMs:now-2,evidenceSha256:'d'.repeat(64),validity:'until-contract-change',risks:{autoReload:'unknown',postpaid:'allowed',overdraft:'unknown',concurrentAccountUsage:'unknown'},fundingChargeProtection:{kind:'documented-manual-funding-only',evidenceSha256:'e'.repeat(64)},allInChargeBound:{schema:'all-in-account-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-tax-fx-and-funding-charges',maxAdditionalMicros:0,evidenceSha256:'f'.repeat(64)}},
      limitedOperation:{schema:'task217-profile-qualification-authority-v1',authorizationId:randomUUID(),taskId:'task217-text-pilot-2026-11-01',dataScope:'canonical-synthetic-measurement',maxCostMicros:1000000,maxAttempts:28,authorizedAtMs:now-1,contractSha256:price.digest,permit,bindingSha256:'0'.repeat(64)}};
     const bound=(q:QualificationPermit):QualificationAccountChargeProof=>{const p={...unbound,limitedOperation:{...unbound.limitedOperation,permit:q}};return {...p,limitedOperation:{...p.limitedOperation,bindingSha256:qualificationAuthorityBindingSha256(p)}};};
     assert.equal(await validate(bound(permit)),true);
     if(schema==='task217-platform-dialogue-measurement-v2')dialoguePlans.push(bound(permit));
     // Rebind deliberate mutations so failures prove recipe validation, not merely a stale digest.
     const invalidPermits:QualificationPermit[]=[{...permit,cases:permit.cases.slice(1)},{...permit,cases:[...permit.cases].reverse()},
      {...permit,cases:permit.cases.map(c=>({...c,requestId:permit.cases[0].requestId}))},
      {...permit,cases:permit.cases.map(c=>({...c,inputSha256:'0'.repeat(64)}))},
      {...permit,cases:permit.cases.map(c=>({...c,contractSha256:canonicalOutputContract(recipe.contractId==='platform-dialogue-v2'?'platform-units-v1':'platform-dialogue-v2',c.language).digest}))}];
     for(const invalidPermit of invalidPermits)assert.equal(await validate(bound(invalidPermit)),false);
     if(schema==='task217-platform-dialogue-measurement-v2')assert.equal(await validate(bound({...permit,schema:'task217-platform-units-measurement-v1'})),false);
    }
   }
   assert.deepEqual(await snapshot(),state);
  });
  const contract=canonicalOutputContract('platform-dialogue-v2','en');
  const profile={provider:'openai' as const,measurement:{capability:'discover' as const,language:'en' as const,model:'gpt-6-luna',environment:'provider-benchmark' as const,sourceSha:'b'.repeat(40),caseSetSha:contract.caseSetSha,cases:4,passed:4,measuredAtMs:now-5000,expiresAtMs:now+600000,latencyMs:1,inputTokenCeiling:4096,outputTokenCeiling:1024,costCeilingUsd:0.002141}};
  const unbound:DurableAccountChargeProof={mode:'bounded-account-charge',grantId,provider:'openai',model:'gpt-6-luna',environment:'provider-benchmark',accountId:'SYNTHETIC-public',projectId:'SYNTHETIC-project',credentialSha256:'c'.repeat(64),evidenceSha256:'d'.repeat(64),currency:'USD',serviceTier:'standard',pricingEvidenceSha256:pricingDigest,accountTerms:{schema:'task217-account-charge-terms-v1',observedAtMs:now-6000,evidenceSha256:'e'.repeat(64),validity:'until-contract-change',risks:{autoReload:'off',postpaid:'blocked',overdraft:'blocked',concurrentAccountUsage:'bounded'},fundingChargeProtection:{kind:'documented-manual-funding-only',evidenceSha256:'f'.repeat(64)},allInChargeBound:{schema:'all-in-account-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-tax-fx-and-funding-charges',maxAdditionalMicros:0,evidenceSha256:'a'.repeat(64)}},limitedOperation:{schema:'task217-limited-operation-v2',authorizationId:randomUUID(),taskId:'task217-text-pilot-2026-11-01',dataScope:'redacted-travel-or-server-units',maxCostMicros:1000000,maxAttempts:28,authorizedAtMs:now-4000,duration:'until-revoked-or-binding-change',providerRisk:'bounded-account-liability-with-observed-risks',acceptedProfileSha256s:['f'.repeat(64)],contractSha256:price.digest,bindingSha256:'0'.repeat(64)}};
  const proof={...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:durableAuthorityBindingSha256(unbound)}};
  const acceptance={schema:'task217-profile-output-acceptance-v1',profileSha256:durableProfileSha256(profile),contractSha256:contract.digest,sourceSha:profile.measurement.sourceSha,provider:'openai',model:'gpt-6-luna',environment:'provider-benchmark',capability:'discover',language:'en',caseSetSha:contract.caseSetSha,reviewedAtMs:now-3000,receipt:{implementationSession:'11111111-1111-4111-8111-111111111111',reviewerSession:'22222222-2222-4222-8222-222222222222',reference:'https://github.com/diamondideaco-svg/dir3com2/issues/217#issuecomment-999999999',artifactSha256:'e'.repeat(64),verdict:'PASS',authorship:'none'}};
  await client.query("INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,input_rate_micros_per_million,output_rate_micros_per_million,enabled,proof,authorized_at) VALUES($1,'openai','SYNTHETIC-public','SYNTHETIC-project','bounded-account-charge',0,100000,500000,true,$2,to_timestamp($3::numeric/1000))",[grantId,proof,now-4000]);
  await client.query("INSERT INTO private.dabra_public_dialogue_authorities(id,source_grant_id,source_proof,profile,output_acceptance,model_tier,enabled,authorized_at) VALUES($1,$2,$3,$4,$5,'economy',true,to_timestamp($6::numeric/1000))",[authorityId,grantId,proof,profile,acceptance,now-2000]);
  await client.query('INSERT INTO auth.users(id) VALUES($1);',[actor]);await client.query("INSERT INTO public.profiles(id,role,status) VALUES($1,'customer','active')",[actor]);await client.query('INSERT INTO private.dabra_public_dialogue_control(enabled) VALUES(true)');
  const request=(who:string=actor,id:string=randomUUID())=>{const attempt=randomUUID(),observation={schema:'task217-public-pricing-observation-v1',provider:'openai',model:'gpt-6-luna',approvedPricingDigest:pricingDigest,approvedContractDigest:price.digest,currency:'USD',unitTokens:1000000,inputMicrosPerMillion:100000,outputMicrosPerMillion:500000,observedAtMs:now-1000,expiresAtMs:now+600000,bodySha256:'b'.repeat(64)};return [attempt,id,who,authorityId,{schema:'dabra-public-execution-v1',authorityId,profileSha256:acceptance.profileSha256,attemptId:attempt,requestId:id,observation},4096,1024,922];};
  const claim=async(args:unknown[],connection=client)=>{await connection.query('BEGIN');try{await connection.query('SET LOCAL ROLE service_role');const out=await connection.query('SELECT public.reserve_dabra_public_dialogue_attempt($1,$2,$3,$4,$5::jsonb,$6,$7,$8) AS v',args);await connection.query('COMMIT');return out.rows[0].v;}catch(e){await connection.query('ROLLBACK');throw e;}};
  const isolated=async(run:()=>Promise<void>)=>{await client.query('BEGIN');try{await run();}finally{await client.query('ROLLBACK');}};
  const seed=async(count:number,cost:number,month=calendar.monthStartMs,day=calendar.dayStartMs-86400000,subjectActor=actor)=>{
   await client.query("INSERT INTO private.dabra_public_dialogue_admissions(attempt_id,request_id,subject_hash,authority_id,source_grant_id,day_start_ms,month_start_ms,input_tokens,output_tokens,cost_micros,execution_pricing) SELECT md5('attempt-'||$1::text||n::text)::uuid,md5('request-'||$1::text||n::text)::uuid,encode(sha256(convert_to('task217-dialogue:'||$2::text,'UTF8')),'hex'),$3,$4,$5,$6,1,1,$7,'{}'::jsonb FROM generate_series(1,$8::int)n",[randomUUID(),subjectActor,authorityId,grantId,day,month,cost,count]);
  };
  await t.test('new APIs are not executable by anon/authenticated; private tables force RLS',async()=>{
   for(const role of ['anon','authenticated'])assert.equal((await client.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS ok",[role,'public.get_dabra_public_dialogue_policy(uuid)'])).rows[0].ok,false);
   const rows=(await client.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='private'::regnamespace AND relname LIKE 'dabra_public_dialogue_%' AND relkind='r'")).rows;assert.equal(rows.length,3);for(const row of rows){assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);}
  });
  await t.test('same request is admitted once; unknown result hold cannot be updated or deleted',async()=>{
   const args=request();assert.equal((await claim(args)).decision,'admitted');assert.equal((await claim(request(actor,String(args[1])))).decision,'denied');
   await assert.rejects(()=>client.query('DELETE FROM private.dabra_public_dialogue_admissions WHERE attempt_id=$1',[args[0]]),/DABRA_PUBLIC_HOLD_IMMUTABLE/);
   await assert.rejects(()=>client.query('UPDATE private.dabra_public_dialogue_admissions SET cost_micros=1 WHERE attempt_id=$1',[args[0]]),/DABRA_PUBLIC_HOLD_IMMUTABLE/);
  });
  await t.test('deactivated/deleted/anonymous actor is denied before reservation',async()=>{
   const inactive=randomUUID();await client.query('INSERT INTO auth.users(id,is_anonymous) VALUES($1,true)',[inactive]);await client.query("INSERT INTO public.profiles(id,role,status) VALUES($1,'customer','active')",[inactive]);assert.equal((await claim(request(inactive))).decision,'denied');
   await client.query('UPDATE auth.users SET is_anonymous=false WHERE id=$1',[inactive]);await client.query("UPDATE public.profiles SET status='inactive' WHERE id=$1",[inactive]);assert.equal((await claim(request(inactive))).decision,'denied');
  });
  await t.test('account monthly cost/request caps deny independently without changing history',async()=>{
   for(const [count,cost]of [[100,1],[1,249500]])await isolated(async()=>{await seed(count,cost);const r=request();await client.query('SET LOCAL ROLE service_role');assert.equal((await client.query('SELECT public.reserve_dabra_public_dialogue_attempt($1,$2,$3,$4,$5::jsonb,$6,$7,$8) AS v',r)).rows[0].v.decision,'denied');});
  });
  await t.test('previous calendar month does not consume the new account period and rows remain',async()=>{
   await isolated(async()=>{await seed(100,1000,publicDialogueCalendar(calendar.monthStartMs-1).monthStartMs);await client.query('SET LOCAL ROLE service_role');const r=request();assert.equal((await client.query('SELECT public.reserve_dabra_public_dialogue_attempt($1,$2,$3,$4,$5::jsonb,$6,$7,$8) AS v',r)).rows[0].v.decision,'admitted');await client.query('RESET ROLE');assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_public_dialogue_admissions WHERE month_start_ms=$1',[publicDialogueCalendar(calendar.monthStartMs-1).monthStartMs])).rows[0].n,100);});
  });
  await t.test('two workers at the final daily slot admit exactly one',async()=>{
   const racer=randomUUID();await client.query('INSERT INTO auth.users(id) VALUES($1)',[racer]);await client.query("INSERT INTO public.profiles(id,role,status) VALUES($1,'partner','active')",[racer]);await seed(9,922,calendar.monthStartMs,calendar.dayStartMs,racer);
   const left=new Client({...config,database}),right=new Client({...config,database});await left.connect();await right.connect();try{const results=await Promise.all([claim(request(racer),left),claim(request(racer),right)]);assert.deepEqual(results.map(r=>r.decision).sort(),['admitted','denied']);}finally{await left.end();await right.end();}
  });
  await t.test('global aggregate includes both historical unmatched holds and public attempts',async()=>{
   const expected=61719+Number((await client.query('SELECT coalesce(sum(cost_micros),0) AS n FROM private.dabra_public_dialogue_admissions WHERE month_start_ms=$1',[calendar.monthStartMs])).rows[0].n);
   assert.equal(Number((await client.query('SELECT private.dabra_monthly_liability($1,$2) AS n',[calendar.monthStartMs,calendar.monthEndMs])).rows[0].n),expected);
  });
  await t.test('dialogue-v2 actual admission: complete group, insufficient capacity and committed unknown hold',async()=>{
   assert.equal(dialoguePlans.length,3);
   const limits={uniqueUsers:10,requestsPerUser:6,requestsTotal:60,inputTokensPerUser:24576,outputTokensPerUser:6144,inputTokensTotal:245760,outputTokensTotal:61440};
   await client.query('UPDATE private.dabra_dialogue_funding_control SET enabled=true,max_attempt_cost_micros=1000000,daily_limits=$1::jsonb',[limits]);
   const install=async(p:QualificationAccountChargeProof)=>{
    const rate=approvedPublicPricingContract(p.provider,p.model,p.pricingEvidenceSha256);assert.ok(rate);
    await client.query('INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,input_rate_micros_per_million,output_rate_micros_per_million,enabled,proof,authorized_at) VALUES($1,$2,$3,$4,$5,0,$6,$7,true,$8::jsonb,to_timestamp($9::numeric/1000))',
     [p.grantId,p.provider,p.accountId,p.projectId,p.mode,rate.inputMicrosPerMillion,rate.outputMicrosPerMillion,p,p.limitedOperation.authorizedAtMs]);
   };
   const request=(p:QualificationAccountChargeProof,index=0,runId=randomUUID())=>{
    const q=p.limitedOperation.permit,c=q.cases[index],attemptId=index===0?runId:randomUUID(),rate=approvedPublicPricingContract(p.provider,p.model,p.pricingEvidenceSha256);assert.ok(rate);
    const observation={schema:'task217-public-pricing-observation-v1',provider:p.provider,model:p.model,approvedPricingDigest:p.pricingEvidenceSha256,
     approvedContractDigest:rate.digest,currency:'USD',unitTokens:1000000,inputMicrosPerMillion:rate.inputMicrosPerMillion,outputMicrosPerMillion:rate.outputMicrosPerMillion,
     observedAtMs:now,expiresAtMs:Math.min(now+300000,rate.tariffBeforeMs??now+300000),bodySha256:'b'.repeat(64)};
    const cost=Math.ceil((4096*rate.inputMicrosPerMillion+1024*rate.outputMicrosPerMillion)/1000000)+p.accountTerms.allInChargeBound.maxAdditionalMicros;
    const executionPricing={schema:'task217-qualification-execution-v1',observation,authorityBindingSha256:p.limitedOperation.bindingSha256,
     planId:q.planId,caseId:c.caseId,runId,inputSha256:c.inputSha256,contractSha256:c.contractSha256,qualificationKey:qualificationCaseKey(p,c.caseId),
     attemptId,requestId:c.requestId,subjectHash:q.subjectHash,stage:c.stage,language:c.language,inputTokenCeiling:4096,outputTokenCeiling:1024};
    return {attemptId,runId,cost,args:[attemptId,c.requestId,c.stage,q.subjectHash,p.grantId,
     {...p,measurementRequest:{planId:q.planId,caseId:c.caseId,runId},executionPricing},4096,1024,cost,limits,calendar.dayStartMs]};
   };
   const reserve=async(r:ReturnType<typeof request>)=>{
    await client.query('BEGIN');try{await client.query('SET LOCAL ROLE service_role');
     const out=await client.query('SELECT public.reserve_dabra_dialogue_attempt($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11) AS v',r.args);
     await client.query('COMMIT');return out.rows[0].v;
    }catch(e){await client.query('ROLLBACK');throw e;}
   };
   const held=async(p:QualificationAccountChargeProof)=>Number((await client.query('SELECT reserved_credit_micros AS n FROM private.dabra_dialogue_funding_grants WHERE id=$1',[p.grantId])).rows[0].n);
   const rows=async(p:QualificationAccountChargeProof)=>(await client.query('SELECT * FROM private.dabra_dialogue_admissions WHERE grant_id=$1 ORDER BY reserved_at,attempt_id',[p.grantId])).rows;
   const historyBefore=(await client.query('SELECT * FROM private.dabra_dialogue_admissions WHERE grant_id=$1',[historical])).rows;
   // Eight cases cannot fit OpenAI's existing lifetime ceiling, even though the permit is valid.
   const tooLarge=dialoguePlans[2];await install(tooLarge);const before=await snapshot();
   assert.equal((await reserve(request(tooLarge))).decision,'denied');assert.deepEqual(await snapshot(),before);
   const complete=dialoguePlans[0];assert.equal(complete.limitedOperation.permit.cases.length,4);await install(complete);
   const first=request(complete);
   assert.equal((await reserve(request(complete,1,first.runId))).decision,'denied','cannot skip the initial case');
   for(let index=0;index<4;index++)assert.equal((await reserve(index===0?first:request(complete,index,first.runId))).decision,'admitted');
   const completed=await rows(complete);assert.equal(completed.length,4);assert.equal(await held(complete),first.cost*4);
   assert.deepEqual(completed.map(r=>r.request_id).sort(),complete.limitedOperation.permit.cases.map(c=>c.requestId).sort());
   assert.equal((await reserve(first)).decision,'denied');assert.deepEqual(await rows(complete),completed);assert.equal(await held(complete),first.cost*4);
   // Use a different canonical provider so the completed OpenAI group is never reset.
   const tariff=(await client.query("SELECT value AS p FROM jsonb_array_elements(private.task217_output_contract_manifest()->'pricing') WHERE value->>'provider'='anthropic'")).rows[0].p;
   const fresh=(p:QualificationAccountChargeProof):QualificationAccountChargeProof=>{
    const next={...p,grantId:randomUUID(),limitedOperation:{...p.limitedOperation,authorizationId:randomUUID(),
     permit:{...p.limitedOperation.permit,planId:randomUUID(),cases:p.limitedOperation.permit.cases.map(c=>({...c,requestId:randomUUID()}))}}};
    return {...next,limitedOperation:{...next.limitedOperation,bindingSha256:qualificationAuthorityBindingSha256(next)}};
   };
   const unknown=fresh({...complete,provider:'anthropic',model:tariff.model,pricingEvidenceSha256:tariff.pricingEvidenceSha256,
    limitedOperation:{...complete.limitedOperation,contractSha256:tariff.digest}});await install(unknown);const lost=request(unknown);
   await reserve(lost); // The transaction committed, but simulate losing its returned decision. No provider call occurs.
   const retained=await rows(unknown);assert.equal(retained.length,1);assert.equal(retained[0].attempt_id,lost.attemptId);assert.equal(await held(unknown),lost.cost);
   assert.equal((await reserve(lost)).decision,'denied');assert.equal((await reserve(request(unknown))).decision,'denied');
   await client.query('UPDATE private.dabra_dialogue_funding_grants SET enabled=false WHERE id=$1',[unknown.grantId]);
   assert.equal((await reserve(request(unknown,1,lost.runId))).decision,'denied');
   const replacement=fresh(unknown);await install(replacement);assert.equal((await reserve(request(replacement))).decision,'denied','fresh plan cannot replay the provider/case qualification key');
   await assert.rejects(()=>client.query('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=0 WHERE id=$1',[unknown.grantId]),/IMMUTABLE/);
   await assert.rejects(()=>client.query('DELETE FROM private.dabra_dialogue_admissions WHERE attempt_id=$1',[lost.attemptId]),/IMMUTABLE/);
   assert.deepEqual(await rows(unknown),retained);assert.equal(await held(unknown),lost.cost);assert.equal(await held(replacement),0);
   assert.deepEqual((await client.query('SELECT * FROM private.dabra_dialogue_admissions WHERE grant_id=$1',[historical])).rows,historyBefore);
   assert.equal(Number((await client.query('SELECT reserved_credit_micros AS n FROM private.dabra_dialogue_funding_grants WHERE id=$1',[historical])).rows[0].n),61719);
  });
 }finally{if(db)await db.end();if(created)await root.query('DROP DATABASE '+database+' WITH (FORCE)');await root.end();}
});
