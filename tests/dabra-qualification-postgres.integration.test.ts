import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';
import { disposableTarget } from '../scripts/sandbox/apply-core-migration-to-db.mjs';
import type { AgentProviderId } from '../lib/dabra/agent-capabilities';
import { APPROVED_DIALOGUE_STANDARD_PRICING } from '../lib/dabra/dialogue-pricing-approvals';
import { approvedPublicPricingContract } from '../lib/dabra/dialogue-pricing-refresh';
import { qualificationAuthorityBindingSha256, type QualificationAccountChargeProof } from '../lib/dabra/dialogue-qualification';
import { PLATFORM_UNITS_QUALIFICATION_CASES, PLATFORM_UNITS_CASE_SET_SHA256, qualificationInputSha256 } from '../lib/dabra/agent-qualification-cases';
import { canonicalOutputContract } from '../lib/dabra/agent-output-contract';
import { syntheticOutputAcceptances } from './fixtures/task217-output-qualification-synthetic';
import { fundingSubject } from '../lib/dabra/dialogue-funding';

const parents=['20261028174710_task217_dialogue_funding_admission.sql','20261101102846_task217_first_profile_measurement_guard.sql',
 '20261101153907_task217_seven_provider_pilot_envelope.sql','20261102043035_task217_pilot_ledger_funding_scope.sql',
 '20261102182200_task217_saved_funding_snapshot_use.sql','20261103000000_task217_limited_customer_funding.sql',
 '20261103170449_task217_credential_binding_readonly.sql','20261103205926_task217_durable_account_charge.sql'];
const outputForward='20261104133500_task217_output_contract_acceptance.sql',bootstrapForward='20261104134000_task217_qualification_bootstrap.sql';
const subject=fundingSubject('SYNTHETIC-QUALIFICATION'),sourceSha='a'.repeat(40);
const daily={uniqueUsers:10,requestsPerUser:6,requestsTotal:60,inputTokensPerUser:24576,outputTokensPerUser:6144,inputTokensTotal:245760,outputTokensTotal:61440};
const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// These disposable fixtures stop at the historical output-contract manifest.
// Preserve its complete v1 tuple; current runtime contracts remain unchanged.
function historicalOutputContract(language:'ar'|'en') {
 const contract={...canonicalOutputContract('platform-units-v1',language),inputVersion:'server-language-numbered-units-v1'};
 return Object.freeze({...contract,digest:sha(['task217-canonical-output-contract-v1',contract.id,contract.capability,
  contract.language,contract.caseSetSha,contract.promptSha256,contract.inputVersion,contract.outputVersion,contract.parserSha256,contract.cases])});
}
const sql=(file:string)=>readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
function target(url:string|undefined) {
 assert.ok(url,'CONTINUITY_TEST_DATABASE_URL required; SQL is never silently skipped');
 const config=disposableTarget({DATABASE_URL:url,SANDBOX_DISPOSABLE_DATABASE:'true',NODE_ENV:process.env.NODE_ENV});
 assert.equal(config.database,'dir3com_test');assert.ok(['127.0.0.1','::1'].includes(config.host));return config;
}
test('qualification PG target rejects live, remote, missing and override selectors',()=>{
 const good='postgresql://postgres:postgres@127.0.0.1:5432/dir3com_test';assert.equal(target(good).database,'dir3com_test');
 for(const value of [undefined,good+'?host=external.invalid',good+'#override',good.replace('dir3com_test','postgres'),
  good.replace('127.0.0.1','rcrdjhoicbxiwgtyrift.supabase.co'),good.replace('127.0.0.1','ynupwivgvwcyrsdhtkcc.supabase.co')])assert.throws(()=>target(value));
});
function grant(provider:AgentProviderId,languages:readonly ('ar'|'en')[]=['ar','en'],extra=100) {
 const rate=APPROVED_DIALOGUE_STANDARD_PRICING.find(r=>r.provider===provider&&approvedPublicPricingContract(provider,r.model,r.sha256));assert.ok(rate);
 const price=approvedPublicPricingContract(provider,rate.model,rate.sha256);assert.ok(price);const at=Date.now()-1000;
 const permit={schema:'task217-platform-units-measurement-v1' as const,purpose:'profile-qualification' as const,planId:randomUUID(),sourceSha,
  caseSetSha:PLATFORM_UNITS_CASE_SET_SHA256,subjectHash:subject,languages,authorizedAtMs:at,expiresAtMs:at+600000,inputTokenCeiling:4096,outputTokenCeiling:1024,
  cases:PLATFORM_UNITS_QUALIFICATION_CASES.filter(c=>languages.includes(c.language)).map(c=>({caseId:c.caseId,requestId:randomUUID(),stage:c.stage,language:c.language,
   inputSha256:qualificationInputSha256(c),contractSha256:historicalOutputContract(c.language).digest}))};
 const unbound:QualificationAccountChargeProof={mode:'bounded-account-qualification',grantId:randomUUID(),provider,model:rate.model,environment:'provider-benchmark',
  accountId:'SYNTHETIC-'+provider,projectId:'SYNTHETIC-project',credentialSha256:'b'.repeat(64),evidenceSha256:'c'.repeat(64),currency:'USD',serviceTier:'standard',pricingEvidenceSha256:rate.sha256,
  accountTerms:{schema:'task217-account-charge-terms-v1',observedAtMs:at-1,evidenceSha256:'d'.repeat(64),validity:'until-contract-change',
   risks:{autoReload:'unknown',postpaid:'allowed',overdraft:'unknown',concurrentAccountUsage:'unknown'},
   fundingChargeProtection:{kind:'documented-manual-funding-only',evidenceSha256:'e'.repeat(64)},
   allInChargeBound:{schema:'all-in-account-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-tax-fx-and-funding-charges',maxAdditionalMicros:extra,evidenceSha256:'f'.repeat(64)}},
  limitedOperation:{schema:'task217-profile-qualification-authority-v1',authorizationId:randomUUID(),taskId:'task217-text-pilot-2026-11-01',dataScope:'canonical-synthetic-measurement',
   maxCostMicros:1000000,maxAttempts:28,authorizedAtMs:at,contractSha256:price.digest,permit,bindingSha256:'0'.repeat(64)}};
 const proof={...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:qualificationAuthorityBindingSha256(unbound)}};
 return {proof,permit,rate,price,cost:Math.ceil((4096*rate.inputMicrosPerMillion+1024*rate.outputMicrosPerMillion)/1000000)+extra};
}
type Grant=ReturnType<typeof grant>;
function request(g:Grant,index=0,runId=randomUUID()) {
 const c=g.permit.cases[index],attempt=index===0?runId:randomUUID(),at=Date.now()-1;
 const observation={schema:'task217-public-pricing-observation-v1',provider:g.proof.provider,model:g.proof.model,
  approvedPricingDigest:g.rate.sha256,approvedContractDigest:g.price.digest,currency:'USD',unitTokens:1000000,
  inputMicrosPerMillion:g.rate.inputMicrosPerMillion,outputMicrosPerMillion:g.rate.outputMicrosPerMillion,
  observedAtMs:at,expiresAtMs:Math.min(at+900000,g.price.tariffBeforeMs??at+900000),bodySha256:sha('SYNTHETIC-HTTP-BOUNDARY')};
 const executionPricing={schema:'task217-qualification-execution-v1',observation,authorityBindingSha256:g.proof.limitedOperation.bindingSha256,
  planId:g.permit.planId,caseId:c.caseId,runId,inputSha256:c.inputSha256,contractSha256:c.contractSha256,
  qualificationKey:sha([g.proof.limitedOperation.taskId,g.proof.provider,g.permit.caseSetSha,c.caseId]),
  attemptId:attempt,requestId:c.requestId,subjectHash:subject,stage:c.stage,language:c.language,inputTokenCeiling:4096,outputTokenCeiling:1024};
 const proof={...g.proof,measurementRequest:{planId:g.permit.planId,caseId:c.caseId,runId},executionPricing};
 const args:unknown[]=[attempt,c.requestId,c.stage,subject,g.proof.grantId,JSON.stringify(proof),4096,1024,g.cost,JSON.stringify(daily),
  Math.floor((Date.now()+10800000)/86400000)*86400000-10800000];
 return {args,proof,attempt,runId};
}
const reserveSql='SELECT public.reserve_dabra_dialogue_attempt($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11) AS v';
test('real disposable PG qualification delta: exact permit, common lifetime ledger, scopes, replay/race, holds, output mapping and ACL/RLS',async t=>{
 const config=target(process.env.CONTINUITY_TEST_DATABASE_URL),database='dir3com_qual_'+randomUUID().replaceAll('-',''),root=new Client(config);
 let db:Client|undefined,created=false;await root.connect();
 try {
  await root.query('CREATE DATABASE '+database);created=true;db=new Client({...config,database});await db.connect();const client=db;
  assert.equal((await client.query("SELECT current_setting('server_version_num')::int AS n")).rows[0].n/10000|0,17);
  await client.query(['anon','authenticated','service_role'].map(r=>'DO $$ BEGIN CREATE ROLE '+r+' NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;').join('\n'));
  await client.query(sql(parents[0]));
  const legacy='33333333-3333-4333-8333-333333333333',envelope={schema:'task217-seven-provider-pilot-v1',id:'task217-text-pilot-2026-11-01',maxCostMicros:1000000,maxAttempts:28};
  for(const [id,provider,held]of [['11111111-1111-4111-8111-111111111111','openai',6423],['22222222-2222-4222-8222-222222222222','anthropic',55296],[legacy,'openai',0]]as const)
   await client.query('INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,reserved_credit_micros,enabled,proof,authorized_at) VALUES($1,$2,$3,$4,$5,1000000,$6,false,$7::jsonb,clock_timestamp())',
    [id,provider,'SYNTHETIC-history-'+id,'SYNTHETIC-history','existing-credit',held,JSON.stringify(id===legacy?{}:{pilotEnvelope:envelope})]);
  await client.query("INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros) SELECT ('80000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'intent.classify',repeat('a',64),CASE WHEN n<=3 THEN '22222222-2222-4222-8222-222222222222'::uuid ELSE '11111111-1111-4111-8111-111111111111'::uuid END,0,0,1,1,1,CASE WHEN n<=3 THEN 18432 ELSE 2141 END FROM generate_series(1,6)n");
  for(const p of parents.slice(1))await client.query(sql(p));
  const acl="SELECT oid,proowner,proacl::text,prosecdef,proconfig FROM pg_proc WHERE oid=ANY(ARRAY['public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)'::regprocedure,'public.get_dabra_dialogue_funding_policy(text)'::regprocedure,'private.protect_dabra_dialogue_grant()'::regprocedure,'private.protect_dabra_pilot_admission()'::regprocedure]) ORDER BY oid";
  const tables="SELECT relname,relowner,relacl::text,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='private'::regnamespace AND relkind='r' ORDER BY relname";
  const beforeACL=(await client.query(acl)).rows,beforeTables=(await client.query(tables)).rows;
  await client.query(sql(outputForward));await client.query(sql(bootstrapForward));
  const asRole=async(role:string,query:string,params:unknown[]=[],connection=client)=>{
   await connection.query('BEGIN');try{await connection.query('SET LOCAL ROLE '+role);const out=await connection.query(query,params);await connection.query('COMMIT');return out;}
   catch(error){await connection.query('ROLLBACK');throw error;}
  };
  const reserve=async(r:ReturnType<typeof request>,connection=client)=>(await asRole('service_role',reserveSql,r.args,connection)).rows[0].v;
  const install=async(g:Grant)=>client.query('INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,input_rate_micros_per_million,output_rate_micros_per_million,enabled,proof,authorized_at) VALUES($1,$2,$3,$4,$5,0,$6,$7,true,$8::jsonb,$9::timestamptz)',
   [g.proof.grantId,g.proof.provider,g.proof.accountId,g.proof.projectId,g.proof.mode,g.rate.inputMicrosPerMillion,g.rate.outputMicrosPerMillion,JSON.stringify(g.proof),new Date(g.proof.limitedOperation.authorizedAtMs).toISOString()]);
  const held=async()=>Number((await client.query('SELECT coalesce(sum(greatest(g.reserved_credit_micros,coalesce(a.cost,0))),0) AS n FROM private.dabra_dialogue_funding_grants g LEFT JOIN LATERAL(SELECT sum(cost_micros) cost FROM private.dabra_dialogue_admissions WHERE grant_id=g.id)a ON true')).rows[0].n);
  const count=async()=>Number((await client.query('SELECT count(*) AS n FROM private.dabra_dialogue_admissions')).rows[0].n);
  await client.query('UPDATE private.dabra_dialogue_funding_control SET enabled=true,max_attempt_cost_micros=1000000,daily_limits=$1::jsonb,subject_hashes=ARRAY[$2::text]',[JSON.stringify(daily),fundingSubject('SYNTHETIC-CUSTOMER')]);
  await t.test('same OID/owner/ACL and forced RLS; original six admissions and 61719 held remain intact',async()=>{
   assert.deepEqual((await client.query(acl)).rows,beforeACL);assert.deepEqual((await client.query(tables)).rows,beforeTables);
   assert.equal(await count(),6);assert.equal(await held(),61719);
   assert.deepEqual((await asRole('service_role','SELECT public.get_dabra_dialogue_funding_policy(NULL) AS v')).rows[0].v,{credentialBindings:{}});
  });
  const g=grant('deepseek',['ar']);await install(g);
  await t.test('independent stored permit read requires exact plan/subject; neither Customer nor anonymous can execute',async()=>{
   const row=(await asRole('service_role','SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[g.permit.planId,subject])).rows[0].v;
   assert.equal(row.schema,'task217-stored-qualification-plan-v1');assert.deepEqual(row.proof,g.proof);assert.equal('profiles' in row,false);
   assert.equal((await asRole('service_role','SELECT public.get_dabra_dialogue_qualification_plan($1,$2) AS v',[randomUUID(),subject])).rows[0].v,null);
   assert.equal((await asRole('service_role','SELECT public.get_dabra_dialogue_funding_policy($1) AS v',[subject])).rows[0].v,null);
   for(const role of ['anon','authenticated'])await assert.rejects(()=>asRole(role,'SELECT public.get_dabra_dialogue_qualification_plan($1,$2)',[g.permit.planId,subject]),{code:'42501'});
  });
  const first=request(g);
  await t.test('missing/null/extra/swapped purpose/canonical contract/input/request fields fail before ledger/hold mutation',async()=>{
   const snapshot=await held();
   for(const field of ['measurementRequest','executionPricing'] as const){
    const changed=structuredClone(first.proof);Reflect.deleteProperty(changed,field);const r={...first,args:[...first.args]};r.args[5]=JSON.stringify(changed);assert.equal((await reserve(r)).decision,'denied');
   }
   for(const field of ['planId','caseId','runId','inputSha256','contractSha256','qualificationKey','requestId','language']as const){
    const changed=structuredClone(first.proof);Object.assign(changed.executionPricing,{[field]:'SYNTHETIC_WRONG'});const r={...first,args:[...first.args]};r.args[5]=JSON.stringify(changed);assert.equal((await reserve(r)).decision,'denied');
   }
   for(const value of [null,{...first.proof,extra:true},{...first.proof,measurementRequest:{...first.proof.measurementRequest,prompt:'override'}}]){
    const r={...first,args:[...first.args]};r.args[5]=JSON.stringify(value);assert.equal((await reserve(r)).decision,'denied');
   }
   assert.equal(await count(),6);assert.equal(await held(),snapshot);
  });
  await t.test('complete selected language group uses one run, one admission per case and no replacement grant retry',async()=>{
   assert.equal((await reserve(first)).decision,'admitted');
   assert.equal((await reserve(request(g))).decision,'denied');
   assert.equal((await reserve(request(g,1))).decision,'denied');
   assert.equal((await reserve(request(g,1,first.runId))).decision,'admitted');
   assert.equal(await count(),8);assert.equal(await held(),61719+g.cost*2);
   const replacement=grant('deepseek',['ar']);await install(replacement);assert.equal((await reserve(request(replacement))).decision,'denied');
   const next=grant('deepseek',['en']);await install(next);const start=request(next);assert.equal((await reserve(start)).decision,'admitted');
   assert.equal((await reserve(request(next,1,start.runId))).decision,'admitted');
  });
  await t.test('original provider admissions prevent starting a language profile that cannot fit its four-call lifetime bound',async()=>{
   const old=grant('openai',['en']);await install(old);const before=await held(),n=await count();
   assert.equal((await reserve(request(old))).decision,'denied');assert.equal(await held(),before);assert.equal(await count(),n);
  });
  await t.test('race admits exactly one first case; lost receipt keeps the hold and cannot be taken by a new run',async()=>{
   const race=grant('mistral',['ar']),unknown=grant('qwen',['en']);await install(race);await install(unknown);
   const second=new Client({...config,database});await second.connect();
   try{const values=await Promise.all([reserve(request(race)),reserve(request(race),second)]);assert.deepEqual(values.map(v=>v.decision).sort(),['admitted','denied']);}finally{await second.end();}
   const before=await held(),one=request(unknown);await reserve(one);assert.equal(await held(),before+unknown.cost);
   assert.equal((await reserve(request(unknown))).decision,'denied');assert.equal((await reserve(request(unknown,1))).decision,'denied');
   const n=await count();await client.query('UPDATE private.dabra_dialogue_funding_grants SET enabled=false WHERE id=$1',[unknown.proof.grantId]);
   assert.equal((await reserve(request(unknown,1,one.runId))).decision,'denied');assert.equal(await count(),n);assert.equal(await held(),before+unknown.cost);
   for(const query of ['UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=0 WHERE id=$1',
    "UPDATE private.dabra_dialogue_funding_grants SET proof=proof||'{\"prompt\":\"override\"}'::jsonb WHERE id=$1",
    'DELETE FROM private.dabra_dialogue_funding_grants WHERE id=$1'])await assert.rejects(()=>client.query(query,[unknown.proof.grantId]),/IMMUTABLE/);
  });
  await t.test('all-in planned group uses all retained/disabled holds under USD1, including original 61719',async()=>{
   const before=await held(),n=await count(),expensive=grant('gemini',['en'],Math.floor((1000000-before)/2));await install(expensive);
   assert.ok(expensive.cost<1000000);assert.equal((await reserve(request(expensive))).decision,'denied');
   assert.equal(await held(),before);assert.equal(await count(),n);
  });
  await t.test('stored independent mapping binds exact original profile tuple and canonical contract; future install needs no new source PR',async()=>{
   const at=Date.now()-1000,profile={provider:g.proof.provider,measurement:{capability:'discover' as const,language:'ar' as const,model:g.proof.model,environment:'provider-benchmark' as const,
    caseSetSha:PLATFORM_UNITS_CASE_SET_SHA256,sourceSha,cases:2,passed:2,measuredAtMs:at,expiresAtMs:at+600000,latencyMs:1,inputTokenCeiling:4096,outputTokenCeiling:1024,costCeilingUsd:g.cost/1000000}};
   const receipts=syntheticOutputAcceptances([profile],Date.now()).map(receipt=>({
    ...receipt,contractSha256:historicalOutputContract(receipt.language).digest
   }));assert.equal(receipts.length,1);
   // Synthetic semantic receipt ONLY in this disposable database. No real
   // model/profile/reviewer acceptance is installed by any source/test fixture.
   await client.query('UPDATE private.dabra_dialogue_funding_control SET profiles=$1::jsonb,output_acceptances=$2::jsonb',[JSON.stringify([profile]),JSON.stringify(receipts)]);
   const read=(await asRole('service_role','SELECT public.get_dabra_dialogue_funding_policy($1) AS v',[fundingSubject('SYNTHETIC-CUSTOMER')])).rows[0].v;
   assert.deepEqual(read.outputAcceptances,receipts);
   for(const bad of [{...receipts[0],contractSha256:'f'.repeat(64)},{...receipts[0],extra:'ignored'},
    {...receipts[0],receipt:{...receipts[0].receipt,reviewerSession:receipts[0].receipt.implementationSession}},
    {...receipts[0],profileSha256:'f'.repeat(64)}])await assert.rejects(()=>client.query('UPDATE private.dabra_dialogue_funding_control SET output_acceptances=$1::jsonb',[JSON.stringify([bad])]),{code:'23514'});
   await assert.rejects(()=>client.query("UPDATE private.dabra_dialogue_funding_control SET profiles='[]'::jsonb"),{code:'23514'});
   await client.query("UPDATE private.dabra_dialogue_funding_control SET profiles='[]'::jsonb,output_acceptances='[]'::jsonb");
  });
  await t.test('same all-history attempt cap includes disabled ordinary rows with ledger cost above their retained counter',async()=>{
   const missing=28-await count();
   // Append synthetic pre-existing ordinary-history metadata in the fixture
   // only. No old row/counter is changed, deleted, reset or refunded.
   await client.query("INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros) SELECT gen_random_uuid(),gen_random_uuid(),'discover',repeat('a',64),$1,0,0,1,1,1,1 FROM generate_series(1,$2)",[legacy,missing]);
   assert.equal(await count(),28);const before=await held(),fresh=grant('xai',['ar']);await install(fresh);
   assert.equal((await reserve(request(fresh))).decision,'denied');assert.equal(await count(),28);assert.equal(await held(),before);
  });
  await t.test('only one new service-only getter; private helpers and tables remain inaccessible to all client roles',async()=>{
   for(const role of ['anon','authenticated','service_role'])for(const table of ['dabra_dialogue_funding_control','dabra_dialogue_funding_grants','dabra_dialogue_admissions'])
    await assert.rejects(()=>asRole(role,'SELECT * FROM private.'+table),{code:'42501'});
   const functions=(await client.query("SELECT oid::regprocedure::text AS name,prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') AS anon,has_function_privilege('authenticated',oid,'EXECUTE') AS auth,has_function_privilege('service_role',oid,'EXECUTE') AS service FROM pg_proc WHERE pronamespace='private'::regnamespace AND (proname LIKE '%qualification%' OR proname IN('valid_dabra_output_acceptances','task217_output_contract_manifest'))")).rows;
   assert.ok(functions.length>=8);for(const row of functions){assert.equal(row.anon,false,row.name);assert.equal(row.auth,false,row.name);assert.equal(row.service,false,row.name);assert.deepEqual(row.proconfig,['search_path=""']);}
   assert.deepEqual((await client.query(acl)).rows,beforeACL);assert.deepEqual((await client.query(tables)).rows,beforeTables);
  });
 }finally{try{await db?.end();}finally{try{if(created)await root.query('DROP DATABASE '+database);}finally{await root.end();}}}
});


// Forward-only delta. Historical baseline assertions above remain unchanged.
// The private baseline phase is for an actual RED run; the same positive
// assertions must fail there. CI defaults to the reviewed forward.
test('qualification provider-bound forward', { timeout: 120000 }, async t => {
 const phase=process.env.TASK217_BOUND_FIXTURE_PHASE??'forward';
 assert.ok(phase==='baseline'||phase==='forward');
 const forward='20261105193011_task217_qualification_provider_bound.sql';
 const config=target(process.env.CONTINUITY_TEST_DATABASE_URL);
 const limits={...daily,uniqueUsers:1,requestsPerUser:4,requestsTotal:4,inputTokensPerUser:16384,
  outputTokensPerUser:4096,inputTokensTotal:16384,outputTokensTotal:4096};
 type History={provider:AgentProviderId;count:number;held?:number;ordinary?:boolean};
 type Request=ReturnType<typeof request>;
 type Fixture={
  client:Client;database:string;install(g:Grant):Promise<unknown>;
  reserve(r:Request,connection?:Client):Promise<{decision:string}>;
  direct(g:Grant,r:Request):Promise<void>;count():Promise<number>;held():Promise<number>;
  history():Promise<unknown[]>;next(g:Grant,index?:number,runId?:string):Request;
 };
 const withFixture=async(entries:readonly History[],run:(f:Fixture)=>Promise<void>)=>{
  const database='dir3com_bound5_'+randomUUID().replaceAll('-',''),root=new Client(config);
  let client:Client|undefined,created=false;await root.connect();
  try{
   await root.query('CREATE DATABASE '+database);created=true;client=new Client({...config,database});await client.connect();const db=client;
   assert.equal(Math.floor(Number((await db.query("SELECT current_setting('server_version_num') AS n")).rows[0].n)/10000),17);
   await db.query(['anon','authenticated','service_role'].map(role=>'DO $$ BEGIN CREATE ROLE '+role+' NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;').join('\n'));
   await db.query(sql(parents[0]));
   const historyIds:string[]=[];
   for(const entry of entries){
    const id=randomUUID();historyIds.push(id);
    // Disabled ordinary + pilot rows count together. Excess retained liability
    // models an unsettled/unknown outcome, never a refundable missing receipt.
    const envelope={schema:'task217-seven-provider-pilot-v1',id:'task217-text-pilot-2026-11-01',maxCostMicros:1000000,maxAttempts:28};
    // Only the original two providers support existing-credit at this
    // historical baseline. Other providers use valid ordinary no-new-charge
    // rows; their ledger costs still count above their zero retained counters.
    const credit=entry.provider==='openai'||entry.provider==='anthropic';
    await db.query('INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,reserved_credit_micros,enabled,proof,authorized_at) VALUES($1,$2,$3,$4,$5,$6,$7,false,$8::jsonb,clock_timestamp())',
     [id,entry.provider,'SYNTHETIC-bound-history-'+id,'SYNTHETIC-project',credit?'existing-credit':'no-new-charge',credit?1000000:0,
      credit?(entry.held??entry.count):0,JSON.stringify(credit&&!entry.ordinary?{pilotEnvelope:envelope}:{})]);
    await db.query("INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros) SELECT gen_random_uuid(),gen_random_uuid(),'intent.classify',repeat('a',64),$1,0,0,1,1,1,1 FROM generate_series(1,$2)",[id,entry.count]);
   }
   for(const parent of parents.slice(1))await db.query(sql(parent));
   await db.query(sql(outputForward));await db.query(sql(bootstrapForward));
   const functionSql="SELECT oid,proname,proowner,proacl::text,prosecdef,proconfig,md5(prosrc) AS body FROM pg_proc WHERE oid=ANY(ARRAY['public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)'::regprocedure,'private.reserve_dabra_qualification_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)'::regprocedure,'private.protect_dabra_qualification_insert()'::regprocedure,'private.protect_dabra_dialogue_grant()'::regprocedure,'private.protect_dabra_pilot_admission()'::regprocedure,'private.valid_dabra_qualification_execution(private.dabra_dialogue_funding_grants,uuid,uuid,text,text,integer,integer,bigint,jsonb,bigint)'::regprocedure,'public.get_dabra_dialogue_qualification_plan(uuid,text)'::regprocedure,'public.get_dabra_dialogue_funding_policy(text)'::regprocedure]) ORDER BY oid";
   const tableSql="SELECT oid,relname,relowner,relacl::text,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='private'::regnamespace AND relkind='r' ORDER BY oid";
   const beforeFunctions=(await db.query(functionSql)).rows,beforeTables=(await db.query(tableSql)).rows;
   const beforeControl=(await db.query('SELECT to_jsonb(c) AS v FROM private.dabra_dialogue_funding_control c')).rows;
   if(phase==='forward')await db.query(sql(forward));
   const afterFunctions=(await db.query(functionSql)).rows;
   const metadata=(row:Record<string,unknown>)=>{const copy={...row};delete copy.body;return copy;};
   assert.deepEqual(afterFunctions.map(metadata),beforeFunctions.map(metadata),'OID/owner/ACL/security/search_path changed');
   const changed=afterFunctions.filter((row,index)=>row.body!==beforeFunctions[index].body).map(row=>row.proname).sort();
   assert.deepEqual(changed,phase==='forward'?['protect_dabra_qualification_insert','reserve_dabra_qualification_attempt']:[],
    'ordinary-v2 or a non-target function body changed');
   assert.deepEqual((await db.query(tableSql)).rows,beforeTables);
   assert.deepEqual((await db.query('SELECT to_jsonb(c) AS v FROM private.dabra_dialogue_funding_control c')).rows,beforeControl);
   await db.query('UPDATE private.dabra_dialogue_funding_control SET enabled=true,max_attempt_cost_micros=1000000,daily_limits=$1::jsonb,subject_hashes=ARRAY[$2::text]',
    [JSON.stringify(limits),fundingSubject('SYNTHETIC-CUSTOMER')]);
   const next=(g:Grant,index=0,runId=randomUUID())=>{const r=request(g,index,runId);r.args[9]=JSON.stringify(limits);return r;};
   const reserve=async(r:Request,connection=db)=>{
    await connection.query('BEGIN');
    try{await connection.query('SET LOCAL ROLE service_role');const row=(await connection.query(reserveSql,r.args)).rows[0].v;
     await connection.query('COMMIT');return row as {decision:string};}
    catch(error){await connection.query('ROLLBACK');throw error;}
   };
   const install=(g:Grant)=>db.query('INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,input_rate_micros_per_million,output_rate_micros_per_million,enabled,proof,authorized_at) VALUES($1,$2,$3,$4,$5,0,$6,$7,true,$8::jsonb,$9::timestamptz)',
    [g.proof.grantId,g.proof.provider,g.proof.accountId,g.proof.projectId,g.proof.mode,g.rate.inputMicrosPerMillion,g.rate.outputMicrosPerMillion,JSON.stringify(g.proof),new Date(g.proof.limitedOperation.authorizedAtMs).toISOString()]);
   const count=async()=>Number((await db.query('SELECT count(*) AS n FROM private.dabra_dialogue_admissions')).rows[0].n);
   const held=async()=>Number((await db.query('SELECT coalesce(sum(greatest(g.reserved_credit_micros,coalesce(a.cost,0))),0) AS n FROM private.dabra_dialogue_funding_grants g LEFT JOIN LATERAL(SELECT sum(cost_micros) cost FROM private.dabra_dialogue_admissions WHERE grant_id=g.id)a ON true')).rows[0].n);
   const history=async()=>[
    (await db.query('SELECT id,provider,enabled,reserved_credit_micros,proof FROM private.dabra_dialogue_funding_grants WHERE id=ANY($1::uuid[]) ORDER BY id',[historyIds])).rows,
    (await db.query('SELECT attempt_id,request_id,grant_id,cost_micros FROM private.dabra_dialogue_admissions WHERE grant_id=ANY($1::uuid[]) ORDER BY attempt_id',[historyIds])).rows,
   ];
   const direct=async(g:Grant,r:Request)=>{
    await db.query('BEGIN');
    try{
     await db.query('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=reserved_credit_micros+$2 WHERE id=$1',[g.proof.grantId,g.cost]);
     await db.query('INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros,execution_pricing) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)',
      [r.args[0],r.args[1],r.args[2],r.args[3],r.args[4],r.args[10],g.permit.authorizedAtMs,g.permit.expiresAtMs,r.args[6],r.args[7],r.args[8],JSON.stringify(r.proof.executionPricing)]);
    }finally{await db.query('ROLLBACK');}
   };
   await run({client:db,database,install,reserve,direct,count,held,history,next});
  }finally{try{await client?.end();}finally{try{if(created)await root.query('DROP DATABASE '+database);}finally{await root.end();}}}
 };
 for(const provider of ['openai','anthropic']as const){
  await t.test('qualification provider-bound forward: '+provider+' 3+2 accepts fifth; sixth denied by RPC/insert; all history retained',()=>withFixture(
   [{provider,count:2,held:1000},{provider,count:1,held:100,ordinary:true}],async f=>{
    const prior=await f.history(),beforeHeld=await f.held(),g=grant(provider,['ar']);await f.install(g);
    const first=f.next(g);assert.equal((await f.reserve(first)).decision,'admitted');
    assert.equal((await f.reserve(f.next(g,1,first.runId))).decision,'admitted');
    assert.equal(await f.count(),5);assert.equal(await f.held(),beforeHeld+g.cost*2);
    const next=grant(provider,['en']);await f.install(next);const denied=f.next(next),held=await f.held();
    assert.equal((await f.reserve(denied)).decision,'denied');
    await assert.rejects(()=>f.direct(next,denied),/DIALOGUE_QUALIFICATION_ENVELOPE/);
    assert.equal(await f.count(),5);assert.equal(await f.held(),held);assert.deepEqual(await f.history(),prior);
   }));
  await t.test('qualification provider-bound forward: '+provider+' 4+2 refuses before first reservation',()=>withFixture(
   [{provider,count:2,held:1000},{provider,count:2,held:100,ordinary:true}],async f=>{
    const prior=await f.history(),held=await f.held(),g=grant(provider,['ar']);await f.install(g);
    assert.equal((await f.reserve(f.next(g))).decision,'denied');
    assert.equal(await f.count(),4);assert.equal(await f.held(),held);assert.deepEqual(await f.history(),prior);
   }));
 }
 for(const provider of ['gemini','xai','deepseek','qwen','mistral']as const){
  await t.test('qualification provider-bound forward: '+provider+' fourth accepts; fifth denied by RPC/insert',()=>withFixture(
   [{provider,count:1,held:1000},{provider,count:1,held:100,ordinary:true}],async f=>{
    const prior=await f.history(),held=await f.held(),g=grant(provider,['ar']);await f.install(g);const first=f.next(g);
    assert.equal((await f.reserve(first)).decision,'admitted');assert.equal((await f.reserve(f.next(g,1,first.runId))).decision,'admitted');
    assert.equal(await f.count(),4);assert.equal(await f.held(),held+g.cost*2);
    const next=grant(provider,['en']);await f.install(next);const denied=f.next(next),before=await f.held();
    assert.equal((await f.reserve(denied)).decision,'denied');
    await assert.rejects(()=>f.direct(next,denied),/DIALOGUE_QUALIFICATION_ENVELOPE/);
    assert.equal(await f.count(),4);assert.equal(await f.held(),before);assert.deepEqual(await f.history(),prior);
   }));
 }
 await t.test('qualification provider-bound forward: shared 28 remains exact across all grants',()=>withFixture(
  [{provider:'openai',count:3},{provider:'anthropic',count:3},{provider:'gemini',count:4},{provider:'xai',count:4},
   {provider:'deepseek',count:4},{provider:'qwen',count:4},{provider:'mistral',count:4}],async f=>{
   const prior=await f.history(),g=grant('openai',['ar']);await f.install(g);const first=f.next(g);
   assert.equal((await f.reserve(first)).decision,'admitted');assert.equal((await f.reserve(f.next(g,1,first.runId))).decision,'admitted');
   assert.equal(await f.count(),28);
   const other=grant('anthropic',['ar']);await f.install(other);const denied=f.next(other),held=await f.held();
   assert.equal((await f.reserve(denied)).decision,'denied');
   await assert.rejects(()=>f.direct(other,denied),/DIALOGUE_QUALIFICATION_ENVELOPE/);
   assert.equal(await f.count(),28);assert.equal(await f.held(),held);assert.deepEqual(await f.history(),prior);
  }));
 const priced=grant('openai',['ar']);
 await t.test('qualification provider-bound forward: shared USD1 includes retained unknown liability',()=>withFixture(
  [{provider:'openai',count:3,held:1000000-priced.cost*2}],async f=>{
   const prior=await f.history(),g=grant('openai',['ar']);assert.equal(g.cost,priced.cost);await f.install(g);const first=f.next(g);
   assert.equal((await f.reserve(first)).decision,'admitted');assert.equal((await f.reserve(f.next(g,1,first.runId))).decision,'admitted');
   assert.equal(await f.held(),1000000);
   const other=grant('gemini',['ar']);await f.install(other);const denied=f.next(other);
   assert.equal((await f.reserve(denied)).decision,'denied');
   await assert.rejects(()=>f.direct(other,denied),/DIALOGUE_QUALIFICATION_ENVELOPE/);
   assert.equal(await f.count(),5);assert.equal(await f.held(),1000000);assert.deepEqual(await f.history(),prior);
  }));
 await t.test('qualification provider-bound forward: daily four is unchanged across providers',()=>withFixture([],async f=>{
  for(const provider of ['openai','gemini']as const){const g=grant(provider,['ar']);await f.install(g);const first=f.next(g);
   assert.equal((await f.reserve(first)).decision,'admitted');assert.equal((await f.reserve(f.next(g,1,first.runId))).decision,'admitted');}
  const g=grant('qwen',['ar']);await f.install(g);const before=await f.held();
  assert.equal((await f.reserve(f.next(g))).decision,'denied');assert.equal(await f.count(),4);assert.equal(await f.held(),before);
 }));
 await t.test('qualification provider-bound forward: concurrent fifth slot cannot duplicate admission',()=>withFixture(
  [{provider:'openai',count:3,held:1000}],async f=>{
   const a=grant('openai',['ar']),b=grant('openai',['ar']);await f.install(a);await f.install(b);
   const ra=f.next(a),rb=f.next(b),second=new Client({...config,database:f.database});await second.connect();
   try{
    const results=await Promise.all([f.reserve(ra),f.reserve(rb,second)]);
    assert.deepEqual(results.map(r=>r.decision).sort(),['admitted','denied']);
    const winner=results[0].decision==='admitted'?a:b,run=results[0].decision==='admitted'?ra.runId:rb.runId;
    const responses=await Promise.all([f.reserve(f.next(winner,1,run)),f.reserve(f.next(winner,1,run),second)]);
    assert.deepEqual(responses.map(r=>r.decision).sort(),['admitted','denied']);assert.equal(await f.count(),5);
   }finally{await second.end();}
  }));
 await t.test('qualification provider-bound forward: unknown accepted intent remains held; disabled/replacement cannot retry or refund',()=>withFixture(
  [{provider:'anthropic',count:3,held:1000}],async f=>{
   const g=grant('anthropic',['ar']);await f.install(g);const r=f.next(g),held=await f.held();
   await f.reserve(r); // Simulate a lost result; no provider send or settlement is performed.
   assert.equal(await f.count(),4);assert.equal(await f.held(),held+g.cost);
   await f.client.query('UPDATE private.dabra_dialogue_funding_grants SET enabled=false WHERE id=$1',[g.proof.grantId]);
   assert.equal((await f.reserve(f.next(g,1,r.runId))).decision,'denied');
   const replacement=grant('anthropic',['ar']);await f.install(replacement);
   assert.equal((await f.reserve(f.next(replacement))).decision,'denied');
   await assert.rejects(()=>f.client.query('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=0 WHERE id=$1',[g.proof.grantId]),/IMMUTABLE/);
   await assert.rejects(()=>f.client.query('DELETE FROM private.dabra_dialogue_admissions WHERE attempt_id=$1',[r.attempt]),/IMMUTABLE/);
   assert.equal(await f.count(),4);assert.equal(await f.held(),held+g.cost);
  }));
});
