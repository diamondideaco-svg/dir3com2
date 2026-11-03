import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';
import { disposableTarget } from '../scripts/sandbox/apply-core-migration-to-db.mjs';
import { AGENT_PROVIDER_IDS, type AgentProviderId } from '../lib/dabra/agent-capabilities';
import { APPROVED_DIALOGUE_STANDARD_PRICING } from '../lib/dabra/dialogue-pricing-approvals';
import { approvedPublicPricingContract } from '../lib/dabra/dialogue-pricing-refresh';
import { durableAuthorityBindingSha256, durableProfileSha256, type DurableAccountChargeProof } from '../lib/dabra/dialogue-durable-authority';

const forward='20261103205926_task217_durable_account_charge.sql';
const predecessors=['20261028174710_task217_dialogue_funding_admission.sql','20261101102846_task217_first_profile_measurement_guard.sql',
  '20261101153907_task217_seven_provider_pilot_envelope.sql','20261102043035_task217_pilot_ledger_funding_scope.sql',
  '20261102182200_task217_saved_funding_snapshot_use.sql','20261103000000_task217_limited_customer_funding.sql','20261103170449_task217_credential_binding_readonly.sql'];
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
const record=(v:unknown): v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const daily={uniqueUsers:10,requestsPerUser:6,requestsTotal:60,inputTokensPerUser:24576,outputTokensPerUser:6144,inputTokensTotal:245760,outputTokensTotal:61440};
const subject=hash('SYNTHETIC-CUSTOMER'),day=(now:number)=>Math.floor((now+10800000)/86400000)*86400000-10800000;
function target(url:string|undefined) {
  assert.ok(url,'CONTINUITY_TEST_DATABASE_URL required; PG evidence cannot silently skip');
  const value=disposableTarget({DATABASE_URL:url,SANDBOX_DISPOSABLE_DATABASE:'true',NODE_ENV:process.env.NODE_ENV});
  assert.equal(value.database,'dir3com_test'); assert.ok(['127.0.0.1','::1'].includes(value.host),'loopback disposable PostgreSQL only');
  return value;
}
test('durable PG target rejects remote, live, ambiguous and missing selectors before connecting',()=>{
  const allowed='postgresql://postgres:postgres@127.0.0.1:5432/dir3com_test';
  assert.equal(target(allowed).database,'dir3com_test');
  for(const url of [undefined,allowed+'?host=example.invalid',allowed+'#override',allowed.replace('127.0.0.1','example.invalid'),
    allowed.replace('dir3com_test','postgres'),allowed.replace('127.0.0.1','ynupwivgvwcyrsdhtkcc.supabase.co')])assert.throws(()=>target(url));
});

function syntheticGrant(provider:AgentProviderId,authorizedAtMs:number) {
  const rate=APPROVED_DIALOGUE_STANDARD_PRICING.find(r=>r.provider===provider&&approvedPublicPricingContract(provider,r.model,r.sha256));
  assert.ok(rate); const contract=approvedPublicPricingContract(provider,rate.model,rate.sha256);assert.ok(contract);
  const cost=Math.ceil((4096*rate.inputMicrosPerMillion+1024*rate.outputMicrosPerMillion)/1000000)+100;
  const profiles=(['discover','intent.classify'] as const).flatMap(capability=>(['ar','en'] as const).map(language=>({
    provider,measurement:{capability,language,model:rate.model,environment:'provider-benchmark' as const,
      caseSetSha:'b'.repeat(64),sourceSha:'c'.repeat(40),cases:1,passed:1,measuredAtMs:authorizedAtMs-3600000,expiresAtMs:authorizedAtMs-1,
      latencyMs:1,inputTokenCeiling:4096,outputTokenCeiling:1024,costCeilingUsd:cost/1000000},
  })));
  const unbound:DurableAccountChargeProof={
    mode:'bounded-account-charge',grantId:randomUUID(),provider,model:rate.model,environment:'provider-benchmark',
    accountId:'SYNTHETIC-'+provider,projectId:'SYNTHETIC-project',credentialSha256:'a'.repeat(64),evidenceSha256:'b'.repeat(64),
    currency:'USD',serviceTier:'standard',pricingEvidenceSha256:rate.sha256,
    accountTerms:{schema:'task217-account-charge-terms-v1',observedAtMs:authorizedAtMs-1,evidenceSha256:'d'.repeat(64),
      validity:'until-contract-change',risks:{autoReload:'unknown',postpaid:'allowed',overdraft:'unknown',concurrentAccountUsage:'unknown'},
      fundingChargeProtection:{kind:'documented-manual-funding-only',evidenceSha256:'e'.repeat(64)},
      allInChargeBound:{schema:'all-in-account-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-tax-fx-and-funding-charges',
        maxAdditionalMicros:100,evidenceSha256:'f'.repeat(64)}},
    limitedOperation:{schema:'task217-limited-operation-v2',authorizationId:randomUUID(),taskId:'task217-text-pilot-2026-11-01',
      dataScope:'redacted-travel-or-server-units',maxCostMicros:1000000,maxAttempts:28,authorizedAtMs,
      duration:'until-revoked-or-binding-change',providerRisk:'bounded-account-liability-with-observed-risks',
      acceptedProfileSha256s:profiles.map(durableProfileSha256).sort(),contractSha256:contract.digest,bindingSha256:'0'.repeat(64)},
  };
  const proof:DurableAccountChargeProof={...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:durableAuthorityBindingSha256(unbound)}};
  return {proof,profiles,rate,contract,cost};
}
type Grant=ReturnType<typeof syntheticGrant>;
function claim(g:Grant,requestId=randomUUID(),at=Date.now()-1) {
  const attemptId=randomUUID(),profile=g.profiles[0],observation={
    schema:'task217-public-pricing-observation-v1',provider:g.proof.provider,model:g.proof.model,
    approvedPricingDigest:g.rate.sha256,approvedContractDigest:g.contract.digest,currency:'USD',unitTokens:1000000,
    inputMicrosPerMillion:g.rate.inputMicrosPerMillion,outputMicrosPerMillion:g.rate.outputMicrosPerMillion,
    observedAtMs:at,expiresAtMs:Math.min(at+900000,g.proof.provider==='gemini'?Date.parse('2027-01-01T00:00:00Z'):at+900000),
    bodySha256:hash('SYNTHETIC-PUBLIC-RESPONSE-NOT-A-LIVE-GET'),
  };
  const executionPricing={schema:'task217-execution-pricing-v1',observation,authorityBindingSha256:g.proof.limitedOperation.bindingSha256,
    profileSha256:durableProfileSha256(profile),attemptId,requestId,subjectHash:subject,stage:'discover',inputTokenCeiling:4096,outputTokenCeiling:1024};
  const serialized={...g.proof,executionPricing};
  const args:unknown[]=[attemptId,requestId,'discover',subject,g.proof.grantId,JSON.stringify(serialized),4096,1024,g.cost,JSON.stringify(daily),day(Date.now())];
  return {args,serialized,attemptId,requestId};
}
const sql='SELECT public.reserve_dabra_dialogue_attempt($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11) AS value';
async function asService(db:Client,args:unknown[]) {
  await db.query('SET LOCAL ROLE service_role'); const result=await db.query(sql,args); await db.query('RESET ROLE');
  const value:unknown=result.rows[0]?.value; return value;
}

test('durable actual PostgreSQL delta: standing authority, atomic public quote, unchanged privileges and retained lifetime history',async t=>{
  const config=target(process.env.CONTINUITY_TEST_DATABASE_URL),database='dir3com_durable_'+randomUUID().replaceAll('-','');
  const root=new Client(config);let db:Client|undefined,created=false;await root.connect();
  try{
    await root.query('CREATE DATABASE '+database);created=true;db=new Client({...config,database});await db.connect();const client=db;
    await client.query(['anon','authenticated','service_role'].map(role=>'DO $$ BEGIN CREATE ROLE '+role+' NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;').join('\n'));
    await client.query(readFileSync(new URL('../supabase/migrations/'+predecessors[0],import.meta.url),'utf8'));
    // Historical synthetic rows are seeded before later insert guards, exactly as
    // an existing pre-v2 ledger. No real account or provider is contacted.
    const envelope={schema:'task217-seven-provider-pilot-v1',id:'task217-text-pilot-2026-11-01',maxCostMicros:1000000,maxAttempts:28};
    for(const [id,provider,cost] of [['11111111-1111-4111-8111-111111111111','openai',6423],['22222222-2222-4222-8222-222222222222','anthropic',55296]] as const)
      await client.query('INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,reserved_credit_micros,enabled,proof,authorized_at) VALUES($1,$2,$3,$4,$5,1000000,$6,false,$7::jsonb,clock_timestamp())',
        [id,provider,'SYNTHETIC-history-'+provider,'SYNTHETIC-history','existing-credit',cost,JSON.stringify({pilotEnvelope:envelope})]);
    await client.query("INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros) SELECT ('80000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'intent.classify',repeat('a',64),CASE WHEN n<=3 THEN '22222222-2222-4222-8222-222222222222'::uuid ELSE '11111111-1111-4111-8111-111111111111'::uuid END,0,0,1,1,1,CASE WHEN n<=3 THEN 18432 ELSE 2141 END FROM generate_series(1,6)n");
    for(const p of predecessors.slice(1))await client.query(readFileSync(new URL('../supabase/migrations/'+p,import.meta.url),'utf8'));
    const aclSql="SELECT oid,proowner,proacl::text,prosecdef,proconfig FROM pg_proc WHERE oid=ANY(ARRAY['public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)'::regprocedure,'public.get_dabra_dialogue_funding_policy(text)'::regprocedure,'private.protect_dabra_dialogue_grant()'::regprocedure,'private.protect_dabra_pilot_admission()'::regprocedure]) ORDER BY oid";
    const tableAclSql="SELECT relname,relowner,relrowsecurity,relforcerowsecurity,relacl::text FROM pg_class WHERE relnamespace='private'::regnamespace AND relkind='r' ORDER BY relname";
    const beforeFunctions=(await client.query(aclSql)).rows,beforeTables=(await client.query(tableAclSql)).rows;
    await client.query(readFileSync(new URL('../supabase/migrations/'+forward,import.meta.url),'utf8'));
    assert.deepEqual((await client.query(aclSql)).rows,beforeFunctions);assert.deepEqual((await client.query(tableAclSql)).rows,beforeTables);
    const grants=AGENT_PROVIDER_IDS.map(p=>syntheticGrant(p,Date.now()-1000)),allProfiles=grants.flatMap(g=>g.profiles);
    await client.query('UPDATE private.dabra_dialogue_funding_control SET enabled=true,subject_hashes=ARRAY[$1::text],profiles=$2::jsonb,max_attempt_cost_micros=1000000',[subject,JSON.stringify(allProfiles)]);
    for(const g of grants)await client.query('INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,input_rate_micros_per_million,output_rate_micros_per_million,enabled,proof,authorized_at) VALUES($1,$2,$3,$4,$5,0,$6,$7,true,$8::jsonb,$9::timestamptz)',
      [g.proof.grantId,g.proof.provider,g.proof.accountId,g.proof.projectId,g.proof.mode,g.rate.inputMicrosPerMillion,g.rate.outputMicrosPerMillion,JSON.stringify(g.proof),new Date(g.proof.limitedOperation.authorizedAtMs).toISOString()]);
    const isolated=async(fn:()=>Promise<void>)=>{await client.query('BEGIN');try{await fn();}finally{await client.query('ROLLBACK');}};
    const rejectWrite=async(text:string,args:unknown[]=[])=>{
      await client.query('SAVEPOINT expected_denial');
      try{await assert.rejects(()=>client.query(text,args),{code:'P0001'});}finally{await client.query('ROLLBACK TO SAVEPOINT expected_denial');await client.query('RELEASE SAVEPOINT expected_denial');}
    };
    for(const g of grants)await t.test('native SQL/TS bindings and exact all-in quote '+g.proof.provider,()=>isolated(async()=>{
      const c=claim(g),value=await asService(client,c.args);assert.ok(record(value));assert.equal(value.decision,'admitted');assert.equal(value.attempt_id,c.attemptId);
      assert.equal(value.pricing_expires_at_ms,c.serialized.executionPricing.observation.expiresAtMs);
      assert.deepEqual((await client.query('SELECT count(*)::int n,sum(cost_micros)::int held FROM private.dabra_dialogue_admissions')).rows,[{n:7,held:61719+g.cost}]);
      const row=(await client.query('SELECT execution_pricing FROM private.dabra_dialogue_admissions WHERE attempt_id=$1',[c.attemptId])).rows[0];
      assert.deepEqual(row.execution_pricing,c.serialized.executionPricing);
      assert.deepEqual(await asService(client,c.args),{decision:'denied'});
    }));
    const chosen=grants[0];
    await t.test('missing/extra/forged/stale quote fields deny before any new hold',()=>isolated(async()=>{
      const cases:((c:ReturnType<typeof claim>)=>void)[]=[
        c=>{Reflect.deleteProperty(c.serialized,'executionPricing');},
        c=>{Reflect.set(c.serialized.executionPricing,'extra',true);},
        c=>{c.serialized.executionPricing.observation.inputMicrosPerMillion++;},
        c=>{c.serialized.executionPricing.observation.approvedContractDigest='f'.repeat(64);},
        c=>{c.serialized.executionPricing.observation.expiresAtMs=Date.now()-1;},
        c=>{c.serialized.executionPricing.observation.observedAtMs=Date.now()+60000;},
        c=>{c.serialized.executionPricing.observation.expiresAtMs+=900001;},
        c=>{c.serialized.executionPricing.subjectHash='f'.repeat(64);},
        c=>{c.serialized.executionPricing.requestId=randomUUID();},
        c=>{c.serialized.executionPricing.profileSha256='f'.repeat(64);},
        c=>{Reflect.set(c.serialized,'remainingCreditMicros',1000000);},
      ];
      for(const change of cases){const c=claim(chosen);change(c);c.args[5]=JSON.stringify(c.serialized);assert.deepEqual(await asService(client,c.args),{decision:'denied'});}
      assert.deepEqual((await client.query('SELECT count(*)::int n,sum(cost_micros)::int held FROM private.dabra_dialogue_admissions')).rows,[{n:6,held:61719}]);
    }));
    await t.test('disabled grant, changed profile and revoked subject reject the same quote',()=>isolated(async()=>{
      const c=claim(chosen);await client.query('UPDATE private.dabra_dialogue_funding_grants SET enabled=false WHERE id=$1',[chosen.proof.grantId]);
      assert.deepEqual(await asService(client,c.args),{decision:'denied'});
      await client.query('UPDATE private.dabra_dialogue_funding_grants SET enabled=true WHERE id=$1',[chosen.proof.grantId]);
      await client.query("UPDATE private.dabra_dialogue_funding_control SET profiles='[]'::jsonb");
      assert.deepEqual(await asService(client,c.args),{decision:'denied'});
      await client.query("UPDATE private.dabra_dialogue_funding_control SET profiles=$1::jsonb,subject_hashes='{}'::text[]",[JSON.stringify(allProfiles)]);
      assert.deepEqual(await asService(client,c.args),{decision:'denied'});
    }));
    await t.test('standing authority and every admission remain immutable while liability only increases',()=>isolated(async()=>{
      const c=claim(chosen);assert.ok(record(await asService(client,c.args)));
      await rejectWrite("UPDATE private.dabra_dialogue_funding_grants SET proof=jsonb_set(proof,'{model}','\"SYNTHETIC-changed\"') WHERE id=$1",[chosen.proof.grantId]);
      await rejectWrite('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=0 WHERE id=$1',[chosen.proof.grantId]);
      await rejectWrite('DELETE FROM private.dabra_dialogue_funding_grants WHERE id=$1',[chosen.proof.grantId]);
      await rejectWrite('UPDATE private.dabra_dialogue_admissions SET cost_micros=0 WHERE attempt_id=$1',[c.attemptId]);
      await rejectWrite('DELETE FROM private.dabra_dialogue_admissions WHERE attempt_id=$1',[c.attemptId]);
      assert.deepEqual((await client.query('SELECT count(*)::int n,sum(cost_micros)::int held FROM private.dabra_dialogue_admissions')).rows,[{n:7,held:61719+chosen.cost}]);
    }));
    for(const role of ['anon','authenticated'] as const)await t.test('unprivileged '+role+' cannot call reservation',()=>isolated(async()=>{
      await client.query('SET LOCAL ROLE '+role);await assert.rejects(()=>client.query(sql,claim(chosen).args),{code:'42501'});
    }));
    await t.test('concurrent service claims share all disabled history and max(counter,ledger), admitting only one final hold',async()=>{
      const other=grants[1];await client.query('UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=$1,enabled=false WHERE id=$2',[1000000-61719-chosen.cost,other.proof.grantId]);
      const sessions=[new Client({...config,database}),new Client({...config,database})];
      try{await Promise.all(sessions.map(s=>s.connect()));const results=await Promise.all(sessions.map(async s=>{
        await s.query('BEGIN');try{const value=await asService(s,claim(chosen).args);await s.query('COMMIT');return value;}catch(e){await s.query('ROLLBACK');throw e;}
      }));assert.equal(results.filter(v=>record(v)&&v.decision==='admitted').length,1);assert.equal(results.filter(v=>record(v)&&v.decision==='denied').length,1);
        assert.equal((await client.query('SELECT count(*)::int n FROM private.dabra_dialogue_admissions')).rows[0].n,7);
        assert.equal((await client.query('SELECT sum(greatest(g.reserved_credit_micros,coalesce(a.cost,0)))::int held FROM private.dabra_dialogue_funding_grants g LEFT JOIN LATERAL(SELECT sum(cost_micros)cost FROM private.dabra_dialogue_admissions WHERE grant_id=g.id)a ON true')).rows[0].held,1000000);
      }finally{await Promise.all(sessions.map(s=>s.end()));}
    });
  }finally{
    try{await db?.end();}finally{try{if(created)await root.query('DROP DATABASE '+database);}finally{await root.end();}}
  }
});
