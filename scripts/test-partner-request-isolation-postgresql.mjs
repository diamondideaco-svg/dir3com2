import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { Client } from 'pg';

// Never use a live database. This harness creates and drops ONLY its own database.
const target = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(target.hostname)
  && /(^|[_-])test($|[_-])/.test(target.pathname.slice(1)), 'Isolated TEST_DATABASE_URL required');
const admin = new Client({ connectionString: target.href });
const name = `partner_request_test_${randomBytes(8).toString('hex')}`;
const baseline = readFileSync(new URL('../supabase/migrations/20260903215959_production_schema_baseline.sql', import.meta.url), 'utf8');
let db;
let created = false;
let checks = 0;
function check(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
await admin.connect();
try {
  await admin.query(`CREATE DATABASE "${name}"`); created = true;
  const url = new URL(target); url.pathname = `/${name}`;
  db = new Client({ connectionString: url.href }); await db.connect();
  await db.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
  for (const table of ['profiles', 'partners', 'products', 'product_availability', 'marketplace_requests', 'marketplace_request_audit_logs', 'marketplace_request_handoff_events']) {
    const sql = baseline.match(new RegExp(`CREATE TABLE "public"\\."${table}" \\([\\s\\S]*?\\n\\);`))?.[0];
    assert.ok(sql, table); await db.query(sql);
    await db.query(`ALTER TABLE public.${table} ADD PRIMARY KEY(id);`);
  }
  await db.query('CREATE UNIQUE INDEX handoff_once ON marketplace_request_handoff_events(request_id,handoff_type);');
  for (const rpc of ['get_partner_marketplace_requests', 'start_partner_marketplace_request_handoff']) {
    const sql = baseline.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\([\\s\\S]*?\\$function\\$\\s*;`))?.[0];
    assert.ok(sql, rpc); await db.query(sql);
  }
  const a = randomUUID(), b = randomUUID(), customer = randomUUID(), otherCustomer = randomUUID(), product = randomUUID();
  for (const [id, role] of [[a, 'partner'], [b, 'partner'], [customer, 'customer'], [otherCustomer, 'customer']]) {
    await db.query('INSERT INTO profiles(id,role,full_name,email) VALUES($1,$2,$2,$3)', [id, role, `${id}@example.invalid`]);
    if (role === 'partner') await db.query('INSERT INTO partners(id,slug,company_name,email) VALUES($1::uuid,$1::text,$2,$3)', [id, 'Isolated QA', `${id}@example.invalid`]);
  }
  await db.query("INSERT INTO products(id,name_ar,name_en,slug,country) VALUES($1::uuid,'اختبار معزول','Isolated QA',$1::text,'EG')", [product]);
  const map = who => db.query("INSERT INTO product_availability(product_id,partner_id,city) VALUES($1,$2,'QA')", [product, who]);
  const request = async (owner = customer) => {
    const id = randomUUID();
    await db.query("INSERT INTO marketplace_requests(id,user_id,product_id,request_reference,request_type) VALUES($1,$2,$3,$4,'request_to_confirm')", [id, owner, product, `REQ-QA-${id}`]);
    return id;
  };
  const read = async (actor, id) => (await db.query('SELECT * FROM get_partner_marketplace_requests($1,$2)', [actor, id])).rows;
  const handoff = (actor, id) => db.query('SELECT * FROM start_partner_marketplace_request_handoff($1,$2,$3)', [actor, id, '15555550100']);
  await map(a);
  const legacy = await request();
  await handoff(a, legacy);
  await map(b);
  const before = await read(b, legacy);
  check(before.length, 1, 'Historical reproduction: second mapped partner reads first partner handoff');
  console.log('HISTORICAL_SHARED_PRODUCT_READ_LEAK=REPRODUCED');
  const unbound = await request(otherCustomer);
  await handoff(b, unbound);
  check((await read(a, unbound)).length, 1, 'Both customer owners leak through shared product scope');
  console.log('HISTORICAL_SHARED_PRODUCT_HANDOFF_CLAIM=REPRODUCED');
  const forwards = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(file => file.endsWith('_partner_request_owner_boundary.sql'));
  assert.equal(forwards.length, 1, 'Forward ownership correction missing');
  const priorRows = (await db.query('SELECT * FROM marketplace_requests ORDER BY id')).rows;
  await db.query(readFileSync(new URL(`../supabase/migrations/${forwards[0]}`, import.meta.url), 'utf8'));
  check((await read(a, legacy)).length, 0, 'Unverified historical ownership fails closed');
  check((await read(b, legacy)).length, 0, 'Shared product does not authorize historical read');
  for (const actor of [a, b]) {
    await assert.rejects(handoff(actor, legacy), /REQUEST_PARTNER_SCOPE_DENIED/); checks++;
  }
  const afterRows = (await db.query('SELECT * FROM marketplace_requests ORDER BY id')).rows
    .map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'partner_owner_id')));
  check(afterRows, priorRows, 'No historical business data changed or ownership invented');
  const ambiguous = await request();
  check((await read(a, ambiguous)).length, 0, 'Ambiguous supplier is not an assignment');
  await assert.rejects(handoff(b, ambiguous), /REQUEST_PARTNER_SCOPE_DENIED/); checks++;
  await db.query('DELETE FROM product_availability WHERE partner_id=$1', [b]);
  const owned = await request();
  check((await read(a, owned)).length, 1, 'Unique server-derived owner may read');
  await map(b);
  check((await read(b, owned)).length, 0, 'New mapping cannot steal existing request');
  await assert.rejects(handoff(b, owned), /REQUEST_PARTNER_SCOPE_DENIED/); checks++;
  const first = await handoff(a, owned);
  const replay = await handoff(a, owned);
  check(first.rows[0].message_snapshot, replay.rows[0].message_snapshot, 'Replay snapshot immutable');
  check(replay.rows[0].replayed, true, 'Replay is not another event');
  check(Number((await db.query('SELECT count(*) FROM marketplace_request_handoff_events WHERE request_id=$1', [owned])).rows[0].count), 1, 'One handoff event');
  await assert.rejects(db.query('UPDATE marketplace_requests SET partner_owner_id=$1 WHERE id=$2', [b, owned]), /REQUEST_PARTNER_OWNER_IMMUTABLE/); checks++;
  await assert.rejects(db.query('UPDATE marketplace_requests SET user_id=$1 WHERE id=$2', [otherCustomer, owned]), /REQUEST_PARTNER_OWNER_IMMUTABLE/); checks++;
  await assert.rejects(db.query("INSERT INTO marketplace_requests(user_id,product_id,request_reference,request_type,partner_owner_id) VALUES($1,$2,'REQ-FORGED','request_to_confirm',$3)", [customer, product, b]), /REQUEST_PARTNER_OWNER_SERVER_ONLY/); checks++;
  // A request still owned by A cannot be taken by B, even when B wins timing.
  await db.query('DELETE FROM product_availability WHERE partner_id=$1', [b]);
  const concurrent = await request();
  const rollback = await request();
  await map(b);
  const other = new Client({ connectionString: url.href }); await other.connect();
  try {
    const race = await Promise.allSettled([
      handoff(a, concurrent),
      other.query('SELECT * FROM start_partner_marketplace_request_handoff($1,$2,$3)', [b, concurrent, '15555550100']),
    ]);
    check(race.map(result => result.status), ['fulfilled', 'rejected'], 'Cross-partner concurrent claim denied');
    assert.match(race[1].reason.message, /REQUEST_PARTNER_SCOPE_DENIED/); checks++;
    const retries = await Promise.all([
      handoff(a, concurrent),
      other.query('SELECT * FROM start_partner_marketplace_request_handoff($1,$2,$3)', [a, concurrent, '15555550101']),
    ]);
    check(retries.map(result => result.rows[0].replayed), [true, true], 'Concurrent replay stays idempotent');
    check(retries[0].rows[0].whatsapp_destination, retries[1].rows[0].whatsapp_destination, 'Replay cannot redirect destination');
  } finally { await other.end(); }
  await db.query(`CREATE FUNCTION qa_reject_handoff() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_AUDIT_FAILURE'; END $$;
    CREATE TRIGGER qa_reject_handoff BEFORE INSERT ON marketplace_request_handoff_events FOR EACH ROW EXECUTE FUNCTION qa_reject_handoff();`);
  await assert.rejects(handoff(a, rollback), /QA_AUDIT_FAILURE/); checks++;
  check((await db.query('SELECT handoff_type,handoff_reference FROM marketplace_requests WHERE id=$1', [rollback])).rows, [{ handoff_type: 'none', handoff_reference: null }], 'Audit failure rolls back request handoff state');
  check(Number((await db.query('SELECT count(*) FROM marketplace_request_handoff_events WHERE request_id=$1', [rollback])).rows[0].count), 0, 'Audit failure leaves no event');
  await db.query('DROP TRIGGER qa_reject_handoff ON marketplace_request_handoff_events');
  await db.query("UPDATE profiles SET status='inactive' WHERE id=$1", [a]);
  await assert.rejects(read(a, owned), /PARTNER_REQUEST_ACTOR_DENIED/); checks++;
  await assert.rejects(handoff(a, owned), /PARTNER_HANDOFF_ACTOR_DENIED/); checks++;
  await db.query("UPDATE profiles SET status='active' WHERE id=$1", [a]);
  await db.query('UPDATE partners SET deleted_at=now() WHERE id=$1', [a]);
  await assert.rejects(read(a, owned), /PARTNER_REQUEST_ACTOR_DENIED/); checks++;
  await assert.rejects(handoff(a, owned), /PARTNER_HANDOFF_ACTOR_DENIED/); checks++;
  await db.query('UPDATE partners SET deleted_at=NULL WHERE id=$1', [a]);
  await db.query('SET ROLE service_role');
  check((await read(a, owned)).length, 1, 'Authenticated server actor RPC remains usable');
  check((await read(b, owned)).length, 0, 'Service RPC still enforces partner ownership');
  await assert.rejects(handoff(b, owned), /REQUEST_PARTNER_SCOPE_DENIED/); checks++;
  await db.query('RESET ROLE');
  await assert.rejects(read(customer, owned), /PARTNER_REQUEST_ACTOR_DENIED/); checks++;
  await assert.rejects(handoff(otherCustomer, owned), /PARTNER_HANDOFF_ACTOR_DENIED/); checks++;
  // The managed Drive contract uses NULL product_id and stays Operations-only.
  await db.query('ALTER TABLE marketplace_requests ALTER COLUMN product_id DROP NOT NULL');
  const managed = randomUUID();
  await db.query("INSERT INTO marketplace_requests(id,user_id,request_reference,request_type) VALUES($1,$2,'REQ-MANAGED-QA','request_to_confirm')", [managed, customer]);
  check((await db.query('SELECT partner_owner_id FROM marketplace_requests WHERE id=$1', [managed])).rows[0].partner_owner_id, null, 'Managed Drive unchanged');
  check((await read(a, managed)).length, 0, 'No partner access to managed Operations request');
  await db.query('DELETE FROM product_availability WHERE partner_id=$1', [a]);
  check((await read(b, owned)).length, 0, 'Sole remaining product mapping is still not owner');
  check((await read(a, owned)).length, 0, 'Revoked product association removes access');
  await assert.rejects(handoff(a, owned), /REQUEST_PARTNER_SCOPE_DENIED/); checks++;
  for (const role of ['anon', 'authenticated']) {
    await db.query(`SET ROLE ${role}`);
    await assert.rejects(read(a, owned), /permission denied/); checks++;
    await assert.rejects(handoff(a, owned), /permission denied/); checks++;
    await db.query('RESET ROLE');
  }
  console.log(`PARTNER_REQUEST_ISOLATION_POSTGRESQL=PASS checks=${checks} production_used=false`);
} finally {
  if (db) await db.end();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
