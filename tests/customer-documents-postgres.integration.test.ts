import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const reconciliationMigration = fs.readFileSync(
  path.resolve('supabase/migrations/20260831171448_reconcile_verification_documents_postgres17.sql'),
  'utf8',
);
const historicalEngineMigration = fs.readFileSync(
  path.resolve('supabase/migrations/20260730220000_create_verification_engine.sql'),
  'utf8',
);
const historicalRlsMigration = fs.readFileSync(
  path.resolve('supabase/migrations/20260801103000_add_rls_for_engine_domains.sql'),
  'utf8',
);

const customerA = '11111111-1111-4111-8111-111111111111';
const customerB = '22222222-2222-4222-8222-222222222222';
const partner = '33333333-3333-4333-8333-333333333333';
const admin = '44444444-4444-4444-8444-444444444444';

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
    const version = await client.query<{ server_version: string }>(
      "select current_setting('server_version') as server_version",
    );
    assert.equal(version.rows[0]?.server_version.split('.')[0], '17');
    await run(client);
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
}

async function resetCurrentCoreShape(client: Client) {
  await client.query(`
    DROP SCHEMA IF EXISTS public CASCADE;
    DROP SCHEMA IF EXISTS auth CASCADE;
    CREATE SCHEMA public;
    CREATE SCHEMA auth;

    DO $$ BEGIN
      CREATE ROLE anon NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE ROLE authenticated NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
    EXCEPTION WHEN duplicate_object THEN
      ALTER ROLE service_role BYPASSRLS;
    END $$;

    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;

    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      full_name text NOT NULL DEFAULT 'Test User',
      email text NOT NULL DEFAULT 'test@example.invalid',
      role text NOT NULL DEFAULT 'customer',
      status text NOT NULL DEFAULT 'active',
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON public.profiles TO authenticated;
    CREATE POLICY profiles_self_select
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (id = (SELECT auth.uid()));
  `);
}

async function asRole<T>(
  client: Client,
  role: 'anon' | 'authenticated' | 'service_role',
  userId: string | null,
  run: () => Promise<T>,
) {
  await client.query('begin');
  try {
    await client.query(`set local role ${role}`);
    if (userId) {
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    }
    return await run();
  } finally {
    await client.query('rollback');
  }
}

async function seedActorsAndDocuments(client: Client) {
  await client.query(
    `INSERT INTO public.profiles (id, role)
     VALUES ($1, 'customer'), ($2, 'customer'), ($3, 'partner'), ($4, 'admin')`,
    [customerA, customerB, partner, admin],
  );

  const requests = await client.query<{ id: string; owner_id: string }>(
    `INSERT INTO public.verification_requests (request_type, owner_type, owner_id)
     VALUES
       ('identity', 'customer', $1),
       ('identity', 'customer', $2),
       ('compliance', 'partner', $3)
     RETURNING id, owner_id`,
    [customerA, customerB, partner],
  );

  const requestByOwner = new Map(requests.rows.map((row) => [row.owner_id, row.id]));
  await client.query(
    `INSERT INTO public.verification_documents
       (verification_request_id, document_type, owner_type, owner_id, file_url)
     VALUES
       ($1, 'passport', 'customer', $2, 'private/customer-a/passport.pdf'),
       ($3, 'passport', 'customer', $4, 'private/customer-b/passport.pdf'),
       ($5, 'license', 'partner', $6, 'private/partner/license.pdf')`,
    [
      requestByOwner.get(customerA),
      customerA,
      requestByOwner.get(customerB),
      customerB,
      requestByOwner.get(partner),
      partner,
    ],
  );
}

test('VERIFICATION_DOCUMENTS_RECONCILIATION = PASS on PostgreSQL 17 with ownership and admin isolation', async () => {
  await withDatabase(async (client) => {
    await resetCurrentCoreShape(client);
    await client.query(reconciliationMigration);
    await seedActorsAndDocuments(client);

    const tables = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'verification_requests',
          'verification_documents',
          'verification_reviews',
          'verification_status_history'
        )
      ORDER BY table_name
    `);
    assert.deepEqual(
      tables.rows.map((row) => row.table_name),
      [
        'verification_documents',
        'verification_requests',
        'verification_reviews',
        'verification_status_history',
      ],
    );

    const requiredDocumentColumns = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'verification_documents'
      ORDER BY ordinal_position
    `);
    assert.deepEqual(
      requiredDocumentColumns.rows.map((row) => row.column_name),
      [
        'id',
        'verification_request_id',
        'document_type',
        'owner_type',
        'owner_id',
        'file_url',
        'issue_date',
        'expiry_date',
        'verification_status',
        'verified_by',
        'review_notes',
        'created_at',
        'updated_at',
      ],
    );

    const security = await client.query<{ relname: string; relrowsecurity: boolean }>(`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE oid IN (
        'public.verification_requests'::regclass,
        'public.verification_documents'::regclass,
        'public.verification_reviews'::regclass,
        'public.verification_status_history'::regclass
      )
      ORDER BY relname
    `);
    assert.equal(security.rowCount, 4);
    assert.ok(security.rows.every((row) => row.relrowsecurity));

    const indexes = await client.query<{ indexname: string }>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'idx_verification_requests_owner',
          'idx_verification_documents_owner',
          'idx_verification_documents_request',
          'idx_verification_reviews_request',
          'idx_verification_status_history_request'
        )
      ORDER BY indexname
    `);
    assert.equal(indexes.rowCount, 5);

    const policies = await client.query<{ policyname: string }>(`
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (
          'verification_requests',
          'verification_documents',
          'verification_reviews',
          'verification_status_history'
        )
      ORDER BY policyname
    `);
    assert.deepEqual(
      policies.rows.map((row) => row.policyname),
      [
        'verification_documents_admin_all',
        'verification_documents_customer_select_own',
        'verification_requests_admin_all',
        'verification_requests_customer_select_own',
        'verification_reviews_admin_all',
        'verification_status_history_admin_all',
      ],
    );

    await asRole(client, 'authenticated', customerA, async () => {
      const visible = await client.query<{ owner_id: string }>(
        'SELECT owner_id FROM public.verification_documents ORDER BY owner_id',
      );
      assert.deepEqual(visible.rows, [{ owner_id: customerA }]);

      const related = await client.query<{ status: string }>(`
        SELECT request.status
        FROM public.verification_documents document
        LEFT JOIN public.verification_requests request
          ON request.id = document.verification_request_id
      `);
      assert.deepEqual(related.rows, [{ status: 'Pending' }]);

      const foreign = await client.query(
        'SELECT id FROM public.verification_documents WHERE owner_id = $1',
        [customerB],
      );
      assert.equal(foreign.rowCount, 0);

      const update = await client.query(
        "UPDATE public.verification_documents SET review_notes = 'spoofed' WHERE owner_id = $1",
        [customerA],
      );
      assert.equal(update.rowCount, 0);

      const deletion = await client.query(
        'DELETE FROM public.verification_documents WHERE owner_id = $1',
        [customerA],
      );
      assert.equal(deletion.rowCount, 0);

      await assert.rejects(
        client.query(
          `INSERT INTO public.verification_documents (document_type, owner_type, owner_id)
           VALUES ('passport', 'customer', $1)`,
          [customerB],
        ),
        /row-level security|permission denied/i,
      );
    });

    await asRole(client, 'authenticated', partner, async () => {
      const visible = await client.query('SELECT id FROM public.verification_documents');
      assert.equal(visible.rowCount, 0);
    });

    await asRole(client, 'anon', null, async () => {
      await assert.rejects(
        client.query('SELECT id FROM public.verification_documents'),
        /permission denied/i,
      );
    });

    await asRole(client, 'authenticated', admin, async () => {
      const visible = await client.query('SELECT id FROM public.verification_documents');
      assert.equal(visible.rowCount, 3);
      const request = await client.query<{ id: string }>(
        'SELECT id FROM public.verification_requests ORDER BY created_at LIMIT 1',
      );
      await client.query(
        `INSERT INTO public.verification_reviews (verification_request_id, reviewer_id, decision)
         VALUES ($1, $2, 'Approved')`,
        [request.rows[0]?.id, admin],
      );
    });

    await asRole(client, 'service_role', null, async () => {
      const visible = await client.query('SELECT id FROM public.verification_documents');
      assert.equal(visible.rowCount, 3);
    });

    const beforeRerun = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM public.verification_documents',
    );
    await client.query(reconciliationMigration);
    const afterRerun = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM public.verification_documents',
    );
    assert.equal(beforeRerun.rows[0]?.count, '3');
    assert.equal(afterRerun.rows[0]?.count, '3');
  });
});

test('reconciliation preserves an existing historical-canonical verification table and its data', async () => {
  await withDatabase(async (client) => {
    await resetCurrentCoreShape(client);
    await client.query(historicalEngineMigration);
    await client.query(
      `INSERT INTO public.verification_documents (document_type, owner_type, owner_id, metadata)
       VALUES ('passport', 'customer', $1, '{"preserved":true}'::jsonb)`,
      [customerA],
    );

    await client.query(reconciliationMigration);
    const preserved = await client.query<{ owner_id: string; metadata: { preserved?: boolean } }>(
      'SELECT owner_id, metadata FROM public.verification_documents',
    );
    assert.equal(preserved.rowCount, 1);
    assert.equal(preserved.rows[0]?.owner_id, customerA);
    assert.equal(preserved.rows[0]?.metadata.preserved, true);
  });
});

test('reconciliation fails closed when an existing verification_documents table is incompatible', async () => {
  await withDatabase(async (client) => {
    await resetCurrentCoreShape(client);
    await client.query(`
      CREATE TABLE public.verification_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        verification_request_id uuid,
        document_type text NOT NULL,
        owner_type text NOT NULL,
        owner_id uuid NOT NULL,
        file_url text,
        issue_date date,
        expiry_date date,
        verification_status text NOT NULL DEFAULT 'Pending',
        verified_by text,
        review_notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await assert.rejects(
      client.query(reconciliationMigration),
      /verification reconciliation refused: verification_documents\.owner_id has incompatible shape/i,
    );
    await client.query('rollback');
    const ownerColumn = await client.query<{ data_type: string }>(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'verification_documents'
        AND column_name = 'owner_id'
    `);
    assert.equal(ownerColumn.rows[0]?.data_type, 'uuid');
    assert.equal(
      (await client.query("SELECT to_regclass('public.verification_requests')::text AS relation")).rows[0]?.relation,
      null,
    );
  });
});

test('the historical engine-wide RLS migration remains unchanged and invalid on PostgreSQL 17', async () => {
  await withDatabase(async (client) => {
    await resetCurrentCoreShape(client);
    await client.query(historicalEngineMigration);

    await assert.rejects(
      client.query(historicalRlsMigration),
      /syntax error at or near "NOT"/i,
    );
    await client.query('rollback');
  });
});
