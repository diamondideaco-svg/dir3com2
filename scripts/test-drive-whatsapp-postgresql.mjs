// Isolated in-memory PostgreSQL only: no URLs, remote projects, credentials or sends.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
let db;
let connectPeer;
if (process.env.DRIVE_WHATSAPP_TEST_DATABASE_URL) {
 const url = new URL(process.env.DRIVE_WHATSAPP_TEST_DATABASE_URL);
 assert.ok(['postgres:', 'postgresql:'].includes(url.protocol) && ['127.0.0.1', 'localhost'].includes(url.hostname)
  && url.port === '5432' && url.pathname === '/dir3com_test' && !url.search, 'Only the explicit local CI fixture is allowed');
 const { Client } = await import('pg');
 const admin = new Client({ connectionString: url.toString() }); await admin.connect();
 const name = 'drive_wa_test_' + randomBytes(8).toString('hex');
 await admin.query(`CREATE DATABASE ${name}`); url.pathname = '/' + name;
 connectPeer = async () => { const client = new Client({ connectionString: url.toString() }); await client.connect(); return client; };
 const client = await connectPeer();
 db = { exec: sql => client.query(sql), query: (sql, params) => client.query(sql, params),
  async close() { await client.end(); await admin.query(`DROP DATABASE ${name}`); await admin.end(); } };
} else {
 const { PGlite } = await import(process.env.DRIVE_WHATSAPP_PGLITE_MODULE || '@electric-sql/pglite');
 db = new PGlite();
}
const read = path => fs.readFileSync(path, 'utf8');
const legacy = read('supabase/migrations/20260916234223_managed_drive_request_boundary.sql');
const years = read('supabase/migrations/20260918190000_drive_model_year_boundary.sql');
const catalog = read('supabase/migrations/20260927223137_drive_september27_managed_catalog.sql');
const acceptance = read('supabase/migrations/20260925150000_drive_customer_quote_acceptance.sql');
const authority = read('supabase/migrations/20260909190225_protected_operations_active_grant_authority.sql');
const migration = read('supabase/migrations/20260928044421_drive_whatsapp_outbox.sql');
const customer = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const operations = '00000000-0000-4000-8000-000000000003';
const foreignOperations = '00000000-0000-4000-8000-000000000004';
let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const scalar = async (query, params = []) => Object.values((await db.query(query, params)).rows[0])[0];
const service = async (name, params = []) => {
  await db.exec('SET ROLE service_role');
  try { return await scalar(`SELECT public.${name}`, params); } finally { await db.exec('RESET ROLE'); }
};
const asUser = async (id, query, params = []) => {
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('SET ROLE authenticated');
  try { return await scalar(query, params); } finally { await db.exec('RESET ROLE'); }
};
const request = async key => {
  const trip = { pickup: 'Cairo', dropoff: 'Giza', name: 'Isolated QA', phone: '+10000000001', acknowledged: true,
    currency: 'USD', minimumModelYear: null, acceptableModelYears: null, passengers: 2, luggage: 1,
    pickupAt: '2099-01-12T12:00', returnAt: '2099-01-13T12:00', mode: 'chauffeur', notes: '', specialRequest: '', flightNumber: '', flightArrival: '' };
  return asUser(customer, 'SELECT public.create_managed_drive_request($1,$2,$3::jsonb,$4)',
    ['safeerat-eg-jetour-t2', key.padEnd(20, '-'), JSON.stringify(trip), 'managed-eg-20260928-v3']);
};
const requestId = ref => scalar('SELECT id FROM public.marketplace_requests WHERE request_reference=$1', [ref]);
const sid = n => 'SM' + n.toString(16).padStart(32, '0');
const begin = row => service('begin_drive_whatsapp($1,$2)', [row.id, row.token]);
const finish = (row, outcome, message = null, error = null) => service('finish_drive_whatsapp($1,$2,$3,$4,$5)', [row.id, row.token, outcome, message, error]);
const receipt = (row, status, message = sid(1), token = row.token, phone = row.phone) => service('record_drive_whatsapp_receipt($1,$2,$3,$4,$5,$6)', [row.id, token, message, phone, status, null]);
const state = row => scalar('SELECT state FROM drive_notification_private.outbox WHERE id=$1', [row.id]);
const claim = () => service('claim_drive_whatsapp()');
const clear = () => db.exec('DELETE FROM drive_notification_private.receipts; DELETE FROM drive_notification_private.outbox; UPDATE drive_notification_private.settings SET budget_used=0,daily_limit=100,send_enabled=true;');

try {
 await db.exec(`DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
 END $$;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,email text,role text,status text,deleted_at timestamptz);
 CREATE TABLE public.team_access_grants(invited_user_id uuid,status text,access_level text,permissions text[],country_scope text[]);
 CREATE FUNCTION public.is_ceo_actor() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE FUNCTION public.normalize_admin_country_key(text) RETURNS text LANGUAGE sql AS $$ SELECT upper(btrim($1)) $$;
 CREATE TABLE public.marketplace_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_reference text,user_id uuid,drive_offer_id text,
 status text DEFAULT 'request_submitted',request_type text,requested_for timestamptz,traveller_count integer,
 customer_brief jsonb,marketplace_family text,supplier_name text,service_name text,next_action text,
 quote_amount numeric,quote_currency text,quote_expires_at timestamptz,updated_at timestamptz,payment_status text,
 transaction_method text DEFAULT 'request_to_confirm',fulfilment_method text DEFAULT 'request_to_confirm',handoff_type text DEFAULT 'none');
 CREATE TABLE public.drive_request_context(request_id uuid PRIMARY KEY,country text,offer_version text,supplier_amount numeric,supplier_currency text,trip jsonb,
 version integer DEFAULT 0,confirmed_vehicle text,confirmed_vehicle_year integer CHECK(confirmed_vehicle_year IN(2025,2026,2027)));
 CREATE TABLE public.drive_request_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid,actor_user_id uuid,country text,action text,new_status text,previous_status text,private_note text);
 `);
 for (const [id, role] of [[customer, 'customer'], [other, 'customer'], [operations, 'staff'], [foreignOperations, 'staff']]) {
  await db.query("INSERT INTO public.profiles VALUES($1,'local@example.invalid',$2,'active',NULL)", [id, role]);
 }
 await db.query("INSERT INTO public.team_access_grants VALUES($1,'active','scoped_staff',ARRAY['operations:read','operations:write'],ARRAY['EG']),($2,'active','scoped_staff',ARRAY['operations:read','operations:write'],ARRAY['SA'])", [operations, foreignOperations]);
 // Execute actual current authority and request/quote functions; only base tables are fixtures.
 await db.exec(authority.slice(authority.indexOf('CREATE OR REPLACE FUNCTION public.has_operational_access'), authority.indexOf('CREATE OR REPLACE FUNCTION public.is_admin_actor')));
 await db.exec(legacy.slice(legacy.indexOf('CREATE TABLE public.drive_managed_offers'), legacy.indexOf('ALTER TABLE public.marketplace_requests')));
 await db.exec(years.slice(years.indexOf('CREATE OR REPLACE FUNCTION public.create_managed_drive_request'), years.indexOf('CREATE FUNCTION public.review_managed_drive_request')));
 await db.exec(catalog);
 await db.exec(acceptance);
 await db.exec(migration);
 equal(await scalar('SELECT capture_enabled OR send_enabled FROM drive_notification_private.settings'), false, 'defaults disabled');
 equal(await claim(), null, 'disabled worker idle');
 await request('before-enabling');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 0, 'no unapproved capture');
 await db.exec('UPDATE drive_notification_private.settings SET capture_enabled=true,send_enabled=true;');
 await request('no-consent-record');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 0, 'no inferred opt-in');
 for (const [id, audience, phone] of [[customer, 'customer', '+10000000001'], [other, 'customer', '+10000000002'], [operations, 'operations', '+10000000003'], [foreignOperations, 'operations', '+10000000004']]) {
  await db.query("INSERT INTO drive_notification_private.subscriptions(user_id,audience,country,phone,language,consent_reference,verified_at,enabled) VALUES($1,$2,'EG',$3,'ar','ISOLATED-CONSENT',now(),true)", [id, audience, phone]);
 }
 const first = await request('with-approved-opt-in'); const id = await requestId(first.reference);
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 2, 'one customer and one EG Operations, no other owner/country');
 equal((await request('with-approved-opt-in')).replayed, true, 'original idempotency retained');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 2, 'retry never duplicates event/outbox');
 await assert.rejects(db.exec(`BEGIN; SELECT public.create_managed_drive_request('invalid','atomic-failure-key','{}','managed-eg-20260928-v3'); COMMIT;`));
 await db.exec('ROLLBACK;');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 2, 'failed request cannot queue');
 // Actual review transition and customer acceptance produce truthful event mapping.
 await asUser(operations, "SELECT public.review_managed_drive_request($1,0,'review')", [id]);
 equal(await scalar("SELECT count(*)::int FROM drive_notification_private.outbox WHERE action='review'"), 1, 'review only customer');
 await asUser(operations, "SELECT public.review_managed_drive_request($1,1,'confirm','QA vehicle',NULL,150,'USD',now()+interval '1 day',NULL)", [id]);
 equal(await scalar("SELECT expected_status FROM drive_notification_private.outbox WHERE action='confirm'"), 'awaiting_customer_acceptance', 'quote not booking');
 await asUser(customer, 'SELECT public.accept_managed_drive_quote($1,2)', [id]);
 equal(await scalar("SELECT count(*)::int FROM drive_notification_private.outbox WHERE action='customer_accept'"), 2, 'acceptance informs owner and Operations');
 equal(await scalar('SELECT next_action FROM public.marketplace_requests WHERE id=$1', [id]), 'payment_not_enabled', 'no payment/booking mutation');
 equal((await asUser(customer, 'SELECT public.accept_managed_drive_quote($1,2)', [id])).replayed, true, 'acceptance replay retained');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 6, 'acceptance replay never duplicates notices');
 equal((await asUser(operations, 'SELECT jsonb_agg(x) FROM public.get_drive_whatsapp_delivery($1) x', [id])).length, 6, 'Operations can inspect status');
 for (const user of [customer, other, foreignOperations]) {
  await assert.rejects(asUser(user, 'SELECT public.get_drive_whatsapp_delivery($1)', [id]), /OPERATIONS_REQUIRED/); checks++;
 }
 let row = await claim();
 equal(await begin(row), false, 'superseded event suppressed before sending');
 equal(await state(row), 'suppressed', 'stale state explicit');
 await clear(); await request('worker-lease-check');
 row = await claim(); const second = await claim();
 assert.notEqual(row.id, second.id); checks++;
 equal(await claim(), null, 'claimed row not delivered to next worker');
 equal(await begin({ ...row, token: other }), false, 'wrong lease cannot begin');
 equal(await begin(row), true, 'owner starts once');
 equal(await begin(row), false, 'same intent cannot begin twice');
 equal(await finish({ ...row, token: other }, 'accepted', sid(1)), false, 'wrong lease cannot complete');
 equal(await receipt(row, 'delivered', sid(1), other), false, 'wrong callback token rejected');
 equal(await receipt(row, 'delivered', sid(1), row.token, '+10000000099'), false, 'wrong recipient rejected');
 equal(await receipt(row, 'delivered'), true, 'callback before POST response accepted');
 equal(await finish(row, 'accepted', sid(1)), true, 'late HTTP completion retained');
 equal(await state(row), 'delivered', 'late HTTP cannot downgrade callback');
 await receipt(row, 'queued'); await receipt(row, 'failed'); await receipt(row, 'delivered');
 equal(await state(row), 'delivered', 'out-of-order failure cannot downgrade delivery');
 await receipt(row, 'read'); await receipt(row, 'sent');
 equal(await state(row), 'read', 'read final state never regresses');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.receipts WHERE outbox_id=$1', [row.id]), 5, 'duplicate receipts stored once');
 equal(await receipt(row, 'read', sid(2)), false, 'cannot replace provider SID');
 // Safe reclaim only before send intent; ambiguous transport is never retried.
 await db.query("UPDATE drive_notification_private.outbox SET lease_until=now()-interval '1 second' WHERE id=$1", [second.id]);
 const reclaimed = await claim(); equal(reclaimed.id, second.id, 'pre-send crash safely reclaimed');
 assert.notEqual(reclaimed.token, second.token); checks++;
 equal(await begin(second), false, 'expired owner cannot send after reclaim');
 equal(await begin(reclaimed), true, 'new lease can start');
 await db.query("UPDATE drive_notification_private.outbox SET lease_until=now()-interval '1 second' WHERE id=$1", [reclaimed.id]);
 equal(await claim(), null, 'send crash not reclaimed');
 equal(await state(reclaimed), 'unknown', 'expired send explicitly unknown');
 await receipt(reclaimed, 'sent', sid(2)); equal(await state(reclaimed), 'sent', 'late signed callback reconciles unknown');
 // Revocation at dispatch time applies even to already queued recipients.
 await clear(); await request('revoked-contact'); row = await claim();
 await db.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE user_id=(SELECT recipient_user_id FROM drive_notification_private.outbox WHERE id=$1)', [row.id]);
 equal(await begin(row), false, 'revoked subscription cannot send');
 await db.exec('UPDATE drive_notification_private.subscriptions SET enabled=true');
 await clear(); await request('country-revoked');
 await db.query("UPDATE drive_notification_private.outbox SET state='suppressed' WHERE audience='customer'");
 row = await claim();
 await db.query("UPDATE public.team_access_grants SET country_scope=ARRAY['SA'] WHERE invited_user_id=$1", [operations]);
 equal(await begin(row), false, 'revoked regional authority cannot send');
 await db.query("UPDATE public.team_access_grants SET country_scope=ARRAY['EG'] WHERE invited_user_id=$1", [operations]);
 await clear(); await request('budget-and-kill'); row = await claim();
 await db.exec('UPDATE drive_notification_private.settings SET send_enabled=false');
 equal(await begin(row), false, 'kill switch checked after claim');
 await db.exec('UPDATE drive_notification_private.settings SET send_enabled=true,daily_limit=1');
 equal(await begin(row), true, 'first budget debit'); await finish(row, 'unknown', null, 'SEND_OUTCOME_UNKNOWN');
 const limited = await claim(); equal(await begin(limited), false, 'global budget shared across recipients');
 equal(await state(row), 'unknown', 'unknown is never automatically retried');
 equal(await scalar('SELECT budget_used FROM drive_notification_private.settings'), 1, 'one global charge per send attempt');
 await clear(); await request('bounded-safe-retry'); row = await claim();
 // Isolate one recipient to measure the retry cap.
 await db.query("UPDATE drive_notification_private.outbox SET state='suppressed' WHERE id<>$1", [row.id]);
 for (let attempt = 1; attempt <= 3; attempt++) {
  equal(await begin(row), true, `safe attempt ${attempt}`); await finish(row, 'retry', null, 'TWILIO_20429');
  if (attempt < 3) { await db.exec("UPDATE drive_notification_private.outbox SET available_at=now() WHERE state='pending'"); row = await claim(); }
 }
 equal(await state(row), 'failed', 'safe retries capped'); equal(await claim(), null, 'no fourth send');
 // Table and function privilege boundaries.
 for (const role of ['anon', 'authenticated']) {
  equal(await scalar('SELECT has_schema_privilege($1,$2,$3)', [role, 'drive_notification_private', 'USAGE']), false, `${role} private schema denied`);
  for (const fn of ['claim_drive_whatsapp()', 'begin_drive_whatsapp(uuid,uuid)', 'finish_drive_whatsapp(uuid,uuid,text,text,text)', 'record_drive_whatsapp_receipt(uuid,uuid,text,text,text,text)']) {
   equal(await scalar('SELECT has_function_privilege($1,$2,$3)', [role, 'public.' + fn, 'EXECUTE']), false, `${role} worker denied`);
  }
 }
 equal(await scalar("SELECT has_table_privilege('service_role','drive_notification_private.outbox','UPDATE')"), false, 'worker cannot bypass lease RPC with table write');
 equal(await scalar("SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='drive_notification_private' AND c.relkind='r' AND c.relrowsecurity"), 4, 'RLS on all new tables');
 if (connectPeer) {
  await clear(); await request('real-concurrent-claims');
  const a = await connectPeer(); const b = await connectPeer();
  try {
   await a.query('SET ROLE service_role'); await b.query('SET ROLE service_role');
   const claims = await Promise.all([a.query('SELECT public.claim_drive_whatsapp() AS result'), b.query('SELECT public.claim_drive_whatsapp() AS result')]);
   assert.notEqual(claims[0].rows[0].result.id, claims[1].rows[0].result.id); checks++;
   const same = claims[0].rows[0].result;
   const starts = await Promise.all([a.query('SELECT public.begin_drive_whatsapp($1,$2) AS result', [same.id, same.token]), b.query('SELECT public.begin_drive_whatsapp($1,$2) AS result', [same.id, same.token])]);
   equal(starts.filter(x => x.rows[0].result).length, 1, 'concurrent send intent wins once');
  } finally { await a.end(); await b.end(); }
 }
 console.log(`PASS ${checks} isolated PostgreSQL assertions (${connectPeer ? 'PostgreSQL with two-connection concurrency' : 'PGlite, sequential'}); no remote database or provider calls`);
} finally { await db.close(); }
