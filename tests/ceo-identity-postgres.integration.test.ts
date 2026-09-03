import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import type { SupabaseClient } from '@supabase/supabase-js';
import ts from 'typescript';
import { postgresTeamActions } from './helpers/team-access-postgres';

const loaderExports = {};
const loaderSource = readFileSync(new URL('../lib/admin/team-access-data.ts', import.meta.url), 'utf8');
runInNewContext(ts.transpileModule(loaderSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: loaderExports,
  require: (id: string) => id === 'server-only' ? {} : id === '@/lib/security/safe-logger' ? { logServerEvent: () => undefined } : createRequire(import.meta.url)(id),
});
const { loadTeamAccess } = loaderExports as typeof import('../lib/admin/team-access-data');

const migration = readFileSync(new URL('../supabase/migrations/20260903233000_ceo_team_access_rbac.sql', import.meta.url), 'utf8');
const ceo = '0acf0c9e-8a7a-4e6b-bfe2-b0e5235aaa16';
const otherAdmin = '11111111-1111-4111-8111-111111111111';
const staff = '22222222-2222-4222-8222-222222222222';
const partner = '33333333-3333-4333-8333-333333333333';
const customer = '44444444-4444-4444-8444-444444444444';
const staffQa = '55555555-5555-4555-8555-555555555555';

test('CEO identity migration: PostgreSQL 17, immutable authority and team RLS', async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, 'Explicit isolated TEST_DATABASE_URL is required');
  const url = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Local disposable PostgreSQL only');
  assert.equal(url.pathname, '/dir3com_test');
  const databaseName = `dir3com_ceo_${randomBytes(8).toString('hex')}`;
  const root = new Client({ connectionString: databaseUrl });
  let db: Client | undefined;
  await root.connect();
  try {
    await root.query(`CREATE DATABASE ${databaseName}`);
    url.pathname = `/${databaseName}`;
    db = new Client({ connectionString: url.toString() });
    await db.connect();
    const client = db;
    assert.equal((await client.query("SELECT current_setting('server_version') AS version")).rows[0].version.split('.')[0], '17');
    await client.query(`
      CREATE SCHEMA auth;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      $$;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text UNIQUE NOT NULL, full_name text, role text NOT NULL, status text NOT NULL DEFAULT 'active');
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, UPDATE(email) ON public.profiles TO authenticated;
      CREATE POLICY profiles_self ON public.profiles FOR ALL TO authenticated
        USING (id = auth.uid()) WITH CHECK (id = auth.uid());
      INSERT INTO public.profiles (id, email, role) VALUES
        ('${ceo}', 'diamondidea.co@gmail.com', 'admin'),
        ('${otherAdmin}', 'admin@example.invalid', 'admin'),
        ('${staff}', 'eg@example.invalid', 'staff'),
        ('${staffQa}', 'qa@example.invalid', 'staff'),
        ('${partner}', 'partner@example.invalid', 'partner'),
        ('${customer}', 'customer@example.invalid', 'customer');
      INSERT INTO auth.users(id,email) SELECT id,email FROM public.profiles;
    `);
    // Real PostgreSQL IO behind the production loader, never a hosted fixture.
    async function result(sql: string) {
      try { return { data: (await client.query(sql)).rows, error: null }; }
      catch (error) { return { data: null, error }; }
    }
    const query = { select: () => query, order: () => query, then: (resolve: (value: unknown) => unknown) => result('SELECT id, email, job_title, access_level, country_scope, permissions, status, invited_user_id, created_at, updated_at FROM public.team_access_grants ORDER BY created_at DESC').then(resolve) };
    const adapter = {
      from: () => query,
      rpc: async () => { const r = await result('SELECT public.is_ceo_actor() AS allowed'); return { data: r.data?.[0]?.allowed ?? null, error: r.error }; },
    } as unknown as SupabaseClient;
    await t.test('pre-migration real missing relation returns not activated', async () => {
      assert.equal((await loadTeamAccess(adapter)).status, 'not_activated');
    });
    await client.query(migration);
    await t.test('legacy same-email unattached row is attached by actual action without changing identity/history', async () => {
      await client.query('BEGIN');
      try {
        await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [ceo]);
        const before=(await client.query(`INSERT INTO public.team_access_grants(email,job_title,country_scope,permissions,created_by,created_at)
          VALUES ('eg@example.invalid','Egypt manager','{EG}','{customers:read}',$1,'2026-01-01') RETURNING *`,[otherAdmin])).rows[0];
        const f=postgresTeamActions(client,ceo);
        const form=new FormData();
        for(const [key,value] of Object.entries({email:'eg@example.invalid',jobTitle:'Egypt manager',accessLevel:'scoped_staff',countryScope:'EG',permissions:'customers:read'})) form.set(key,value);
        try { await f.actions.upsertTeamAccessGrantAction(form); }
        catch(error) { console.log('LEGACY_ATTACHMENT_REPRO',f.errors.map(({code,constraint})=>({code,constraint}))); throw error; }
        const after=(await client.query('SELECT * FROM public.team_access_grants')).rows;
        assert.equal(after.length,1);
        assert.equal(after[0].id,before.id);
        assert.equal(after[0].invited_user_id,staff);
        assert.equal(after[0].created_by,before.created_by);
        assert.deepEqual(after[0].created_at,before.created_at);
        assert.deepEqual(after[0].country_scope,before.country_scope);
        assert.deepEqual(after[0].permissions,before.permissions);
      } finally { await client.query('ROLLBACK'); }
    });
    await t.test('migrated zero grants is ready, not an unavailable or fabricated result', async () => {
      const state = await loadTeamAccess(adapter);
      assert.equal(state.status, 'ready');
      if (state.status === 'ready') assert.equal(state.grants.length, 0);
    });
    await t.test('present table with missing function stays unavailable until activation', async () => {
      await client.query('BEGIN');
      try {
        await client.query('DROP FUNCTION public.is_ceo_actor() CASCADE');
        assert.equal((await loadTeamAccess(adapter)).status, 'not_activated');
      } finally { await client.query('ROLLBACK'); }
    });
    await t.test('legacy non-unique same-name index is replaced; migration replays twice without row loss', async () => {
      await client.query('DROP INDEX public.team_access_grants_user_idx; CREATE INDEX team_access_grants_user_idx ON public.team_access_grants(invited_user_id)');
      const index=()=>client.query("SELECT indisunique,indisvalid,indpred IS NULL AS nonpartial,pg_get_indexdef(indexrelid) AS definition FROM pg_index WHERE indexrelid='public.team_access_grants_user_idx'::regclass");
      assert.equal((await index()).rows[0].indisunique,false);
      await client.query(migration); await client.query(migration);
      const current=(await index()).rows[0];
      assert.equal(current.indisunique,true); assert.equal(current.indisvalid,true); assert.equal(current.nonpartial,true);
      assert.match(current.definition,/\(invited_user_id\)/);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM public.team_access_grants')).rows[0].count,0);
    });
    await client.query(`INSERT INTO public.team_access_grants (email, job_title, country_scope, permissions, invited_user_id, created_by) VALUES
      ('eg@example.invalid', 'Egypt manager', '{EG}', '{customers:read}', '${staff}', '${ceo}'),
      ('qa@example.invalid', 'Qatar manager', '{QA}', '{products:read}', '${staffQa}', '${ceo}'),
      ('pending@example.invalid', 'Unattached invitation', '{QA}', '{admin:full}', NULL, '${ceo}')`);
    await client.query(migration);

    await t.test('migrated real grants preserve country, permission, status and Auth identity data', async () => {
      const state = await loadTeamAccess(adapter);
      assert.equal(state.status, 'ready');
      if (state.status === 'ready') {
        assert.equal(state.grants.length, 3);
        const egypt = state.grants.find(row => row.invited_user_id === staff);
        assert.deepEqual(egypt?.country_scope, ['EG']);
        assert.deepEqual(egypt?.permissions, ['customers:read']);
        assert.equal(egypt?.status, 'active');
      }
    });

    async function asActor(role: 'anon' | 'authenticated' | 'service_role', id: string | null, claims: object, run: () => Promise<void>, setup?: () => Promise<void>) {
      await client.query('BEGIN');
      try {
        await setup?.();
        await client.query(`SET LOCAL ROLE ${role}`);
        await client.query("SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [id ?? '', JSON.stringify(claims)]);
        await run();
      } finally { await client.query('ROLLBACK'); }
    }
    async function cannotWrite() {
      assert.equal((await client.query('SELECT public.is_ceo_actor() AS allowed')).rows[0].allowed, false);
      assert.equal((await client.query("UPDATE public.team_access_grants SET access_level='global_admin', country_scope='{EG,QA}', permissions='{admin:full}' RETURNING id")).rowCount, 0);
      assert.equal((await client.query('DELETE FROM public.team_access_grants RETURNING id')).rowCount, 0);
      await assert.rejects(client.query(`INSERT INTO public.team_access_grants(email, job_title, created_by) VALUES ('forged@example.invalid', 'CEO', '${ceo}')`), /row-level security/i);
    }

    await t.test('legitimate canonical CEO control', async () => {
      await asActor('authenticated', ceo, { email: 'diamondidea.co@gmail.com' }, async () => {
        assert.equal((await client.query('SELECT public.is_ceo_actor() AS allowed')).rows[0].allowed, true);
        assert.equal((await client.query("UPDATE public.team_access_grants SET job_title=job_title RETURNING id")).rowCount, 3);
      });
    });
    await t.test('canonical CEO can read/insert/update/delete, even after email changes', async () => {
      await asActor('authenticated', ceo, { email: 'renamed@example.invalid' }, async () => {
        assert.equal((await client.query('SELECT public.is_ceo_actor() AS allowed')).rows[0].allowed, true);
        assert.equal((await client.query('SELECT * FROM public.team_access_grants')).rowCount, 3);
        const inserted = await client.query(`INSERT INTO public.team_access_grants(email, job_title, created_by) VALUES ('new@example.invalid', 'Test', '${ceo}') RETURNING id`);
        assert.equal(inserted.rowCount, 1);
        assert.equal((await client.query("UPDATE public.team_access_grants SET job_title='Updated' WHERE id=$1 RETURNING job_title", [inserted.rows[0].id])).rows[0].job_title, 'Updated');
        assert.equal((await client.query('DELETE FROM public.team_access_grants WHERE id=$1 RETURNING id', [inserted.rows[0].id])).rowCount, 1);
      }, async () => { await client.query("UPDATE public.profiles SET email='renamed@example.invalid' WHERE id=$1", [ceo]); });
    });
    await t.test('non-CEO admin editing own profile to case-variant CEO email remains denied', async () => {
      await asActor('authenticated', otherAdmin, { email: 'admin@example.invalid' }, async () => {
        assert.equal((await client.query("UPDATE public.profiles SET email='DIAMONDIDEA.CO@GMAIL.COM' WHERE id=$1 RETURNING email", [otherAdmin])).rowCount, 1);
        await cannotWrite();
      });
    });
    await t.test('exact CEO email on wrong UUID grants no authority', async () => {
      await asActor('authenticated', otherAdmin, { email: 'diamondidea.co@gmail.com' }, cannotWrite, async () => {
        await client.query("UPDATE public.profiles SET email='renamed@example.invalid' WHERE id=$1", [ceo]);
        await client.query("UPDATE public.profiles SET email='diamondidea.co@gmail.com' WHERE id=$1", [otherAdmin]);
      });
    });
    for (const [name, id] of [['other admin', otherAdmin], ['staff', staff], ['partner', partner], ['customer', customer]] as const) {
      await t.test(`${name}: forged JWT email, role, country and permissions do not grant CEO write`, async () => {
        await asActor('authenticated', id, { email: 'diamondidea.co@gmail.com', role: 'admin', country_scope: ['EG', 'QA'], user_metadata: { role: 'admin', permissions: ['admin:full'] } }, cannotWrite);
      });
    }
    for (const [name, changes] of [['inactive', "status='inactive'"], ['non-admin', "role='staff'"], ['legacy alias is not exact admin', "role='super_admin'"]] as const) {
      await t.test(`${name} CEO denied`, async () => {
        await asActor('authenticated', ceo, { email: 'diamondidea.co@gmail.com', role: 'admin' }, cannotWrite, async () => { await client.query(`UPDATE public.profiles SET ${changes} WHERE id=$1`, [ceo]); });
      });
    }
    await t.test('missing CEO profile denied', async () => {
      await asActor('authenticated', ceo, {}, cannotWrite, async () => { await client.query('DELETE FROM public.profiles WHERE id=$1', [ceo]); });
    });
    for (const [name, id, email, expected] of [
      ['Egypt owner with changed email', staff, 'changed@example.invalid', 'Egypt manager'],
      ['Qatar owner with other grant email', staffQa, 'eg@example.invalid', 'Qatar manager'],
      ['wrong UUID with attached grant email', customer, 'eg@example.invalid', null],
      ['unattached invitation email', customer, 'pending@example.invalid', null],
    ] as const) {
      await t.test(`self-read: ${name}`, async () => {
        await asActor('authenticated', id, { email }, async () => {
          const rows = await client.query('SELECT job_title FROM public.team_access_grants');
          assert.deepEqual(rows.rows.map(row => row.job_title), expected ? [expected] : []);
          await cannotWrite();
        });
      });
    }
    await t.test('anonymous has no table/function grants', async () => {
      for (const sql of ['SELECT * FROM public.team_access_grants', 'SELECT public.is_ceo_actor()']) {
        await asActor('anon', null, {}, async () => { await assert.rejects(client.query(sql), /permission denied/i); });
      }
      await asActor('authenticated', null, { email: 'diamondidea.co@gmail.com' }, cannotWrite);
    });
    await t.test('service role preserves legitimate management without claiming CEO identity', async () => {
      await asActor('service_role', null, {}, async () => {
        assert.equal((await client.query('SELECT public.is_ceo_actor() AS allowed')).rows[0].allowed, false);
        assert.equal((await client.query("UPDATE public.team_access_grants SET job_title=job_title RETURNING id")).rowCount, 3);
        assert.equal((await client.query(`INSERT INTO public.team_access_grants(email, job_title, created_by) VALUES ('system@example.invalid', 'System-provisioned', '${ceo}') RETURNING id`)).rowCount, 1);
        assert.equal((await client.query("DELETE FROM public.team_access_grants WHERE email='system@example.invalid' RETURNING id")).rowCount, 1);
      });
    });
    await t.test('service email refresh preserves the existing single UUID-bound grant', async () => {
      await asActor('service_role', null, {}, async () => {
        const before = await client.query('SELECT id FROM public.team_access_grants WHERE invited_user_id=$1', [staff]);
        const changed = await client.query(`INSERT INTO public.team_access_grants(email, job_title, invited_user_id, created_by)
          VALUES ('changed-eg@example.invalid', 'Egypt manager', $1, $2)
          ON CONFLICT (invited_user_id) DO UPDATE SET email=EXCLUDED.email
          RETURNING id, email`, [staff, ceo]);
        assert.equal(changed.rows[0].id, before.rows[0].id);
        assert.equal(changed.rows[0].email, 'changed-eg@example.invalid');
        assert.equal((await client.query('SELECT id FROM public.team_access_grants WHERE invited_user_id=$1', [staff])).rowCount, 1);
      });
    });
    await t.test('duplicate grants for one Auth UUID are rejected by the database', async () => {
      await asActor('service_role', null, {}, async () => {
        await assert.rejects(client.query(`INSERT INTO public.team_access_grants(email, job_title, invited_user_id, created_by)
          VALUES ('duplicate-eg@example.invalid', 'Duplicate', $1, $2)`, [staff, ceo]), /duplicate key.*team_access_grants_user_idx/i);
      });
    });
    await t.test('idempotent migration preserves rows, RLS, policies, index and least privileges', async () => {
      assert.equal((await client.query('SELECT count(*)::int AS count FROM public.team_access_grants')).rows[0].count, 3);
      assert.equal((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.team_access_grants'::regclass")).rows[0].relrowsecurity, true);
      assert.equal((await client.query("SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='team_access_grants_user_idx'")).rowCount, 1);
      assert.deepEqual((await client.query("SELECT policyname FROM pg_policies WHERE tablename='team_access_grants' ORDER BY policyname")).rows.map(row => row.policyname), ['team_access_ceo_all', 'team_access_self_read', 'team_access_service_role_all']);
      for (const role of ['authenticated', 'service_role']) {
        for (const operation of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.equal((await client.query("SELECT has_table_privilege($1, 'public.team_access_grants', $2) AS allowed", [role, operation])).rows[0].allowed, true);
        assert.equal((await client.query("SELECT has_table_privilege($1, 'public.team_access_grants', 'TRUNCATE') AS allowed", [role])).rows[0].allowed, false);
      }
    });

    const saveSql='SELECT public.save_team_access_grant($1,$2,$3,$4,$5,$6) AS id';
    const saveArgs=[staff,'eg@example.invalid','Egypt manager','scoped_staff',['EG'],['customers:read']];
    const snapshot=async()=>({grants:(await client.query('SELECT * FROM public.team_access_grants ORDER BY id')).rows,profiles:(await client.query('SELECT * FROM public.profiles ORDER BY id')).rows});
    async function isolated(run:()=>Promise<void>) {
      await client.query('BEGIN');
      try { await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[ceo]); await run(); }
      finally {await client.query('ROLLBACK');}
    }
    async function denied(sql:string,args:unknown[],pattern:RegExp) {
      const before=await snapshot();
      await client.query('SAVEPOINT denied');
      await assert.rejects(client.query(sql,args),pattern);
      await client.query('ROLLBACK TO SAVEPOINT denied');
      assert.deepEqual(await snapshot(),before);
    }
    for(const email of ['eg@example.invalid','  EG@EXAMPLE.INVALID  ','\tEG@EXAMPLE.INVALID\u00a0']) {
      await t.test(`actual action legacy attachment normalizes ${JSON.stringify(email)} and preserves history`,async()=>isolated(async()=>{
        await client.query('UPDATE public.team_access_grants SET email=$1,invited_user_id=NULL,created_by=$2 WHERE invited_user_id=$3',[email,otherAdmin,staff]);
        const before=(await client.query('SELECT * FROM public.team_access_grants WHERE email=$1',[email])).rows[0];
        const f=postgresTeamActions(client,ceo); const form=new FormData();
        for(const [key,value] of Object.entries({email,jobTitle:before.job_title,accessLevel:before.access_level,countryScope:'EG',permissions:'customers:read'})) form.set(key,value);
        await f.actions.upsertTeamAccessGrantAction(form);
        const after=(await client.query('SELECT * FROM public.team_access_grants WHERE id=$1',[before.id])).rows[0];
        assert.equal(after.invited_user_id,staff); assert.equal(after.email,'eg@example.invalid');
        for(const key of ['id','job_title','country_scope','permissions','created_by','created_at']) assert.deepEqual(after[key],before[key]);
        assert.equal((await client.query('SELECT count(*)::int AS count FROM public.team_access_grants')).rows[0].count,3);
      }));
    }
    await t.test('fresh UUID grant and later Auth email change keep one grant',async()=>isolated(async()=>{
      await client.query('DELETE FROM public.team_access_grants WHERE invited_user_id=$1',[staff]);
      await client.query('SET LOCAL ROLE authenticated');
      const first=(await client.query(saveSql,saveArgs)).rows[0].id;
      await client.query('RESET ROLE');
      await client.query("UPDATE auth.users SET email='renamed@example.invalid' WHERE id=$1",[staff]);
      await client.query('SET LOCAL ROLE authenticated');
      const second=(await client.query(saveSql,[staff,'renamed@example.invalid',...saveArgs.slice(2)])).rows[0].id;
      assert.equal(first,second);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM public.team_access_grants WHERE invited_user_id=$1',[staff])).rows[0].count,1);
    }));
    for(const scenario of ['email attached elsewhere','UUID plus separate legacy email','ambiguous normalized legacy rows','Auth UUID/email mismatch'] as const) {
      await t.test(`${scenario}: fail closed with no grant/profile side effects`,async()=>isolated(async()=>{
        if(scenario==='email attached elsewhere') await client.query('UPDATE public.team_access_grants SET invited_user_id=$1 WHERE invited_user_id=$2',[customer,staff]);
        if(scenario==='UUID plus separate legacy email') {
          await client.query("UPDATE public.team_access_grants SET email='old@example.invalid' WHERE invited_user_id=$1",[staff]);
          await client.query("INSERT INTO public.team_access_grants(email,job_title,created_by) VALUES('eg@example.invalid','Legacy',$1)",[ceo]);
        }
        if(scenario==='ambiguous normalized legacy rows') {
          await client.query('UPDATE public.team_access_grants SET invited_user_id=NULL WHERE invited_user_id=$1',[staff]);
          await client.query("INSERT INTO public.team_access_grants(email,job_title,created_by) VALUES(' EG@EXAMPLE.INVALID ','Ambiguous',$1)",[ceo]);
        }
        if(scenario==='Auth UUID/email mismatch') await client.query("UPDATE auth.users SET email='different@example.invalid' WHERE id=$1",[staff]);
        await denied(saveSql,saveArgs,/TEAM_ACCESS_IDENTITY_CONFLICT/);
      }));
    }
    await t.test('normalized email shared by two Auth UUIDs fails closed at the database boundary',async()=>isolated(async()=>{
      await client.query("UPDATE auth.users SET email=' EG@EXAMPLE.INVALID ' WHERE id=$1",[customer]);
      await denied(saveSql,saveArgs,/TEAM_ACCESS_IDENTITY_CONFLICT/);
    }));
    await t.test('profile constraint failure rolls back the earlier grant attachment',async()=>isolated(async()=>{
      await client.query('UPDATE public.team_access_grants SET invited_user_id=NULL WHERE invited_user_id=$1',[staff]);
      await client.query("ALTER TABLE public.profiles ADD CONSTRAINT test_no_promotion CHECK(id<>'22222222-2222-4222-8222-222222222222'::uuid OR role<>'admin')");
      await denied(saveSql,[staff,'eg@example.invalid','Promoted','global_admin',[],['admin:full']],/test_no_promotion/);
    }));
    for(const [label,id,profileStatus,role] of [
      ['forged admin',otherAdmin,'active','admin'],['staff',staff,'active','staff'],['partner',partner,'active','partner'],
      ['customer',customer,'active','customer'],['inactive CEO',ceo,'inactive','admin'],['non-admin CEO',ceo,'active','staff'],
    ]) {
      await t.test(`${label}: cannot invoke either privileged RPC`,async()=>isolated(async()=>{
        await client.query('UPDATE public.profiles SET status=$1,role=$2 WHERE id=$3',[profileStatus,role,id]);
        await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[id,JSON.stringify({email:'diamondidea.co@gmail.com',actor_id:ceo})]);
        await client.query('SET LOCAL ROLE authenticated');
        await denied(saveSql,saveArgs,/TEAM_ACCESS_FORBIDDEN/);
        await denied('SELECT public.set_team_access_status($1,$2)',['eg@example.invalid','active'],/TEAM_ACCESS_FORBIDDEN/);
      }));
    }
    for(const role of ['anon','service_role']) {
      await t.test(`${role}: no management RPC execute permission even with forged actor claims`,async()=>isolated(async()=>{
        await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[ceo]);
        await client.query(`SET LOCAL ROLE ${role}`);
        // anon cannot snapshot table either; assert privilege directly.
        assert.equal((await client.query("SELECT has_function_privilege(current_user,'public.save_team_access_grant(uuid,text,text,text,text[],text[])','EXECUTE') AS allowed")).rows[0].allowed,false);
        await client.query('SAVEPOINT forbidden_rpc');
        await assert.rejects(client.query(saveSql,saveArgs),/permission denied/);
        await client.query('ROLLBACK TO SAVEPOINT forbidden_rpc');
      }));
    }
    await t.test('authenticated without Auth UUID cannot claim CEO through email',async()=>isolated(async()=>{
      await client.query("SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims',$1,true)",[JSON.stringify({email:'diamondidea.co@gmail.com',actor_id:ceo})]);
      await client.query('SET LOCAL ROLE authenticated');
      await denied(saveSql,saveArgs,/TEAM_ACCESS_FORBIDDEN/);
    }));
    await t.test('direct RPC cannot downgrade or disable canonical CEO',async()=>isolated(async()=>{
      await client.query('SET LOCAL ROLE authenticated');
      await denied(saveSql,[ceo,'diamondidea.co@gmail.com','CEO','scoped_staff',['EG'],[]],/TEAM_ACCESS_CEO_PROTECTED/);
      await client.query(saveSql,[ceo,'diamondidea.co@gmail.com','CEO','global_admin',[],['admin:full']]);
      await denied('SELECT public.set_team_access_status($1,$2)',['diamondidea.co@gmail.com','inactive'],/TEAM_ACCESS_CEO_PROTECTED/);
    }));
    await t.test('email remains unique while multiple unattached UUIDs remain allowed',async()=>isolated(async()=>{
      await client.query("INSERT INTO public.team_access_grants(email,job_title,created_by) VALUES('another-pending@example.invalid','Unattached',$1)",[ceo]);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM public.team_access_grants WHERE invited_user_id IS NULL')).rows[0].count,2);
      await denied("INSERT INTO public.team_access_grants(email,job_title,created_by) VALUES('pending@example.invalid','Duplicate',$1)",[ceo],/team_access_grants_email_key/);
    }));
    await t.test('status action follows attached UUID and atomically deactivates profile',async()=>isolated(async()=>{
      const f=postgresTeamActions(client,ceo); const form=new FormData(); form.set('email','  EG@EXAMPLE.INVALID ');form.set('status','inactive');form.set('invited_user_id',customer);
      await f.actions.setTeamAccessStatusAction(form);
      assert.equal((await client.query('SELECT status FROM public.team_access_grants WHERE invited_user_id=$1',[staff])).rows[0].status,'inactive');
      assert.equal((await client.query('SELECT status FROM public.profiles WHERE id=$1',[staff])).rows[0].status,'inactive');
      assert.equal((await client.query('SELECT status FROM public.profiles WHERE id=$1',[customer])).rows[0].status,'active');
    }));
    await t.test('duplicate legacy UUID upgrade fails transactionally without deleting rows/index',async()=>{
      await client.query('DROP INDEX public.team_access_grants_user_idx; CREATE INDEX team_access_grants_user_idx ON public.team_access_grants(invited_user_id)');
      await client.query("INSERT INTO public.team_access_grants(email,job_title,invited_user_id,created_by) VALUES('duplicate@example.invalid','Preserve me',$1,$2)",[staff,ceo]);
      const before=await snapshot();
      await assert.rejects(client.query(migration),/could not create unique index/);
      await client.query('ROLLBACK');
      assert.deepEqual(await snapshot(),before);
      assert.equal((await client.query("SELECT indisunique FROM pg_index WHERE indexrelid='public.team_access_grants_user_idx'::regclass")).rows[0].indisunique,false);
      // Remove only this disposable test's explicit duplicate, then reconcile.
      await client.query("DELETE FROM public.team_access_grants WHERE email='duplicate@example.invalid'");
      await client.query(migration);
    });
  } finally {
    await db?.end();
    await root.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await root.end();
  }
});
