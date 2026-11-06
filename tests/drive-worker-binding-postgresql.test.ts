import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const execute = promisify(execFile);
const container = process.env.TASK166_BINDING_TEST_CONTAINER;
const ceo='0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16';
const other='00000000-0000-4000-8000-000000000199';
const approval='00000000-0000-4000-8000-000000000166';
const revision='a'.repeat(40);
const deployment='dpl_SYNTHETIC1660000';
const worker='SYNTHETIC-ONLY-NOT-A-REAL-WORKER-CREDENTIAL';
const fingerprintForward=readFileSync('supabase/migrations/20261106161631_task166_worker_binding_fingerprint.sql','utf8');
const fingerprintSql=(value:string)=>`'${createHash('sha256').update('task166-existing-worker-v1:'+value,'utf8').digest('hex')}'`;
const migration=readFileSync('supabase/migrations/20261105081501_task166_existing_worker_binding.sql','utf8');

async function sql(text:string,user='postgres'):Promise<string>{
  assert.ok(container&&/^task166-binding-[a-z0-9-]+$/.test(container),'Explicit owned isolated container required; never a DB URL');
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec','-i',container,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U',user,'-d','task166_binding_synthetic'],{windowsHide:true});
    let stdout='',stderr='';child.stdout.on('data',d=>{stdout+=d;});child.stderr.on('data',d=>{stderr+=d;});
    child.on('error',reject);child.on('close',code=>code===0?resolve(stdout.trim()):reject(Error(stderr.trim())));child.stdin.end(text);
  });
}
function actorQuery(query:string,uid=ceo){return `BEGIN; SET LOCAL "request.jwt.claim.sub"='${uid}'; ${query}; COMMIT;`;}
async function state(uid=ceo){return JSON.parse(await sql(actorQuery(`SELECT public.get_task166_worker_binding_state('${approval}')`,uid),'authenticated'));}
async function bind(uid=ceo,sha=revision,dep=deployment,value=worker){return JSON.parse(await sql(actorQuery(`SELECT public.bind_task166_existing_worker('${approval}','${sha}','${dep}','${value}')`,uid),'authenticated'));}
async function reset(){await sql(`TRUNCATE drive_notification_private.task166_worker_binding_permit,vault.secrets;
  UPDATE public.profiles SET role='admin',status='active',deleted_at=NULL WHERE id='${ceo}';
  INSERT INTO drive_notification_private.task166_worker_binding_permit(approval_id,source_sha,deployment_id,expires_at,expected_worker_sha256)
  VALUES('${approval}','${revision}','${deployment}',clock_timestamp()+interval '4 minutes',${fingerprintSql(worker)});`);}
async function counts(){return (await sql(`SELECT json_build_array((SELECT count(*) FROM vault.secrets),
  (SELECT count(*) FROM drive_notification_private.task166_worker_binding_permit WHERE consumed_at IS NOT NULL));`));}

test('binding isolated PostgreSQL authorization, one-time races and rollback',async t=>{
  assert.ok(container&&/^task166-binding-[a-z0-9-]+$/.test(container),'No skip or Production fallback');
  const inspect=JSON.parse((await execute('docker',['inspect',container,'--format','{{json .}}'],{windowsHide:true})).stdout);
  assert.equal(inspect.Config.Labels['dir3com.task166.synthetic'],'true');
  assert.equal(inspect.HostConfig.NetworkMode,'none');assert.equal(Object.keys(inspect.HostConfig.PortBindings??{}).length,0);
  assert.equal(inspect.Mounts.filter((m:{Type:string})=>m.Type!=='tmpfs').length,0);
  await execute('docker',['exec',container,'createdb','-U','postgres','task166_binding_synthetic'],{windowsHide:true});
  try{
    await sql(`CREATE SCHEMA auth;CREATE SCHEMA drive_notification_private;CREATE SCHEMA vault;
      DO $$BEGIN CREATE ROLE anon LOGIN;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
      DO $$BEGIN CREATE ROLE authenticated LOGIN;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
      DO $$BEGIN CREATE ROLE service_role LOGIN BYPASSRLS;EXCEPTION WHEN duplicate_object THEN NULL;END$$;
      GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,status text,deleted_at timestamptz);
      INSERT INTO public.profiles VALUES('${ceo}','admin','active',NULL),('${other}','admin','active',NULL);
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      CREATE TABLE vault.secrets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,synthetic_value text);
      CREATE SEQUENCE vault.synthetic_create_count;
      CREATE UNIQUE INDEX secrets_name_idx ON vault.secrets(name) WHERE name IS NOT NULL;
      CREATE FUNCTION vault.create_secret(value text,new_name text,description text,key_id uuid) RETURNS uuid
      LANGUAGE plpgsql AS $$DECLARE result uuid;BEGIN
        PERFORM nextval('vault.synthetic_create_count');
        INSERT INTO vault.secrets(name,synthetic_value) VALUES(new_name,value) RETURNING id INTO result;
        IF current_setting('fixture.vault_failure',true)='on' THEN RAISE EXCEPTION 'SYNTHETIC_VAULT_FAILURE'; END IF;
        IF current_setting('fixture.vault_delay',true)='on' THEN PERFORM pg_sleep(3); END IF;
        RETURN result;END$$;`);
    await sql(migration);
    await t.test('RED baseline: original RPC accepts a worker different from the trusted permit proof',async()=>{
      const wrong='DIFFERENT-SYNTHETIC-ONLY-WORKER-CREDENTIAL';
      const result=JSON.parse(await sql(`BEGIN;
        ALTER TABLE drive_notification_private.task166_worker_binding_permit ADD COLUMN expected_worker_sha256 text;
        INSERT INTO drive_notification_private.task166_worker_binding_permit
          (approval_id,source_sha,deployment_id,expires_at,expected_worker_sha256)
          VALUES('${approval}','${revision}','${deployment}',clock_timestamp()+interval '4 minutes',${fingerprintSql(worker)});
        SET LOCAL ROLE authenticated;SET LOCAL "request.jwt.claim.sub"='${ceo}';
        SELECT public.bind_task166_existing_worker('${approval}','${revision}','${deployment}','${wrong}');
        ROLLBACK;`));
      assert.equal(result.code,'BOUND','Reproduces the reviewed defect only in a rollback-isolated synthetic DB');
      assert.deepEqual(JSON.parse(await counts()),[0,0]);
    });
    const originalAcl=await sql("SELECT json_agg(json_build_array(oid::text,proacl::text) ORDER BY proname) FROM pg_proc WHERE oid IN ('public.bind_task166_existing_worker(uuid,text,text,text)'::regprocedure,'public.get_task166_worker_binding_state(uuid)'::regprocedure)");
    await sql(fingerprintForward);
    assert.equal(await sql("SELECT json_agg(json_build_array(oid::text,proacl::text) ORDER BY proname) FROM pg_proc WHERE oid IN ('public.bind_task166_existing_worker(uuid,text,text,text)'::regprocedure,'public.get_task166_worker_binding_state(uuid)'::regprocedure)"),originalAcl,'Forward retains exact RPC OIDs and ACLs');
    await t.test('migration creates no permit, secret or activation',async()=>assert.deepEqual(JSON.parse(await counts()),[0,0]));
    await t.test('RPC owners, definer/search_path, RLS and ACLs are least privilege',async()=>{
      const roles=JSON.parse(await sql("SELECT json_agg(json_build_object('name',rolname,'super',rolsuper,'login',rolcanlogin,'bypass',rolbypassrls)) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')"));
      assert.equal(roles.length,3);for(const role of roles){assert.equal(role.super,false);assert.equal(role.login,true);assert.equal(role.bypass,role.name==='service_role');}
      const metadata=JSON.parse(await sql(`SELECT json_agg(json_build_object('owner',pg_get_userbyid(p.proowner),
      'definer',p.prosecdef,'config',p.proconfig,'public',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),
      'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'service_role',has_function_privilege('service_role',p.oid,'EXECUTE'))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('get_task166_worker_binding_state','bind_task166_existing_worker');`));
      assert.equal(metadata.length,2);for(const row of metadata){assert.equal(row.owner,'postgres');assert.equal(row.definer,true);
        assert.deepEqual(row.config,['search_path=pg_catalog']);assert.equal(row.public,false);assert.equal(row.anon,false);assert.equal(row.authenticated,true);assert.equal(row.service_role,false);}
      assert.equal(await sql("SELECT relrowsecurity FROM pg_class WHERE oid='drive_notification_private.task166_worker_binding_permit'::regclass"),'t');
      assert.equal(await sql("SELECT has_table_privilege('authenticated','drive_notification_private.task166_worker_binding_permit','SELECT,INSERT,UPDATE,DELETE')"),'f');
    });
    await t.test('anonymous and service_role connections cannot execute either RPC',async()=>{
      for(const role of ['anon','service_role'])for(const q of [
        `SELECT public.get_task166_worker_binding_state('${approval}')`,
        `SELECT public.bind_task166_existing_worker('${approval}','${revision}','${deployment}','${worker}')`]){
        await assert.rejects(sql(actorQuery(q),role),/permission denied/);
      }
    });
    await reset();
    await t.test('nonCEO admin, staff, partner, customer, absent UID cannot establish authority',async()=>{
      for(const role of ['admin','staff','partner','customer']){
        await sql(`UPDATE public.profiles SET role='${role}' WHERE id='${other}'`);
        assert.equal((await state(other)).code,'FORBIDDEN');assert.equal((await bind(other)).code,'FORBIDDEN');
      }
      const result=JSON.parse(await sql(`SELECT public.get_task166_worker_binding_state('${approval}')`,'authenticated'));
      assert.equal(result.code,'FORBIDDEN');assert.deepEqual(JSON.parse(await counts()),[0,0]);
    });
    await t.test('missing permit is not approval',async()=>{
      await sql('TRUNCATE drive_notification_private.task166_worker_binding_permit');
      assert.equal((await state()).code,'NOT_APPROVED');assert.equal((await bind()).code,'NOT_APPROVED');
    });
    await reset();
    await t.test('metadata exposes exact approved identity, never a value',async()=>{
      const before=await state();assert.deepEqual(before,{code:'READY',approvalId:approval,sourceSha:revision,
        deploymentId:deployment,referenceName:'task166_existing_worker_bearer',secretId:null});assert.ok(!JSON.stringify(before).includes(worker));
    });
    await t.test('wrong SHA or deployment cannot bind',async()=>{
      assert.equal((await bind(ceo,'b'.repeat(40))).code,'IDENTITY_MISMATCH');
      assert.equal((await bind(ceo,revision,'dpl_SYNTHETIC_OTHER')).code,'IDENTITY_MISMATCH');assert.deepEqual(JSON.parse(await counts()),[0,0]);
    });
    await t.test('revoked permit cannot bind',async()=>{
      await sql('UPDATE drive_notification_private.task166_worker_binding_permit SET revoked_at=clock_timestamp()');
      assert.equal((await state()).code,'REVOKED');assert.equal((await bind()).code,'REVOKED');
    });
    await reset();
    await t.test('expired permit cannot bind or renew itself',async()=>{
      await sql("UPDATE drive_notification_private.task166_worker_binding_permit SET issued_at=clock_timestamp()-interval '6 minutes',expires_at=clock_timestamp()-interval '2 minutes'");
      assert.equal((await state()).code,'EXPIRED');assert.equal((await bind()).code,'EXPIRED');assert.deepEqual(JSON.parse(await counts()),[0,0]);
    });
    await reset();
    await t.test('inactive, deleted or non-admin CEO profile denies binding',async()=>{
      for(const change of ["status='inactive'","deleted_at=clock_timestamp()","role='staff'"]){
        await reset();await sql('UPDATE public.profiles SET '+change+` WHERE id='${ceo}'`);
        assert.equal((await state()).code,'FORBIDDEN');assert.equal((await bind()).code,'FORBIDDEN');assert.deepEqual(JSON.parse(await counts()),[0,0]);
      }
    });
    await reset();
    await t.test('existing named reference is conflict, never overwritten or adopted',async()=>{
      await sql("INSERT INTO vault.secrets(name,synthetic_value) VALUES('task166_existing_worker_bearer','DIFFERENT_SYNTHETIC_VALUE')");
      assert.equal((await state()).code,'CONFLICT_STOP');assert.equal((await bind()).code,'CONFLICT_STOP');
      assert.equal(await sql("SELECT synthetic_value FROM vault.secrets"),'DIFFERENT_SYNTHETIC_VALUE');assert.deepEqual(JSON.parse(await counts()),[1,0]);
    });
    await reset();
    await t.test('invalid worker cannot consume permit',async()=>{
      const result=JSON.parse(await sql(actorQuery(`SELECT public.bind_task166_existing_worker('${approval}','${revision}','${deployment}',NULL)`),'authenticated'));
      assert.equal(result.code,'WORKER_UNAVAILABLE');assert.deepEqual(JSON.parse(await counts()),[0,0]);
    });
    await t.test('GREEN wrong worker is rejected before Vault and cannot consume the pinned permit',async()=>{
      const before=await sql("SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM vault.synthetic_create_count");
      assert.deepEqual(await bind(ceo,revision,deployment,'DIFFERENT-SYNTHETIC-ONLY-WORKER-CREDENTIAL'),{code:'WORKER_IDENTITY_MISMATCH'});
      assert.deepEqual(JSON.parse(await counts()),[0,0]);
      assert.equal(await sql("SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM vault.synthetic_create_count"),before,'Vault function was not entered');
      assert.equal(await sql(`SELECT expected_worker_sha256=${fingerprintSql(worker)} FROM drive_notification_private.task166_worker_binding_permit WHERE approval_id='${approval}'`),'t');
      const good=await bind();assert.equal(good.code,'BOUND');assert.deepEqual(JSON.parse(await counts()),[1,1]);
      assert.equal(await sql("SELECT synthetic_value FROM vault.secrets"),worker);
    });
    await reset();
    await t.test('authenticated caller cannot replace the trusted fingerprint or supply one to the RPC',async()=>{
      await assert.rejects(sql(`UPDATE drive_notification_private.task166_worker_binding_permit SET expected_worker_sha256=${fingerprintSql('DIFFERENT-SYNTHETIC-ONLY-WORKER-CREDENTIAL')}`,'authenticated'),/permission denied/);
      await assert.rejects(sql(actorQuery(`SELECT public.bind_task166_existing_worker('${approval}','${revision}','${deployment}','${worker}','${'a'.repeat(64)}')`),'authenticated'),/does not exist/);
      assert.deepEqual(JSON.parse(await counts()),[0,0]);
    });
    await t.test('legacy unfinished permit without proof fails closed without renewal or consumption',async()=>{
      await sql('UPDATE drive_notification_private.task166_worker_binding_permit SET expected_worker_sha256=NULL');
      const before=await sql("SELECT row_to_json(p)::text FROM drive_notification_private.task166_worker_binding_permit p");
      assert.deepEqual(await state(),{code:'WORKER_BINDING_PROOF_REQUIRED'});
      assert.deepEqual(await bind(),{code:'WORKER_BINDING_PROOF_REQUIRED'});
      assert.deepEqual(JSON.parse(await counts()),[0,0]);
      assert.equal(await sql("SELECT row_to_json(p)::text FROM drive_notification_private.task166_worker_binding_permit p"),before);
    });
    await reset();
    await t.test('Vault failure rolls back both writes and scrubs the exception',async()=>{
      const result=JSON.parse(await sql(actorQuery(`SET LOCAL fixture.vault_failure='on';SELECT public.bind_task166_existing_worker('${approval}','${revision}','${deployment}','${worker}')`),'authenticated'));
      assert.deepEqual(result,{code:'UNCONFIRMED_CHECK_METADATA'});assert.deepEqual(JSON.parse(await counts()),[0,0]);
    });
    await t.test('expiry while Vault is executing rolls back secret and consumption',async()=>{
      const before=Number(await sql('SELECT CASE WHEN is_called THEN last_value ELSE 0 END FROM vault.synthetic_create_count'));
      await sql("UPDATE drive_notification_private.task166_worker_binding_permit SET expires_at=clock_timestamp()+interval '2 seconds'");
      const result=JSON.parse(await sql(actorQuery(`SET LOCAL fixture.vault_delay='on';SELECT public.bind_task166_existing_worker('${approval}','${revision}','${deployment}','${worker}')`),'authenticated'));
      assert.equal(result.code,'UNCONFIRMED_CHECK_METADATA');assert.deepEqual(JSON.parse(await counts()),[0,0]);
      assert.equal(Number(await sql('SELECT last_value FROM vault.synthetic_create_count')),before+1,'Vault body actually ran before expiry rollback');
    });
    await reset();
    await t.test('concurrent locked permit returns BUSY and owner binds once',async()=>{
      assert.ok(container);
      const child=spawn('docker',['exec','-i',container,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d','task166_binding_synthetic'],{windowsHide:true});
      let output='',error='';let signal:()=>void=()=>{};
      const locked=new Promise<void>(resolve=>{signal=resolve;});
      child.stdout.on('data',d=>{output+=d;if(output.includes('LOCKED'))signal();});child.stderr.on('data',d=>{error+=d;});
      const finished=new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('close',c=>c===0?resolve():reject(Error(error)));});
      child.stdin.end(`BEGIN; SELECT 1 FROM drive_notification_private.task166_worker_binding_permit WHERE approval_id='${approval}' FOR UPDATE;
        SELECT 'LOCKED';SELECT pg_sleep(2);COMMIT;`);
      await locked;assert.equal((await bind()).code,'BUSY_CHECK_METADATA');await finished;
      const results=await Promise.all([bind(),bind()]);
      assert.equal(results.filter(r=>r.code==='BOUND').length,1);
      assert.ok(results.every(r=>['BOUND','ALREADY_BOUND','BUSY_CHECK_METADATA'].includes(r.code)));
      assert.deepEqual(JSON.parse(await counts()),[1,1]);
    });
    await t.test('response-loss reconciliation reads same reference, retry cannot overwrite',async()=>{
      const before=await state();assert.equal(before.code,'BOUND');const again=await bind();assert.equal(again.code,'ALREADY_BOUND');
      assert.equal(again.secretId,before.secretId);assert.ok(!JSON.stringify(again).includes(worker));assert.deepEqual(JSON.parse(await counts()),[1,1]);
    });
    await t.test('completed legacy binding without fingerprint stays bound and is never replaced',async()=>{
      await sql('UPDATE drive_notification_private.task166_worker_binding_permit SET expected_worker_sha256=NULL');
      const before=await state();assert.equal(before.code,'BOUND');
      const replay=await bind(ceo,revision,deployment,'DIFFERENT-SYNTHETIC-ONLY-WORKER-CREDENTIAL');
      assert.equal(replay.code,'ALREADY_BOUND');assert.equal(replay.secretId,before.secretId);
      assert.deepEqual(JSON.parse(await counts()),[1,1]);assert.equal(await sql("SELECT synthetic_value FROM vault.secrets"),worker);
    });
    await t.test('missing consumed reference is fail-closed, not recreated',async()=>{
      await sql('DELETE FROM vault.secrets');assert.equal((await state()).code,'INCONSISTENT_STOP');assert.equal((await bind()).code,'INCONSISTENT_STOP');assert.deepEqual(JSON.parse(await counts()),[0,1]);
    });
    await t.test('permit constraints reject broad targets, extra lifetime and mismatched consume pair',async()=>{
      await reset();for(const update of ["reference_name='other'","actor_uuid='"+other+"'","vercel_project_id='other'",
        "supabase_project_ref='other'","expires_at=issued_at+interval '6 minutes'","consumed_at=clock_timestamp()","expected_worker_sha256='not-a-digest'"]){
        await assert.rejects(sql('UPDATE drive_notification_private.task166_worker_binding_permit SET '+update),/check constraint/);
      }
    });
  }finally{
    await execute('docker',['exec',container,'dropdb','-U','postgres','--force','task166_binding_synthetic'],{windowsHide:true});
  }
});
