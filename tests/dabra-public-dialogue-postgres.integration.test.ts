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
 }finally{if(db)await db.end();if(created)await root.query('DROP DATABASE '+database+' WITH (FORCE)');await root.end();}
});
