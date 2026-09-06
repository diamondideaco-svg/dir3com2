import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {BASELINE,PENDING,quote,tableSql,renderBaseline,modelAdoption,pendingVersions} from './production-baseline-contract.mjs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const capture=JSON.parse(read('docs/production-schema-capture-2026-09-06.json'));
const queries=JSON.parse(read('scripts/baseline-catalog-queries.json'));
const ledger=JSON.parse(read('docs/production-ledger-capture-2026-09-06.json')).records;
const baseline=read(`supabase/baseline/${BASELINE}_production_schema_baseline.sql`);
assert.ok(baseline.replaceAll('\r\n','\n').trim()===renderBaseline(capture).trim(),'Generated baseline drift');
const container='dir3com-pr93-pg17';
const database='pr101_baseline_'+randomBytes(8).toString('hex');
assert.match(database,/^pr101_baseline_[a-f0-9]{16}$/);
const sql=(q,db=database)=>execFileSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-Atq'],{input:q,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}).trim();
const scalar=q=>JSON.parse(sql(q));
let created=false;
const createdRoles=[];
const canonical=x=>JSON.stringify(x,(_,v)=>typeof v==='string'?v.replaceAll('\r\n','\n'):v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const scope=(key,rows)=>rows.filter(r=>key==='triggers'?r.schema==='public'||r.name==='trg_auth_users_provision_profile':key==='policies'?r.schemaname==='public':key==='defaults'?r.schema==='public'&&r.owner==='postgres':r.schema==='public');
function denied(query){try{sql(query);}catch(e){assert.match(String(e.stderr),/permission denied|row-level security/);return;}assert.fail('Expected denial');}
try {
  assert.equal(sql('SHOW server_version','postgres'),'17.11');
  for(const role of capture.roles.properties){
    if(sql(`SELECT count(*) FROM pg_roles WHERE rolname='${role.name}'`,'postgres')==='0'){
      sql(`CREATE ROLE ${quote(role.name)} NOLOGIN ${role.bypassrls?'BYPASSRLS':'NOBYPASSRLS'}`,'postgres');createdRoles.push(role.name);
    }
  }
  // Existing cluster roles must not be mutated by the harness.
  for(const role of ['anon','authenticated','service_role'])assert.equal(sql(`SELECT rolbypassrls FROM pg_roles WHERE rolname='${role}'`,'postgres'),role==='service_role'?'t':'f');
  assert.equal(sql("SELECT count(*) FROM pg_auth_members WHERE member IN ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole)",'postgres'),'0','Client role membership must match captured absence of parent roles');
  sql(`CREATE DATABASE ${quote(database)}`,'postgres');created=true;
  sql('CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;');
  for(const t of capture.types.filter(x=>x.schema==='auth'))sql(`CREATE TYPE auth.${quote(t.name)} AS ENUM (${t.labels.map(x=>"'"+x.replaceAll("'","''")+"'").join(',')})`);
  sql(tableSql(capture.tables.find(x=>x.schema==='auth'&&x.name==='users')));
  sql('ALTER TABLE auth.users ADD PRIMARY KEY(id);');
  for(const f of capture.functions.filter(x=>x.schema==='auth'))sql(f.definition);
  sql('GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;');
  sql(baseline);
  console.log('BASELINE_DDL=PASS');
  for(const key of ['tables','constraints','indexes','functions','triggers','policies','grants','column_grants','defaults']){
    const actual=scope(key,scalar(queries[key]));const expected=scope(key,capture[key]);
    assert.ok(canonical(actual)===canonical(expected),`PARITY_${key}: actual ${actual.length}, expected ${expected.length}; first mismatch ${actual.findIndex((r,i)=>canonical(r)!==canonical(expected[i]))}`);
    console.log(`PARITY_${key}=PASS (${actual.length})`);
  }
  assert.equal(sql("SELECT to_regclass('public.customer_documents') IS NULL"),'t');
  assert.equal(sql("SELECT count(*) FROM pg_proc WHERE proname='activate_partner_with_attestation'"),'0');
  assert.equal(sql("SELECT has_table_privilege('service_role','public.dabra_provider_attempts','TRUNCATE')"),'t');
  assert.equal(sql("SELECT has_table_privilege('service_role','public.notifications','SELECT') AND has_table_privilege('service_role','public.notifications','INSERT') AND NOT has_table_privilege('authenticated','public.notifications','SELECT')"),'t');
  // Baseline and capture contain zero production data. Test fixtures begin only here.
  const id='00000000-0000-4000-8000-000000000101';
  sql(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('${id}','baseline-fixture@example.invalid','{}');`);
  assert.equal(sql(`SELECT role||':'||status FROM public.profiles WHERE id='${id}'`),'customer:active');
  denied('SET ROLE anon; SELECT * FROM public.audit_logs;');
  assert.equal(sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${id}'; SELECT count(*) FROM public.audit_logs`),'0');
  denied('SET ROLE authenticated; INSERT INTO public.notifications(title) VALUES(\'denied\');');
  console.log('PENDING_ABSENT=PASS AUTH_PROVISIONING=PASS RUNTIME_ROLE_DENIAL=PASS NOTIFICATIONS_CONTRACT=PASS');
  const adopted=modelAdoption(ledger,structuredClone(ledger),false);
  assert.deepEqual(pendingVersions(adopted),PENDING);
  assert.throws(()=>modelAdoption(ledger.slice(1),ledger,false));
  const changed=structuredClone(ledger);changed[0].name+='-mismatch';assert.throws(()=>modelAdoption(changed,ledger,false));
  console.log('ADOPTION_PURE_MODEL=PASS DRY_RUN_EQUIVALENT_BEFORE=20260903220000,20260904210623,20260906034500');
  const files=readdirSync(new URL('supabase/migrations/',root));
  for(const version of PENDING){const found=files.filter(f=>f.startsWith(version+'_'));assert.equal(found.length,1);sql(read('supabase/migrations/'+found[0]));adopted.push(version);console.log(`FORWARD_${version}=PASS`);}
  assert.equal(sql("SELECT to_regclass('public.customer_documents') IS NOT NULL"),'t');
  assert.equal(sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.customer_documents'::regclass"),'t');
  assert.equal(sql("SELECT count(*) FROM pg_proc WHERE proname='activate_partner_with_attestation'"),'1');
  for(const p of ['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])assert.equal(sql(`SELECT has_table_privilege('service_role','public.dabra_provider_attempts','${p}')`),'f');
  assert.equal(sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${id}'; SELECT count(*) FROM public.customer_documents;`),'0');
  const cli='C:/Users/dell/AppData/Local/Programs/Supabase/supabase.exe';
  assert.equal(execFileSync(cli,['--version'],{encoding:'utf8'}).trim(),'2.111.0');
  const login='pr101_cli_'+randomBytes(8).toString('hex'), password=randomBytes(24).toString('hex');
  sql(`CREATE ROLE ${quote(login)} LOGIN PASSWORD '${password}'`,'postgres');createdRoles.push(login);
  // Disposable parser fixtures contain comments only, never migration execution or secrets.
  const cliFixture=mkdtempSync(join(tmpdir(),'pr101-cli-order-'));
  mkdirSync(join(cliFixture,'supabase','migrations'),{recursive:true});
  writeFileSync(join(cliFixture,'supabase','config.toml'),'project_id = "pr101-ordering-proof"\n[db]\nmajor_version = 17\n');
  for(const v of [BASELINE,...PENDING])writeFileSync(join(cliFixture,'supabase','migrations',v+'_ordering_fixture.sql'),'-- Filename parser proof only; never executed.\n');
  const url=`postgresql://${login}:${password}@127.0.0.1:55493/${database}?sslmode=disable`;
  let listing;
  try { listing=execFileSync(cli,['migration','list','--db-url',url,'--workdir',cliFixture,'--yes'],{encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']}); }
  catch(error) { throw new Error('CLI_ORDERING_BLOCKED: '+String(error.stderr||'no stderr').replaceAll(url,'[LOCAL_DB]').replaceAll(password,'[REDACTED]').slice(0,1500)); }
  const positions=[BASELINE,...PENDING].map(v=>listing.indexOf(v));
  assert.ok(positions.every(p=>p>=0));assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
  console.log('CLI_2_111_0_FILENAME_ORDER=PASS');
  assert.deepEqual(pendingVersions(adopted),[]);
  console.log('FORWARD_CONTRACTS=PASS DRY_RUN_EQUIVALENT_AFTER=EMPTY');
} catch(error) { console.error(String(error.stderr||error.message).slice(0,4000));process.exitCode=1; }
finally {
  if(created)sql(`DROP DATABASE ${quote(database)}`,'postgres');
  for(const role of createdRoles.reverse())sql(`DROP ROLE ${quote(role)}`,'postgres');
  console.log('OWN_DISPOSABLE_DATABASE=CLOSED PRODUCTION_WRITES=0');
}
