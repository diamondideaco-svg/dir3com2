import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';
import { disposableTarget } from '../scripts/sandbox/apply-core-migration-to-db.mjs';
import { parseCustomerCaseRead } from '../lib/contact/customer-cases';

const forward='../supabase/migrations/20261104130000_task217_customer_case_owner.sql';
function fixtureTarget(url:string|undefined) {
 assert.ok(url,'CONTINUITY_TEST_DATABASE_URL required; missing PostgreSQL is not PASS');
 const config=disposableTarget({DATABASE_URL:url,SANDBOX_DISPOSABLE_DATABASE:'true',NODE_ENV:process.env.NODE_ENV});
 assert.equal(config.database,'dir3com_test');assert.ok(['127.0.0.1','::1'].includes(config.host));return config;
}
test('Case PG fixture target rejects remote, live and override selectors before connecting',()=>{
 const allowed='postgresql://postgres:postgres@127.0.0.1:5432/dir3com_test';assert.equal(fixtureTarget(allowed).database,'dir3com_test');
 for(const value of [undefined,allowed+'?host=elsewhere.invalid',allowed+'#override',
  allowed.replace('127.0.0.1','rcrdjhoicbxiwgtyrift.supabase.co'),allowed.replace('127.0.0.1','ynupwivgvwcyrsdhtkcc.supabase.co'),
  allowed.replace('dir3com_test','postgres')])assert.throws(()=>fixtureTarget(value));
});

test('real disposable PG Customer cases: owner, atomic replay, orphan origin, authority, country, races, ACL/RLS',async t=>{
 const config=fixtureTarget(process.env.CONTINUITY_TEST_DATABASE_URL),database='dir3com_cases_'+randomUUID().replaceAll('-','');
 const serviceRole='case_service_'+randomUUID().replaceAll('-',''),root=new Client(config);
 let client:Client|undefined,created=false,roleCreated=false;
 await root.connect();
 try {
  await root.query('CREATE DATABASE '+database);created=true;
  client=new Client({...config,database});await client.connect();const db=client;
  assert.equal((await db.query("SELECT current_setting('server_version_num')::int AS n")).rows[0].n/10000|0,17);
  await db.query(['anon','authenticated','service_role'].map(role=>'DO $$ BEGIN CREATE ROLE '+role+' NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;').join('\n'));
  // Isolated NOLOGIN role models Supabase service_role's BYPASSRLS without
  // ALTER ROLE or changing a shared cluster role. It inherits only that role's ACL.
  await root.query('CREATE ROLE '+serviceRole+' NOLOGIN BYPASSRLS');roleCreated=true;
  await root.query('GRANT service_role TO '+serviceRole);
  const core=readFileSync(new URL('../supabase/migrations/20260903215959_production_schema_baseline.sql',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const profile=core.match(/CREATE TABLE "public"\."profiles" \([\s\S]*?\n\);/)?.[0];
  const team=core.match(/CREATE TABLE "public"\."team_access_grants" \([\s\S]*?\n\);/)?.[0];
  const normalize=core.match(/CREATE OR REPLACE FUNCTION public\.normalize_admin_country_key\(value text\)[\s\S]*?\$function\$\n;/)?.[0];
  assert.ok(profile&&team&&normalize,'Exact existing Core definitions required');
  await db.query('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);'+profile+team+normalize+
   'ALTER TABLE public.profiles ADD PRIMARY KEY(id); ALTER TABLE public.team_access_grants ADD PRIMARY KEY(id);'+
   'GRANT SELECT,UPDATE ON public.profiles,public.team_access_grants TO service_role;');
  await db.query(readFileSync(new URL('../supabase/migrations/20260928234244_contact_durable_inbox.sql',import.meta.url),'utf8'));
  const actors=Array.from({length:7},()=>randomUUID()),[a,b,c,d,staff,sa,inactive]=actors;
  for(const [i,id] of actors.entries()){
   await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
   await db.query('INSERT INTO public.profiles(id,full_name,email,role,status) VALUES($1,$2,$3,$4,$5)',
    [id,'SYNTHETIC','fixture-'+i+'@example.invalid',i>=4&&i<=5?'staff':'customer',i===6?'inactive':'active']);
  }
  for(const [actor,country] of [[staff,'EG'],[sa,'SA']])await db.query("INSERT INTO public.team_access_grants(id,email,job_title,access_level,country_scope,permissions,invited_user_id,created_by) VALUES($1,$2,'SYNTHETIC','scoped_staff',$3,ARRAY['operations:write'],$4,$4)",
   [randomUUID(),actor+'@example.invalid',[country],actor]);
  const input={name:'SYNTHETIC',email:'fixture@example.invalid',phone:'',subject:'service',country:'EG',message:'PRIVATE_CASE_MESSAGE'};
  const asRole=async(role:string,sql:string,params:unknown[]=[],connection=db)=>{
   await connection.query('BEGIN');try{await connection.query('SET LOCAL ROLE '+role);const value=await connection.query(sql,params);await connection.query('COMMIT');return value;}
   catch(error){await connection.query('ROLLBACK');throw error;}
  };
  const service=(sql:string,params:unknown[]=[],connection=db)=>asRole(serviceRole,sql,params,connection);
  const receive=async(actor:string,key:string,value:unknown=input,connection=db)=>(await service('SELECT public.receive_customer_contact_enquiry($1,$2,$3) AS v',[actor,key,value],connection)).rows[0].v;
  const anonymous=async(key:string,fingerprint='f'.repeat(64))=>(await service('SELECT public.receive_contact_enquiry($1,$2,$3,$4) AS v',[key,fingerprint,'e'.repeat(64),input])).rows[0].v;
  const read=async(actor:string,id:string|null=null)=>parseCustomerCaseRead((await service('SELECT public.get_customer_contact_cases($1,$2) AS v',[actor,id])).rows[0].v);
  const progress=async(id:string,actor:string,expected='received',status='in_progress',countries:string[]|null=null)=>
   (await service('SELECT public.progress_contact_enquiry($1,$2,$3,$4,$5,$6) AS v',[id,actor,countries,expected,status,'PRIVATE_INTERNAL_NOTE'])).rows[0].v;
  const legacyKey=randomUUID(),legacy=await anonymous(legacyKey);
  const tableState="SELECT relname,relacl::text,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('public.contact_enquiries'::regclass,'public.contact_enquiry_events'::regclass) ORDER BY relname";
  const before=(await db.query(tableState)).rows;
  await db.query(readFileSync(new URL(forward,import.meta.url),'utf8'));
  const keyA=randomUUID(),keyB=randomUUID(),caseA=await receive(a,keyA),caseB=await receive(b,keyB);
  await t.test('same key/input replay is atomic, foreign actor/input collision is generic, and reads filter owner inside SQL',async()=>{
   assert.equal(caseA.kind,'saved');assert.equal(caseA.replay,false);assert.equal(caseB.kind,'saved');
   assert.deepEqual(await receive(a,keyA),{kind:'saved',reference:caseA.reference,replay:true});
   assert.deepEqual(await receive(b,keyA),{kind:'conflict'});
   assert.deepEqual(await receive(a,keyA,{...input,message:'different'}),{kind:'conflict'});
   assert.equal((await read(a))?.cases.length,1);assert.equal((await read(a,caseB.reference))?.cases.length,0);
   const own=await read(b);assert.equal(own?.cases[0].reference,'CASE-'+caseB.reference);
   assert.doesNotMatch(JSON.stringify(own),/PRIVATE_|@|owner|actor|fingerprint|sender_hash/);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM public.contact_enquiry_events WHERE enquiry_id=$1',[caseA.reference])).rows[0].n,1);
  });
  await t.test('anonymous/legacy/owned collisions never cross intake origin and old rows are not claimed',async()=>{
   assert.deepEqual(await receive(a,legacyKey),{kind:'conflict'});
   assert.equal((await db.query('SELECT intake_origin,owner_user_id FROM public.contact_enquiries WHERE id=$1',[legacy.reference])).rows[0].intake_origin,'legacy');
   const hash=(await db.query('SELECT fingerprint FROM public.contact_enquiries WHERE id=$1',[caseA.reference])).rows[0].fingerprint;
   assert.deepEqual(await anonymous(keyA,hash),{kind:'conflict'});
   const anonKey=randomUUID(),first=await anonymous(anonKey);assert.equal(first.kind,'saved');
   assert.deepEqual(await anonymous(anonKey),{kind:'saved',reference:first.reference,replay:true});
   assert.deepEqual(await receive(a,anonKey),{kind:'conflict'});
  });
  await t.test('owner/origin immutable; deleting Auth parent preserves authenticated orphan and cannot enable anonymous replay',async()=>{
   await assert.rejects(()=>service('UPDATE public.contact_enquiries SET owner_user_id=$2 WHERE id=$1',[caseA.reference,b]),{code:'23514'});
   await assert.rejects(()=>service("UPDATE public.contact_enquiries SET intake_origin='anonymous',owner_user_id=NULL WHERE id=$1",[caseA.reference]),{code:'23514'});
   await assert.rejects(()=>service("UPDATE public.contact_enquiries SET intake_origin='authenticated',owner_user_id=$2 WHERE id=$1",[legacy.reference,b]));
   await db.query('DELETE FROM auth.users WHERE id=$1',[a]);
   assert.deepEqual((await db.query('SELECT intake_origin,owner_user_id FROM public.contact_enquiries WHERE id=$1',[caseA.reference])).rows,
    [{intake_origin:'authenticated',owner_user_id:null}]);
   const hash=(await db.query('SELECT fingerprint FROM public.contact_enquiries WHERE id=$1',[caseA.reference])).rows[0].fingerprint;
   assert.deepEqual(await anonymous(keyA,hash),{kind:'conflict'});assert.equal((await read(a))?.cases.length,0);
  });
  await t.test('current profile/grant/country are checked inside staff write; retries do not append duplicate events',async()=>{
   await assert.rejects(()=>receive(inactive,randomUUID()),{code:'42501'});
   await assert.rejects(()=>progress(caseB.reference,sa),{code:'42501'});
   await assert.rejects(()=>progress(caseB.reference,b),{code:'42501'});
   await db.query("UPDATE public.team_access_grants SET status='inactive' WHERE invited_user_id=$1",[staff]);
   await assert.rejects(()=>progress(caseB.reference,staff),{code:'42501'});
   await db.query("UPDATE public.team_access_grants SET status='active',permissions=ARRAY['unknown:write'] WHERE invited_user_id=$1",[staff]);
   await assert.rejects(()=>progress(caseB.reference,staff),{code:'42501'});
   await db.query("UPDATE public.team_access_grants SET permissions=ARRAY['operations:write'] WHERE invited_user_id=$1",[staff]);
   assert.equal(await progress(caseB.reference,staff),true);assert.equal(await progress(caseB.reference,staff),false);
   await assert.rejects(()=>progress(caseB.reference,staff,'received','closed'),/CONTACT_STALE/);
   assert.equal(await progress(caseB.reference,staff,'in_progress','closed'),true);
   const dto=await read(b);assert.equal(dto?.cases[0].events.length,3);assert.equal(dto?.cases[0].status,'closed');
   assert.doesNotMatch(JSON.stringify(dto),/PRIVATE_|actor|note/);
  });
  await t.test('concurrent exact replay admits one row and one initial event; owner swaps cannot steal a global key',async()=>{
   const other=new Client({...config,database});await other.connect();
   try{
    const key=randomUUID(),[one,two]=await Promise.all([receive(c,key,input),receive(c,key,input,other)]);
    assert.equal(one.kind,'saved');assert.equal(two.kind,'saved');assert.equal(one.reference,two.reference);
    assert.deepEqual([one.replay,two.replay].sort(),[false,true]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.contact_enquiry_events WHERE enquiry_id=$1',[one.reference])).rows[0].n,1);
    const clash=randomUUID(),values=await Promise.all([receive(c,clash,input),receive(d,clash,input,other)]);
    assert.deepEqual(values.map(v=>v.kind).sort(),['conflict','saved']);
   }finally{await other.end();}
  });
  await t.test('an event-insert failure rolls back the case and idempotency row together',async()=>{
   await db.query("CREATE FUNCTION public.fixture_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_id='"+d+"'::uuid THEN RAISE EXCEPTION 'FIXTURE_EVENT_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_event_failure BEFORE INSERT ON public.contact_enquiry_events FOR EACH ROW EXECUTE FUNCTION public.fixture_event_failure();");
   const key=randomUUID();await assert.rejects(()=>receive(d,key),/FIXTURE_EVENT_FAILURE/);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM public.contact_enquiries WHERE request_key=$1',[key])).rows[0].n,0);
   await db.query('DROP TRIGGER fixture_event_failure ON public.contact_enquiry_events; DROP FUNCTION public.fixture_event_failure()');
  });
  await t.test('owner and shared hourly limits retain replay and bound both intake paths',async()=>{
   let n=(await db.query("SELECT count(*)::int AS n FROM public.contact_enquiries WHERE owner_user_id=$1",[c])).rows[0].n;
   while(n++<3)assert.equal((await receive(c,randomUUID())).kind,'saved');
   assert.deepEqual(await receive(c,randomUUID()),{kind:'limited'});
   await db.query("INSERT INTO public.contact_enquiries(request_key,fingerprint,sender_hash,name,email,subject,message,country) SELECT gen_random_uuid(),repeat('a',64),repeat('b',64),'SYNTHETIC','bulk@example.invalid','other','SYNTHETIC','EG' FROM generate_series(1,100)");
   assert.deepEqual(await receive(b,randomUUID()),{kind:'limited'});assert.deepEqual(await anonymous(randomUUID()),{kind:'limited'});
   assert.equal((await receive(b,keyB)).replay,true);
  });
  await t.test('table ACL/RLS unchanged; RPCs service-only invoker with empty search_path; anonymous/authenticated cannot read or claim',async()=>{
   assert.deepEqual((await db.query(tableState)).rows,before);
   const functions=['receive_customer_contact_enquiry(uuid,uuid,jsonb)','get_customer_contact_cases(uuid,uuid)','progress_contact_enquiry(uuid,uuid,text[],text,text,text)'];
   for(const signature of functions){
    const row=(await db.query("SELECT prosecdef,proconfig,has_function_privilege('service_role',oid,'EXECUTE') AS service,has_function_privilege('anon',oid,'EXECUTE') AS anon,has_function_privilege('authenticated',oid,'EXECUTE') AS customer FROM pg_proc WHERE oid=$1::regprocedure",['public.'+signature])).rows[0];
    assert.equal(row.prosecdef,false);assert.equal(row.service,true);assert.equal(row.anon,false);assert.equal(row.customer,false);
    assert.deepEqual(row.proconfig,['search_path=""']);
   }
   for(const role of ['anon','authenticated']){
    await assert.rejects(()=>asRole(role,'SELECT * FROM public.contact_enquiries'),{code:'42501'});
    await assert.rejects(()=>asRole(role,'SELECT * FROM public.contact_enquiry_events'),{code:'42501'});
    await assert.rejects(()=>asRole(role,'SELECT public.get_customer_contact_cases($1,NULL)',[b]),{code:'42501'});
    await assert.rejects(()=>asRole(role,'SELECT public.receive_customer_contact_enquiry($1,$2,$3)',[b,randomUUID(),input]),{code:'42501'});
   }
  });
 } finally {
  try{await client?.end();}finally{
   try{if(created)await root.query('DROP DATABASE '+database);}finally{
    try{if(roleCreated)await root.query('DROP ROLE '+serviceRole);}finally{await root.end();}
   }
  }
 }
});
