import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';

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
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, email text UNIQUE NOT NULL, role text NOT NULL, status text NOT NULL DEFAULT 'active');
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
    `);
    await client.query(migration);
    await client.query(`INSERT INTO public.team_access_grants (email, job_title, country_scope, permissions, invited_user_id, created_by) VALUES
      ('eg@example.invalid', 'Egypt manager', '{EG}', '{customers:read}', '${staff}', '${ceo}'),
      ('qa@example.invalid', 'Qatar manager', '{QA}', '{products:read}', '${staffQa}', '${ceo}'),
      ('pending@example.invalid', 'Unattached invitation', '{QA}', '{admin:full}', NULL, '${ceo}')`);
    await client.query(migration);

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
  } finally {
    await db?.end();
    await root.query(`DROP DATABASE IF EXISTS ${databaseName}`);
    await root.end();
  }
});
