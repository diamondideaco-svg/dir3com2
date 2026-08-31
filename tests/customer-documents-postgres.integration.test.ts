import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const migration = fs.readFileSync(
  path.resolve('supabase/migrations/20260730220000_create_verification_engine.sql'),
  'utf8',
);
const historicalRlsMigration = fs.readFileSync(
  path.resolve('supabase/migrations/20260801103000_add_rls_for_engine_domains.sql'),
  'utf8',
);

async function withDatabase(run: (client: Client) => Promise<void>) {
  assert.ok(databaseUrl, 'TEST_DATABASE_URL or DATABASE_URL is required');
  const hostname = new URL(databaseUrl).hostname;
  assert.ok(
    hostname === '127.0.0.1' || hostname === 'localhost',
    'Customer document migration tests require an isolated local PostgreSQL database',
  );
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

test('verification document migration is repeatable and owner RLS is DB-enforced', async () => {
  await withDatabase(async (client) => {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await client.query('CREATE SCHEMA IF NOT EXISTS auth;');
    await client.query(`
      DO $$ BEGIN
        CREATE ROLE anon NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      DO $$ BEGIN
        CREATE ROLE authenticated NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS uuid
      LANGUAGE sql
      STABLE
      AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);

    await client.query(migration);
    await client.query(migration);

    const table = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'verification_documents'
    `);
    assert.equal(table.rowCount, 1);

    await client.query(`
      ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public TO authenticated, anon;
      GRANT SELECT ON public.verification_documents TO authenticated;
      REVOKE ALL ON public.verification_documents FROM anon;
      CREATE POLICY customer_read_own_verification_documents
        ON public.verification_documents
        FOR SELECT
        TO authenticated
        USING (
          owner_type = 'customer'
          AND owner_id = (SELECT auth.uid())::text
        );
    `);

    const customerA = '11111111-1111-4111-8111-111111111111';
    const customerB = '22222222-2222-4222-8222-222222222222';
    await client.query(
      `INSERT INTO public.verification_documents (document_type, owner_type, owner_id)
       VALUES ('passport', 'customer', $1), ('passport', 'customer', $2)`,
      [customerA, customerB],
    );

    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [customerA]);

      const visible = await client.query<{ owner_id: string }>(
        'SELECT owner_id FROM public.verification_documents ORDER BY owner_id',
      );
      assert.deepEqual(visible.rows, [{ owner_id: customerA }]);

      const foreign = await client.query(
        'SELECT id FROM public.verification_documents WHERE owner_id = $1',
        [customerB],
      );
      assert.equal(foreign.rowCount, 0);

      const spoof = await client.query(
        'SELECT id FROM public.verification_documents WHERE owner_type = $1 AND owner_id = $2',
        ['customer', customerB],
      );
      assert.equal(spoof.rowCount, 0);
    } finally {
      await client.query('ROLLBACK');
    }

    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE authenticated');
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [
        '33333333-3333-4333-8333-333333333333',
      ]);
      const partner = await client.query('SELECT id FROM public.verification_documents');
      assert.equal(partner.rowCount, 0);
    } finally {
      await client.query('ROLLBACK');
    }

    await client.query('BEGIN');
    try {
      await client.query('SET LOCAL ROLE anon');
      await assert.rejects(
        client.query('SELECT id FROM public.verification_documents'),
        /permission denied/i,
      );
    } finally {
      await client.query('ROLLBACK');
    }
  });
});

test('the historical engine-wide RLS migration is not directly deployable on PostgreSQL 17', async () => {
  await withDatabase(async (client) => {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await client.query(`
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        role text NOT NULL
      );
    `);
    await client.query(migration);

    await assert.rejects(
      client.query(historicalRlsMigration),
      /syntax error at or near "NOT"/i,
    );
  });
});
