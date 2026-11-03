import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Client } from 'pg';
import { disposableTarget } from '../scripts/sandbox/apply-core-migration-to-db.mjs';

const forwardPath = '../supabase/migrations/20261103170449_task217_credential_binding_readonly.sql';
const roles = ['anon', 'authenticated', 'service_role'] as const;
type Role = typeof roles[number];
function fixtureTarget(url: string | undefined) {
  assert.ok(url, 'CONTINUITY_TEST_DATABASE_URL required; SQL evidence must not silently skip');
  const config = disposableTarget({ DATABASE_URL: url, SANDBOX_DISPOSABLE_DATABASE: 'true', NODE_ENV: process.env.NODE_ENV });
  assert.equal(config.database, 'dir3com_test');
  assert.ok(['127.0.0.1', '::1'].includes(config.host), 'Existing loopback CI PostgreSQL only');
  return config;
}

test('credential binding PG fixture target rejects remote, ambiguous and live database selectors before connecting', () => {
  const allowed = 'postgresql://postgres:postgres@127.0.0.1:5432/dir3com_test';
  assert.equal(fixtureTarget(allowed).database, 'dir3com_test');
  for (const value of [undefined, allowed + '?host=example.invalid', allowed + '#override',
    allowed.replace('127.0.0.1', 'example.invalid'), allowed.replace('dir3com_test', 'postgres'),
    allowed.replace('127.0.0.1', 'ynupwivgvwcyrsdhtkcc.supabase.co'),
    allowed.replace('127.0.0.1', 'rcrdjhoicbxiwgtyrift.supabase.co')]) {
    assert.throws(() => fixtureTarget(value));
  }
});

test('real disposable PostgreSQL credential binding delta: getter, unchanged financial gate, ACL and retained synthetic ledger', async t => {
  const config = fixtureTarget(process.env.CONTINUITY_TEST_DATABASE_URL);
  const database = 'dir3com_binding_' + randomUUID().replaceAll('-', '');
  const root = new Client(config);
  let db: Client | undefined, created = false;
  await root.connect();
  try {
    await root.query('CREATE DATABASE ' + database); created = true;
    db = new Client({ ...config, database }); await db.connect();
    const client = db;
    assert.equal((await client.query("SELECT current_setting('server_version_num')::int AS n")).rows[0].n / 10000 | 0, 17);
    await client.query(roles.map(role => 'DO $$ BEGIN CREATE ROLE ' + role + ' NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;').join('\n'));
    const original = readFileSync(new URL('../supabase/migrations/20261028174710_task217_dialogue_funding_admission.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const start = original.indexOf('CREATE SCHEMA IF NOT EXISTS private;');
    const end = original.indexOf('CREATE FUNCTION private.protect_dabra_dialogue_grant()');
    const getter = original.match(/CREATE FUNCTION public\.get_dabra_dialogue_funding_policy\(p_subject_hash text\)[\s\S]*?\nEND \$\$;/)?.[0];
    assert.ok(start > 0 && end > start && getter, 'Exact existing schema/getter fixture required');
    await client.query(original.slice(start, end) + getter + `
      REVOKE ALL ON FUNCTION public.get_dabra_dialogue_funding_policy(text) FROM PUBLIC,anon,authenticated,service_role;
      GRANT EXECUTE ON FUNCTION public.get_dabra_dialogue_funding_policy(text) TO service_role;
      UPDATE private.dabra_dialogue_funding_control SET enabled=true,subject_hashes=ARRAY[repeat('a',64)],
        profiles='[{"synthetic":true}]',max_attempt_cost_micros=18432;
      INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,reserved_credit_micros,enabled,proof,authorized_at) VALUES
        ('11111111-1111-4111-8111-111111111111','openai','SYNTHETIC_openai','SYNTHETIC_project','existing-credit',8564,6423,true,'{"synthetic":"openai"}',clock_timestamp()),
        ('22222222-2222-4222-8222-222222222222','anthropic','SYNTHETIC_anthropic','SYNTHETIC_project','existing-credit',73728,55296,false,'{"synthetic":"anthropic"}',clock_timestamp());
      INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros)
        SELECT ('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'33333333-3333-4333-8333-333333333333'::uuid,
          'intent.classify',repeat('a',64),CASE WHEN g<=3 THEN '22222222-2222-4222-8222-222222222222'::uuid ELSE '11111111-1111-4111-8111-111111111111'::uuid END,
          0,0,1,1,1,CASE WHEN g<=3 THEN 18432 ELSE 2141 END FROM generate_series(1,6) g;
    `);
    // All keys, identities and amounts in this disposable fixture are synthetic.
    const asRole = async (role: Role, sql: string, params: unknown[] = []) => {
      await client.query('BEGIN READ ONLY');
      try { await client.query('SET LOCAL ROLE ' + role); return await client.query(sql, params); }
      finally { await client.query('ROLLBACK'); }
    };
    const policy = async (subject: string | null) => (await asRole('service_role',
      'SELECT public.get_dabra_dialogue_funding_policy($1) AS value', [subject])).rows[0].value;
    const aclSql = `SELECT oid,proowner,proacl::text,prosecdef,proconfig FROM pg_proc
      WHERE oid='public.get_dabra_dialogue_funding_policy(text)'::regprocedure`;
    const tableAclSql = `SELECT relname,relowner,relrowsecurity,relforcerowsecurity,relacl::text FROM pg_class
      WHERE relnamespace='private'::regnamespace AND relkind='r' ORDER BY relname`;
    const protectedSql = `SELECT jsonb_build_object('control',to_jsonb(c)-'credential_bindings',
      'grants',(SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM private.dabra_dialogue_funding_grants g),
      'admissions',(SELECT jsonb_agg(to_jsonb(a) ORDER BY attempt_id) FROM private.dabra_dialogue_admissions a)) AS value
      FROM private.dabra_dialogue_funding_control c`;
    const beforePolicy = await policy('a'.repeat(64));
    assert.equal(await policy(null), null);
    const beforeAcl = (await client.query(aclSql)).rows;
    const beforeTables = (await client.query(tableAclSql)).rows;
    const beforeProtected = (await client.query(protectedSql)).rows;
    await client.query(readFileSync(new URL(forwardPath, import.meta.url), 'utf8'));
    await t.test('CREATE OR REPLACE preserves function OID, owner, ACL, SECURITY DEFINER, search path, table ACL and RLS', async () => {
      assert.deepEqual((await client.query(aclSql)).rows, beforeAcl);
      assert.deepEqual((await client.query(tableAclSql)).rows, beforeTables);
    });
    await t.test('service-only empty reference read is distinct from the original Customer subject path', async () => {
      assert.deepEqual(await policy(null), { credentialBindings: {} });
      assert.deepEqual(await policy('a'.repeat(64)), beforePolicy);
      for (const subject of ['invalid', 'b'.repeat(64), '']) assert.equal(await policy(subject), null);
      for (const role of ['anon', 'authenticated'] as const) {
        for (const subject of [null, 'a'.repeat(64)]) {
          await assert.rejects(() => asRole(role, 'SELECT public.get_dabra_dialogue_funding_policy($1)', [subject]),
            { code: '42501' });
        }
      }
      await assert.rejects(() => asRole('service_role', 'SELECT credential_bindings FROM private.dabra_dialogue_funding_control'),
        { code: '42501' });
      const privileges = await client.query(`SELECT
        has_function_privilege('service_role','public.get_dabra_dialogue_funding_policy(text)','EXECUTE') AS service,
        has_function_privilege('anon','public.get_dabra_dialogue_funding_policy(text)','EXECUTE') AS anon,
        has_function_privilege('authenticated','public.get_dabra_dialogue_funding_policy(text)','EXECUTE') AS customer`);
      assert.deepEqual(privileges.rows, [{ service: true, anon: false, customer: false }]);
    });
    await t.test('column constraint rejects unknown providers and noncanonical references', async () => {
      for (const value of [[], false, 42, 'reference', { all: 'f'.repeat(64) },
        { deepseek: null }, { deepseek: 42 }, { deepseek: 'bad' },
        { deepseek: 'F'.repeat(64) }, { deepseek: 'f'.repeat(63) }, { deepseek: 'f'.repeat(65) }]) {
        await assert.rejects(() => client.query('UPDATE private.dabra_dialogue_funding_control SET credential_bindings=$1::jsonb', [JSON.stringify(value)]),
          { code: '23514' });
      }
    });
    await t.test('one-provider and all-seven synthetic bindings are read-only and never contain financial fields', async () => {
      const providers = ['openai', 'gemini', 'anthropic', 'xai', 'deepseek', 'qwen', 'mistral'];
      const single = { deepseek: 'f'.repeat(64) };
      await client.query('UPDATE private.dabra_dialogue_funding_control SET credential_bindings=$1::jsonb', [JSON.stringify(single)]);
      assert.deepEqual(await policy(null), { credentialBindings: single });
      const all = Object.fromEntries(providers.map(p => [p, 'e'.repeat(64)]));
      await client.query('UPDATE private.dabra_dialogue_funding_control SET credential_bindings=$1::jsonb', [JSON.stringify(all)]);
      assert.deepEqual(await policy(null), { credentialBindings: all });
      assert.deepEqual(await policy('a'.repeat(64)), beforePolicy);
      await client.query('UPDATE private.dabra_dialogue_funding_control SET enabled=false');
      assert.equal(await policy('a'.repeat(64)), null);
      assert.deepEqual(await policy(null), { credentialBindings: all });
      await client.query('UPDATE private.dabra_dialogue_funding_control SET enabled=true');
    });
    await t.test('no grant, admission, budget or previous control value is changed by references or reads', async () => {
      assert.deepEqual((await client.query(protectedSql)).rows, beforeProtected);
      const ledger = (await client.query('SELECT count(*)::int AS n,sum(cost_micros)::int AS held FROM private.dabra_dialogue_admissions')).rows;
      assert.deepEqual(ledger, [{ n: 6, held: 61719 }]);
    });
    await t.test('a missing singleton produces SQL NULL rather than an empty successful reference read', async () => {
      await client.query('BEGIN');
      try {
        await client.query('DELETE FROM private.dabra_dialogue_funding_control');
        assert.equal((await client.query('SELECT public.get_dabra_dialogue_funding_policy(NULL) AS value')).rows[0].value, null);
      } finally { await client.query('ROLLBACK'); }
    });
  } finally {
    try { await db?.end(); }
    finally {
      try { if (created) await root.query('DROP DATABASE ' + database); }
      finally { await root.end(); }
    }
  }
});
