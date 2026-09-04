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
const hardeningMigration = readFileSync(
  new URL('../supabase/migrations/20260904210623_harden_dabra_provider_attempt_acl.sql', import.meta.url),
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
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO service_role;
    `);
    await db.query(migration);
    await db.query('GRANT UPDATE (model), REFERENCES (request_id) ON public.dabra_provider_attempts TO service_role');

    const ownerBefore = (await db.query(`
      SELECT c.relowner, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c WHERE c.oid = 'public.dabra_provider_attempts'::regclass
    `)).rows[0];
    const roleBefore = (await db.query(`
      SELECT oid, rolinherit, rolbypassrls
      FROM pg_roles WHERE rolname = 'service_role'
    `)).rows[0];
    const membershipsBefore = (await db.query(`
      SELECT roleid, member, grantor, admin_option, inherit_option, set_option
      FROM pg_auth_members
      WHERE roleid = 'service_role'::regrole OR member = 'service_role'::regrole
      ORDER BY roleid, member, grantor
    `)).rows;
    assert.equal(await hasPrivilege(db, 'service_role', 'UPDATE'), true, 'fixture must reproduce default UPDATE');
    assert.equal(await hasPrivilege(db, 'service_role', 'DELETE'), true, 'fixture must reproduce default DELETE');
    assert.equal(await hasPrivilege(db, 'service_role', 'TRUNCATE'), true, 'fixture must reproduce default TRUNCATE');
    assert.equal(await hasPrivilege(db, 'service_role', 'REFERENCES'), true, 'fixture must reproduce default REFERENCES');
    assert.equal(await hasPrivilege(db, 'service_role', 'TRIGGER'), true, 'fixture must reproduce default TRIGGER');
    assert.equal(await hasPrivilege(db, 'service_role', 'MAINTAIN'), true, 'fixture must reproduce PostgreSQL 17 MAINTAIN');

    await db.query(hardeningMigration);
    await db.query(hardeningMigration);

    const ownerAfter = (await db.query(`
      SELECT c.relowner, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c WHERE c.oid = 'public.dabra_provider_attempts'::regclass
    `)).rows[0];
    const roleAfter = (await db.query(`
      SELECT oid, rolinherit, rolbypassrls
      FROM pg_roles WHERE rolname = 'service_role'
    `)).rows[0];
    const membershipsAfter = (await db.query(`
      SELECT roleid, member, grantor, admin_option, inherit_option, set_option
      FROM pg_auth_members
      WHERE roleid = 'service_role'::regrole OR member = 'service_role'::regrole
      ORDER BY roleid, member, grantor
    `)).rows;
    assert.deepEqual(ownerAfter, ownerBefore, 'hardening must preserve owner, RLS, and FORCE RLS');
    assert.deepEqual(roleAfter, roleBefore, 'hardening must not change service-role identity or attributes');
    assert.deepEqual(membershipsAfter, membershipsBefore, 'hardening must not change role inheritance or SET memberships');
    assert.equal(ownerAfter.relrowsecurity, true);
    assert.equal(ownerAfter.relforcerowsecurity, true);

    for (const privilege of ['SELECT', 'INSERT'] as const) {
      assert.equal(await hasPrivilege(db, 'service_role', privilege), true, `service_role ${privilege}`);
    }
    for (const privilege of ['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] as const) {
      assert.equal(await hasPrivilege(db, 'service_role', privilege), false, `service_role must not have ${privilege}`);
    }
    for (const role of ['anon', 'authenticated'] as const) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] as const) {
        assert.equal(await hasPrivilege(db, role, privilege), false, `${role} must not have ${privilege}`);
      }
    }
    assert.equal((await db.query(`
      SELECT count(*)::int AS count
      FROM pg_attribute
      WHERE attrelid = 'public.dabra_provider_attempts'::regclass
        AND attnum > 0 AND NOT attisdropped AND attacl IS NOT NULL
    `)).rows[0].count, 0, 'column ACLs must be cleared');
    const serviceAcl = await db.query(`
      SELECT acl.privilege_type, acl.is_grantable
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) acl
      JOIN pg_roles r ON r.oid = acl.grantee
      WHERE c.oid = 'public.dabra_provider_attempts'::regclass AND r.rolname = 'service_role'
      ORDER BY acl.privilege_type
    `);
    assert.deepEqual(serviceAcl.rows, [
      { privilege_type: 'INSERT', is_grantable: false },
      { privilege_type: 'SELECT', is_grantable: false },
    ]);

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
      await assertDenied(role, `INSERT INTO public.dabra_provider_attempts (
        request_id, provider, intent_class, language, route, started_at, completed_at,
        latency_ms, success, fallback_hop, grounding_status
      ) VALUES ('00000000-0000-4000-8000-000000000001', 'openai', 'internal', 'en', 'web', now(), now(), 0, true, 0, 'answered-general')`);
      await assertDenied(role, "SELECT * FROM public.get_dabra_provider_metrics(now() - interval '1 hour')");
    }

    const uniqueIndex = await db.query(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'dabra_provider_attempts_request_hop_unique_idx'
    `);
    assert.equal(uniqueIndex.rowCount, 1);
    assert.match(uniqueIndex.rows[0].indexdef, /UNIQUE.*request_id, fallback_hop/i);

    await db.query('begin');
    try {
      await db.query('set local role service_role');
      assert.equal(
        (await db.query("SELECT * FROM public.get_dabra_provider_metrics(now() - interval '1 hour')")).rowCount,
        0,
      );
      await db.query(`
        INSERT INTO public.dabra_provider_attempts (
          request_id, provider, model, intent_class, language, route, started_at, completed_at,
          latency_ms, success, fallback_hop, input_tokens, output_tokens, estimated_cost_usd,
          pricing_version, grounding_status
        ) VALUES
          ('11111111-1111-4111-8111-111111111111', 'openai', 'gpt-4.1-mini', 'general', 'en', 'fast-chat', now() - interval '100 milliseconds', now(), 100, true, 0, 100, 20, 0.000072, '2026-09-04:openai:gpt-4.1-mini', 'answered-general'),
          ('11111111-1111-4111-8111-111111111112', 'openai', 'gpt-4.1-mini', 'general', 'en', 'fast-chat', now() - interval '200 milliseconds', now(), 200, true, 0, 50, 10, 0.000036, '2026-09-04:openai:gpt-4.1-mini', 'answered-general'),
          ('22222222-2222-4222-8222-222222222221', 'openai', 'unknown-input-model', 'general', 'en', 'fast-chat', now() - interval '80 milliseconds', now(), 80, true, 0, NULL, 5, NULL, NULL, 'answered-general'),
          ('33333333-3333-4333-8333-333333333331', 'gemini', 'unknown-output-model', 'general', 'en', 'fast-chat', now() - interval '70 milliseconds', now(), 70, true, 0, 10, NULL, NULL, NULL, 'answered-general'),
          ('44444444-4444-4444-8444-444444444441', 'xai', 'all-unknown-model', 'general', 'en', 'fast-chat', now() - interval '60 milliseconds', now(), 60, true, 0, NULL, NULL, NULL, NULL, 'answered-general'),
          ('55555555-5555-4555-8555-555555555551', 'deepseek', 'partial-cost-model', 'general', 'en', 'fast-chat', now() - interval '50 milliseconds', now(), 50, true, 0, 30, 10, 0.000040, 'manual-test-current', 'answered-general'),
          ('55555555-5555-4555-8555-555555555552', 'deepseek', 'partial-cost-model', 'general', 'en', 'fast-chat', now() - interval '40 milliseconds', now(), 40, true, 0, 20, 5, NULL, NULL, 'answered-general')
      `);
      const metrics = await db.query("SELECT * FROM public.get_dabra_provider_metrics(now() - interval '1 hour')");
      assert.equal(metrics.rowCount, 5);
      const row = (provider: string, model: string) => metrics.rows.find((item) => item.provider === provider && item.model === model);
      const complete = row('openai', 'gpt-4.1-mini');
      assert.ok(complete);
      assert.equal(complete.attempt_count, '2');
      assert.equal(complete.input_tokens_known_sum, '150');
      assert.equal(complete.output_tokens_known_sum, '30');
      assert.equal(complete.input_tokens_unknown_count, '0');
      assert.equal(complete.output_tokens_unknown_count, '0');
      assert.equal(complete.token_coverage_complete, true);
      assert.equal(complete.total_input_tokens, '150');
      assert.equal(complete.total_output_tokens, '30');
      assert.equal(complete.estimated_cost_known_sum, '0.000108000000');
      assert.equal(complete.estimated_cost_unknown_count, '0');
      assert.equal(complete.cost_coverage_complete, true);
      assert.equal(complete.estimated_cost_usd, '0.000108000000');
      assert.ok(complete.last_used);
      assert.ok(complete.last_success);

      const unknownInput = row('openai', 'unknown-input-model');
      assert.ok(unknownInput);
      assert.equal(unknownInput.input_tokens_known_sum, null);
      assert.equal(unknownInput.input_tokens_unknown_count, '1');
      assert.equal(unknownInput.output_tokens_known_sum, '5');
      assert.equal(unknownInput.total_input_tokens, null);
      assert.equal(unknownInput.total_output_tokens, '5');
      assert.equal(unknownInput.token_coverage_complete, false);

      const unknownOutput = row('gemini', 'unknown-output-model');
      assert.ok(unknownOutput);
      assert.equal(unknownOutput.input_tokens_known_sum, '10');
      assert.equal(unknownOutput.output_tokens_known_sum, null);
      assert.equal(unknownOutput.output_tokens_unknown_count, '1');
      assert.equal(unknownOutput.total_output_tokens, null);

      const allUnknown = row('xai', 'all-unknown-model');
      assert.ok(allUnknown);
      assert.equal(allUnknown.input_tokens_known_sum, null);
      assert.equal(allUnknown.output_tokens_known_sum, null);
      assert.equal(allUnknown.total_input_tokens, null);
      assert.equal(allUnknown.total_output_tokens, null);
      assert.equal(allUnknown.estimated_cost_known_sum, null);
      assert.equal(allUnknown.estimated_cost_usd, null);

      const partialCost = row('deepseek', 'partial-cost-model');
      assert.ok(partialCost);
      assert.equal(partialCost.token_coverage_complete, true);
      assert.equal(partialCost.estimated_cost_known_sum, '0.000040000000');
      assert.equal(partialCost.estimated_cost_unknown_count, '1');
      assert.equal(partialCost.cost_coverage_complete, false);
      assert.equal(partialCost.estimated_cost_usd, null);
      await db.query('commit');
    } finally {
      await db.query('rollback').catch(() => undefined);
    }

    const concurrentClients = [new Client({ connectionString: isolatedUrl.toString() }), new Client({ connectionString: isolatedUrl.toString() })];
    await Promise.all(concurrentClients.map((entry) => entry.connect()));
    const concurrentInsert = async (entry: Client, fallbackHop: number) => {
      await entry.query('begin');
      try {
        await entry.query('set local role service_role');
        await entry.query(`
          INSERT INTO public.dabra_provider_attempts (
            request_id, provider, model, intent_class, language, route, started_at, completed_at,
            latency_ms, success, fallback_hop, grounding_status
          ) VALUES ('66666666-6666-4666-8666-666666666661', 'mistral', 'mistral-small-latest', 'general', 'en', 'fast-chat', now(), now(), 0, true, $1, 'answered-general')
        `, [fallbackHop]);
        await entry.query('commit');
      } catch (error) {
        await entry.query('rollback');
        throw error;
      }
    };
    try {
      const duplicateRace = await Promise.allSettled(concurrentClients.map((entry) => concurrentInsert(entry, 0)));
      assert.equal(duplicateRace.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = duplicateRace.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      assert.match(String((rejected?.reason as { code?: string })?.code ?? rejected?.reason), /23505/);
      await concurrentInsert(concurrentClients[0], 1);
      const logicalAttempts = await db.query("SELECT fallback_hop FROM public.dabra_provider_attempts WHERE request_id = '66666666-6666-4666-8666-666666666661' ORDER BY fallback_hop");
      assert.deepEqual(logicalAttempts.rows.map((row) => row.fallback_hop), [0, 1]);
    } finally {
      await Promise.all(concurrentClients.map((entry) => entry.end().catch(() => undefined)));
    }
    await assertDenied('service_role', "UPDATE public.dabra_provider_attempts SET model = 'forged'");
    await assertDenied('service_role', 'DELETE FROM public.dabra_provider_attempts');
    await assertDenied('service_role', 'TRUNCATE public.dabra_provider_attempts');

    for (const role of ['anon', 'authenticated', 'service_role'] as const) {
      await db.query('begin');
      try {
        await db.query(`DO $$ BEGIN EXECUTE format('GRANT %I TO ${role}', current_user); END $$`);
        await assert.rejects(db.query(hardeningMigration), new RegExp(`${role} can inherit or assume`, 'i'));
      } finally {
        await db.query('rollback');
      }
    }
  } finally {
    await client?.end().catch(() => undefined);
    await root.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]).catch(() => undefined);
    await root.query(`DROP DATABASE IF EXISTS ${databaseName}`).catch(() => undefined);
    await root.end();
  }
});

async function hasPrivilege(db: Client, role: string, privilege: string): Promise<boolean> {
  const result = await db.query<{ allowed: boolean }>(
    `SELECT has_table_privilege($1, 'public.dabra_provider_attempts', $2) AS allowed`,
    [role, privilege],
  );
  return result.rows[0].allowed;
}
