import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const migration = readFileSync(
  new URL('../supabase/migrations/20260902163712_reconcile_customer_activity_postgres17.sql', import.meta.url),
  'utf8',
);
const customerA = '11111111-1111-4111-8111-111111111111';
const customerB = '22222222-2222-4222-8222-222222222222';
const partner = '33333333-3333-4333-8333-333333333333';
const adminUser = '44444444-4444-4444-8444-444444444444';

async function asRole<T>(
  client: Client,
  role: 'anon' | 'authenticated' | 'service_role',
  userId: string | null,
  run: () => Promise<T>,
) {
  await client.query('begin');
  try {
    await client.query(`set local role ${role}`);
    if (userId) await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return await run();
  } finally {
    await client.query('rollback');
  }
}

test('customer_activity reconciliation passes twice on PostgreSQL 17 with least-privilege access', async () => {
  assert.ok(databaseUrl, 'TEST_DATABASE_URL or DATABASE_URL is required');
  const parsedUrl = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsedUrl.hostname), 'Test requires isolated local PostgreSQL');
  assert.equal(parsedUrl.pathname, '/dir3com_test', 'Test requires the disposable dir3com_test database');
  const databaseName = `dir3com_customer_activity_${randomBytes(8).toString('hex')}`;
  const rootClient = new Client({ connectionString: databaseUrl });
  let client: Client | null = null;

  await rootClient.connect();
  try {
    await rootClient.query(`CREATE DATABASE ${databaseName}`);
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    client = new Client({ connectionString: isolatedUrl.toString() });
    await client.connect();

    const version = await client.query<{ version: string }>("select current_setting('server_version') as version");
    assert.equal(version.rows[0]?.version.split('.')[0], '17');
    await client.query(`
      CREATE SCHEMA auth;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN ALTER ROLE service_role BYPASSRLS; END $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        role text NOT NULL,
        status text NOT NULL DEFAULT 'active'
      );
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON public.profiles TO authenticated;
      CREATE POLICY profiles_self_select ON public.profiles FOR SELECT TO authenticated
        USING (id = (SELECT auth.uid()));
      CREATE OR REPLACE FUNCTION public.is_admin_actor() RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.profiles profile
          WHERE profile.id = auth.uid()
            AND lower(profile.role) IN ('admin', 'staff')
            AND lower(profile.status) = 'active'
        )
      $$;
      GRANT EXECUTE ON FUNCTION public.is_admin_actor() TO authenticated, service_role;

      CREATE TABLE public.customers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name text NOT NULL,
        email text NOT NULL
      );
      INSERT INTO public.profiles (id, role) VALUES
        ('${customerA}', 'customer'),
        ('${customerB}', 'customer'),
        ('${partner}', 'partner'),
        ('${adminUser}', 'admin');
      INSERT INTO public.customers (id, full_name, email) VALUES
        ('${customerA}', 'Customer A', 'a@example.invalid'),
        ('${customerB}', 'Customer B', 'b@example.invalid');
    `);

    await client.query(migration);
    await client.query(
      `INSERT INTO public.customer_activity (customer_id, activity_type, details)
       VALUES ($1, 'request_created', 'REQ-TEST')`,
      [customerA],
    );
    await client.query(migration);

    const relation = await client.query<{ relation: string }>(
      "SELECT to_regclass('public.customer_activity')::text AS relation",
    );
    assert.equal(relation.rows[0]?.relation, 'customer_activity');
    const rows = await client.query<{ activity_type: string }>('SELECT activity_type FROM public.customer_activity');
    assert.deepEqual(rows.rows, [{ activity_type: 'request_created' }]);

    const constraints = await client.query<{ contype: string }>(`
      SELECT contype
      FROM pg_constraint
      WHERE conrelid = 'public.customer_activity'::regclass
      ORDER BY contype
    `);
    assert.deepEqual(constraints.rows.map((row) => row.contype), ['f', 'p']);
    const index = await client.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'customer_activity'
        AND indexname = 'idx_customer_activity_customer_created_at'
    `);
    assert.equal(index.rowCount, 1);
    const security = await client.query<{ relrowsecurity: boolean }>(`
      SELECT relrowsecurity FROM pg_class WHERE oid = 'public.customer_activity'::regclass
    `);
    assert.equal(security.rows[0]?.relrowsecurity, true);
    const policies = await client.query<{ policyname: string; roles: string[] }>(`
      SELECT policyname, roles FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'customer_activity'
      ORDER BY policyname
    `);
    assert.deepEqual(policies.rows.map((row) => row.policyname), [
      'customer_activity_admin_all',
      'customer_activity_service_role_all',
    ]);

    await asRole(client, 'anon', null, async () => {
      await assert.rejects(client!.query('SELECT id FROM public.customer_activity'), /permission denied/i);
    });
    for (const actor of [customerA, partner]) {
      await asRole(client, 'authenticated', actor, async () => {
        const visible = await client!.query('SELECT id FROM public.customer_activity');
        assert.equal(visible.rowCount, 0);
        await assert.rejects(
          client!.query(
            "INSERT INTO public.customer_activity (customer_id, activity_type) VALUES ($1, 'forged')",
            [customerB],
          ),
          /row-level security/i,
        );
      });
    }
    await asRole(client, 'authenticated', adminUser, async () => {
      const visible = await client!.query('SELECT activity_type FROM public.customer_activity');
      assert.deepEqual(visible.rows, [{ activity_type: 'request_created' }]);
      await client!.query(
        "INSERT INTO public.customer_activity (customer_id, activity_type) VALUES ($1, 'admin_note')",
        [customerB],
      );
    });
    await asRole(client, 'service_role', null, async () => {
      const visible = await client!.query('SELECT id FROM public.customer_activity');
      assert.equal(visible.rowCount, 1);
    });
  } finally {
    await client?.end().catch(() => undefined);
    await rootClient.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]).catch(() => undefined);
    await rootClient.query(`DROP DATABASE IF EXISTS ${databaseName}`).catch(() => undefined);
    await rootClient.end();
  }
});

test('reconciliation preserves compatible historical customer_activity rows and adds the canonical FK', async () => {
  assert.ok(databaseUrl, 'TEST_DATABASE_URL or DATABASE_URL is required');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN ALTER ROLE service_role BYPASSRLS; END $$;
      CREATE TABLE public.customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE public.customer_activity (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id uuid NOT NULL,
        activity_type text NOT NULL,
        details text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE OR REPLACE FUNCTION public.is_admin_actor() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      INSERT INTO public.customers (id) VALUES ('${customerA}');
      INSERT INTO public.customer_activity (customer_id, activity_type) VALUES ('${customerA}', 'preserved');
    `);
    await client.query(migration);
    const preserved = await client.query<{ activity_type: string }>('SELECT activity_type FROM public.customer_activity');
    assert.deepEqual(preserved.rows, [{ activity_type: 'preserved' }]);
    const foreignKey = await client.query(`
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.customer_activity'::regclass AND contype = 'f'
    `);
    assert.equal(foreignKey.rowCount, 1);
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
});
