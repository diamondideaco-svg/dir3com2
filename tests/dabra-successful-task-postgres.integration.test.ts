import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Client} from 'pg';
import {disposableTarget} from '../scripts/sandbox/apply-core-migration-to-db.mjs';
import {canonicalOutputContract} from '../lib/dabra/agent-output-contract';
import {durableAuthorityBindingSha256,durableProfileSha256,type DurableAccountChargeProof} from '../lib/dabra/dialogue-durable-authority';
import {approvedPublicPricingContract} from '../lib/dabra/dialogue-pricing-refresh';
import {publicDialogueCalendar} from '../lib/dabra/public-dialogue-policy';

const sql=(file:string)=>readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
const parents=['20261028174710_task217_dialogue_funding_admission.sql','20261101102846_task217_first_profile_measurement_guard.sql','20261101153907_task217_seven_provider_pilot_envelope.sql','20261102043035_task217_pilot_ledger_funding_scope.sql','20261102182200_task217_saved_funding_snapshot_use.sql','20261103000000_task217_limited_customer_funding.sql','20261103170449_task217_credential_binding_readonly.sql','20261103205926_task217_durable_account_charge.sql','20261104133500_task217_output_contract_acceptance.sql','20261104134000_task217_qualification_bootstrap.sql','20261105193011_task217_qualification_provider_bound.sql'];
function target(value:string|undefined){
 assert.ok(value,'CONTINUITY_TEST_DATABASE_URL required; never silently skip');
 const config=disposableTarget({DATABASE_URL:value,SANDBOX_DISPOSABLE_DATABASE:'true',NODE_ENV:process.env.NODE_ENV});
 assert.ok(['127.0.0.1','::1'].includes(config.host));assert.equal(config.database,'dir3com_test');return config;
}
test('Task237 PostgreSQL synthetic lifecycle, atomic quota and conserved accounting', {timeout:120000}, async t=>{
 const config=target(process.env.CONTINUITY_TEST_DATABASE_URL),database='task237_synthetic_'+randomUUID().replaceAll('-',''),root=new Client(config);
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
  await client.query(sql('20261106225730_task217_public_dialogue_monthly_policy.sql'));
  assert.deepEqual(await snapshot(),old);assert.deepEqual((await client.query(aclSql)).rows,acl);
  const now=Number((await client.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS n')).rows[0].n),calendar=publicDialogueCalendar(now);
  assert.equal(Number((await client.query('SELECT private.dabra_monthly_liability($1,$2) AS n',[calendar.monthStartMs,calendar.monthEndMs])).rows[0].n),61719);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_public_dialogue_control')).rows[0].n,0,'no policy enabled by migration');
  const grantId=randomUUID(),authorityId=randomUUID(),actor=randomUUID(),pricingDigest='f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a';
  const price=approvedPublicPricingContract('openai','gpt-6-luna',pricingDigest);assert.ok(price);
  await client.query(sql('20261110220000_task217_dialogue_v2_qualification.sql'));
  await client.query(sql('20261111003000_task217_bilingual_qualification_authority.sql'));
  const historyBefore=await snapshot();
  await client.query(sql('20261111130000_task237_successful_task_development.sql'));
  assert.deepEqual(await snapshot(),historyBefore);
  assert.equal((await client.query('SELECT private.dabra_successful_task_development_enabled() AS v')).rows[0].v,false);
  const contract=canonicalOutputContract('platform-dialogue-v2','en');
  const profile={provider:'openai' as const,measurement:{capability:'discover' as const,language:'en' as const,model:'gpt-6-luna',environment:'provider-benchmark' as const,sourceSha:'b'.repeat(40),caseSetSha:contract.caseSetSha,cases:4,passed:4,measuredAtMs:now-5000,expiresAtMs:now+600000,latencyMs:1,inputTokenCeiling:4096,outputTokenCeiling:1024,costCeilingUsd:0.002141}};
  const unbound:DurableAccountChargeProof={mode:'bounded-account-charge',grantId,provider:'openai',model:'gpt-6-luna',environment:'provider-benchmark',accountId:'SYNTHETIC-public',projectId:'SYNTHETIC-project',credentialSha256:'c'.repeat(64),evidenceSha256:'d'.repeat(64),currency:'USD',serviceTier:'standard',pricingEvidenceSha256:pricingDigest,accountTerms:{schema:'task217-account-charge-terms-v1',observedAtMs:now-6000,evidenceSha256:'e'.repeat(64),validity:'until-contract-change',risks:{autoReload:'off',postpaid:'blocked',overdraft:'blocked',concurrentAccountUsage:'bounded'},fundingChargeProtection:{kind:'documented-manual-funding-only',evidenceSha256:'f'.repeat(64)},allInChargeBound:{schema:'all-in-account-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-tax-fx-and-funding-charges',maxAdditionalMicros:0,evidenceSha256:'a'.repeat(64)}},limitedOperation:{schema:'task217-limited-operation-v2',authorizationId:randomUUID(),taskId:'task217-text-pilot-2026-11-01',dataScope:'redacted-travel-or-server-units',maxCostMicros:1000000,maxAttempts:28,authorizedAtMs:now-4000,duration:'until-revoked-or-binding-change',providerRisk:'bounded-account-liability-with-observed-risks',acceptedProfileSha256s:['f'.repeat(64)],contractSha256:price.digest,bindingSha256:'0'.repeat(64)}};
  const proof={...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:durableAuthorityBindingSha256(unbound)}};
  const acceptance={schema:'task217-profile-output-acceptance-v1',profileSha256:durableProfileSha256(profile),contractSha256:contract.digest,sourceSha:profile.measurement.sourceSha,provider:'openai',model:'gpt-6-luna',environment:'provider-benchmark',capability:'discover',language:'en',caseSetSha:contract.caseSetSha,reviewedAtMs:now-3000,receipt:{implementationSession:'11111111-1111-4111-8111-111111111111',reviewerSession:'22222222-2222-4222-8222-222222222222',reference:'https://github.com/diamondideaco-svg/dir3com2/issues/217#issuecomment-999999999',artifactSha256:'e'.repeat(64),verdict:'PASS',authorship:'none'}};
  await client.query("INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,input_rate_micros_per_million,output_rate_micros_per_million,enabled,proof,authorized_at) VALUES($1,'openai','SYNTHETIC-public','SYNTHETIC-project','bounded-account-charge',0,100000,500000,true,$2,to_timestamp($3::numeric/1000))",[grantId,proof,now-4000]);
  await client.query("INSERT INTO private.dabra_public_dialogue_authorities(id,source_grant_id,source_proof,profile,output_acceptance,model_tier,enabled,authorized_at) VALUES($1,$2,$3,$4,$5,'economy',true,to_timestamp($6::numeric/1000))",[authorityId,grantId,proof,profile,acceptance,now-2000]);
  await client.query('INSERT INTO auth.users(id) VALUES($1);',[actor]);await client.query("INSERT INTO public.profiles(id,role,status) VALUES($1,'customer','active')",[actor]);await client.query('INSERT INTO private.dabra_successful_task_control(enabled) VALUES(true)');
  const request=(who:string=actor,id:string=randomUUID())=>{const attempt=randomUUID(),observation={schema:'task217-public-pricing-observation-v1',provider:'openai',model:'gpt-6-luna',approvedPricingDigest:pricingDigest,approvedContractDigest:price.digest,currency:'USD',unitTokens:1000000,inputMicrosPerMillion:100000,outputMicrosPerMillion:500000,observedAtMs:now-1000,expiresAtMs:now+600000,bodySha256:'b'.repeat(64)};return [attempt,id,who,authorityId,{schema:'dabra-public-execution-v1',authorityId,profileSha256:acceptance.profileSha256,attemptId:attempt,requestId:id,observation},4096,1024,922];};
  const establishedHistory=await snapshot();
  const digest='7'.repeat(64);
  const make=(who:string=actor):unknown[]=>[...request(who),digest,randomUUID()];
  const rpc=async(name:string,args:unknown[],connection=client)=>{
   await connection.query('BEGIN');try{
    await connection.query('SET LOCAL ROLE service_role');
    const {rows}=await connection.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS v`,args);
    await connection.query('COMMIT');return rows[0].v;
   }catch(e){await connection.query('ROLLBACK');throw e;}
  };
  const claim=(r:unknown[],c=client)=>rpc('reserve_dabra_successful_task',r,c);
  const finish=(r:unknown[],outcome:string,answer:string|null=null,token=r[9])=>rpc('finish_dabra_successful_task',[r[2],r[1],r[8],token,outcome,answer,'en']);
  const read=(r:unknown[],who=r[2],input=r[8])=>rpc('read_dabra_successful_task',[who,r[1],input]);
  const usage=(who=actor)=>rpc('get_dabra_successful_task_allowance',[who]);
  const countHolds=async()=> (await client.query('SELECT count(*)::int AS n,sum(cost_micros)::int AS cost FROM private.dabra_public_dialogue_admissions')).rows[0];
  const addActor=async()=>{const id=randomUUID();await client.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await client.query("INSERT INTO public.profiles(id,role,status) VALUES($1,'customer','active')",[id]);return id;};
  await t.test('default-off gate, owner-only ACL and no original control activation',async()=>{
   assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_public_dialogue_control')).rows[0].n,0);
   for(const role of ['anon','authenticated','service_role'])for(const table of ['dabra_successful_tasks','dabra_successful_task_answers','dabra_successful_task_control'])
    assert.equal((await client.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') AS v",[role,'private.'+table])).rows[0].v,false);
   for(const role of ['anon','authenticated']) assert.equal((await client.query("SELECT has_function_privilege($1,'public.read_dabra_successful_task(uuid,uuid,text)','EXECUTE') AS v",[role])).rows[0].v,false);
   for(const role of ['anon','authenticated','service_role'])assert.equal((await client.query("SELECT has_function_privilege($1,'private.dabra_successful_task_actor_locked(uuid)','EXECUTE') AS v",[role])).rows[0].v,false);
   await client.query('UPDATE private.dabra_successful_task_control SET enabled=false');assert.equal((await claim(make())).decision,'denied');
   await client.query('UPDATE private.dabra_successful_task_control SET enabled=true');
  });
  await t.test('one admitted slot becomes one saved success; duplicate replay never charges; mismatch and wrong owner do not reveal',async()=>{
   const r=make();assert.equal((await claim(r)).decision,'admitted');
   assert.equal((await usage()).dailyPending,1);assert.equal((await usage()).dailySucceeded,0);
   assert.equal((await finish(r,'succeeded','SYNTHETIC validated answer')).state,'succeeded');
   const held=await countHolds();assert.equal((await finish(r,'succeeded','SYNTHETIC replacement')).state,'succeeded');
   assert.equal((await read(r)).answer,'SYNTHETIC validated answer');assert.equal((await claim(r)).decision,'existing');
   assert.deepEqual(await countHolds(),held);assert.equal((await usage()).dailySucceeded,1);assert.equal((await usage()).dailyPending,0);
   assert.equal((await read(r,actor,'8'.repeat(64))).state,'conflict');
   const other=await addActor();assert.deepEqual(await read(r,other),{state:'absent'});
   assert.equal(await finish(r,'failed',null,randomUUID()),null);
   assert.equal((await read(r)).state,'succeeded');
  });
  await t.test('known failure releases only success slot, never admitted cost or attempt; more than ten failures are allowed within cost',async()=>{
   const who=await addActor();for(let i=0;i<12;i++) { const r=make(who);assert.equal((await claim(r)).decision,'admitted');assert.equal((await finish(r,'failed')).state,'failed');assert.equal((await claim(r)).decision,'existing'); }
   const u=await usage(who);assert.equal(u.dailyPending,0);assert.equal(u.dailySucceeded,0);assert.equal(u.accountHeldCostMicros,12*922);
  });
  await t.test('unknown holds slot until fenced expiry and never auto-redispatches or refunds cost',async()=>{
   const who=await addActor(),r=make(who);assert.equal((await claim(r)).decision,'admitted');
   assert.equal((await finish(r,'unknown')).state,'unknown');assert.equal((await usage(who)).dailyPending,1);
   await client.query('UPDATE private.dabra_successful_tasks SET lease_expires_ms=0 WHERE actor_id=$1',[who]);
   assert.equal((await read(r)).state,'unknown');assert.equal((await usage(who)).dailyPending,0);
   assert.equal((await finish(r,'succeeded','SYNTHETIC late answer')).state,'unknown');assert.equal((await claim(r)).decision,'existing');
   assert.equal((await usage(who)).accountHeldCostMicros,922);
  });
  const seed=async(who:string,count:number,day=calendar.dayStartMs,month=calendar.monthStartMs,cost=1)=>{
   for(let i=0;i<count;i++){
    const r=make(who);await client.query("INSERT INTO private.dabra_public_dialogue_admissions(attempt_id,request_id,subject_hash,authority_id,source_grant_id,day_start_ms,month_start_ms,input_tokens,output_tokens,cost_micros,execution_pricing) VALUES($1,$2,encode(sha256(convert_to('task217-dialogue:'||$3::text,'UTF8')),'hex'),$4,$5,$6,$7,1,1,$8,'{}')",[r[0],r[1],who,authorityId,grantId,day,month,cost]);
    await client.query("INSERT INTO private.dabra_successful_tasks(actor_id,request_id,input_digest,attempt_id,day_start_ms,month_start_ms,state,lease_token,lease_expires_ms) VALUES($1,$2,$3,$4,$5,$6,'succeeded',$7,0)",[who,r[1],digest,r[0],day,month,r[9]]);
   }
  };
  await t.test('two independent workers race for one remaining successful slot; only one is admitted',async()=>{
   const who=await addActor();await seed(who,9);
   const left=new Client({...config,database}),right=new Client({...config,database});await left.connect();await right.connect();
   try{const results=await Promise.all([claim(make(who),left),claim(make(who),right)]);assert.deepEqual(results.map(r=>r.decision).sort(),['admitted','denied']);}
   finally{await left.end();await right.end();}
   const u=await usage(who);assert.equal(u.dailySucceeded,9);assert.equal(u.dailyPending,1);
  });
  await t.test('monthly successful cap and monthly account cost are independent; previous period is not erased',async()=>{
   const capped=await addActor();await seed(capped,50,calendar.dayStartMs-86400000);assert.equal((await claim(make(capped))).decision,'denied');
   const funded=await addActor();await seed(funded,2,calendar.dayStartMs-86400000,calendar.monthStartMs,249999);assert.equal((await claim(make(funded))).decision,'denied');
   const previous=await addActor();await seed(previous,50,calendar.dayStartMs-35*86400000,publicDialogueCalendar(calendar.monthStartMs-1).monthStartMs);
   assert.equal((await claim(make(previous))).decision,'admitted');assert.equal((await usage(previous)).monthlySucceeded,0);
  });
  await t.test('altered pricing/profile and exhausted shared USD25 liability fail without a hold',async()=>{
   for(const key of ['profileSha256','observation']){
    const r=make();const execution=r[4] as Record<string,unknown>;
    r[4]={...execution,[key]:key==='profileSha256'?'0'.repeat(64):{...(execution.observation as object),inputMicrosPerMillion:1}};
    const before=await countHolds();assert.equal((await claim(r)).decision,'denied');assert.deepEqual(await countHolds(),before);
   }
   await client.query('BEGIN');try{
    const who=await addActor();await seed(who,100,calendar.dayStartMs,calendar.monthStartMs,250000);
    const candidate=make(actor);await client.query('SET LOCAL ROLE service_role');
    assert.equal((await client.query('SELECT public.reserve_dabra_successful_task($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS v',candidate)).rows[0].v.decision,'denied');
   }finally{await client.query('ROLLBACK');}
  });
  await t.test('period-crossing completion is fenced, retention is exactly 24h and physical purge preserves accounting',async()=>{
   const who=await addActor(),r=make(who);assert.equal((await claim(r)).decision,'admitted');
   await client.query('UPDATE private.dabra_successful_tasks SET day_start_ms=day_start_ms-86400000 WHERE actor_id=$1',[who]);
   assert.equal((await finish(r,'succeeded','SYNTHETIC boundary answer')).state,'unknown');
   const fresh=make(who);assert.equal((await claim(fresh)).decision,'admitted');await finish(fresh,'succeeded','SYNTHETIC expiring answer');
   const row=(await client.query('SELECT a.expires_at_ms-t.finished_at_ms AS ttl FROM private.dabra_successful_task_answers a JOIN private.dabra_successful_tasks t USING(actor_id,request_id) WHERE a.actor_id=$1',[who])).rows[0];assert.equal(Number(row.ttl),86400000);
   const holds=await countHolds();await client.query('UPDATE private.dabra_successful_task_answers SET expires_at_ms=0 WHERE actor_id=$1',[who]);
   assert.equal(Number(await rpc('purge_dabra_successful_task_answers',[null])),1);assert.equal((await read(fresh)).answer,null);
   assert.equal((await read(fresh)).state,'succeeded');assert.deepEqual(await countHolds(),holds);
   assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_successful_task_answers WHERE actor_id=$1',[who])).rows[0].n,0);
  });
  const blockedBy=async(connection:Client,pid:number)=>{
   const end=Date.now()+2000;let blocked=false;
   while(Date.now()<end){blocked=(await connection.query('SELECT pg_backend_pid()=ANY(pg_blocking_pids($1)) AS v',[pid])).rows[0].v;if(blocked)break;await new Promise(resolve=>setTimeout(resolve,10));}
   assert.equal(blocked,true,'the requested operation must actually wait for the fixture lock');
  };
  await t.test('uncommitted direct INSERT keys fail fast without retaining admission locks or new cost',async()=>{
   const writer=new Client({...config,database}),contender=new Client({...config,database}),probe=new Client({...config,database});await writer.connect();await contender.connect();await probe.connect();
   const insertAdmission=async(connection:Client,attempt:unknown,requestId:unknown,who:unknown)=>connection.query("INSERT INTO private.dabra_public_dialogue_admissions(attempt_id,request_id,subject_hash,authority_id,source_grant_id,day_start_ms,month_start_ms,input_tokens,output_tokens,cost_micros,execution_pricing) VALUES($1,$2,encode(sha256(convert_to('task217-dialogue:'||$3::text,'UTF8')),'hex'),$4,$5,$6,$7,1,1,1,'{}')",[attempt,requestId,who,authorityId,grantId,calendar.dayStartMs,calendar.monthStartMs]);
   const saved=make(await addActor());await claim(saved);await finish(saved,'succeeded','SYNTHETIC retained answer');
   try{
    for(const collision of ['admission request','admission attempt','parent primary','parent attempt','unrelated admission write']){
     const who=await addActor(),r=make(who),otherAttempt=randomUUID();
     if(collision.startsWith('parent'))await insertAdmission(client,collision==='parent attempt'?r[0]:otherAttempt,randomUUID(),who);
     const before=await countHolds();
     await writer.query('BEGIN');
     if(collision.startsWith('parent'))await writer.query("INSERT INTO private.dabra_successful_tasks(actor_id,request_id,input_digest,attempt_id,day_start_ms,month_start_ms,lease_token,lease_expires_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[who,collision==='parent attempt'?randomUUID():r[1],digest,collision==='parent attempt'?r[0]:otherAttempt,calendar.dayStartMs,calendar.monthStartMs,randomUUID(),now+12000]);
     else await insertAdmission(writer,collision==='admission attempt'?r[0]:randomUUID(),collision==='admission request'?r[1]:randomUUID(),who);
     await contender.query('BEGIN');await contender.query('SET LOCAL ROLE service_role');await contender.query("SET LOCAL statement_timeout='2s'");
     try{
      const started=Date.now();const result=(await contender.query('SELECT public.reserve_dabra_successful_task($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS v',r)).rows[0].v;
      assert.deepEqual(result,{decision:'denied'},collision);assert.ok(Date.now()-started<300,collision+' must not wait for a unique index');
      assert.equal((await probe.query("SELECT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) AS v")).rows[0].v,true,'admission lock released before caller rollback');
      await probe.query('BEGIN');await probe.query('SELECT 1 FROM private.dabra_successful_task_control FOR UPDATE NOWAIT');await probe.query('SELECT 1 FROM auth.users WHERE id=$1 FOR UPDATE NOWAIT',[who]);await probe.query('SELECT 1 FROM public.profiles WHERE id=$1 FOR UPDATE NOWAIT',[who]);await probe.query('ROLLBACK');
      assert.deepEqual(await countHolds(),before);assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_successful_tasks WHERE actor_id=$1',[who])).rows[0].n,0);
      assert.equal((await read(saved)).answer,'SYNTHETIC retained answer','existing retrieval remains available during unrelated direct writes');
     }finally{await contender.query('ROLLBACK');await writer.query('ROLLBACK');}
     if(collision==='parent attempt')assert.equal((await claim(r)).decision,'denied','existing admitted attempt remains ineligible, without unique-index waiting');
     else{assert.equal((await claim(r)).decision,'admitted','explicit later reservation still works after conflict ends');await finish(r,'failed');}
    }
    // Writer-first remains unavailable; the reverse ordering is exercised separately below.
    const who=await addActor(),r=make(who);assert.equal((await claim(r)).decision,'admitted');const before=await countHolds();
    await writer.query('BEGIN');await writer.query("INSERT INTO private.dabra_successful_task_answers VALUES($1,$2,'SYNTHETIC uncommitted answer','en',$3)",[who,r[1],now+86400000]);
    await contender.query('BEGIN');await contender.query('SET LOCAL ROLE service_role');await contender.query("SET LOCAL statement_timeout='2s'");
    try{
     const started=Date.now(),result=(await contender.query("SELECT public.finish_dabra_successful_task($1,$2,$3,$4,'succeeded','SYNTHETIC final','en') AS v",[who,r[1],digest,r[9]])).rows[0].v;
     assert.equal(result,null);assert.ok(Date.now()-started<300);assert.equal((await probe.query("SELECT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) AS v")).rows[0].v,true);assert.deepEqual(await countHolds(),before);
    }finally{await contender.query('ROLLBACK');await writer.query('ROLLBACK');}
    assert.equal((await finish(r,'succeeded','SYNTHETIC valid answer')).state,'succeeded');assert.equal((await read(r)).answer,'SYNTHETIC valid answer');assert.deepEqual(await countHolds(),before);
   }finally{await writer.query('ROLLBACK');await contender.query('ROLLBACK');await probe.query('ROLLBACK');await writer.end();await contender.end();await probe.end();}
  });
  await t.test('all task RPCs fail fast on contention and release subtransaction locks before client rollback',async()=>{
   const who=await addActor(),pendingTask=make(who),saved=make(who);await claim(pendingTask);await claim(saved);await finish(saved,'succeeded','SYNTHETIC private');
   const attempts={reserve:make(who),finish:pendingTask,read:saved,allowance:pendingTask};
   const operation=(name:string,target:string)=>{const r=name==='reserve'&&target==='task row'?pendingTask:attempts[name as keyof typeof attempts];return name==='reserve'?['reserve_dabra_successful_task',r] as const:name==='finish'?['finish_dabra_successful_task',[who,r[1],digest,r[9],'succeeded','SYNTHETIC blocked','en']] as const:name==='read'?['read_dabra_successful_task',[who,r[1],digest]] as const:['get_dabra_successful_task_allowance',[who]] as const;};
   const targets:[string,string[],string,unknown[]][]=[
    ['shared',['reserve','finish','read','allowance'],"SELECT pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0))",[]],
    ['task table',['reserve','finish','read','allowance'],'LOCK TABLE private.dabra_successful_tasks IN ACCESS EXCLUSIVE MODE',[]],
    ['control table',['reserve','finish','read','allowance'],'LOCK TABLE private.dabra_successful_task_control IN ACCESS EXCLUSIVE MODE',[]],
    ['user table',['reserve','finish','read','allowance'],'LOCK TABLE auth.users IN ACCESS EXCLUSIVE MODE',[]],
    ['profile table',['reserve','finish','read','allowance'],'LOCK TABLE public.profiles IN ACCESS EXCLUSIVE MODE',[]],
    ['control row',['reserve','finish','read','allowance'],'SELECT 1 FROM private.dabra_successful_task_control FOR UPDATE',[]],
    ['user row',['reserve','finish','read','allowance'],'SELECT 1 FROM auth.users WHERE id=$1 FOR UPDATE',[who]],
    ['profile row',['reserve','finish','read','allowance'],'SELECT 1 FROM public.profiles WHERE id=$1 FOR UPDATE',[who]],
    ['task row',['reserve','finish','read'],'SELECT 1 FROM private.dabra_successful_tasks WHERE actor_id=$1 FOR UPDATE',[who]],
    ['answer table',['finish','read'],'LOCK TABLE private.dabra_successful_task_answers IN ACCESS EXCLUSIVE MODE',[]],
    ['answer row',['read'],'SELECT 1 FROM private.dabra_successful_task_answers WHERE actor_id=$1 FOR UPDATE',[who]],
    ['public cost table',['reserve','allowance'],'LOCK TABLE private.dabra_public_dialogue_admissions IN ACCESS EXCLUSIVE MODE',[]],
    ['legacy cost table',['reserve','allowance'],'LOCK TABLE private.dabra_dialogue_admissions IN ACCESS EXCLUSIVE MODE',[]],
    ['grant table',['reserve','allowance'],'LOCK TABLE private.dabra_dialogue_funding_grants IN ACCESS EXCLUSIVE MODE',[]],
    ['authority table',['reserve'],'LOCK TABLE private.dabra_public_dialogue_authorities IN ACCESS EXCLUSIVE MODE',[]],
    ['authority row',['reserve'],'SELECT 1 FROM private.dabra_public_dialogue_authorities WHERE id=$1 FOR UPDATE',[authorityId]],
    ['grant row',['reserve'],'SELECT 1 FROM private.dabra_dialogue_funding_grants WHERE id=$1 FOR UPDATE',[grantId]],
   ];
   const contender=new Client({...config,database}),probe=new Client({...config,database});await contender.connect();await probe.connect();const before=await countHolds();
   try{for(const [target,operations,lock,args] of targets)for(const name of operations){
    await client.query('BEGIN');await client.query(lock,args);await contender.query('BEGIN');await contender.query('SET LOCAL ROLE service_role');await contender.query("SET LOCAL statement_timeout='2s'");
    try{
     const [fn,params]=operation(name,target),started=Date.now();const result=(await contender.query(`SELECT public.${fn}(${params.map((_,i)=>'$'+(i+1)).join(',')}) AS v`,[...params])).rows[0].v;
     assert.deepEqual(result,name==='reserve'?{decision:'denied'}:null,name+' / '+target);assert.ok(Date.now()-started<300,name+' must not queue on '+target);
     if(target!=='shared')assert.equal((await probe.query("SELECT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) AS v")).rows[0].v,true,'subtransaction releases admission lock before client transaction ends');
     if(target==='answer row'||target==='authority row'||target==='grant row'){
      await probe.query('BEGIN');await probe.query('SELECT 1 FROM private.dabra_successful_task_control FOR UPDATE NOWAIT');await probe.query('SELECT 1 FROM auth.users WHERE id=$1 FOR UPDATE NOWAIT',[who]);await probe.query('SELECT 1 FROM public.profiles WHERE id=$1 FOR UPDATE NOWAIT',[who]);await probe.query('ROLLBACK');
     }
    }finally{await contender.query('ROLLBACK');await client.query('ROLLBACK');}
   }}finally{await contender.end();await probe.end();}
   assert.deepEqual(await countHolds(),before);assert.equal((await read(pendingTask)).state,'pending');assert.equal((await read(saved)).answer,'SYNTHETIC private');
  });
  await t.test('disabled or revoked eligibility gates absent, existing and conflict branches before revealing state',async()=>{
   const who=await addActor(),r=make(who);await claim(r);await finish(r,'succeeded','SYNTHETIC private');const before=await countHolds();
   const operations=[['read_dabra_successful_task',[who,randomUUID(),digest]],['read_dabra_successful_task',[who,r[1],digest]],['read_dabra_successful_task',[who,r[1],'8'.repeat(64)]],['reserve_dabra_successful_task',r],['reserve_dabra_successful_task',[...r.slice(0,8),'8'.repeat(64),r[9]]],['reserve_dabra_successful_task',make(who)],['get_dabra_successful_task_allowance',[who]],['finish_dabra_successful_task',[who,r[1],digest,r[9],'succeeded','SYNTHETIC','en']]] as const;
   const contender=new Client({...config,database});await contender.connect();
   try{for(const revoke of ['control','profile','user']){
    await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0))");
    if(revoke==='control')await client.query('UPDATE private.dabra_successful_task_control SET enabled=false');
    else if(revoke==='profile')await client.query("UPDATE public.profiles SET status='inactive' WHERE id=$1",[who]);
    else await client.query("UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id=$1",[who]);
    for(const [name,args] of operations)assert.deepEqual(await rpc(name,[...args],contender),name.startsWith('reserve')?{decision:'denied'}:null);
    await client.query('COMMIT');
    for(const [name,args] of operations)assert.deepEqual(await rpc(name,[...args],contender),name.startsWith('reserve')?{decision:'denied'}:null);
    await client.query('UPDATE private.dabra_successful_task_control SET enabled=true');await client.query("UPDATE public.profiles SET status='active' WHERE id=$1",[who]);await client.query('UPDATE auth.users SET banned_until=NULL WHERE id=$1',[who]);
   }}finally{await client.query('ROLLBACK');await contender.end();}
   assert.deepEqual(await countHolds(),before);assert.equal((await read(r)).answer,'SYNTHETIC private');
  });
  await t.test('answer INSERT order cannot form a unique-index and parent-FK cycle',async()=>{
   const who=await addActor(),r=make(who),other=make(who);await claim(r);await claim(other);const before=await countHolds();
   const writer=new Client({...config,database}),finisher=new Client({...config,database}),probe=new Client({...config,database});await writer.connect();await finisher.connect();await probe.connect();
   const fp=(await finisher.query('SELECT pg_backend_pid() AS p')).rows[0].p,wp=(await writer.query('SELECT pg_backend_pid() AS p')).rows[0].p;
   const finishSql="SELECT public.finish_dabra_successful_task($1,$2,$3,$4,'succeeded','SYNTHETIC finish','en') AS v",args=[who,r[1],digest,r[9]];
   let finishing:Promise<{rows:{v:unknown}[]}>|undefined,writing:Promise<string>|undefined;
   try{
    for(const target of [r,other]){
     await writer.query('BEGIN');await writer.query("INSERT INTO private.dabra_successful_task_answers VALUES($1,$2,'SYNTHETIC writer','en',$3)",[who,target[1],now+86400000]);
     await finisher.query('BEGIN');await finisher.query('SET LOCAL ROLE service_role');await finisher.query("SET LOCAL statement_timeout='2s'");
     const started=Date.now();assert.equal((await finisher.query(finishSql,args)).rows[0].v,null);assert.ok(Date.now()-started<300);
     assert.equal((await probe.query("SELECT pg_try_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0)) AS v")).rows[0].v,true,'failed completion releases admission lock before client rollback');
     await probe.query('BEGIN');await probe.query('SELECT 1 FROM private.dabra_successful_task_control FOR UPDATE NOWAIT');await probe.query('SELECT 1 FROM auth.users WHERE id=$1 FOR UPDATE NOWAIT',[who]);await probe.query('SELECT 1 FROM public.profiles WHERE id=$1 FOR UPDATE NOWAIT',[who]);await probe.query('ROLLBACK');
     await finisher.query('ROLLBACK');await writer.query('ROLLBACK');assert.deepEqual(await countHolds(),before);assert.equal((await read(r)).state,'pending');
    }
    // Synthetic-only gate pauses finish after its locks but before its answer index insertion.
    await client.query("CREATE FUNCTION private.task237_order_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('task237.synthetic_finish_gate',true)='on' THEN PERFORM pg_advisory_xact_lock(hashtextextended('task237-order-gate',0)); END IF; RETURN NEW; END $$; CREATE TRIGGER task237_order_gate BEFORE INSERT ON private.dabra_successful_task_answers FOR EACH ROW EXECUTE FUNCTION private.task237_order_gate()");
    await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('task237-order-gate',0))");
    await finisher.query('BEGIN');await finisher.query('SET LOCAL ROLE service_role');await finisher.query("SET LOCAL task237.synthetic_finish_gate='on'; SET LOCAL statement_timeout='5s'");
    finishing=finisher.query(finishSql,args);await blockedBy(client,fp);
    await writer.query('BEGIN');await writer.query("SET LOCAL statement_timeout='5s'");
    writing=writer.query("INSERT INTO private.dabra_successful_task_answers VALUES($1,$2,'SYNTHETIC writer','en',$3)",[who,r[1],now+86400000]).then(()=>'inserted',(e: {code:string})=>e.code);
    let waiting=false;const end=Date.now()+1000;
    while(Date.now()<end){waiting=(await probe.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND relation='private.dabra_successful_task_answers'::regclass AND locktype='relation' AND NOT granted) AS v",[wp])).rows[0].v;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,5));}
    assert.equal(waiting,true,'direct writer is excluded at relation lock before creating its unique key');
    assert.equal((await probe.query('SELECT $1::int=ANY(pg_blocking_pids($2)) AS v',[wp,fp])).rows[0].v,false,'finish does not wait for direct writer');
    await client.query('COMMIT');assert.deepEqual((await finishing).rows[0].v,{state:'succeeded'});await finisher.query('COMMIT');
    assert.equal(await writing,'23505','later writer sees saved answer, not a deadlock or timeout');await writer.query('ROLLBACK');
    assert.equal((await read(r)).answer,'SYNTHETIC finish');assert.deepEqual(await countHolds(),before);
   }finally{
    await client.query('ROLLBACK');await probe.query('SELECT pg_cancel_backend($1),pg_cancel_backend($2)',[wp,fp]);if(finishing)await finishing.catch(()=>{});if(writing)await writing;await writer.query('ROLLBACK');await finisher.query('ROLLBACK');await probe.query('ROLLBACK');await writer.end();await finisher.end();await probe.end();
    await client.query('DROP TRIGGER IF EXISTS task237_order_gate ON private.dabra_successful_task_answers;DROP FUNCTION IF EXISTS private.task237_order_gate()');
   }
  });
  await t.test('wait inside answer INSERT rolls back late answer atomically and serializes eligibility revocation',async()=>{
   // Test-only trigger exposes a real pause inside INSERT, after all production locks/checks.
   await client.query("CREATE FUNCTION private.task237_test_insert_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('task237-synthetic-insert-wait',0)); RETURN NEW; END $$; CREATE TRIGGER task237_test_insert_wait BEFORE INSERT ON private.dabra_successful_task_answers FOR EACH ROW EXECUTE FUNCTION private.task237_test_insert_wait()");
   try{for(const change of ['lease','control','account','user']){
    const who=await addActor(),r=make(who);assert.equal((await claim(r)).decision,'admitted');
    if(change==='lease')await client.query('UPDATE private.dabra_successful_tasks SET lease_expires_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+400 WHERE actor_id=$1',[who]);
    const before=await countHolds(),queued=new Client({...config,database}),revoker=new Client({...config,database});await queued.connect();await revoker.connect();
    const pid=Number((await queued.query('SELECT pg_backend_pid() AS pid')).rows[0].pid),revokePid=Number((await revoker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    let pending:Promise<unknown>|undefined,revokePending:Promise<unknown>|undefined;
    try{
     await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('task237-synthetic-insert-wait',0))");
     await queued.query('BEGIN');await queued.query('SET LOCAL ROLE service_role');await queued.query("SET LOCAL statement_timeout='5s'");
     pending=queued.query('SELECT public.finish_dabra_successful_task($1,$2,$3,$4,$5,$6,$7) AS v',[who,r[1],digest,r[9],'succeeded','SYNTHETIC insertion wait','en']).then(x=>x.rows[0].v);
     await blockedBy(client,pid);
     if(change==='lease')await client.query('SELECT pg_sleep(0.45)');
     else {
      await revoker.query("SET statement_timeout='5s'");
      revokePending=change==='control'?revoker.query('UPDATE private.dabra_successful_task_control SET enabled=false'):change==='user'?revoker.query("UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id=$1",[who]):revoker.query("UPDATE public.profiles SET status='inactive' WHERE id=$1",[who]);
      const end=Date.now()+2000;let blocked=false;
      while(Date.now()<end){blocked=(await client.query('SELECT $1::int=ANY(pg_blocking_pids($2)) AS v',[pid,revokePid])).rows[0].v;if(blocked)break;await new Promise(resolve=>setTimeout(resolve,10));}
      assert.equal(blocked,true,'revocation cannot commit while the answer transaction holds eligibility rows');
     }
     await client.query('COMMIT');assert.deepEqual(await pending,{state:change==='lease'?'unknown':'succeeded'});await queued.query('COMMIT');
     if(revokePending){await revokePending;assert.equal(await read(r),null);}
    }finally{await client.query('ROLLBACK');if(pending)await pending;await queued.query('ROLLBACK');if(revokePending)await revokePending;await queued.end();await revoker.end();await client.query('UPDATE private.dabra_successful_task_control SET enabled=true');await client.query("UPDATE public.profiles SET status='active' WHERE id=$1",[who]);await client.query('UPDATE auth.users SET banned_until=NULL WHERE id=$1',[who]);}
    assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_successful_task_answers WHERE actor_id=$1',[who])).rows[0].n,change==='lease'?0:1);
    assert.equal((await read(r)).state,change==='lease'?'unknown':'succeeded');assert.deepEqual(await countHolds(),before);
   }}finally{await client.query('DROP TRIGGER task237_test_insert_wait ON private.dabra_successful_task_answers;DROP FUNCTION private.task237_test_insert_wait()');}
  });
  await t.test('retrieval rejects answer-row contention, checks fresh expiry on explicit retry and never cleans up another answer',async()=>{
   const who=await addActor(),r=make(who);assert.equal((await claim(r)).decision,'admitted');await finish(r,'succeeded','SYNTHETIC expiring read');
   await client.query('UPDATE private.dabra_successful_task_answers SET expires_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+400 WHERE actor_id=$1',[who]);
   const queued=new Client({...config,database});await queued.connect();
   try{
    await client.query('BEGIN');await client.query('SELECT 1 FROM private.dabra_successful_task_answers WHERE actor_id=$1 FOR UPDATE',[who]);
    const started=Date.now();assert.equal(await rpc('read_dabra_successful_task',[who,r[1],digest],queued),null);assert.ok(Date.now()-started<300);await client.query('SELECT pg_sleep(0.45)');await client.query('COMMIT');assert.equal((await read(r)).answer,null);
    const fresh=make(who);assert.equal((await claim(fresh)).decision,'admitted');await finish(fresh,'succeeded','SYNTHETIC fresh read');
    await client.query('BEGIN');await client.query('SELECT 1 FROM private.dabra_successful_task_answers WHERE actor_id=$1 AND request_id=$2 FOR UPDATE',[who,r[1]]);
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{const result=await Promise.race([rpc('read_dabra_successful_task',[who,fresh[1],digest],queued),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('retrieval waited for unrelated expired answer cleanup')),500);})]);assert.equal(result.answer,'SYNTHETIC fresh read');}
    finally{if(timer)clearTimeout(timer);await client.query('ROLLBACK');}
    assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_successful_task_answers WHERE actor_id=$1',[who])).rows[0].n,2,'read does not delete expired content; explicit purge remains responsible');
   }finally{await client.query('ROLLBACK');await queued.end();}
  });
  assert.deepEqual(await snapshot(),establishedHistory,'historical grant/admission records unchanged');
 }finally{if(db)await db.end();if(created)await root.query('DROP DATABASE '+database+' WITH (FORCE)');await root.end();}
});
