import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { quote, tableSql } from './production-baseline-contract.mjs';

// Only this explicitly named LOCAL container is reachable. Never accept a URL,
// project reference, remote hostname or production credentials in this harness.
const container = 'dir3com-protected-ops-policy-20260909';
const database = `protected_ops_test_${randomBytes(8).toString('hex')}`;
assert.match(database, /^protected_ops_test_[a-f0-9]{16}$/);
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const capture = JSON.parse(read('docs/production-schema-capture-2026-09-06.json'));
const sql = (input, db = database) => execFileSync('docker', ['exec', '-i', container, 'psql',
  '-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq'],
{ input, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const literal = value => `'${value.replaceAll("'", "''")}'`;
const ceo = '0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16';
const admin = '10000000-0000-4000-8000-000000000001';
const staff = '10000000-0000-4000-8000-000000000002';
const customer = '10000000-0000-4000-8000-000000000003';
const partner = '10000000-0000-4000-8000-000000000004';
const actor = (id, statement, role = 'authenticated') => sql(`BEGIN; SET LOCAL ROLE ${role};
  SET LOCAL request.jwt.claim.sub=${literal(id)};
  SET LOCAL request.jwt.claims=${literal(JSON.stringify({sub:id, role, user_metadata:{role:'admin',country_scope:['SA']}}))};
  ${statement}; COMMIT;`);
const allowed = (id, permission, country, global = false) => actor(id,
  `SELECT public.has_operational_access(${literal(permission)},${country === null ? 'NULL' : literal(country)},${global})`);
let checks = 0;
function equal(actual, expected, name) { assert.equal(actual, expected, name); checks++; console.log(`PASS ${name}`); }
function denied(id, statement, pattern = /42501|denied|FORBIDDEN|NOT_AUTHORIZED|permission denied|row-level security/i, role) {
  try { actor(id, statement, role); } catch (error) { assert.match(String(error.stderr), pattern); checks++; return; }
  assert.fail(`Expected database denial: ${statement}`);
}
const grant = (id, countries, permissions, level = 'scoped_staff') => actor(ceo,
  `SELECT public.save_team_access_grant('${id}','${id}@example.invalid','Isolated manager',
  '${level}',ARRAY[${countries.map(literal).join(',')}]::text[],ARRAY[${permissions.map(literal).join(',')}]::text[])`);
let created = false;
try {
  assert.match(sql('SHOW server_version', 'postgres'), /^17\./);
  for (const role of capture.roles.properties) {
    if (sql(`SELECT count(*) FROM pg_roles WHERE rolname=${literal(role.name)}`, 'postgres') === '0') {
      sql(`CREATE ROLE ${quote(role.name)} NOLOGIN ${role.bypassrls ? 'BYPASSRLS' : 'NOBYPASSRLS'}`, 'postgres');
    }
  }
  for (const role of ['anon','authenticated','service_role']) {
    equal(sql(`SELECT rolbypassrls FROM pg_roles WHERE rolname='${role}'`, 'postgres'), role === 'service_role' ? 't' : 'f', `${role} RLS contract`);
  }
  sql(`CREATE DATABASE ${quote(database)}`, 'postgres'); created = true;
  sql('CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;');
  for (const type of capture.types.filter(type => type.schema === 'auth')) {
    sql(`CREATE TYPE auth.${quote(type.name)} AS ENUM (${type.labels.map(literal).join(',')})`);
  }
  sql(tableSql(capture.tables.find(table => table.schema === 'auth' && table.name === 'users')));
  sql('ALTER TABLE auth.users ADD PRIMARY KEY(id);');
  for (const fn of capture.functions.filter(fn => fn.schema === 'auth')) sql(fn.definition);
  sql(`GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
    GRANT SELECT ON storage.objects TO authenticated;`);
  const files = readdirSync(new URL('supabase/migrations/', root)).filter(file => file.endsWith('.sql')).sort();
  const migration = files.find(file => file.endsWith('_protected_operations_active_grant_authority.sql'));
  assert.ok(migration);
  for (const file of files.filter(file => file !== migration)) sql(read(`supabase/migrations/${file}`));
  // Fixtures are inserted only in our disposable database; no captured user data.
  for (const [id, role] of [[ceo,'admin'],[admin,'admin'],[staff,'staff'],[customer,'customer'],[partner,'partner']]) {
    sql(`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('${id}','${id}@example.invalid','{}');
      UPDATE public.profiles SET role='${role}',status='active',deleted_at=NULL WHERE id='${id}';`);
  }
  sql(`INSERT INTO public.customers(full_name,email,country) VALUES
    ('Fixture Egypt','eg@example.invalid','Egypt'),('Fixture Qatar','qa@example.invalid','QA'),('Fixture Saudi','sa@example.invalid','SA');
    INSERT INTO public.products(id,name_ar,name_en,slug,country) VALUES
    ('20000000-0000-4000-8000-000000000001','اختبار','Fixture Egypt','fixture-eg','EG'),
    ('20000000-0000-4000-8000-000000000002','اختبار','Fixture Qatar','fixture-qa','QA');
    INSERT INTO public.product_audit_events(product_id,action,actor_user_id,actor_role,country)
    SELECT id,'create_draft','${ceo}','admin',country FROM public.products;`);
  const rows = () => sql(`SELECT jsonb_build_object('profiles',(SELECT jsonb_agg(p ORDER BY id) FROM public.profiles p),
    'customers',(SELECT jsonb_agg(c ORDER BY id) FROM public.customers c),'products',(SELECT jsonb_agg(p ORDER BY id) FROM public.products p))`);
  const before = rows();
  sql(read(`supabase/migrations/${migration}`));
  equal(rows(), before, 'forward migration does not rewrite business/profile data');
  sql(read(`supabase/migrations/${migration}`));
  equal(rows(), before, 'forward replay idempotent');
  equal(allowed(ceo,'admin:full',null,true), 't', 'CEO without grant');
  equal(actor(ceo,'SELECT count(*) FROM public.product_audit_events'), '2', 'CEO global product audit');
  for (const id of [admin,staff,customer,partner]) {
    equal(allowed(id,'customers:read','EG'), 'f', `missing grant / forged metadata denied ${id}`);
    equal(actor(id,'SELECT count(*) FROM public.customers'), '0', 'RLS read denied without authority');
    denied(id, "SELECT public.product_lifecycle_actor_role('EG','products:write')");
  }
  grant(admin,['EG'],['customers:read','customers:write','products:read','products:write']);
  sql(`UPDATE public.profiles SET role='admin' WHERE id='${admin}'`);
  equal(allowed(admin,'customers:read','Egypt'), 't', 'scoped Admin Egypt allowed');
  equal(allowed(admin,'customers:read','QA'), 'f', 'scoped Admin Qatar denied');
  equal(allowed(admin,'admin:full',null,true), 'f', 'Admin is not implicitly global');
  equal(actor(admin,'SELECT count(*) FROM public.customers'), '1', 'database filters before returning customer rows');
  equal(actor(admin,'SELECT count(*) FROM public.product_audit_events'), '1', 'cross-country product audit denied');
  equal(actor(admin,"SELECT public.product_lifecycle_actor_role('EG','products:write')"), 'admin', 'scoped Admin lifecycle allowed');
  denied(admin,"SELECT public.product_lifecycle_actor_role('QA','products:write')");
  equal(actor(admin,"WITH changed AS (UPDATE public.customers SET city='Fixture' WHERE country='QA' RETURNING id) SELECT count(*) FROM changed"), '0', 'cross-country update denied');
  denied(admin,"UPDATE public.customers SET country='SA' WHERE country='Egypt'");
  sql(`UPDATE public.team_access_grants SET status='inactive' WHERE invited_user_id='${admin}'`);
  equal(allowed(admin,'customers:read','EG'), 'f', 'inactive Admin grant denied');
  equal(actor(admin,'SELECT count(*) FROM public.product_audit_events'), '0', 'inactive Admin audit denied');
  sql(`DELETE FROM public.team_access_grants WHERE invited_user_id='${admin}'`);
  equal(allowed(admin,'customers:read','EG'), 'f', 'deleted Admin grant denied');
  grant(staff,['EG'],['customers:read','products:read']);
  equal(allowed(staff,'customers:read','EG'), 't', 'staff granted permission allowed');
  equal(allowed(staff,'customers:write','EG'), 'f', 'staff missing permission denied');
  grant(staff,['EG','QA'],['customers:read','products:read']);
  equal(actor(staff,'SELECT count(*) FROM public.customers'), '2', 'Country Manager Egypt plus Qatar');
  equal(allowed(staff,'customers:read','SA'), 'f', 'Country Manager Saudi denied');
  grant(staff,['EG'],['customers:read','products:read']);
  equal(allowed(staff,'customers:read','QA'), 'f', 'country removal effective next request');
  grant(staff,['EG'],['products:read']);
  equal(allowed(staff,'customers:read','EG'), 'f', 'permission removal effective next request');
  actor(ceo,`SELECT public.set_team_access_status('${staff}@example.invalid','inactive')`);
  equal(allowed(staff,'products:read','EG'), 'f', 'CEO deactivation revokes access');
  actor(ceo,`SELECT public.set_team_access_status('${staff}@example.invalid','active')`);
  equal(allowed(staff,'products:read','EG'), 't', 'CEO reactivation restores existing scope');
  sql(`UPDATE public.profiles SET status='inactive' WHERE id='${staff}'`);
  equal(allowed(staff,'products:read','EG'), 'f', 'inactive profile denied despite active grant');
  sql(`UPDATE public.profiles SET status='active',deleted_at=now() WHERE id='${staff}'`);
  equal(allowed(staff,'products:read','EG'), 'f', 'deleted profile denied');
  grant(admin,[],['admin:full'],'global_admin');
  equal(allowed(admin,'customers:read','SA'), 't', 'explicit approved global grant');
  denied(admin,`SELECT public.set_team_access_status('${staff}@example.invalid','active')`);
  sql(`UPDATE public.team_access_grants SET status='inactive' WHERE invited_user_id='${admin}'`);
  denied(admin,"SELECT public.transition_marketplace_request('30000000-0000-4000-8000-000000000001','under_review','awaiting_supplier')");
  denied(admin,`SELECT public.activate_partner_with_attestation('${partner}','approved',now(),true,'Fixture attestation')`);
  denied(customer,"SELECT public.has_operational_access('admin:full',NULL,true)",/permission denied/,'anon');
  denied(ceo,"SELECT public.has_operational_access('admin:full',NULL,true)",/permission denied/,'service_role');
  equal(actor(ceo,'SELECT public.is_admin_actor()','service_role'), 'f', 'service actor cannot impersonate CEO authority');
  equal(sql("SELECT has_function_privilege('service_role','public.transition_marketplace_request(uuid,text,text,jsonb)','EXECUTE')"),'t','intentional system transition boundary preserved');
  console.log(`POSTGRESQL_17=PASS CHECKS=${checks} PRODUCTION_WRITES=0`);
} catch (error) {
  console.error(String(error.stderr || error.stack || error).slice(0,6000)); process.exitCode = 1;
} finally {
  if (created) sql(`DROP DATABASE ${quote(database)}`, 'postgres');
  console.log('OWN_DISPOSABLE_DATABASE=CLOSED');
}
