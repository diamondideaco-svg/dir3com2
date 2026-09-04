import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const baseConnection = process.env.TEST_DATABASE_URL;
if (!baseConnection) throw new Error('TEST_DATABASE_URL is required.');

const baseUrl = new URL(baseConnection);
const host = baseUrl.hostname.toLowerCase();
const databaseName = decodeURIComponent(baseUrl.pathname.replace(/^\//, ''));
if (!(host === '127.0.0.1' || host === 'localhost' || host === 'postgres') || !/(^|[_-])test($|[_-])/i.test(databaseName)) {
  throw new Error(`Lifecycle PostgreSQL test refuses non-disposable target: ${host}/${databaseName}`);
}

const lifecycleMigration = readFileSync(new URL('../supabase/migrations/20260903234500_admin_product_lifecycle_and_request_handoff.sql', import.meta.url), 'utf8');
const partnerHandoffMigration = readFileSync(new URL('../supabase/migrations/20260903234600_partner_request_handoff.sql', import.meta.url), 'utf8');
const cleanupMigration = readFileSync(new URL('../supabase/migrations/20260903234700_drop_legacy_admin_handoff_rpc.sql', import.meta.url), 'utf8');
const hardeningMigration = readFileSync(new URL('../supabase/migrations/20260904004000_harden_admin_partner_authorization.sql', import.meta.url), 'utf8');
const temporaryDatabase = `admin_partner_${randomBytes(8).toString('hex')}`;
const admin = new Client({ connectionString: baseConnection });
let testClient;
let adminConnected = false;

const bootstrap = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  deleted_at timestamptz
);

CREATE TABLE public.team_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_user_id uuid UNIQUE,
  access_level text NOT NULL DEFAULT 'scoped_staff',
  country_scope text[] NOT NULL DEFAULT '{}',
  permissions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  slug text NOT NULL UNIQUE,
  base_price numeric NOT NULL DEFAULT 0,
  country text,
  city text,
  marketplace_family text,
  fulfilment_state text,
  transaction_method text,
  supply_type text,
  supplier_verified boolean NOT NULL DEFAULT false,
  marketplace_environment text,
  synthetic boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  featured boolean NOT NULL DEFAULT false,
  verified boolean NOT NULL DEFAULT false,
  shield_certified boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id)
);

CREATE TABLE public.marketplace_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_reference text NOT NULL UNIQUE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  status text NOT NULL DEFAULT 'request_submitted',
  handoff_type text,
  fulfilment_method text,
  handoff_reference text,
  handoff_started_at timestamptz,
  next_action text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.product_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  partner_id uuid NOT NULL REFERENCES public.profiles(id)
);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated, service_role;
GRANT SELECT ON public.team_access_grants TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_availability TO service_role;
`;

async function expectError(client, sql, params, expected) {
  try {
    await client.query(sql, params);
    throw new Error(`Expected database error containing ${expected}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Expected database error')) throw error;
    if (!String(error?.message || '').includes(expected)) throw error;
  }
}

async function setAuthenticatedActor(client, userId) {
  await client.query('RESET ROLE');
  await client.query('SET ROLE authenticated');
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

async function resetActor(client) {
  await client.query('RESET ROLE');
  await client.query("SELECT set_config('request.jwt.claim.sub', '', false)");
}

try {
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE "${temporaryDatabase}"`);

  const testUrl = new URL(baseConnection);
  testUrl.pathname = `/${temporaryDatabase}`;
  testClient = new Client({ connectionString: testUrl.toString() });
  await testClient.connect();
  await testClient.query(bootstrap);

  await testClient.query(lifecycleMigration);
  await testClient.query(partnerHandoffMigration);
  await testClient.query(cleanupMigration);
  await testClient.query(hardeningMigration);

  const adminId = randomUUID();
  const staffId = randomUUID();
  const partnerId = randomUUID();
  const foreignPartnerId = randomUUID();
  await testClient.query(
    `INSERT INTO public.profiles(id, role, status) VALUES
      ($1,'admin','active'),($2,'staff','active'),($3,'partner','active'),($4,'partner','active')`,
    [adminId, staffId, partnerId, foreignPartnerId],
  );
  await testClient.query(
    `INSERT INTO public.team_access_grants(invited_user_id,access_level,country_scope,permissions,status)
     VALUES($1,'scoped_staff',ARRAY['EG'],ARRAY['products:read','products:write'],'active')`,
    [staffId],
  );

  await setAuthenticatedActor(testClient, adminId);
  const created = await testClient.query(
    `SELECT public.create_product_draft_lifecycle(
      'سيارة اختبار','Lifecycle Car','lifecycle-car',100,'Egypt','Cairo',
      'drive','verified_requestable','request_to_confirm','verified_local_partner',true,false,false,'postgres test'
    ) AS id`,
  );
  const productId = created.rows[0]?.id;
  if (!productId) throw new Error('Lifecycle draft RPC did not return product id.');

  await resetActor(testClient);
  const initial = await testClient.query('SELECT status, verified, lifecycle_version FROM public.products WHERE id=$1', [productId]);
  if (initial.rows[0]?.status !== 'draft' || initial.rows[0]?.verified !== false || initial.rows[0]?.lifecycle_version !== 1) {
    throw new Error('Draft truth or lifecycle version is incorrect.');
  }

  await setAuthenticatedActor(testClient, adminId);
  await testClient.query(`SELECT public.publish_product_lifecycle($1,1,'postgres publish')`, [productId]);
  await resetActor(testClient);
  const published = await testClient.query('SELECT status, verified, lifecycle_version FROM public.products WHERE id=$1', [productId]);
  if (published.rows[0]?.status !== 'published' || published.rows[0]?.verified !== false || published.rows[0]?.lifecycle_version !== 2) {
    throw new Error('Publish must change status/version without silently granting verification.');
  }

  await setAuthenticatedActor(testClient, adminId);
  await expectError(testClient, `SELECT public.unpublish_product_lifecycle($1,1,'stale version')`, [productId], 'PRODUCT_VERSION_STALE');
  await testClient.query(`SELECT public.unpublish_product_lifecycle($1,2,'postgres unpublish')`, [productId]);
  await testClient.query(`SELECT public.archive_product_lifecycle($1,3,'postgres archive')`, [productId]);

  const qatarCreated = await testClient.query(
    `SELECT public.create_product_draft_lifecycle(
      'سيارة قطر إدارية','Admin Qatar Car','admin-qatar-car',100,'Qatar','Doha',
      'drive','verified_requestable','request_to_confirm','verified_local_partner',true,false,false,'admin qatar audit isolation'
    ) AS id`,
  );
  const qatarProductId = qatarCreated.rows[0]?.id;
  if (!qatarProductId) throw new Error('Admin Qatar seed did not return product id.');
  await resetActor(testClient);

  const audit = await testClient.query('SELECT action FROM public.product_audit_events WHERE product_id=$1 ORDER BY created_at,id', [productId]);
  const actions = audit.rows.map((row) => row.action);
  for (const required of ['create_draft','publish','unpublish','archive']) {
    if (!actions.includes(required)) throw new Error(`Missing product audit event: ${required}`);
  }

  await setAuthenticatedActor(testClient, staffId);
  const staffCreated = await testClient.query(
    `SELECT public.create_product_draft_lifecycle(
      'سيارة مصر','Egypt Staff Car','egypt-staff-car',100,'Egypt','Cairo',
      'drive','verified_requestable','request_to_confirm','verified_local_partner',true,false,false,'staff egypt'
    ) AS id`,
  );
  const staffProductId = staffCreated.rows[0]?.id;
  await expectError(
    testClient,
    `SELECT public.create_product_draft_lifecycle(
      'سيارة قطر','Qatar Staff Car','qatar-staff-car',100,'Qatar','Doha',
      'drive','verified_requestable','request_to_confirm','verified_local_partner',true,false,false,'staff qatar'
    )`,
    [],
    'COUNTRY_SCOPE_FORBIDDEN',
  );

  const visibleAudit = await testClient.query('SELECT count(*)::int AS count FROM public.product_audit_events');
  if (visibleAudit.rows[0]?.count !== 5) {
    throw new Error(`Scoped staff audit visibility expected 5 Egypt events and no Qatar event; saw ${visibleAudit.rows[0]?.count}`);
  }
  const qatarLeak = await testClient.query('SELECT count(*)::int AS count FROM public.product_audit_events WHERE product_id=$1', [qatarProductId]);
  if (qatarLeak.rows[0]?.count !== 0) {
    throw new Error('Scoped staff could read a Qatar product audit event.');
  }
  await resetActor(testClient);

  await testClient.query('SET ROLE service_role');
  await expectError(
    testClient,
    `SELECT public.publish_product_lifecycle($1,1,'service role spoof')`,
    [staffProductId],
    'permission denied',
  );
  await resetActor(testClient);

  const handoffProduct = randomUUID();
  await testClient.query(
    `INSERT INTO public.products(id,name_ar,name_en,slug,country,marketplace_family,fulfilment_state,transaction_method,supply_type,supplier_verified,marketplace_environment,synthetic,status)
     VALUES($1,'سيارة شريك','Partner Car','partner-car','Egypt','drive','verified_requestable','request_to_confirm','verified_local_partner',true,'production',false,'published')`,
    [handoffProduct],
  );
  await testClient.query('INSERT INTO public.product_availability(product_id,partner_id) VALUES($1,$2)', [handoffProduct, partnerId]);
  const requestId = randomUUID();
  await testClient.query(
    `INSERT INTO public.marketplace_requests(id,request_reference,product_id,status) VALUES($1,$2,$3,'request_submitted')`,
    [requestId, `REQ-${randomBytes(5).toString('hex')}`, handoffProduct],
  );

  await testClient.query(
    `SELECT public.start_partner_marketplace_request_handoff($1,$2,$3)`,
    [partnerId, requestId, 'WA:POSTGRES-TEST'],
  );

  const handoff = await testClient.query(
    `SELECT r.handoff_type,r.fulfilment_method,r.handoff_reference,r.next_action,
      (SELECT count(*)::int FROM public.marketplace_request_handoff_events e WHERE e.request_id=r.id) AS event_count
     FROM public.marketplace_requests r WHERE r.id=$1`,
    [requestId],
  );
  const row = handoff.rows[0];
  if (row?.handoff_type !== 'whatsapp' || row?.fulfilment_method !== 'whatsapp_handoff' || row?.handoff_reference !== 'WA:POSTGRES-TEST' || row?.next_action !== 'await_partner_response' || row?.event_count !== 1) {
    throw new Error('Partner handoff was not atomically persisted with one event.');
  }

  await expectError(
    testClient,
    `SELECT public.start_partner_marketplace_request_handoff($1,$2,$3)`,
    [partnerId, requestId, 'WA:DUPLICATE'],
    'REQUEST_HANDOFF_ALREADY_STARTED',
  );

  const foreignRequestId = randomUUID();
  await testClient.query(
    `INSERT INTO public.marketplace_requests(id,request_reference,product_id,status) VALUES($1,$2,$3,'request_submitted')`,
    [foreignRequestId, `REQ-${randomBytes(5).toString('hex')}`, handoffProduct],
  );
  await expectError(
    testClient,
    `SELECT public.start_partner_marketplace_request_handoff($1,$2,$3)`,
    [foreignPartnerId, foreignRequestId, 'WA:FOREIGN'],
    'REQUEST_PARTNER_SCOPE_DENIED',
  );

  await expectError(testClient, 'UPDATE public.marketplace_request_handoff_events SET handoff_reference=handoff_reference', [], 'MARKETPLACE_REQUEST_HANDOFF_APPEND_ONLY');
  await expectError(testClient, 'DELETE FROM public.marketplace_request_handoff_events', [], 'MARKETPLACE_REQUEST_HANDOFF_APPEND_ONLY');

  const obsolete = await testClient.query("SELECT to_regprocedure('public.start_marketplace_request_handoff(uuid,text,uuid,text)') AS proc");
  if (obsolete.rows[0]?.proc !== null) throw new Error('Obsolete admin handoff RPC still exists after cleanup migration.');

  console.log('ADMIN_PARTNER_LIFECYCLE_POSTGRESQL=PASS lifecycle=PASS audit_scope=PASS session_actor=PASS handoff=PASS ownership=PASS append_only=PASS');
} finally {
  if (testClient) await testClient.end().catch(() => {});
  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS "${temporaryDatabase}" WITH (FORCE)`).catch(() => {});
    await admin.end().catch(() => {});
  }
}
