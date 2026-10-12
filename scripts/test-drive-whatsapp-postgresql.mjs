// Isolated in-memory PostgreSQL only: no URLs, remote projects, credentials or sends.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
let db;
let connectPeer;
if (process.env.DRIVE_WHATSAPP_TEST_DATABASE_URL) {
 const url = new URL(process.env.DRIVE_WHATSAPP_TEST_DATABASE_URL);
 assert.ok(['postgres:', 'postgresql:'].includes(url.protocol) && ['127.0.0.1', 'localhost'].includes(url.hostname)
  && ['5432', '54339'].includes(url.port) && url.pathname === '/dir3com_test' && !url.search, 'Only the explicit local CI fixture is allowed');
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
const request = async (key, user = customer, phone = '+10000000001') => {
  const trip = { pickup: 'Cairo', dropoff: 'Giza', name: 'Isolated QA', phone, acknowledged: true,
    currency: 'USD', minimumModelYear: null, acceptableModelYears: null, passengers: 2, luggage: 1,
    pickupAt: '2099-01-12T12:00', returnAt: '2099-01-13T12:00', mode: 'chauffeur', notes: '', specialRequest: '', flightNumber: '', flightArrival: '' };
  return asUser(user, 'SELECT public.create_managed_drive_request($1,$2,$3::jsonb,$4)',
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
 // Current candidate forward migration, not merely the historical Twilio baseline.
 const forwardPath = fs.readdirSync('supabase/migrations').find(name => name.endsWith('_drive_whatsapp_kapso_operations_created.sql'));
 assert.ok(forwardPath);
 const forward = read('supabase/migrations/' + forwardPath);
 await db.exec(forward);
 equal(await scalar('SELECT operations_created_enabled FROM drive_notification_private.settings'), false, 'category disabled by default');
 equal(await scalar('SELECT operations_recipient_user_id IS NULL AND cardinality(operations_template_languages)=0 FROM drive_notification_private.settings'), true, 'no recipient or template invented');
 await db.exec(forward);
 equal(await scalar('SELECT operations_created_enabled FROM drive_notification_private.settings'), false, 'forward replay remains disabled');
 await clear(); await request('kapso-disabled-category');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 0, 'old capture switch does not enable new category');
 await db.query("UPDATE drive_notification_private.settings SET operations_created_enabled=true,operations_recipient_user_id=$1,operations_template_languages=ARRAY['ar']", [operations]);
 await db.query("UPDATE drive_notification_private.subscriptions SET language='en' WHERE user_id=$1", [operations]);
 await request('kapso-wrong-language');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 0, 'unapproved language cannot capture');
 await db.query("UPDATE drive_notification_private.subscriptions SET language='ar' WHERE user_id=$1", [operations]);
 // Another eligible EG manager still must not receive this single-recipient rollout.
 await db.query("UPDATE public.team_access_grants SET country_scope=ARRAY['EG'] WHERE invited_user_id=$1", [foreignOperations]);
 const selected = await request('kapso-selected-operations');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 1, 'only selected recipient, no customer or second eligible manager');
 equal(await scalar('SELECT recipient_user_id FROM drive_notification_private.outbox'), operations, 'configured recipient is authoritative');
 equal((await request('kapso-selected-operations')).replayed, true, 'request replay kept');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 1, 'single-category request retry dedup');
 const selectedId = await requestId(selected.reference);
 await asUser(operations, "SELECT public.review_managed_drive_request($1,0,'review')", [selectedId]);
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 1, 'review category not activated');
 await asUser(operations, "SELECT public.review_managed_drive_request($1,1,'confirm','QA vehicle',NULL,150,'USD',now()+interval '1 day',NULL)", [selectedId]);
 await asUser(customer, 'SELECT public.accept_managed_drive_quote($1,2)', [selectedId]);
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'), 1, 'quote and acceptance categories remain closed');
 equal(await scalar('SELECT next_action FROM public.marketplace_requests WHERE id=$1', [selectedId]), 'payment_not_enabled', 'Kapso scope does not enable payment/booking');
 row=await claim(); equal(await service('begin_kapso_drive_whatsapp($1,$2,$3)',[row.id,row.token,'10000000000166']),false,'superseded request suppressed');
 // Force failure after the capture trigger to prove atomic request/event/outbox rollback.
 await clear();
 const snapshot=await scalar("SELECT jsonb_build_array((SELECT count(*) FROM marketplace_requests),(SELECT count(*) FROM drive_request_events),(SELECT count(*) FROM drive_notification_private.outbox))");
 await db.exec("CREATE FUNCTION public.task166_fail_after_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ISOLATED_ROLLBACK'; END $$; CREATE TRIGGER zz_task166_fail AFTER INSERT ON public.drive_request_events FOR EACH ROW EXECUTE FUNCTION public.task166_fail_after_capture();");
 await assert.rejects(request('kapso-atomic-rollback'),/ISOLATED_ROLLBACK/); checks++;
 equal(await scalar("SELECT jsonb_build_array((SELECT count(*) FROM marketplace_requests),(SELECT count(*) FROM drive_request_events),(SELECT count(*) FROM drive_notification_private.outbox))"),snapshot,'after-capture failure rolls back request/event/outbox atomically');
 await db.exec('DROP TRIGGER zz_task166_fail ON public.drive_request_events; DROP FUNCTION public.task166_fail_after_capture();');
 const kapsoBegin = row => service('begin_kapso_drive_whatsapp($1,$2,$3)',[row.id,row.token,'10000000000166']);
 const kapsoReceipt = (row,state,message='wamid.ISOLATED166',sender='10000000000166',phone=row.phone) => service('record_kapso_drive_whatsapp_receipt($1,$2,$3,$4,$5)',[message,sender,phone,state,null]);
 await request('kapso-receipt-binding'); row=await claim();
 equal(await kapsoBegin({...row,token:other}),false,'Kapso wrong lease denied');
 equal(await kapsoBegin(row),true,'Kapso intent binds sender once');
 equal(await kapsoBegin(row),false,'Kapso intent cannot repeat');
 equal(await scalar('SELECT provider_phone_number_id FROM drive_notification_private.outbox WHERE id=$1',[row.id]),'10000000000166','sender durable before network');
 equal(await kapsoReceipt(row,'delivered'),false,'early callback without durable WAMID must retry');
 equal(await finish(row,'accepted',sid(19)),false,'Twilio SID cannot complete Kapso attempt');
 equal(await finish(row,'accepted','wamid.ISOLATED166'),true,'Kapso accepted WAMID durable');
 equal(await kapsoReceipt(row,'delivered','wamid.ISOLATED166','10000000000999'),false,'foreign sender cannot reconcile message');
 equal(await kapsoReceipt(row,'delivered','wamid.ISOLATED166','10000000000166','+10000000099'),false,'foreign recipient cannot reconcile message');
 equal(await kapsoReceipt(row,'delivered','wamid.UNBOUND'),false,'unbound message cannot correlate by phone');
 equal(await kapsoReceipt(row,'delivered'),true,'signed bound delivery reconciles');
 await kapsoReceipt(row,'sent'); await kapsoReceipt(row,'failed'); await kapsoReceipt(row,'delivered');
 equal(await state(row),'delivered','Kapso out-of-order/duplicate receipts cannot downgrade');
 await kapsoReceipt(row,'read'); await kapsoReceipt(row,'sent');
 equal(await state(row),'read','Kapso read never regresses');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.receipts WHERE outbox_id=$1',[row.id]),4,'Kapso state receipts dedup in database');
 await clear(); await request('kapso-consent-revoked'); row=await claim();
 await db.query('UPDATE drive_notification_private.subscriptions SET enabled=false WHERE user_id=$1',[operations]);
 equal(await kapsoBegin(row),false,'Kapso rechecks consent after capture/claim');
 await db.query('UPDATE drive_notification_private.subscriptions SET enabled=true WHERE user_id=$1',[operations]);
 await clear(); await request('kapso-authority-revoked'); row=await claim();
 await db.query("UPDATE public.team_access_grants SET country_scope=ARRAY['SA'] WHERE invited_user_id=$1",[operations]);
 equal(await kapsoBegin(row),false,'Kapso rechecks EG authority after claim');
 await db.query("UPDATE public.team_access_grants SET country_scope=ARRAY['EG'] WHERE invited_user_id=$1",[operations]);
 await clear(); await request('kapso-recipient-changed'); row=await claim();
 await db.query('UPDATE drive_notification_private.settings SET operations_recipient_user_id=$1',[foreignOperations]);
 equal(await kapsoBegin(row),false,'recipient rollout rechecked before intent');
 await db.query('UPDATE drive_notification_private.settings SET operations_recipient_user_id=$1',[operations]);
 await clear(); await request('kapso-category-kill'); row=await claim();
 await db.exec('UPDATE drive_notification_private.settings SET operations_created_enabled=false');
 equal(await kapsoBegin(row),false,'category kill switch rechecked after claim'); equal(await claim(),null,'disabled category cannot claim');
 await db.exec('UPDATE drive_notification_private.settings SET operations_created_enabled=true,operations_template_languages=ARRAY[]::text[]');
 equal(await kapsoBegin(row),false,'template language gate rechecked after claim');
 await db.exec("UPDATE drive_notification_private.settings SET operations_template_languages=ARRAY['ar']");
 await clear(); await request('kapso-unknown-after-crash'); row=await claim(); equal(await kapsoBegin(row),true,'intent before ambiguous crash');
 await db.query("UPDATE drive_notification_private.outbox SET lease_until=now()-interval '1 second' WHERE id=$1",[row.id]);
 equal(await claim(),null,'Kapso send crash never reclaimed'); equal(await state(row),'unknown','Kapso expired intent explicitly unknown');
 equal(await kapsoReceipt(row,'sent','wamid.NO_RESPONSE'),false,'lost HTTP WAMID requires manual reconciliation, no guessing');
 equal(await claim(),null,'unknown no blind resend');
 await clear(); await request('kapso-budget-one'); row=await claim();
 await db.exec('UPDATE drive_notification_private.settings SET daily_limit=1');
 equal(await kapsoBegin(row),true,'Kapso global budget debited'); await finish(row,'unknown',null,'SEND_OUTCOME_UNKNOWN');
 await request('kapso-budget-two'); const kapsoLimited=await claim();
 equal(await kapsoBegin(kapsoLimited),false,'Kapso daily budget caps next request');
 equal(await scalar('SELECT budget_used FROM drive_notification_private.settings'),1,'one debit for ambiguous send');
 for(const role of ['anon','authenticated']) for(const fn of ['begin_kapso_drive_whatsapp(uuid,uuid,text)','record_kapso_drive_whatsapp_receipt(text,text,text,text,text)'])
  equal(await scalar('SELECT has_function_privilege($1,$2,$3)',[role,'public.'+fn,'EXECUTE']),false,role+' Kapso RPC denied');
 equal(await scalar("SELECT has_table_privilege('service_role','drive_notification_private.outbox','UPDATE')"),false,'Kapso direct privileged table update still denied');
 equal(await scalar("SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='drive_notification_private' AND c.relkind='r' AND c.relrowsecurity"),4,'forward retains all RLS');
 if(connectPeer){
  await clear(); await request('kapso-concurrent-worker');
  const a=await connectPeer(); const b=await connectPeer();
  try{
   await a.query('SET ROLE service_role'); await b.query('SET ROLE service_role');
   const claims=await Promise.all([a.query('SELECT public.claim_drive_whatsapp() AS result'),b.query('SELECT public.claim_drive_whatsapp() AS result')]);
   equal(claims.filter(x=>x.rows[0].result!==null).length,1,'two workers claim one selected recipient only once');
   const selected=claims.find(x=>x.rows[0].result!==null).rows[0].result;
   const starts=await Promise.all([a.query('SELECT public.begin_kapso_drive_whatsapp($1,$2,$3) AS result',[selected.id,selected.token,'10000000000166']),b.query('SELECT public.begin_kapso_drive_whatsapp($1,$2,$3) AS result',[selected.id,selected.token,'10000000000166'])]);
   equal(starts.filter(x=>x.rows[0].result).length,1,'two Kapso send intents win exactly once');
  }finally{await a.end();await b.end();}
 }

 await db.query("UPDATE public.team_access_grants SET country_scope=ARRAY['SA'] WHERE invited_user_id=$1",[foreignOperations]);
 // Task192: actual customer forward; no mock replacement for consent/ownership/RLS.
 const customerForward = read('supabase/migrations/20261008115500_drive_whatsapp_customer_categories.sql');
 await db.exec(customerForward);
 equal(await scalar('SELECT cardinality(customer_actions)=0 AND cardinality(customer_template_languages)=0 FROM drive_notification_private.settings'),true,'customer defaults closed');
 await db.exec(customerForward);
 await clear(); await request('customer-defaults-closed');
 equal(await scalar("SELECT count(*)::int FROM drive_notification_private.outbox WHERE audience='customer'"),0,'existing capture/send switches cannot enable customer categories');
 equal(await scalar("SELECT count(*)::int FROM drive_notification_private.outbox WHERE audience='operations'"),1,'existing operations created retained');
 await db.exec("UPDATE drive_notification_private.settings SET operations_created_enabled=false,customer_actions=ARRAY['created','review','confirm','decline','customer_accept'],customer_template_languages=ARRAY['ar','en']");
 // Another customer's verified subscription deliberately shares the captured phone;
 // request owner must win before duplicate-phone constraints, never by phone alone.
 await db.query("UPDATE drive_notification_private.subscriptions SET phone='+10000000001' WHERE user_id=$1",[other]);
 await clear(); const customerRequest=await request('customer-owned-request'); const customerId=await requestId(customerRequest.reference);
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'),1,'customer only, no second customer/operations');
 equal(await scalar('SELECT recipient_user_id FROM drive_notification_private.outbox'),customer,'authoritative request owner');
 equal((await request('customer-owned-request')).replayed,true,'customer request replay preserved');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'),1,'customer request replay dedup');
 await assert.rejects(asUser(foreignOperations,"SELECT public.review_managed_drive_request($1,0,'review')",[customerId])); checks++;
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'),1,'unauthorized review cannot enqueue');
 await asUser(operations,"SELECT public.review_managed_drive_request($1,0,'review')",[customerId]);
 equal(await scalar("SELECT expected_status FROM drive_notification_private.outbox WHERE action='review'"),'under_review','customer review status');
 await asUser(operations,"SELECT public.review_managed_drive_request($1,1,'confirm','QA vehicle',NULL,150,'USD',now()+interval '1 day',NULL)",[customerId]);
 equal(await scalar("SELECT expected_status FROM drive_notification_private.outbox WHERE action='confirm'"),'awaiting_customer_acceptance','customer quote not confirmed booking');
 await assert.rejects(asUser(other,'SELECT public.accept_managed_drive_quote($1,2)',[customerId])); checks++;
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'),3,'foreign customer acceptance cannot enqueue');
 await asUser(customer,'SELECT public.accept_managed_drive_quote($1,2)',[customerId]);
 equal(await scalar("SELECT expected_status FROM drive_notification_private.outbox WHERE action='customer_accept'"),'awaiting_payment','customer acceptance truthful state');
 equal(await scalar('SELECT next_action FROM public.marketplace_requests WHERE id=$1',[customerId]),'payment_not_enabled','customer notices never enable booking/payment');
 equal((await asUser(customer,'SELECT public.accept_managed_drive_quote($1,2)',[customerId])).replayed,true,'customer acceptance replay');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'),4,'customer acceptance dedup');
 // Created/review/quote are now superseded and must not send.
 for(let i=0;i<3;i++){row=await claim();equal(await kapsoBegin(row),false,'superseded customer event suppressed');}
 row=await claim(); equal(row.action,'customer_accept','current customer event');
 equal(await kapsoBegin({...row,token:other}),false,'customer wrong lease denied');
 equal(await kapsoBegin(row),true,'customer current intent');
 equal(await kapsoBegin(row),false,'customer duplicate intent denied');
 equal(await finish({...row,token:other},'accepted','wamid.CUSTOMER192'),false,'customer forged completion denied');
 equal(await kapsoReceipt(row,'delivered','wamid.CUSTOMER192'),false,'customer early WAMID not attached by phone');
 equal(await finish(row,'accepted','wamid.CUSTOMER192'),true,'customer WAMID durable');
 equal(await kapsoReceipt(row,'delivered','wamid.CUSTOMER192','10000000000999'),false,'customer foreign sender denied');
 equal(await kapsoReceipt(row,'delivered','wamid.CUSTOMER192','10000000000166','+10000000099'),false,'customer foreign recipient denied');
 equal(await kapsoReceipt(row,'delivered','wamid.CUSTOMER192'),true,'customer delivery bound');
 await kapsoReceipt(row,'read','wamid.CUSTOMER192'); await kapsoReceipt(row,'failed','wamid.CUSTOMER192'); await kapsoReceipt(row,'sent','wamid.CUSTOMER192'); await kapsoReceipt(row,'read','wamid.CUSTOMER192');
 equal(await state(row),'read','customer receipt monotonic');
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.receipts WHERE outbox_id=$1',[row.id]),4,'customer receipts dedup');
 for(const language of ['ar','en']){
  await db.query("UPDATE drive_notification_private.subscriptions SET language=$1 WHERE user_id=$2",[language,customer]);
  await clear(); const result=await request('customer-decline-'+language); const declinedId=await requestId(result.reference);
  await asUser(operations,"SELECT public.review_managed_drive_request($1,0,'decline')",[declinedId]);
  equal(await scalar("SELECT language FROM drive_notification_private.outbox WHERE action='decline'"),language,'customer language snapshot '+language);
  equal(await scalar("SELECT expected_status FROM drive_notification_private.outbox WHERE action='decline'"),'declined','decline truthful status '+language);
 }
 await db.query("UPDATE drive_notification_private.subscriptions SET language='ar' WHERE user_id=$1",[customer]);
 // Capture-time and pre-send revalidation use the exact existing eligible function.
 const mutations=[
  ["UPDATE drive_notification_private.subscriptions SET enabled=false WHERE user_id=$1","UPDATE drive_notification_private.subscriptions SET enabled=true WHERE user_id=$1",'revoked consent'],
  ["UPDATE drive_notification_private.subscriptions SET verified_at=now()+interval '1 day' WHERE user_id=$1","UPDATE drive_notification_private.subscriptions SET verified_at=now() WHERE user_id=$1",'unverified contact'],
  ["UPDATE drive_notification_private.subscriptions SET phone='+10000000099' WHERE user_id=$1","UPDATE drive_notification_private.subscriptions SET phone='+10000000001' WHERE user_id=$1",'changed contact'],
  ["UPDATE public.profiles SET status='suspended' WHERE id=$1","UPDATE public.profiles SET status='active' WHERE id=$1",'inactive profile'],
  ["UPDATE public.profiles SET deleted_at=now() WHERE id=$1","UPDATE public.profiles SET deleted_at=NULL WHERE id=$1",'deleted profile'],
 ];
 for(const [change,restore,label] of mutations){
  await clear(); await db.query(change,[customer]);
  const captureAttempt=()=>request('customer-capture-'+label.replaceAll(' ','-'));
  if(['inactive profile','deleted profile'].includes(label)){
   await assert.rejects(captureAttempt,/AUTH_REQUIRED/); checks++;
  }else await captureAttempt();
  equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'),0,label+' blocks capture'); await db.query(restore,[customer]);
  await clear(); await request('customer-begin-'+label.replaceAll(' ','-')); row=await claim(); await db.query(change,[customer]);
  equal(await kapsoBegin(row),false,label+' blocks begin'); equal(await state(row),'suppressed',label+' suppressed'); await db.query(restore,[customer]);
 }
 await clear(); const changedOwner=await request('customer-owner-changed'); row=await claim();
 await db.query('UPDATE public.marketplace_requests SET user_id=$1 WHERE request_reference=$2',[other,changedOwner.reference]);
 equal(await kapsoBegin(row),false,'changed authoritative ownership blocks begin even shared phone');
 await clear(); await request('customer-category-kill'); row=await claim();
 await db.exec('UPDATE drive_notification_private.settings SET customer_actions=ARRAY[]::text[]');
 equal(await claim(),null,'customer category disabled cannot claim'); equal(await kapsoBegin(row),false,'customer category rechecked after claim');
 await db.exec("UPDATE drive_notification_private.settings SET customer_actions=ARRAY['confirm'],customer_template_languages=ARRAY['ar']");
 await clear(); const quote=await request('customer-quote-expiry'); const quoteId=await requestId(quote.reference);
 equal(await scalar('SELECT count(*)::int FROM drive_notification_private.outbox'),0,'unconfigured customer created skipped');
 await asUser(operations,"SELECT public.review_managed_drive_request($1,0,'review')",[quoteId]);
 await asUser(operations,"SELECT public.review_managed_drive_request($1,1,'confirm','QA vehicle',NULL,150,'USD',now()+interval '1 day',NULL)",[quoteId]);
 row=await claim(); equal(row.action,'confirm','quote only configured action');
 await db.query("UPDATE public.marketplace_requests SET quote_expires_at=now()-interval '1 second' WHERE id=$1",[quoteId]);
 equal(await kapsoBegin(row),false,'expired customer quote cannot send');
 await clear(); const quoteKill=await request('customer-quote-language'); const quoteKillId=await requestId(quoteKill.reference);
 await asUser(operations,"SELECT public.review_managed_drive_request($1,0,'review')",[quoteKillId]);
 await asUser(operations,"SELECT public.review_managed_drive_request($1,1,'confirm','QA vehicle',NULL,150,'USD',now()+interval '1 day',NULL)",[quoteKillId]);
 row=await claim(); await db.exec('UPDATE drive_notification_private.settings SET customer_template_languages=ARRAY[]::text[]');
 equal(await kapsoBegin(row),false,'customer language approval rechecked after claim');
 await db.exec("UPDATE drive_notification_private.settings SET customer_actions=ARRAY['created'],customer_template_languages=ARRAY['ar']");
 await clear(); await request('customer-intent-crash'); row=await claim(); equal(await kapsoBegin(row),true,'customer crash durable intent');
 await db.query("UPDATE drive_notification_private.outbox SET lease_until=now()-interval '1 second' WHERE id=$1",[row.id]);
 equal(await claim(),null,'customer crash no reclaim'); equal(await state(row),'unknown','customer crash unknown');
 for(const role of ['anon','authenticated','service_role']) equal(await scalar('SELECT has_function_privilege($1,$2,$3)',[role,'drive_notification_private.category_enabled(text,text,uuid,text)','EXECUTE']),false,role+' category helper private');
 equal(await scalar("SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='drive_notification_private' AND c.relkind='r' AND c.relrowsecurity"),4,'customer forward retains RLS');
 if(connectPeer){
  await clear(); await request('customer-concurrent-worker'); const a=await connectPeer();const b=await connectPeer();
  try{
   await a.query('SET ROLE service_role'); await b.query('SET ROLE service_role');
   const claims=await Promise.all([a.query('SELECT public.claim_drive_whatsapp() AS result'),b.query('SELECT public.claim_drive_whatsapp() AS result')]);
   equal(claims.filter(x=>x.rows[0].result!==null).length,1,'customer two workers one claim');
   const claimed=claims.find(x=>x.rows[0].result!==null).rows[0].result;
   const starts=await Promise.all([a.query('SELECT public.begin_kapso_drive_whatsapp($1,$2,$3) AS result',[claimed.id,claimed.token,'10000000000166']),b.query('SELECT public.begin_kapso_drive_whatsapp($1,$2,$3) AS result',[claimed.id,claimed.token,'10000000000166'])]);
   equal(starts.filter(x=>x.rows[0].result).length,1,'customer two workers one intent');
  }finally{await a.end();await b.end();}
 }

 // F1: exact runtime-key claim skips unsupported oldest rows without mutation/loss.
 await clear(); await db.exec("UPDATE drive_notification_private.settings SET customer_actions=ARRAY['confirm'],customer_template_languages=ARRAY['ar','en']");
 await db.query("UPDATE drive_notification_private.subscriptions SET language='en',phone='+10000000002' WHERE user_id=$1",[other]);
 const enFirst=await request('filtered-en-first',other,'+10000000002'); const enFirstId=await requestId(enFirst.reference);
 await asUser(operations,"SELECT public.review_managed_drive_request($1,0,'review')",[enFirstId]);
 await asUser(operations,"SELECT public.review_managed_drive_request($1,1,'confirm','QA vehicle',NULL,150,'USD',now()+interval '1 day',NULL)",[enFirstId]);
 const arSecond=await request('filtered-ar-second'); const arSecondId=await requestId(arSecond.reference);
 await asUser(operations,"SELECT public.review_managed_drive_request($1,0,'review')",[arSecondId]);
 await asUser(operations,"SELECT public.review_managed_drive_request($1,1,'confirm','QA vehicle',NULL,150,'USD',now()+interval '1 day',NULL)",[arSecondId]);
 const filteredClaim=keys=>service('claim_kapso_drive_whatsapp($1::text[])',[keys]);
 row=await filteredClaim(['customer.confirm.ar']); equal(row.reference,arSecond.reference,'supported newer AR progresses past oldest EN');
 equal(await scalar("SELECT state FROM drive_notification_private.outbox WHERE request_id=$1",[enFirstId]),'pending','unsupported EN untouched');
 equal(await kapsoBegin(row),true,'filtered AR eligibility rechecked'); await finish(row,'accepted','wamid.FILTERED_AR');
 for(let i=0;i<6;i++){
  // Expire any claimed leases to model dispatch cadence beyond two minutes, no sleeps.
  await db.exec("UPDATE drive_notification_private.outbox SET lease_until=now()-interval '1 second' WHERE state='claimed'");
  equal(await filteredClaim(['customer.confirm.ar']),null,'filtered AR no unsupported lease churn '+i);
 }
 equal(await scalar("SELECT attempts=0 AND lease_token IS NULL AND state='pending' FROM drive_notification_private.outbox WHERE request_id=$1",[enFirstId]),true,'unsupported message neither dropped nor claimed');
 row=await filteredClaim(['customer.confirm.en']); equal(row.reference,enFirst.reference,'later EN template still claims original pending message');
 await db.query("UPDATE drive_notification_private.subscriptions SET enabled=false WHERE user_id=$1",[other]);
 equal(await kapsoBegin(row),false,'filtered claim does not bypass revoked consent');
 await db.query("UPDATE drive_notification_private.subscriptions SET enabled=true WHERE user_id=$1",[other]);
 for(const keys of [[],['customer.confirm.fr'],['operations.customer_accept.ar'],[null]]){await assert.rejects(filteredClaim(keys),/INVALID_TEMPLATE_KEYS/);checks++;}
 for(const role of ['anon','authenticated']) equal(await scalar('SELECT has_function_privilege($1,$2,$3)',[role,'public.claim_kapso_drive_whatsapp(text[])','EXECUTE']),false,role+' filtered claim denied');
 for(const role of ['anon','authenticated','service_role']) equal(await scalar('SELECT has_function_privilege($1,$2,$3)',[role,'drive_notification_private.claim(text[])','EXECUTE']),false,role+' shared claim helper private');

 console.log(`PASS ${checks} isolated PostgreSQL assertions (${connectPeer ? 'PostgreSQL with two-connection concurrency' : 'PGlite, sequential'}); no remote database or provider calls`);
} finally { await db.close(); }
