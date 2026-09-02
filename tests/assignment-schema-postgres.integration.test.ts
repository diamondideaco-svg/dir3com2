import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const migration = readFileSync(
  new URL('../supabase/migrations/20260902125155_reconcile_assignment_engine_tables.sql', import.meta.url),
  'utf8',
);

test('assignment reconciliation passes twice on PostgreSQL 17 with Admin isolation', async () => {
  assert.ok(databaseUrl, 'TEST_DATABASE_URL or DATABASE_URL is required');
  const parsedUrl = new URL(databaseUrl);
  assert.ok(parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === 'localhost', 'Test requires isolated local PostgreSQL');
  assert.equal(parsedUrl.pathname, '/dir3com_test', 'Test requires the disposable dir3com_test database');
  const databaseName = `dir3com_assignment_${randomBytes(8).toString('hex')}`;
  assert.match(databaseName, /^dir3com_assignment_[a-f0-9]{16}$/);
  const admin = new Client({ connectionString: databaseUrl });
  let client: Client | null = null;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    client = new Client({ connectionString: isolatedUrl.toString() });
    await client.connect();
    assert.equal((await client.query("select current_setting('server_version') as version")).rows[0].version.split('.')[0], '17');
    await client.query(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN ALTER ROLE service_role BYPASSRLS; END $$;
      CREATE OR REPLACE FUNCTION public.is_admin_actor() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    `);
    await client.query(migration);
    await client.query(migration);

    const tables = await client.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('assignment_rules', 'assignment_logs')
      ORDER BY table_name
    `);
    assert.deepEqual(tables.rows.map((row) => row.table_name), ['assignment_logs', 'assignment_rules']);

    const policies = await client.query<{ policyname: string; roles: string[] }>(`
      SELECT policyname, roles FROM pg_policies
      WHERE schemaname = 'public' AND tablename IN ('assignment_rules', 'assignment_logs')
    `);
    assert.equal(policies.rows.length, 4);
    assert.ok(policies.rows.every((row) =>
      (row.policyname === 'admin_full_access' && row.roles.includes('authenticated'))
      || (row.policyname === 'service_role_full_access' && row.roles.includes('service_role'))
    ));

    await client.query('SET ROLE anon');
    try {
      await assert.rejects(client.query('SELECT * FROM public.assignment_rules'), /permission denied/);
    } finally {
      await client.query('RESET ROLE');
    }
  } finally {
    await client?.end().catch(() => undefined);
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]).catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`).catch(() => undefined);
    await admin.end();
  }
});
