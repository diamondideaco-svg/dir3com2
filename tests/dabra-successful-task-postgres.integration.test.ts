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
  await t.test('Core decision resolver: private service-only empty state, approved owner, withdrawal and funding binding',async core=>{
   const before=await snapshot();
   await client.query(sql('20261112090000_task237_production_decision_resolution.sql'));
   assert.deepEqual(await snapshot(),before);
   assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_successful_task_decisions')).rows[0].n,0);
   for(const role of ['anon','authenticated','service_role']) {
    assert.equal((await client.query("SELECT has_table_privilege($1,'private.dabra_successful_task_decisions','SELECT,INSERT,UPDATE,DELETE') AS v",[role])).rows[0].v,false);
    assert.equal((await client.query("SELECT has_function_privilege($1,'public.resolve_dabra_successful_task_decisions(uuid,text,jsonb)','EXECUTE') AS v",[role])).rows[0].v,role==='service_role');
   }
   const ceo='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16',who=await addActor(),other=await addActor();
   await client.query('INSERT INTO auth.users(id) VALUES($1)',[ceo]);
   await client.query("INSERT INTO public.profiles(id,role,status) VALUES($1,'admin','active')",[ceo]);
   const kinds=['retention','consent','deletion','audience','spending'];
   const policy={schema:'dabra-successful-task-production-policy-v1',revision:'synthetic-revision',
    ...Object.fromEntries(kinds.map(k=>[k+'Decision','synthetic-'+k]))};
   const resolve=(owner=who,role='customer')=>rpc('resolve_dabra_successful_task_decisions',[owner,role,policy]);
   assert.equal(await resolve(),null,'missing decisions do not authorize');
   for(const kind of kinds) await client.query(`INSERT INTO private.dabra_successful_task_decisions
    (reference,revision,kind,purpose,actor_id,actor_role,approved_by,approval_reference,approved_at_ms,expires_at_ms,document,funding_grant_id,funding_proof_sha256)
    VALUES($1,'synthetic-revision',$2,'dabra-successful-task',$3,'customer',$4,'synthetic-evidence',$5,$6,'{"syntheticOnly":true}'::jsonb,$7,
     CASE WHEN $7::uuid IS NULL THEN NULL ELSE (SELECT encode(sha256(convert_to(proof::text,'UTF8')),'hex') FROM private.dabra_dialogue_funding_grants WHERE id=$7) END)`,
    ['synthetic-'+kind,kind,who,kind==='consent'?who:ceo,now-1000,now+600000,kind==='spending'?grantId:null]);
   assert.equal((await resolve()).actorId,who);
   // Prepared production lifecycle contract: same Core ledger, separate explicit documents.
   const baseline=sql('20260903215959_production_schema_baseline.sql');
   const grantTable=baseline.match(/CREATE TABLE "public"\."team_access_grants" \([\s\S]*?\n\);/);
   const normalizeCountry=baseline.match(/CREATE OR REPLACE FUNCTION public\.normalize_admin_country_key\(value text\)[\s\S]*?\$function\$\n;/);
   assert.ok(grantTable && normalizeCountry);await client.query(grantTable[0]);await client.query(normalizeCountry[0]);
   await client.query(sql('20261112100000_task237_production_lifecycle.sql'));
   const strongCatalog=async()=> (await client.query(`SELECT n.nspname AS schema,p.proname AS name,p.oid,p.proowner,
    pg_get_userbyid(p.proowner) AS owner,oidvectortypes(p.proargtypes) AS types,
    pg_get_function_arguments(p.oid) AS arguments,p.proacl::text AS acl,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
    has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
    ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END || ':' || a.privilege_type
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a ORDER BY 1) AS privileges
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname,p.proname) IN (('private','dabra_production_task_terms'),
     ('public','get_dabra_production_task_policy'),('public','reserve_dabra_production_task'))
    ORDER BY n.nspname,p.proname`)).rows;
   const strongSignatures=[
    ['private','dabra_production_task_terms','jsonb'],
    ['public','get_dabra_production_task_policy','uuid, text, jsonb, jsonb, jsonb, jsonb'],
    ['public','reserve_dabra_production_task','uuid, uuid, uuid, uuid, jsonb, integer, integer, bigint, text, uuid, text, jsonb, jsonb, bigint, jsonb, jsonb'],
   ];
   const catalogBefore=await strongCatalog();
   assert.deepEqual(catalogBefore.map(r=>[r.schema,r.name,r.types]),strongSignatures,'exact signatures, one overload each');
   for(const r of catalogBefore){
    const isPublic=r.schema==='public';
    assert.equal(r.owner,'postgres');assert.equal(r.prosecdef,isPublic);
    assert.deepEqual(r.proconfig,['search_path=""']);
    assert.equal(r.anon_execute,false);assert.equal(r.authenticated_execute,false);assert.equal(r.service_execute,isPublic);
    assert.deepEqual(r.privileges,isPublic?['postgres:EXECUTE','service_role:EXECUTE']:['postgres:EXECUTE']);
   }
   await client.query(sql('20261113193000_task237_strong_pilot.sql'));
   assert.deepEqual(await strongCatalog(),catalogBefore,'replacement preserves OIDs, signatures/defaults, owner, ACL and security settings');
   const operator=await addActor();await client.query("UPDATE public.profiles SET role='staff' WHERE id=$1",[operator]);
   const operations={schema:'dabra-operations-binding-v1',actorId:operator,country:'EG',kind:'grant',grant:{id:randomUUID(),invited_user_id:operator,access_level:'scoped_staff',status:'active',country_scope:['Egypt'],permissions:['operations:read']}};
   const checkOperations=async(b:unknown=operations)=>(await client.query('SELECT private.dabra_task_operations_current($1,$2) AS v',[operator,b])).rows[0].v;
   assert.equal(await checkOperations(),false,'missing grant');
   await client.query("INSERT INTO public.team_access_grants(id,email,job_title,invited_user_id,created_by,country_scope,permissions) VALUES($1,'synthetic@example.invalid','synthetic',$2,$2,ARRAY['Egypt'],ARRAY['operations:read'])",[operations.grant.id,operator]);
   assert.equal(await checkOperations(),true);
   for(const point of [0x09,0x0a,0x0b,0x0c,0x0d,0x20,0xa0,0x1680,0x2000,0x2001,0x2002,0x2003,0x2004,0x2005,0x2006,0x2007,0x2008,0x2009,0x200a,0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff]){
    const c=String.fromCodePoint(point);operations.grant.country_scope=[c+'Egypt'+c];
    await client.query('UPDATE public.team_access_grants SET country_scope=$1 WHERE invited_user_id=$2',[operations.grant.country_scope,operator]);assert.equal(await checkOperations(),true);
    operations.grant.country_scope=['EG',c];operations.grant.access_level='global_admin';
    await client.query("UPDATE public.team_access_grants SET country_scope=$1,access_level='global_admin' WHERE invited_user_id=$2",[operations.grant.country_scope,operator]);assert.equal(await checkOperations(),false);
    operations.grant.access_level='scoped_staff';await client.query("UPDATE public.team_access_grants SET access_level='scoped_staff' WHERE invited_user_id=$1",[operator]);
   }
   operations.grant.country_scope=['Egypt'];await client.query("UPDATE public.team_access_grants SET country_scope=ARRAY['Egypt'] WHERE invited_user_id=$1",[operator]);

   for(const change of ["status='inactive'","permissions=ARRAY['products:read']","country_scope=ARRAY['SA']"]){
    await client.query('UPDATE public.team_access_grants SET '+change+' WHERE invited_user_id=$1',[operator]);assert.equal(await checkOperations(),false);
    await client.query("UPDATE public.team_access_grants SET status='active',permissions=ARRAY['operations:read'],country_scope=ARRAY['Egypt'] WHERE invited_user_id=$1",[operator]);
   }
   await client.query("INSERT INTO public.team_access_grants(email,job_title,invited_user_id,created_by) VALUES('second@example.invalid','synthetic',$1,$1)",[operator]);
   assert.equal(await checkOperations(),false,'ambiguous maybeSingle parity');
   await client.query('DELETE FROM public.team_access_grants WHERE invited_user_id=$1 AND id<>$2',[operator,operations.grant.id]);
   const pinned='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16';
   assert.equal((await client.query('SELECT private.dabra_task_operations_current($1,$2) AS v',[pinned,{schema:'dabra-operations-binding-v1',actorId:pinned,country:'EG',kind:'ceo',grant:null}])).rows[0].v,true);
   const grantLocker=new Client({...config,database});await grantLocker.connect();
   try {await grantLocker.query('BEGIN');await grantLocker.query('LOCK TABLE public.team_access_grants IN ROW EXCLUSIVE MODE');
    assert.equal(await checkOperations(),false,'table contention is NOWAIT, no remote wait/phantom');
   } finally {await grantLocker.query('ROLLBACK');await grantLocker.end();}

   const docs={
    retention:{schema:'dabra-answer-retention-v1',answerRetentionMs:60000},
    consent:{schema:'dabra-answer-consent-v1',actorId:who,revision:policy.revision,noticeVersion:'synthetic-answer-v1',noticeSha256:'c'.repeat(64),grantedAtMs:now-1000,generation:0},
    deletion:{schema:'dabra-answer-deletion-v1',policyReference:'synthetic-purge',purgeWithinMs:1000,backupPolicyReference:'synthetic-backup'},
    audience:{schema:'dabra-task-audience-v1',actorId:who,role:'customer',revision:policy.revision},
    spending:{schema:'dabra-task-spending-v1',currency:'USD',timeZone:'Asia/Riyadh',grantId,maxAttempts:1,dailySuccesses:2,monthlySuccesses:4,accountMonthlyCostMicros:10000,monthlyCostMicros:100000,attemptCostMicros:5000,inputTokenCeiling:4096,outputTokenCeiling:1024,leaseMs:12000},
   };
   const opaque=await resolve();
   assert.equal((await client.query('SELECT private.dabra_production_task_terms($1) AS v',[opaque])).rows[0].v,null,'metadata alone cannot admit');
   for(const [kind,document] of Object.entries(docs)) await client.query('UPDATE private.dabra_successful_task_decisions SET document=$1 WHERE kind=$2',[document,kind]);
   const approved=await resolve(),production=[...request(who),digest,randomUUID(),'customer',policy,approved];
   await core.test('Strong v2 atomic policy and admission preserve v1 and one hold',async()=>{
    // Keep this case in one rollback-only transaction; the outer RPC helper commits.
    const rpc=async(name:string,args:unknown[])=>{
     await client.query('SET LOCAL ROLE service_role');
     try {return (await client.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS v`,args)).rows[0].v;}
     finally {await client.query('RESET ROLE');}
    };
    const resolve=()=>rpc('resolve_dabra_successful_task_decisions',[who,'customer',policy]);
    await client.query('BEGIN');
    try {
     const strongId=randomUUID(),strongAcceptance={...acceptance,receipt:{...acceptance.receipt,artifactSha256:'d'.repeat(64)}};
     await client.query("INSERT INTO private.dabra_public_dialogue_authorities(id,source_grant_id,source_proof,profile,output_acceptance,model_tier,enabled,authorized_at) VALUES($1,$2,$3,$4,$5,'strong',true,to_timestamp($6::numeric/1000))",[strongId,grantId,proof,profile,strongAcceptance,now-2000]);
     const strongRequest=[...request(who),digest,randomUUID(),'customer',policy,approved];
     strongRequest[3]=strongId;strongRequest[4]={...(strongRequest[4] as Record<string,unknown>),authorityId:strongId};
     assert.equal((await rpc('reserve_dabra_production_task',strongRequest)).decision,'denied','v1 cannot admit strong');
     const v1Policy=await rpc('get_dabra_production_task_policy',[who,'customer',policy,approved]);
     assert.ok(v1Policy.authorities.every((a:{model_tier:string})=>a.model_tier==='economy'));
     await client.query("UPDATE private.dabra_successful_task_decisions SET document=$1 WHERE actor_id=$2 AND kind='spending'",[{...docs.spending,schema:'dabra-task-spending-v2',modelTier:'strong'},who]);
     const v2=await resolve();strongRequest[12]=v2;
     assert.equal((await client.query('SELECT private.dabra_production_task_terms($1) AS v',[v2])).rows[0].v.model_tier,'strong');
     const otherGrantId=randomUUID(),otherAuthorityId=randomUUID();
     const otherUnbound={...proof,grantId:otherGrantId,accountId:'SYNTHETIC-second-public'};
     const otherProof={...otherUnbound,limitedOperation:{...otherUnbound.limitedOperation,bindingSha256:durableAuthorityBindingSha256(otherUnbound)}};
     const otherAcceptance={...acceptance,receipt:{...acceptance.receipt,artifactSha256:'9'.repeat(64)}};
     await client.query("INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,input_rate_micros_per_million,output_rate_micros_per_million,enabled,proof,authorized_at) VALUES($1,'openai','SYNTHETIC-second-public','SYNTHETIC-project','bounded-account-charge',0,100000,500000,true,$2,to_timestamp($3::numeric/1000))",[otherGrantId,otherProof,now-4000]);
     await client.query("INSERT INTO private.dabra_public_dialogue_authorities(id,source_grant_id,source_proof,profile,output_acceptance,model_tier,enabled,authorized_at) VALUES($1,$2,$3,$4,$5,'strong',true,to_timestamp($6::numeric/1000))",[otherAuthorityId,otherGrantId,otherProof,profile,otherAcceptance,now-2000]);
     const otherRequest=[...request(who),digest,randomUUID(),'customer',policy,v2];
     otherRequest[3]=otherAuthorityId;otherRequest[4]={...(otherRequest[4] as Record<string,unknown>),authorityId:otherAuthorityId};
     const tasks=async()=> (await client.query('SELECT count(*)::int AS n FROM private.dabra_production_tasks')).rows[0].n;
     const beforeMismatch={tasks:await tasks(),holds:await countHolds()};
     assert.equal((await rpc('reserve_dabra_production_task',otherRequest)).decision,'denied','otherwise valid authority from another grant is excluded');
     assert.deepEqual({tasks:await tasks(),holds:await countHolds()},beforeMismatch,'wrong grant creates no task, hold or cost');
     const selected=await rpc('get_dabra_production_task_policy',[who,'customer',policy,v2]);
     assert.equal(selected.authorities.length,1);assert.equal(selected.authorities[0].id,strongId);
     const before=await countHolds();
     assert.equal((await rpc('reserve_dabra_production_task',[...production.slice(0,-1),v2])).decision,'denied','v2 strong cannot fall back to economy');
     assert.equal((await rpc('reserve_dabra_production_task',strongRequest)).decision,'admitted');
     assert.equal((await rpc('reserve_dabra_production_task',strongRequest)).decision,'existing');
     const after=await countHolds();assert.equal(after.n,before.n+1);
     await client.query("UPDATE private.dabra_successful_task_decisions SET document=$1 WHERE actor_id=$2 AND kind='spending'",[{...docs.spending,schema:'dabra-task-spending-v2',modelTier:'economy'},who]);
     strongRequest[12]=await resolve();assert.equal((await rpc('reserve_dabra_production_task',strongRequest)).decision,'conflict');
     assert.deepEqual(await countHolds(),after);
     // Positive control: the same denied request works when its grant is explicitly approved.
     await client.query("UPDATE private.dabra_successful_task_decisions SET document=$1,funding_grant_id=$2,funding_proof_sha256=(SELECT encode(sha256(convert_to(proof::text,'UTF8')),'hex') FROM private.dabra_dialogue_funding_grants WHERE id=$2) WHERE actor_id=$3 AND kind='spending'",
      [{...docs.spending,schema:'dabra-task-spending-v2',modelTier:'strong',grantId:otherGrantId},otherGrantId,who]);
     const otherBundle=await resolve();assert.ok(otherBundle);otherRequest[12]=otherBundle;
     const otherPolicy=await rpc('get_dabra_production_task_policy',[who,'customer',policy,otherBundle]);
     assert.equal(otherPolicy.authorities.length,1);assert.equal(otherPolicy.authorities[0].id,otherAuthorityId);
     assert.equal((await rpc('reserve_dabra_production_task',otherRequest)).decision,'admitted');
     const otherHolds=await countHolds();assert.equal(otherHolds.n,after.n+1);
     assert.equal(otherHolds.cost,after.cost+Number(otherRequest[7]));
     assert.equal(await tasks(),beforeMismatch.tasks+2);
    } finally {await client.query('ROLLBACK');}
   });
   const retrieve=()=>rpc('read_dabra_production_task',[who,production[1],digest,'customer',policy,approved]);
   for(const [key,maximum] of Object.entries({dailySuccesses:10,monthlySuccesses:50,accountMonthlyCostMicros:500000,monthlyCostMicros:25000000})) {
    const excessive=structuredClone(approved);Object.assign(excessive.decisions.spending.document,{dailySuccesses:10,monthlySuccesses:50,accountMonthlyCostMicros:500000,monthlyCostMicros:25000000,[key]:maximum+1});
    assert.equal((await client.query('SELECT private.dabra_production_task_terms($1) AS v',[excessive])).rows[0].v,null,key);
   }
   const beforeProduction=await countHolds();
   assert.equal((await rpc('reserve_dabra_production_task',[...production.slice(0,-1),opaque])).decision,'denied');
   assert.deepEqual(await countHolds(),beforeProduction);
   assert.equal((await rpc('reserve_dabra_production_task',[...production,now+600000])).decision,'admitted');
   assert.equal(Number((await client.query('SELECT input_valid_until_ms FROM private.dabra_production_tasks WHERE request_id=$1',[production[1]])).rows[0].input_valid_until_ms),now+600000);
   const afterProduction=await countHolds();assert.equal(afterProduction.n,beforeProduction.n+1);
   assert.equal((await rpc('finish_dabra_production_task',[who,production[1],digest,production[9],'succeeded','SYNTHETIC production contract','en'])).state,'succeeded');
   assert.equal((await retrieve()).answer,'SYNTHETIC production contract');
   const uuidRead=()=>rpc('retrieve_dabra_production_task',[who,production[1],'customer',policy,approved,null]);
   assert.equal((await uuidRead()).answer,'SYNTHETIC production contract','UUID resolves original digest server-side');
   assert.equal(Number((await uuidRead()).inputValidUntilMs),now+600000,'original FX deadline is not renewed');
   assert.equal((await rpc('reserve_dabra_production_task',production)).decision,'existing');assert.deepEqual(await countHolds(),afterProduction);
   await client.query("UPDATE private.dabra_successful_task_decisions SET revoked_at_ms=$1 WHERE kind='consent'",[now]);
   assert.equal(await retrieve(),null,'withdrawal fences the saved answer without refund or redispatch');
   assert.deepEqual(await countHolds(),afterProduction);
   await client.query("UPDATE private.dabra_successful_task_decisions SET revoked_at_ms=NULL WHERE kind='consent'");
   const confirmRead=()=>rpc('read_dabra_production_task',[who,production[1],digest,'customer',policy,approved,true]);
   assert.equal((await confirmRead()).answer,'SYNTHETIC production contract');
   assert.ok((await client.query('SELECT read_verified_at_ms FROM private.dabra_production_tasks WHERE request_id=$1',[production[1]])).rows[0].read_verified_at_ms);
   // Fixture resets only the proof to exercise first-confirm FX expiry; immutable cost remains.
   await client.query('UPDATE private.dabra_production_tasks SET read_verified_at_ms=NULL,input_valid_until_ms=1 WHERE request_id=$1',[production[1]]);
   assert.equal((await confirmRead()).state,'failed');
   assert.equal((await uuidRead()).state,'failed','UUID cannot bypass original FX expiry');
   assert.equal((await client.query('SELECT read_verified_at_ms FROM private.dabra_production_tasks WHERE request_id=$1',[production[1]])).rows[0].read_verified_at_ms,null);
   await client.query('UPDATE private.dabra_production_task_answers SET expires_at_ms=0 WHERE actor_id=$1',[who]);
   assert.equal((await retrieve()).state,'failed','expired before owner-read proof does not retain success');
   assert.equal((await rpc('reserve_dabra_production_task',production)).decision,'existing');
   assert.deepEqual(await countHolds(),afterProduction,'expiry never refunds or redispatches');
   const tiny=[...request(who),digest,randomUUID(),'customer',policy,approved];
   assert.equal((await rpc('reserve_dabra_production_task',tiny)).decision,'admitted');
   await client.query('UPDATE private.dabra_production_tasks SET retention_ms=1 WHERE request_id=$1',[tiny[1]]);
   await client.query("CREATE FUNCTION private.task237_test_retention_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.01); RETURN NEW; END $$; CREATE TRIGGER task237_test_retention_wait BEFORE INSERT ON private.dabra_production_task_answers FOR EACH ROW EXECUTE FUNCTION private.task237_test_retention_wait()");
   try {
    const heldBefore=await countHolds();
    assert.equal((await rpc('finish_dabra_production_task',[who,tiny[1],digest,tiny[9],'succeeded','SYNTHETIC short retention','en'])).state,'unknown');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_production_task_answers WHERE request_id=$1',[tiny[1]])).rows[0].n,0);
    assert.deepEqual(await countHolds(),heldBefore);
    assert.equal((await rpc('reserve_dabra_production_task',tiny)).decision,'existing');
   } finally {await client.query('DROP TRIGGER task237_test_retention_wait ON private.dabra_production_task_answers; DROP FUNCTION private.task237_test_retention_wait()');}

   for(const role of ['anon','authenticated'])for(const signature of ['public.retrieve_dabra_production_task(uuid,uuid,text,jsonb,jsonb,jsonb,boolean)','public.reserve_dabra_production_task(uuid,uuid,uuid,uuid,jsonb,integer,integer,bigint,text,uuid,text,jsonb,jsonb,bigint,jsonb,jsonb)','public.finish_dabra_production_task(uuid,uuid,text,uuid,text,text,text)','public.read_dabra_production_task(uuid,uuid,text,text,jsonb,jsonb,boolean,jsonb,jsonb)'])
    assert.equal((await client.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS v",[role,signature])).rows[0].v,false);
   const originalTrip={id:randomUUID(),origin:'Cairo',destination:'Riyadh',startDate:null,endDate:null,adults:2,children:0,rooms:1,budget:null,currency:'USD',families:['stay']};
   const continuity={schema:'dabra-task-continuity-v1',ownerId:who,revision:1,generation:0,tripId:originalTrip.id,tripExpiresAtMs:now+600000,originalTrip};
   const checkTrip=async()=>(await client.query('SELECT private.dabra_task_continuity_current($1,$2) AS v',[who,continuity])).rows[0].v;
   assert.equal(await checkTrip(),false,'missing historical dependency is not provisioned by task migration');
   await client.query("CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$");
   await client.query(readFileSync(new URL('../supabase/drafts/task187-continuity.sql',import.meta.url),'utf8'));
   await client.query('UPDATE public.dabra_continuity_policy SET enabled=true');
   await client.query("INSERT INTO public.dabra_account_continuity(owner_id,revision,generation,consent_enabled,consent_version,trip,trip_expires_at) VALUES($1,1,0,true,'task187-v1',$2,to_timestamp($3::numeric/1000))",[who,originalTrip,continuity.tripExpiresAtMs]);
   assert.equal(await checkTrip(),true);
   const tripRequest=[...request(who),digest,randomUUID(),'customer',policy,approved,null,null,continuity];
   assert.equal((await rpc('reserve_dabra_production_task',tripRequest)).decision,'admitted');
   assert.equal((await rpc('finish_dabra_production_task',[who,tripRequest[1],digest,tripRequest[9],'succeeded','SYNTHETIC trip','en'])).state,'succeeded');
   const tripRead=()=>rpc('retrieve_dabra_production_task',[who,tripRequest[1],'customer',policy,approved,null,true]);
   assert.equal(await rpc('retrieve_dabra_production_task',[who,tripRequest[1],'customer',policy,approved,null,false]),null);
   assert.equal((await client.query('SELECT read_verified_at_ms FROM private.dabra_production_tasks WHERE actor_id=$1 AND request_id=$2',[who,tripRequest[1]])).rows[0].read_verified_at_ms,null);
   assert.equal((await tripRead()).tripValidUntilMs,continuity.tripExpiresAtMs);
   const heldTrip=await countHolds();
   for(const change of ["revision=revision+1","generation=generation+1","consent_enabled=false,trip=NULL,trip_expires_at=NULL","trip=NULL,trip_expires_at=NULL","trip_expires_at=to_timestamp(0)","trip=jsonb_set(trip,'{destination}','\"Dubai\"')"]){
    await client.query('UPDATE public.dabra_account_continuity SET '+change+' WHERE owner_id=$1',[who]);assert.equal(await tripRead(),null);
    await client.query("UPDATE public.dabra_account_continuity SET revision=1,generation=0,consent_enabled=true,consent_version='task187-v1',trip=$2,trip_expires_at=to_timestamp($3::numeric/1000) WHERE owner_id=$1",[who,originalTrip,continuity.tripExpiresAtMs]);
   }
   await client.query('UPDATE public.dabra_continuity_policy SET enabled=false');assert.equal(await tripRead(),null);
   await client.query('UPDATE public.dabra_continuity_policy SET enabled=true');
   const tripLocker=new Client({...config,database});await tripLocker.connect();
   try {for(const table of ['public.dabra_continuity_policy','public.dabra_account_continuity']){
    await tripLocker.query('BEGIN');await tripLocker.query('LOCK TABLE '+table+' IN ACCESS EXCLUSIVE MODE');assert.equal(await tripRead(),null);await tripLocker.query('ROLLBACK');
   }}finally{await tripLocker.query('ROLLBACK');await tripLocker.end();}
   assert.deepEqual(await countHolds(),heldTrip);assert.equal((await rpc('reserve_dabra_production_task',tripRequest)).decision,'existing');
   // Model natural elapsed time, with matching unchanged source/task deadlines, not revocation.
   const expiredBinding={...continuity,tripExpiresAtMs:now-1};
   await client.query('UPDATE public.dabra_account_continuity SET trip_expires_at=to_timestamp($2::numeric/1000) WHERE owner_id=$1',[who,expiredBinding.tripExpiresAtMs]);
   await client.query('UPDATE private.dabra_production_tasks SET continuity_binding=$3,read_verified_at_ms=NULL WHERE actor_id=$1 AND request_id=$2',[who,tripRequest[1],expiredBinding]);
   const expiredTrip=await tripRead();assert.equal(expiredTrip.state,'failed');assert.equal(expiredTrip.answer,null);
   assert.equal((await client.query('SELECT read_verified_at_ms FROM private.dabra_production_tasks WHERE actor_id=$1 AND request_id=$2',[who,tripRequest[1]])).rows[0].read_verified_at_ms,null);
   assert.deepEqual(await countHolds(),heldTrip);
   const decisionRows=(await client.query('SELECT * FROM private.dabra_successful_task_decisions')).rows;
   try {
    for(const d of decisionRows){const document={...d.document};if(d.kind==='consent'||d.kind==='audience')document.actorId=operator;if(d.kind==='audience')document.role='staff';
     await client.query('UPDATE private.dabra_successful_task_decisions SET actor_id=$1,actor_role=$2,approved_by=$3,document=$4 WHERE reference=$5',[operator,'staff',d.kind==='consent'?operator:d.approved_by,document,d.reference]);}
    const opsApproved=await resolve(operator,'staff'),opsRequest=[...request(operator),digest,randomUUID(),'staff',policy,opsApproved,null,operations];
    assert.equal((await rpc('reserve_dabra_production_task',opsRequest)).decision,'admitted');
    assert.equal((await rpc('finish_dabra_production_task',[operator,opsRequest[1],digest,opsRequest[9],'succeeded','SYNTHETIC operations','en'])).state,'succeeded');
    const held=await countHolds();
    const opsRead=()=>rpc('read_dabra_production_task',[operator,opsRequest[1],digest,'staff',policy,opsApproved,true,operations]);
    assert.equal((await opsRead()).answer,'SYNTHETIC operations');
    assert.equal((await rpc('retrieve_dabra_production_task',[operator,production[1],'staff',policy,opsApproved,operations])).state,'absent','foreign owner UUID never returns its answer');
    await client.query("UPDATE public.team_access_grants SET status='inactive' WHERE invited_user_id=$1",[operator]);
    assert.equal(await opsRead(),null,'final Core read observes revoked grant');
    assert.equal(await rpc('retrieve_dabra_production_task',[operator,opsRequest[1],'staff',policy,opsApproved,operations]),null,'UUID retrieval observes revoked grant');
    assert.equal(await rpc('read_dabra_production_task',[operator,randomUUID(),digest,'staff',policy,opsApproved,false,operations]),null,'revoked grant cannot observe absent state');
    assert.deepEqual(await countHolds(),held,'revocation neither refunds nor redispatches');
   } finally {
    for(const d of decisionRows)await client.query('UPDATE private.dabra_successful_task_decisions SET actor_id=$1,actor_role=$2,approved_by=$3,document=$4 WHERE reference=$5',[d.actor_id,d.actor_role,d.approved_by,d.document,d.reference]);
   }
   // No production hooks: hold real relation/row locks from a second session.
   const blocker=new Client({...config,database}),resolver=new Client({...config,database});
   await blocker.connect();await resolver.connect();
   const resolverPid=Number((await resolver.query('SELECT pg_backend_pid() AS p')).rows[0].p);
   try {
    for(const table of ['auth.users','public.profiles','private.dabra_successful_task_decisions','private.dabra_dialogue_funding_grants']) {
     await blocker.query('BEGIN');await blocker.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
     await resolver.query('BEGIN');await resolver.query('SET LOCAL ROLE service_role');await resolver.query("SET LOCAL statement_timeout='2s'");
     const started=Date.now();
     assert.equal((await resolver.query('SELECT public.resolve_dabra_successful_task_decisions($1,$2,$3) AS v',[who,'customer',policy])).rows[0].v,null);
     assert.ok(Date.now()-started<500,'relation contention must reject, not wait for client timeout');
     assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_locks WHERE pid=$1 AND relation=ANY(ARRAY['auth.users'::regclass,'public.profiles'::regclass,'private.dabra_successful_task_decisions'::regclass,'private.dabra_dialogue_funding_grants'::regclass])",[resolverPid])).rows[0].n,0,'caught lock conflict releases earlier relation/identity locks before caller rollback');
     await resolver.query('ROLLBACK');await blocker.query('ROLLBACK');
    }
    // An uncommitted missing reference must not be consumed from a later snapshot.
    const row=(await client.query("DELETE FROM private.dabra_successful_task_decisions WHERE kind='deletion' RETURNING *")).rows[0];
    await blocker.query('BEGIN');
    await blocker.query('INSERT INTO private.dabra_successful_task_decisions SELECT * FROM jsonb_populate_record(NULL::private.dabra_successful_task_decisions,$1)',[JSON.stringify(row)]);
    assert.equal(await resolve(),null,'only four visible references fail closed while fifth is inserted');
    await blocker.query('COMMIT');assert.equal((await resolve()).actorId,who,'a separate later call may resolve all five');
    await blocker.query('BEGIN');await blocker.query("UPDATE private.dabra_successful_task_decisions SET revoked_at_ms=$1 WHERE kind='deletion'",[now]);
    assert.equal(await resolve(),null,'an in-flight withdrawal cannot be read without its row lock');
    await blocker.query('COMMIT');assert.equal(await resolve(),null,'committed withdrawal closes later calls');
    await client.query("UPDATE private.dabra_successful_task_decisions SET revoked_at_ms=NULL WHERE kind='deletion'");
    // Missing profile cannot become valid merely because a later statement sees it.
    const missing=(await client.query('DELETE FROM public.profiles WHERE id=$1 RETURNING *',[who])).rows[0];
    await blocker.query('BEGIN');await blocker.query('INSERT INTO public.profiles SELECT * FROM jsonb_populate_record(NULL::public.profiles,$1)',[JSON.stringify(missing)]);
    assert.equal(await resolve(),null,'required profile was not present in the lock result');
    await blocker.query('COMMIT');assert.equal((await resolve()).actorId,who);
   } finally {
    await resolver.query('ROLLBACK');await blocker.query('ROLLBACK');await resolver.end();await blocker.end();
   }

   assert.equal(await resolve(other),null,'another active account cannot resolve owner decisions');
   assert.equal(await resolve(who,'admin'),null,'server role must match actual Core role');
   await client.query("UPDATE private.dabra_successful_task_decisions SET revoked_at_ms=$1 WHERE kind='consent'",[now]);
   assert.equal(await resolve(),null,'withdrawal invalidates the whole bundle');
   await client.query("UPDATE private.dabra_successful_task_decisions SET revoked_at_ms=NULL WHERE kind='consent'");
   await client.query("UPDATE private.dabra_successful_task_decisions SET expires_at_ms=$1 WHERE kind='retention'",[now]);
   assert.equal(await resolve(),null,'expired approval invalidates the whole bundle');
   await client.query("UPDATE private.dabra_successful_task_decisions SET expires_at_ms=$1 WHERE kind='retention'",[now+600000]);
   await client.query("UPDATE private.dabra_successful_task_decisions SET funding_proof_sha256=repeat('0',64) WHERE kind='spending'");
   assert.equal(await resolve(),null,'changed funding proof cannot be reinterpreted as authorization');
   assert.deepEqual(await snapshot(),before,'resolution never changes existing spending/admissions');
   await client.query(sql('20261112110000_task237_consent_capture.sql'));
   assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_task_notices')).rows[0].n,0);
   const consent=(action:string,gen:number|null=null,mutation:string|null=randomUUID())=>rpc('dabra_task_consent',[who,'customer',action,'synthetic-revision','synthetic-notice','a'.repeat(64),gen,mutation]);
   assert.equal(await consent('notice'),null,'no notice is fabricated before administrative approval');
   const heldConsent=await countHolds();
   const emptyRevoke=await rpc('dabra_task_consent',[other,'customer','revoke',null,null,null,0,randomUUID()]);assert.equal(emptyRevoke.generation,1,'withdrawal fences even an actor without prior consent');
   const status=await consent('status');assert.equal((await consent('revoke',status.generation)).state,'revoked','withdrawal works despite invalid spending proof');
   assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_production_task_answers WHERE actor_id=$1',[who])).rows[0].n,0);
   assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_production_tasks WHERE actor_id=$1 AND (continuity_binding IS NOT NULL OR input_digest IS NOT NULL OR answer_digest IS NOT NULL OR decision_bundle IS NOT NULL OR policy IS NOT NULL OR operations_binding IS NOT NULL OR content_removed_at_ms IS NULL)',[who])).rows[0].n,0);
   assert.equal(await rpc('finish_dabra_production_task',[who,production[1],digest,production[9],'succeeded','MUST NOT RETURN','en']),null);
   assert.deepEqual(await countHolds(),heldConsent);
   const text='SYNTHETIC notice',hash=(await client.query("SELECT encode(sha256(convert_to($1,'UTF8')),'hex') AS h",[text])).rows[0].h;
   await client.query('INSERT INTO private.dabra_task_notices VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,NULL)',['synthetic-revision','synthetic-notice',text,hash,ceo,'synthetic-evidence',now-1000,now+600000]);
   // Malformed historical documents cannot block owner removal or advance its fence.
   await client.query("UPDATE private.dabra_successful_task_decisions SET document=jsonb_build_object('generation','not-a-number') WHERE kind='consent'");
   const beforeFence=await consent('status'),revokeId=randomUUID();
   const removed=await consent('revoke',beforeFence.generation,revokeId);assert.equal(removed.generation,beforeFence.generation+1);
   assert.deepEqual(await consent('revoke',beforeFence.generation,revokeId),removed);
   assert.equal(await rpc('dabra_task_consent',[who,'customer','grant','synthetic-revision','synthetic-notice',hash,beforeFence.generation,randomUUID()]),null,'grant queued before withdrawal cannot reactivate');
   const shown=await consent('notice');assert.equal(shown.text,text);
   const mutation=randomUUID(),grantArgs=[who,'customer','grant','synthetic-revision','synthetic-notice',hash,shown.generation,mutation];
   const granted=await rpc('dabra_task_consent',grantArgs);assert.equal(granted.state,'granted');
   assert.deepEqual(await rpc('dabra_task_consent',grantArgs),granted,'same mutation has one consent effect');
   assert.deepEqual(await consent('revoke',beforeFence.generation,revokeId),removed,'old revoke receipt does not mutate new grant');
   assert.equal((await consent('status')).granted,true);
   assert.equal((await client.query("SELECT count(*)::int AS n FROM private.dabra_successful_task_decisions WHERE reference=$1",['consent:'+mutation])).rows[0].n,1);
   assert.equal(await rpc('select_dabra_production_task_policy',[other,'customer','synthetic-revision']),null);
   await client.query("UPDATE private.dabra_successful_task_decisions SET funding_proof_sha256=(SELECT encode(sha256(convert_to(proof::text,'UTF8')),'hex') FROM private.dabra_dialogue_funding_grants WHERE id=$1) WHERE kind='spending'",[grantId]);
   assert.equal((await rpc('select_dabra_production_task_policy',[who,'customer','synthetic-revision'])).consentDecision,'consent:'+mutation);
   await client.query("INSERT INTO private.dabra_successful_task_decisions SELECT 'synthetic-duplicate-audience',revision,kind,purpose,actor_id,actor_role,approved_by,approval_reference,approved_at_ms,expires_at_ms,revoked_at_ms,document,funding_grant_id,funding_proof_sha256 FROM private.dabra_successful_task_decisions WHERE kind='audience'");
   assert.equal(await rpc('select_dabra_production_task_policy',[who,'customer','synthetic-revision']),null,'ambiguous actor references are not resolved by latest');
   await client.query("DELETE FROM private.dabra_successful_task_decisions WHERE reference='synthetic-duplicate-audience'");
   await client.query('UPDATE private.dabra_successful_task_decisions SET expires_at_ms=approved_at_ms+1 WHERE reference=$1',['consent:'+mutation]);
   await client.query('SELECT pg_sleep(0.01)');
   const expiredStatus=await consent('status');assert.equal(expiredStatus.granted,false);assert.equal(expiredStatus.hasConsent,true);
   let renewal=await rpc('dabra_task_consent',[who,'customer','grant','synthetic-revision','synthetic-notice',hash,expiredStatus.generation,randomUUID()]);assert.equal(renewal.state,'granted');
   assert.deepEqual(await countHolds(),heldConsent);
   // Same effective-consent criterion drives display, selection and explicit renewal.
   for(const invalid of ["actor_role='staff'","document=jsonb_set(document,'{generation}','\"invalid\"'::jsonb)"]){
    await client.query("UPDATE private.dabra_successful_task_decisions SET "+invalid+" WHERE actor_id=$1 AND kind='consent' AND revoked_at_ms IS NULL",[who]);
    const changed=await consent('status');assert.equal(changed.granted,false);assert.equal(changed.hasConsent,true);
    assert.equal(await rpc('select_dabra_production_task_policy',[who,'customer','synthetic-revision']),null);
    renewal=await rpc('dabra_task_consent',[who,'customer','grant','synthetic-revision','synthetic-notice',hash,changed.generation,randomUUID()]);assert.equal(renewal.state,'granted');
    assert.equal((await consent('status')).granted,true);assert.ok(await rpc('select_dabra_production_task_policy',[who,'customer','synthetic-revision']));
    assert.deepEqual(await countHolds(),heldConsent);
   }
   const semanticRow=(await client.query("SELECT to_jsonb(d) AS row FROM private.dabra_successful_task_decisions d WHERE actor_id=$1 AND kind='consent' AND revoked_at_ms IS NULL",[who])).rows[0].row;
   for(const revision of ['123',123]) {
    const candidate={...semanticRow,revision:'123',document:{...semanticRow.document,revision}};
    const effective=(await client.query("SELECT private.dabra_task_consent_effective(jsonb_populate_record(NULL::private.dabra_successful_task_decisions,$1),$2,'customer','123',floor(extract(epoch FROM clock_timestamp())*1000)::bigint) AS v",[candidate,who])).rows[0].v;
    assert.equal(effective,typeof revision==='string','JSON numeric revision must not match text program');
   }
   const holder=new Client({...config,database});await holder.connect();
   try {
    await holder.query('BEGIN');await holder.query('LOCK TABLE private.dabra_successful_task_decisions IN ROW EXCLUSIVE MODE');
    assert.equal(await rpc('select_dabra_production_task_policy',[who,'customer','synthetic-revision']),null,'phantom concurrent grant is rejected without waiting');
    assert.equal(await consent('revoke',renewal.generation),null,'withdrawal contention has no partial effect');
    await holder.query('ROLLBACK');
   }finally{await holder.query('ROLLBACK');await holder.end();}
   assert.equal((await consent('revoke',renewal.generation)).state,'revoked');
   assert.equal(await rpc('dabra_task_consent',grantArgs),null,'lost old grant response cannot regrant after withdrawal');
   assert.deepEqual(await countHolds(),heldConsent);
   for(const role of ['anon','authenticated'])assert.equal((await client.query("SELECT has_function_privilege($1,'public.dabra_task_consent(uuid,text,text,text,text,text,bigint,uuid)','EXECUTE') AS v",[role])).rows[0].v,false);
   await core.test('atomic continuity derivative erasure and bounded stored-deadline purge',async()=>{
    await client.query(sql('20261112120000_task237_content_erasure.sql'));
    const binding={...continuity,revision:20,tripExpiresAtMs:now+600000};
    const resetSource=()=>client.query("UPDATE public.dabra_account_continuity SET revision=20,generation=0,consent_enabled=true,consent_version='task187-v1',trip=$2,trip_expires_at=to_timestamp($3::numeric/1000) WHERE owner_id=$1",[who,originalTrip,binding.tripExpiresAtMs]);
    const restoreTask=async(id:unknown,trip:unknown)=>{
     await client.query("UPDATE private.dabra_production_tasks SET content_removed_at_ms=NULL,input_digest=$3,answer_digest=NULL,operations_binding=NULL,continuity_binding=$4,policy=$5,decision_bundle=$6,input_valid_until_ms=NULL,state='succeeded',read_verified_at_ms=NULL WHERE actor_id=$1 AND request_id=$2",[who,id,digest,trip,policy,approved]);
     await client.query("INSERT INTO private.dabra_production_task_answers VALUES($1,$2,'SYNTHETIC erasure','en',$3) ON CONFLICT(actor_id,request_id) DO UPDATE SET answer=EXCLUDED.answer,expires_at_ms=EXCLUDED.expires_at_ms",[who,id,now+600000]);
    };
    const source=async()=>(await client.query('SELECT revision,generation,trip FROM public.dabra_account_continuity WHERE owner_id=$1',[who])).rows[0];
    const removed=async(id:unknown)=>(await client.query('SELECT content_removed_at_ms IS NOT NULL AS v FROM private.dabra_production_tasks WHERE actor_id=$1 AND request_id=$2',[who,id])).rows[0].v;
    const holds=await countHolds(),consents=(await client.query("SELECT reference,revoked_at_ms FROM private.dabra_successful_task_decisions WHERE kind='consent' ORDER BY reference")).rows;
    const foreignTasks=(await client.query('SELECT to_jsonb(t) AS row FROM private.dabra_production_tasks t WHERE actor_id<>$1 ORDER BY actor_id,request_id',[who])).rows;
    await resetSource();await restoreTask(production[1],null);await restoreTask(tripRequest[1],binding);
    const locker=new Client({...config,database});await locker.connect();
    try {
     await locker.query('BEGIN');await locker.query("SELECT pg_advisory_xact_lock(hashtextextended('task217-existing-credit-v2',0))");
     await assert.rejects(rpc('purge_dabra_production_task_content',[1]),{code:'55P03'});
     const before=await source();await assert.rejects(client.query('UPDATE public.dabra_account_continuity SET revision=revision+1 WHERE owner_id=$1',[who]),{code:'55P03'});
     assert.deepEqual(await source(),before);assert.equal(await removed(tripRequest[1]),false);
    }finally{await locker.query('ROLLBACK');await locker.end();}
    // A task bound to the next version must survive an event for the old version.
    await restoreTask(tripRequest[1],{...binding,revision:21});
    await client.query('UPDATE public.dabra_account_continuity SET revision=21 WHERE owner_id=$1',[who]);assert.equal(await removed(tripRequest[1]),false);
    for(const change of ["revision=revision+1","generation=generation+1,consent_enabled=false,trip=NULL,trip_expires_at=NULL","trip=NULL,trip_expires_at=NULL"]){
     await resetSource();await restoreTask(tripRequest[1],binding);
     await client.query('UPDATE public.dabra_account_continuity SET '+change+' WHERE owner_id=$1',[who]);
     assert.equal(await removed(tripRequest[1]),true);assert.equal(await removed(production[1]),false);
     assert.equal((await client.query('SELECT count(*)::int AS n FROM private.dabra_production_task_answers WHERE actor_id=$1 AND request_id=$2',[who,tripRequest[1]])).rows[0].n,0);
     assert.equal(await rpc('finish_dabra_production_task',[who,tripRequest[1],digest,tripRequest[9],'succeeded','MUST NOT RESTORE','en']),null);
    }
    await resetSource();await restoreTask(tripRequest[1],binding);
    await client.query('DELETE FROM public.dabra_account_continuity WHERE owner_id=$1',[who]);assert.equal(await removed(tripRequest[1]),true);
    for(const deadline of ['answer','fx','trip','decision']){
     await restoreTask(tripRequest[1],null);
     if(deadline==='answer')await client.query('UPDATE private.dabra_production_task_answers SET expires_at_ms=1 WHERE actor_id=$1 AND request_id=$2',[who,tripRequest[1]]);
     if(deadline==='fx')await client.query('UPDATE private.dabra_production_tasks SET input_valid_until_ms=1 WHERE actor_id=$1 AND request_id=$2',[who,tripRequest[1]]);
     if(deadline==='trip')await client.query('UPDATE private.dabra_production_tasks SET continuity_binding=$3 WHERE actor_id=$1 AND request_id=$2',[who,tripRequest[1],{...binding,tripExpiresAtMs:1}]);
     if(deadline==='decision')await client.query("UPDATE private.dabra_production_tasks SET decision_bundle=jsonb_set(decision_bundle,'{decisions,consent,expiresAtMs}','1') WHERE actor_id=$1 AND request_id=$2",[who,tripRequest[1]]);
     assert.equal(await rpc('purge_dabra_production_task_content',[1]),1);assert.equal(await removed(tripRequest[1]),true);assert.equal(await removed(production[1]),false);
     assert.equal(await rpc('purge_dabra_production_task_content',[1]),0);
    }
    await restoreTask(tripRequest[1],{...binding,tripExpiresAtMs:'malformed'});
    assert.equal(await rpc('purge_dabra_production_task_content',[1]),0,'malformed deadline and missing source row do not prove expiry');
    assert.deepEqual(await countHolds(),holds);
    assert.deepEqual((await client.query('SELECT to_jsonb(t) AS row FROM private.dabra_production_tasks t WHERE actor_id<>$1 ORDER BY actor_id,request_id',[who])).rows,foreignTasks);
    assert.deepEqual((await client.query("SELECT reference,revoked_at_ms FROM private.dabra_successful_task_decisions WHERE kind='consent' ORDER BY reference")).rows,consents);
    for(const role of ['anon','authenticated'])assert.equal((await client.query("SELECT has_function_privilege($1,'public.purge_dabra_production_task_content(integer)','EXECUTE') AS v",[role])).rows[0].v,false);
   });


  });
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
