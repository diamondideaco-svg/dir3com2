import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Local Docker socket only; no URL, secret, Production or shared UAT backend.
// Each run owns a fresh database; cleanup never targets an existing database.
const container = 'dir3com-pr93-pg17';
const database = `notifications_grants_test_${randomBytes(8).toString('hex')}`;
assert.match(database, /^notifications_grants_test_[a-f0-9]{16}$/);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260906025749_notifications_production_grants.sql');
function sql(query, db = database) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atq'], { input: query, encoding: 'utf8', timeout: 20000, stdio: ['pipe','pipe','pipe'] }).trim();
}
function denied(query) {
  try { sql(query); } catch (error) {
    assert.match(String(error.stderr), /permission denied for table notifications/);
    assert.match(String(error.stderr), /ERROR:\s+42501:/);
    return;
  }
  assert.fail('Expected notification permission denial');
}
function json(query) { return JSON.parse(sql(query)); }
const fixture = `
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, status text NOT NULL, deleted_at timestamptz);
INSERT INTO public.profiles VALUES('11111111-1111-4111-8111-111111111111','active',null);
GRANT SELECT ON public.profiles TO service_role;
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=NOW(); RETURN NEW; END $$;
CREATE TABLE public.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
 title text NOT NULL, body text, kind text NOT NULL DEFAULT 'info' CHECK(kind IN ('info','booking','promotion','system')),
 read_at timestamptz, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','read','archived')),
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_profile_id ON public.notifications(profile_id);
CREATE TRIGGER set_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.notifications FOR ALL USING(auth.role()='service_role') WITH CHECK(auth.role()='service_role');
CREATE POLICY "Users manage own notifications" ON public.notifications FOR ALL USING(profile_id IS NOT NULL AND profile_id::text=auth.uid()::text) WITH CHECK(profile_id IS NOT NULL AND profile_id::text=auth.uid()::text);
REVOKE ALL ON public.notifications FROM PUBLIC,anon,authenticated,service_role;
GRANT TRUNCATE,REFERENCES,TRIGGER ON public.notifications TO anon,authenticated,service_role;
INSERT INTO public.notifications(profile_id,title,body,status) VALUES('11111111-1111-4111-8111-111111111111','Preserve me','Existing test-only row','archived');
-- Other summary relations are already satisfied here, isolating the ACL bug.
CREATE TABLE public.audit_logs(id uuid, timestamp timestamptz);
CREATE TABLE public.activity_timeline(id uuid, created_at timestamptz);
CREATE TABLE public.system_events(id uuid, created_at timestamptz);
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT SELECT ON public.audit_logs,public.activity_timeline,public.system_events TO service_role;
`;
const snapshotQuery = `SELECT jsonb_build_object(
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.notifications'::regclass AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.notifications'::regclass),
 'indexes',(SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='notifications'),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='notifications'),
 'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.notifications'::regclass AND NOT tgisinternal),
 'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.notifications'::regclass),
 'rows',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM public.notifications n)
)`;
const snapshot = () => json(snapshotQuery);
const acl = () => sql("SELECT relacl::text FROM pg_class WHERE oid='public.notifications'::regclass");
const literal = (value) => value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
function loadModule(path, dependencies = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name) => { if (name in dependencies) return dependencies[name]; throw new Error(`Unexpected dependency ${name}`); } });
  return exports;
}
// Execute the actual current-master functions with a narrow Supabase-shaped
// adapter. Every notification SELECT/INSERT runs against real PG permissions.
function client() {
  return { from(table) {
    assert.ok(['notifications','profiles','audit_logs','activity_timeline','system_events'].includes(table));
    let row;
    let order = 'created_at';
    const filters = [];
    const chain = {
      select: () => chain,
      insert: (input) => { row = input; return chain; },
      eq: (key,value) => { assert.ok(['id','status'].includes(key)); filters.push(`${key}=${literal(value)}`); return chain; },
      is: (key,value) => { assert.equal(key,'deleted_at'); assert.equal(value,null); filters.push('deleted_at IS NULL'); return chain; },
      order: (key) => { assert.ok(['created_at','timestamp'].includes(key)); order=key; return chain; },
      limit: async (n) => { assert.equal(n,8); return execute(`SELECT * FROM public.${table} ORDER BY ${order} DESC LIMIT 8`); },
      maybeSingle: async () => { const result=execute(`SELECT id FROM public.profiles WHERE ${filters.join(' AND ')}`); return { ...result,data:result.data?.[0] ?? null }; },
      single: async () => {
        assert.equal(table,'notifications');
        assert.deepEqual(Object.keys(row).sort(),['body','kind','profile_id','status','title']);
        const result=execute(`INSERT INTO public.notifications(profile_id,title,body,kind,status) VALUES(${['profile_id','title','body','kind','status'].map(k=>literal(row[k])).join(',')}) RETURNING id,profile_id,title,body,kind,status,created_at`);
        return { ...result,data:result.data?.[0] ?? null };
      },
    };
    return chain;
  } };
}
function execute(query) {
  try {
    return { data: json(`SET ROLE service_role; WITH result AS (${query}) SELECT coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb) FROM result;`), error:null };
  } catch (error) {
    const message=String(error.stderr);
    return { data:null,error:{ code:message.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] ?? 'UNKNOWN',message } };
  }
}
let created = false;
try {
  const version=Number(sql('SHOW server_version_num;', 'postgres'));
  assert.ok(version>=170000 && version<180000, 'PostgreSQL 17 required');
  // Roles must already exist on this known local test server; do not modify them.
  assert.equal(sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')",'postgres'),'3');
  sql(`CREATE DATABASE "${database}";`,'postgres'); created=true;
  sql(fixture);
  const before=snapshot();
  for(const query of ['SELECT * FROM public.notifications',"INSERT INTO public.notifications(title) VALUES('denied') RETURNING id"]){
    const result=execute(query);
    assert.equal(result.error?.code,'42501');
    assert.match(result.error.message,/permission denied for table notifications/);
  }
  const engine=loadModule('lib/operations/operations-engine.ts');
  let allowed=true;
  const actions=loadModule('lib/actions/operations-actions.ts',{
    'next/cache':{},
    '@/lib/auth/admin':{requireAdminReadAccess:async()=>{if(!allowed)throw new Error('Forbidden');return {supabase:client()};}},
    '@/lib/operations/operations-engine':engine,
  });
  await assert.rejects(actions.getOperationsSummary(),/ADMIN_OPERATIONS_READ_FAILED/);
  assert.equal((await actions.createNotification({profileId:'11111111-1111-4111-8111-111111111111',title:'Test'})).success,false);
  assert.deepEqual(snapshot(),before);
  console.log('PRE_FIX_42501_REPRODUCED=PASS');

  // Each incompatible fixture is transaction-local and must leave its original
  // schema, policies, ACLs and rows untouched when migration preflight rejects.
  const conflicts=[
    ['missing_relation','ALTER TABLE public.notifications RENAME TO notifications_hidden','RELATION'],
    ['missing_pk','ALTER TABLE public.notifications DROP CONSTRAINT notifications_pkey','CONSTRAINTS'],
    ['missing_id_default','ALTER TABLE public.notifications ALTER COLUMN id DROP DEFAULT','DEFAULTS'],
    ['nullable_title','ALTER TABLE public.notifications ALTER COLUMN title DROP NOT NULL','COLUMNS'],
    ['extra_column','ALTER TABLE public.notifications ADD COLUMN legacy text','COLUMNS'],
    ['rls_disabled','ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY','RELATION'],
    ['unsafe_policy','ALTER POLICY "Users manage own notifications" ON public.notifications USING(true)','POLICIES'],
    ['extra_constraint','ALTER TABLE public.notifications ADD CHECK(title <> \'blocked\')','CONSTRAINTS'],
    ['extra_index','CREATE UNIQUE INDEX unexpected_unique ON public.notifications(title)','INDEXES'],
    ['disabled_trigger','ALTER TABLE public.notifications DISABLE TRIGGER set_notifications_updated_at','TRIGGERS'],
    ['column_grant','GRANT INSERT(title) ON public.notifications TO authenticated','COLUMN_PRIVILEGE'],
    ['inherited_grant','GRANT pg_write_all_data TO authenticated','EFFECTIVE_PRIVILEGE'],
  ];
  const originalAcl=acl();
  for(const [name,setup,code] of conflicts){
    try { sql(`BEGIN; ${setup}; ${migration}`); assert.fail(`Expected conflict: ${name}`); }
    catch(error){ assert.match(String(error.stderr),new RegExp(`NOTIFICATIONS_GRANTS_${code}_CONFLICT`),name); }
    assert.deepEqual(snapshot(),before,name); assert.equal(acl(),originalAcl,name);
    console.log(`PREFLIGHT_${name}=PASS rollback=PASS`);
  }
  sql(migration);
  assert.deepEqual(snapshot(),before,'Existing schema, policies, trigger and rows preserved');
  const firstAcl=acl(); sql(migration); assert.equal(acl(),firstAcl,'Reapply is idempotent');
  const summary=await actions.getOperationsSummary();
  assert.equal(summary.notifications.length,1); assert.equal(summary.notifications[0].title,'Preserve me');
  for(const key of ['audits','timeline','events'])assert.equal(summary[key].length,0);
  const createdNotification=await actions.createNotification({profileId:'11111111-1111-4111-8111-111111111111',title:'Local replay only',kind:'booking'});
  assert.equal(createdNotification.success,true); assert.equal(createdNotification.notification.status,'active');
  assert.ok(createdNotification.notification.id);
  assert.equal((await actions.getOperationsSummary()).notifications.length,2);
  allowed=false;
  await assert.rejects(actions.createNotification({profileId:'11111111-1111-4111-8111-111111111111',title:'Denied'}),/Forbidden/);
  await assert.rejects(actions.getOperationsSummary(),/Forbidden/);
  console.log('OPERATIONS_SUMMARY=PASS SERVER_INSERT_RETURNING=PASS ADMIN_GUARD=PASS');

  const afterAllowed=snapshot();
  for(const role of ['anon','authenticated','service_role']){
    const privileges=json(`SELECT jsonb_object_agg(p,has_table_privilege('${role}','public.notifications',p)) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])p;`);
    for(const [p,value] of Object.entries(privileges))assert.equal(value,role==='service_role'&&['SELECT','INSERT'].includes(p));
    for(const query of ['TRUNCATE public.notifications','DELETE FROM public.notifications',"UPDATE public.notifications SET title='forged'"])
      denied(`SET ROLE ${role}; ${query};`);
    if(role!=='service_role'){
      denied(`SET ROLE ${role}; INSERT INTO public.notifications(title) VALUES('forged');`);
      denied(`SET ROLE ${role}; SELECT * FROM public.notifications;`);
    }
    console.log(`${role.toUpperCase()}_MINIMUM_PRIVILEGES=PASS TRUNCATE_DENIED=PASS`);
  }
  assert.deepEqual(snapshot(),afterAllowed,'Denied actions cannot change rows');
  assert.ok(afterAllowed.rows.some(row=>JSON.stringify(row)===JSON.stringify(before.rows[0])));
  console.log(`POSTGRESQL=${version} NOTIFICATIONS_GRANTS=PASS ROWS_SCHEMA_RLS_PRESERVED=PASS`);
} finally {
  if(created) sql(`DROP DATABASE "${database}";`,'postgres');
}
