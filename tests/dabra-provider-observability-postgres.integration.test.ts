import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const migration = readFileSync(
  new URL('../supabase/migrations/20260904130954_dabra_provider_observability.sql', import.meta.url),
  'utf8',
);

test('DABRA provider observability is append-only and isolated on PostgreSQL 17', async () => {
  assert.ok(databaseUrl, 'TEST_DATABASE_URL or DATABASE_URL is required');
  const parsedUrl = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsedUrl.hostname), 'Test requires isolated local PostgreSQL');
  assert.equal(parsedUrl.pathname, '/dir3com_test', 'Test requires the disposable dir3com_test database');
  const databaseName = `dir3com_dabra_observability_${randomBytes(8).toString('hex')}`;
  const root = new Client({ connectionString: databaseUrl });
  let client: Client | null = null;
  await root.connect();
  try {
    await root.query(`CREATE DATABASE ${databaseName}`);
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    client = new Client({ connectionString: isolatedUrl.toString() });
    await client.connect();
    const db = client;
    assert.equal((await db.query("select current_setting('server_version') as version")).rows[0].version.split('.')[0], '17');
    await db.query(`
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN ALTER ROLE service_role BYPASSRLS; END $$;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `);
    await db.query(migration);

    const columns = await db.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dabra_provider_attempts'
      ORDER BY ordinal_position
    `);
    assert.deepEqual(columns.rows.map((row) => row.column_name), [
      'attempt_id', 'request_id', 'provider', 'model', 'intent_class', 'language', 'route',
      'started_at', 'completed_at', 'latency_ms', 'success', 'error_category', 'fallback_from',
      'fallback_reason', 'fallback_hop', 'input_tokens', 'output_tokens', 'estimated_cost_usd',
      'pricing_version', 'grounding_status', 'created_at',
    ]);

    async function assertDenied(role: 'anon' | 'authenticated' | 'service_role', sql: string) {
      await db.query('begin');
      try {
        await db.query(`set local role ${role}`);
        await assert.rejects(db.query(sql), /permission denied/i);
      } finally {
        await db.query('rollback');
      }
    }

    for (const role of ['anon', 'authenticated'] as const) {
      await assertDenied(role, 'SELECT * FROM public.dabra_provider_attempts');
      await assertDenied(role, "SELECT * FROM public.get_dabra_provider_metrics(now() - interval '1 hour')");
    }

    await db.query('begin');
    try {
      await db.query('set local role service_role');
      await db.query(`
        INSERT INTO public.dabra_provider_attempts (
          request_id, provider, model, intent_class, language, route, started_at, completed_at,
          latency_ms, success, fallback_hop, input_tokens, output_tokens, estimated_cost_usd,
          pricing_version, grounding_status
        ) VALUES (
          '11111111-1111-4111-8111-111111111111', 'openai', 'gpt-4.1-mini', 'general', 'en',
          'fast-chat', now() - interval '100 milliseconds', now(), 100, true, 0, 100, 20,
          0.000072, '2026-09-04:2025-04-14', 'answered-general'
        )
      `);
      const metrics = await db.query("SELECT * FROM public.get_dabra_provider_metrics(now() - interval '1 hour')");
      assert.equal(metrics.rowCount, 1);
      assert.equal(metrics.rows[0].provider, 'openai');
      assert.equal(metrics.rows[0].attempt_count, '1');
      assert.equal(metrics.rows[0].success_count, '1');
      assert.equal(metrics.rows[0].failure_count, '0');
      assert.equal(metrics.rows[0].timeout_count, '0');
      assert.equal(metrics.rows[0].p99_latency_ms, '100.00');
      assert.ok(metrics.rows[0].last_used);
      assert.ok(metrics.rows[0].last_success);
      await db.query('commit');
    } finally {
      await db.query('rollback').catch(() => undefined);
    }
    await assertDenied('service_role', "UPDATE public.dabra_provider_attempts SET model = 'forged'");
    await assertDenied('service_role', 'DELETE FROM public.dabra_provider_attempts');
  } finally {
    await client?.end().catch(() => undefined);
    await root.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]).catch(() => undefined);
    await root.query(`DROP DATABASE IF EXISTS ${databaseName}`).catch(() => undefined);
    await root.end();
  }
});
