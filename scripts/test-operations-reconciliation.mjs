import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Invoked only by the localhost/disposable-database guarded PR93 runner.
const migration = readFileSync(new URL('../supabase/migrations/20260906013832_reconcile_pr93_operations_notifications.sql', import.meta.url), 'utf8');
const tables = ['audit_logs', 'activity_timeline', 'system_events'];

async function notificationsSnapshot(db) {
  return (await db.query(`SELECT jsonb_build_object(
    'columns',(SELECT jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),'required',attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.notifications'::regclass AND attnum>0 AND NOT attisdropped),
    'constraints',(SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.notifications'::regclass),
    'indexes',(SELECT jsonb_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE schemaname='public' AND tablename='notifications'),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='notifications'),
    'grants',(SELECT relacl::text FROM pg_class WHERE oid='public.notifications'::regclass),
    'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid='public.notifications'::regclass),
    'rows',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM public.notifications n)
  ) AS snapshot`)).rows[0].snapshot;
}

export async function prepareOperationsReconciliation(db) {
  // Reproduce existing Production schema, not the incompatible legacy table.
  await db.query(`
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
    CREATE TABLE public.notifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
      title text NOT NULL, body text,
      kind text NOT NULL DEFAULT 'info' CHECK(kind IN ('info','booking','promotion','system')),
      read_at timestamptz,
      status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','read','archived')),
      deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_notifications_profile_id ON public.notifications(profile_id);
    ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Service role full access" ON public.notifications FOR ALL USING(auth.role()='service_role') WITH CHECK(auth.role()='service_role');
    CREATE POLICY "Users manage own notifications" ON public.notifications FOR ALL USING(profile_id IS NOT NULL AND profile_id::text=auth.uid()::text) WITH CHECK(profile_id IS NOT NULL AND profile_id::text=auth.uid()::text);
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.notifications TO authenticated,service_role;
    INSERT INTO public.notifications(title,body,status) VALUES ('Preservation fixture','Never rewritten','archived');
    -- Simulate permissive defaults: migration must explicitly remove them.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
  `);
  const snapshot = await notificationsSnapshot(db);
  // A conflicting pre-existing relation must stop atomically, never be
  // silently repaired or have its data/contract rewritten.
  await db.query('CREATE TABLE public.audit_logs(id uuid)');
  await assert.rejects(db.query(migration), /PR93_OPERATIONS_SCHEMA_CONFLICT/);
  await db.query('ROLLBACK');
  assert.equal((await db.query("SELECT to_regclass('public.activity_timeline') AS relation")).rows[0].relation, null);
  assert.deepEqual(await notificationsSnapshot(db), snapshot);
  await db.query('DROP TABLE public.audit_logs'); // disposable test fixture only
  await db.query(migration);
  assert.deepEqual(await notificationsSnapshot(db), snapshot);
  assert.equal((await db.query("SELECT to_regclass('public.notification_templates') AS templates,to_regclass('public.notification_logs') AS logs")).rows[0].templates, null);
  assert.equal((await db.query("SELECT to_regclass('public.notification_logs') AS logs")).rows[0].logs, null);
  return snapshot;
}

export async function verifyOperationsReconciliation(db, snapshot) {
  await db.query('RESET ROLE');
  assert.deepEqual(await notificationsSnapshot(db), snapshot, 'Notifications schema, policies, grants and rows must survive all six PR93 migrations unchanged');
  const adminId = randomUUID();
  const otherAdmin = randomUUID();
  const customerId = randomUUID();
  const partnerId = randomUUID();
  const staffId = randomUUID();
  const inactiveAdmin = randomUUID();
  const deletedAdmin = randomUUID();
  await db.query(`INSERT INTO public.profiles(id,role,status,deleted_at) VALUES
    ($1,'admin','active',null),($2,'admin','active',null),($3,'customer','active',null),
    ($4,'partner','active',null),($5,'staff','active',null),($6,'admin','inactive',null),($7,'admin','active',now())`,
  [adminId,otherAdmin,customerId,partnerId,staffId,inactiveAdmin,deletedAdmin]);
  const inserts = [
    ["INSERT INTO public.audit_logs(entity_type,entity_id,action,performed_by) VALUES('test','test','test',$1) RETURNING id", [adminId]],
    ["INSERT INTO public.activity_timeline(entity_type,entity_id,event_type,performed_by) VALUES('test','test','test',$1) RETURNING id", [adminId]],
    ["INSERT INTO public.system_events(event_name) VALUES('test') RETURNING id", []],
  ];
  const denied = async (sql, values = []) => {
    await assert.rejects(db.query(sql, values), (error) => ['42501','P0001'].includes(error.code));
  };
  const actor = async (id, role = 'authenticated') => {
    await db.query('RESET ROLE');
    await db.query(`SET ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  await actor(adminId);
  for (const [sql, values] of inserts) assert.equal((await db.query(sql, values)).rowCount, 1);
  await denied(inserts[0][0], [otherAdmin]);
  await denied(inserts[1][0], [otherAdmin]);
  for (const table of tables) {
    assert.equal((await db.query(`SELECT * FROM public.${table}`)).rowCount, 1);
    await denied(`UPDATE public.${table} SET id=id`);
    await denied(`DELETE FROM public.${table}`);
    await denied(`TRUNCATE public.${table}`);
  }
  for (const id of [customerId,partnerId,staffId,inactiveAdmin,deletedAdmin]) {
    await actor(id);
    for (let i=0;i<tables.length;i++) {
      assert.equal((await db.query(`SELECT * FROM public.${tables[i]}`)).rowCount, 0);
      await denied(inserts[i][0], i<2 ? [id] : []);
    }
  }
  await actor('', 'anon');
  for (let i=0;i<tables.length;i++) {
    await denied(`SELECT * FROM public.${tables[i]}`);
    await denied(inserts[i][0], inserts[i][1]);
  }
  await actor('', 'service_role');
  for (let i=0;i<tables.length;i++) {
    assert.equal((await db.query(`SELECT * FROM public.${tables[i]}`)).rowCount, 1);
    await denied(inserts[i][0], inserts[i][1]);
    await denied(`UPDATE public.${tables[i]} SET id=id`);
    await denied(`DELETE FROM public.${tables[i]}`);
    await denied(`TRUNCATE public.${tables[i]}`);
  }
  await db.query('RESET ROLE');
  for (const table of tables) {
    const rls = (await db.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass', [`public.${table}`])).rows[0];
    assert.deepEqual(rls, { relrowsecurity: true, relforcerowsecurity: true });
    await denied(`UPDATE public.${table} SET id=id`);
    await denied(`DELETE FROM public.${table}`);
    await denied(`TRUNCATE public.${table}`);
  }
  // Existing recipient-owned policy remains effective; no cross-user widening.
  await actor(customerId);
  assert.equal((await db.query('SELECT * FROM public.notifications')).rowCount, 0);
  await denied("INSERT INTO public.notifications(profile_id,title) VALUES($1,'forged recipient')", [partnerId]);
  await db.query('RESET ROLE');
  await db.query('BEGIN');
  try {
    await db.query('SET LOCAL ROLE service_role');
    const inserted = await db.query("INSERT INTO public.notifications(profile_id,title,body,kind,status) VALUES($1,'تحديث / Update',null,'booking','active') RETURNING id,profile_id,title,status", [customerId]);
    assert.equal(inserted.rows[0].profile_id, customerId);
    assert.equal(inserted.rows[0].status, 'active');
    await db.query('SET LOCAL ROLE authenticated');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [customerId]);
    assert.equal((await db.query('SELECT * FROM public.notifications')).rowCount, 1);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [partnerId]);
    assert.equal((await db.query('SELECT * FROM public.notifications')).rowCount, 0);
  } finally {
    await db.query('ROLLBACK');
  }
  assert.deepEqual(await notificationsSnapshot(db), snapshot);
  console.log('OPERATIONS_RECONCILIATION=PASS notifications_preserved=PASS canonical_chain=PASS admin=PASS actor_binding=PASS nonadmin_denied=PASS service_read_only=PASS append_only=PASS');
}
