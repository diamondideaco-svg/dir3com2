import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {BASELINE,PENDING,quote,tableSql,renderBaseline} from './production-baseline-contract.mjs';
import {adoptionContract,digest} from './baseline-adoption-contract.mjs';
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
const redactions=[];
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
  const evidence=mkdtempSync(join(tmpdir(),'pr101-adoption-proof-'));
  // Exact captured version/name inventory; inert statement fixtures stand in for
  // private historical bodies. Full fixture rows are backed up byte-for-byte.
  // This tests the mechanism, NOT a claim to possess a current Production backup.
  sql('CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[], name text, created_by text, idempotency_key text, rollback text[]);');
  const fixture=ledger.map((r,i)=>({version:r.version,name:r.name,statements:[`-- inert fixture for captured statement checksum ${r.statement_md5}`],created_by:i===0?'fixture operator':null,idempotency_key:i===0?'fixture key':null,rollback:i===0?['-- inert rollback',null]:null}));
  const lit=s=>"'"+s.replaceAll("'","''")+"'";
  sql(`INSERT INTO supabase_migrations.schema_migrations SELECT * FROM jsonb_populate_recordset(NULL::supabase_migrations.schema_migrations,${lit(JSON.stringify(fixture))}::jsonb);`);
  const history=()=>sql("SELECT jsonb_agg(to_jsonb(m) ORDER BY version) FROM supabase_migrations.schema_migrations m");
  const backup=history();const backupPath=join(evidence,'immutable-ledger-backup.json');
  writeFileSync(backupPath,backup,{flag:'wx',mode:0o400});chmodSync(backupPath,0o400);
  assert.throws(()=>writeFileSync(backupPath,'overwrite',{flag:'wx'}));
  const appState=()=>canonical(Object.fromEntries(Object.keys(queries).filter(k=>['tables','constraints','indexes','functions','triggers','policies','grants','column_grants','defaults'].includes(k)).map(k=>[k,scope(k,scalar(queries[k]))])));
  const fixtureInventory=scalar(queries.ledger);
  assert.deepEqual(fixtureInventory.map(r=>[r.version,r.name]),ledger.map(r=>[r.version,r.name]));
  const schemaBefore=appState();const contract=adoptionContract(readFileSync(backupPath,'utf8'),fixtureInventory,digest(schemaBefore));
  const dataState=()=>sql("SELECT jsonb_build_object('users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM auth.users u),'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.profiles p))");
  const dataBefore=dataState();
  assert.throws(()=>adoptionContract(JSON.stringify(fixture.slice(1)),fixtureInventory,digest(schemaBefore)));
  const tampered=JSON.parse(backup);tampered[0].statements.push('-- changed');
  assert.throws(()=>adoptionContract(JSON.stringify(tampered),fixtureInventory,digest(schemaBefore)),/checksum mismatch/);
  for(const fault of ['after-delete','before-commit']) {
    assert.throws(()=>sql(contract.adopt(fault)));
    assert.equal(history(),backup,`${fault} must restore ALL history`);
    assert.equal(appState(),schemaBefore);
    assert.equal(dataState(),dataBefore);
  }
  sql("UPDATE supabase_migrations.schema_migrations SET name=name||'-mismatch' WHERE version=(SELECT min(version) FROM supabase_migrations.schema_migrations)");
  const mismatched=history();assert.throws(()=>sql(contract.adopt()));assert.equal(history(),mismatched);
  sql(`TRUNCATE supabase_migrations.schema_migrations; INSERT INTO supabase_migrations.schema_migrations SELECT * FROM jsonb_populate_recordset(NULL::supabase_migrations.schema_migrations,${lit(backup)}::jsonb);`);
  sql(contract.adopt());const committed=history();sql(contract.adopt());assert.equal(history(),committed);
  assert.deepEqual(JSON.parse(committed),contract.marker,'Full six-column materialized marker must match exactly');
  // Each corrupted marker must be rejected by BOTH adoption and recovery,
  // preserving even the corrupt row for operator inspection (no destructive retry).
  for(const [key,value] of Object.entries({version:'20990101000000',name:'wrong',statements:['wrong checksum'],created_by:'unexpected actor',idempotency_key:'unexpected key',rollback:['unexpected rollback']})){
    const changed=structuredClone(contract.marker);changed[0][key]=value;
    sql(`TRUNCATE supabase_migrations.schema_migrations; INSERT INTO supabase_migrations.schema_migrations SELECT * FROM jsonb_populate_recordset(NULL::supabase_migrations.schema_migrations,${lit(JSON.stringify(changed))}::jsonb);`);
    const bad=history();
    for(const statement of [contract.adopt(),contract.recover]){assert.throws(()=>sql(statement));assert.equal(history(),bad);}
    assert.equal(dataState(),dataBefore);
  }
  sql(`TRUNCATE supabase_migrations.schema_migrations; INSERT INTO supabase_migrations.schema_migrations SELECT * FROM jsonb_populate_recordset(NULL::supabase_migrations.schema_migrations,${lit(committed)}::jsonb);`);
  // Unexpected defaults/columns are not accepted even when current row JSON
  // happens to match. The schema contract must fail BEFORE the no-op shortcut.
  for(const [change,restore] of [["ALTER TABLE supabase_migrations.schema_migrations ALTER COLUMN created_by SET DEFAULT 'unexpected'","ALTER TABLE supabase_migrations.schema_migrations ALTER COLUMN created_by DROP DEFAULT"],["ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN unexpected text","ALTER TABLE supabase_migrations.schema_migrations DROP COLUMN unexpected"]]){
    sql(change);const bad=history();
    for(const statement of [contract.adopt(),contract.recover]){try{sql(statement);assert.fail('Schema mismatch accepted');}catch(e){assert.match(String(e.stderr),/BASELINE_LEDGER_SCHEMA_MISMATCH/);}assert.equal(history(),bad);}
    sql(restore);
  }
  sql(contract.recover);assert.equal(history(),backup);sql(contract.adopt());
  assert.equal(appState(),schemaBefore,'Adoption may not change application schema');
  assert.equal(dataState(),dataBefore,'Adoption/recovery may not change application data');
  assert.equal(readFileSync(backupPath,'utf8'),backup);
  console.log('ADOPTION_EXACT_47=PASS BACKUP=PASS TRANSACTION=PASS CRASH_AFTER_DELETE=PASS CRASH_BEFORE_COMMIT=PASS RECOVERY=PASS IDEMPOTENCY=PASS');
  console.log('SIX_COLUMN_MARKER=PASS MUTATED_MARKER_DENIED=6/6 METADATA_RECOVERY=PASS SCHEMA_DRIFT_DENIED=PASS APP_DATA_UNCHANGED=PASS');
  const cli='C:/Users/dell/AppData/Local/Programs/Supabase/supabase.exe';
  assert.equal(execFileSync(cli,['--version'],{encoding:'utf8'}).trim(),'2.111.0');
  const login='pr101_cli_'+randomBytes(8).toString('hex'), password=randomBytes(24).toString('hex');
  redactions.push(password);
  sql(`CREATE ROLE ${quote(login)} LOGIN SUPERUSER PASSWORD '${password}'; ALTER ROLE ${quote(login)} SET role=postgres;`,'postgres');createdRoles.push(login);
  const cliFixture=join(evidence,'cli');mkdirSync(join(cliFixture,'supabase','migrations'),{recursive:true});
  writeFileSync(join(cliFixture,'supabase','config.toml'),'project_id = "pr101-isolated-proof"\n[db]\nmajor_version = 17\n');
  const files=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort();
  assert.deepEqual(files.map(f=>f.slice(0,14)),[BASELINE,...PENDING]);
  for(const f of files)writeFileSync(join(cliFixture,'supabase','migrations',f),read('supabase/migrations/'+f));
  const url=`postgresql://${login}:${password}@127.0.0.1:55493/${database}?sslmode=disable`;
  redactions.push(url);
  const runCli=(extra,label)=>{
    const args=['db','push','--db-url',url,'--workdir',cliFixture,'--yes','--output-format','json',...extra];
    let output;
    try { output=execFileSync(cli,args,{encoding:'utf8',timeout:60000,stdio:['pipe','pipe','pipe']}); }
    catch(error){throw new Error('ISOLATED_CLI: '+String(error.stderr||error.message).replaceAll(url,'[LOCAL_DB]').replaceAll(password,'[REDACTED]').slice(0,2000));}
    output=output.replaceAll(url,'[LOCAL_DB]').replaceAll(password,'[REDACTED]');
    writeFileSync(join(evidence,label+'.txt'),output);console.log(label+'='+output.trim());return output;
  };
  const before=runCli(['--dry-run'],'ACTUAL_CLI_BEFORE');
  assert.deepEqual(JSON.parse(before).migrations,files.slice(1));
  assert.deepEqual(JSON.parse(before).seeds,[]);assert.deepEqual(JSON.parse(before).roles,[]);
  assert.equal(history(),committed,'Dry run must not apply history');
  const applied=runCli([],'ACTUAL_CLI_APPLY');assert.deepEqual(JSON.parse(applied).migrations,files.slice(1));
  const after=runCli(['--dry-run'],'ACTUAL_CLI_AFTER');
  assert.deepEqual(JSON.parse(after).migrations,[]);assert.equal(JSON.parse(after).upToDate,true);
  assert.deepEqual(JSON.parse(history()).map(r=>r.version),[BASELINE,...PENDING]);
  assert.throws(()=>sql(contract.recover),'Recovery must refuse after forwards');
  assert.throws(()=>sql(contract.adopt()),'Adoption must refuse after forwards');
  console.log('CLI_DRY_RUN_BEFORE=EXACT_THREE CLI_DRY_RUN_AFTER=EMPTY PENDING_THREE_APPLIED=PASS');
  console.log('EVIDENCE_DIRECTORY='+evidence);
  assert.equal(sql("SELECT to_regclass('public.customer_documents') IS NOT NULL"),'t');
  assert.equal(sql("SELECT relrowsecurity FROM pg_class WHERE oid='public.customer_documents'::regclass"),'t');
  assert.equal(sql("SELECT count(*) FROM pg_proc WHERE proname='activate_partner_with_attestation'"),'1');
  for(const p of ['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])assert.equal(sql(`SELECT has_table_privilege('service_role','public.dabra_provider_attempts','${p}')`),'f');
  assert.equal(sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${id}'; SELECT count(*) FROM public.customer_documents;`),'0');
  console.log('FORWARD_CONTRACTS=PASS');
} catch(error) { let safe=String(error.stderr||error.message);for(const secret of redactions)safe=safe.replaceAll(secret,'[REDACTED]');console.error(safe.slice(0,4000));process.exitCode=1; }
finally {
  if(created)sql(`DROP DATABASE ${quote(database)}`,'postgres');
  for(const role of createdRoles.reverse())sql(`DROP ROLE ${quote(role)}`,'postgres');
  console.log('OWN_DISPOSABLE_DATABASE=CLOSED PRODUCTION_WRITES=0');
}
