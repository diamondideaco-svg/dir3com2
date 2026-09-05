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
const remediationMigration = readFileSync(new URL('../supabase/migrations/20260905160435_reconcile_admin_partner_lifecycle_safety.sql', import.meta.url), 'utf8');
const phase0LifecycleReconciliationMigration = readFileSync(new URL('../supabase/migrations/20260905161554_reconcile_phase0_lifecycle_insert.sql', import.meta.url), 'utf8');
const temporaryDatabase = `admin_partner_${randomBytes(8).toString('hex')}`;
const admin = new Client({ connectionString: baseConnection });
let testClient;
let adminConnected = false;
let testUrl;

const bootstrap = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  full_name text NOT NULL DEFAULT '',
  email text
);

CREATE TABLE public.team_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_user_id uuid UNIQUE,
  email text NOT NULL DEFAULT '',
  job_title text NOT NULL DEFAULT '',
  access_level text NOT NULL DEFAULT 'scoped_staff',
  country_scope text[] NOT NULL DEFAULT '{}',
  permissions text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  invited_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.partners (
  id uuid PRIMARY KEY REFERENCES public.profiles(id),
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
  environment text,
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
  request_type text NOT NULL DEFAULT 'request_to_confirm',
  status text NOT NULL DEFAULT 'request_submitted',
  requested_for timestamptz,
  traveller_count integer NOT NULL DEFAULT 1,
  marketplace_family text,
  supplier_name text,
  service_name text,
  transaction_method text,
  handoff_type text,
  fulfilment_method text,
  handoff_reference text,
  handoff_started_at timestamptz,
  next_action text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.marketplace_request_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.marketplace_requests(id),
  previous_status text NOT NULL,
  new_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.product_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  partner_id uuid NOT NULL REFERENCES public.profiles(id)
);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated, service_role;
GRANT SELECT ON public.team_access_grants TO authenticated, service_role;
GRANT SELECT ON public.partners TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_request_audit_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_availability TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.products TO authenticated;
`;

// Exact definitions read from DIR3COM Production on 2026-09-05. The
// reconciliation migration is always applied after this parity fixture.
const productionPhase0Triggers = `
CREATE OR REPLACE FUNCTION public.phase0_force_new_product_draft_staging()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.status := 'draft';
  new.verified := false;
  new.shield_certified := false;
  new.featured := false;
  new.synthetic := true;
  new.environment := 'staging';
  return new;
end;
$$;

CREATE TRIGGER trg_phase0_force_new_product_draft_staging
BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.phase0_force_new_product_draft_staging();

CREATE OR REPLACE FUNCTION public.phase0_lock_staging_synthetic_products()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  if coalesce(new.synthetic,false) = true and new.environment = 'staging' then
    new.status := 'draft';
    new.featured := false;
    new.verified := false;
    new.shield_certified := false;
  end if;
  return new;
end;
$$;

CREATE TRIGGER trg_phase0_lock_staging_synthetic_products
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.phase0_lock_staging_synthetic_products();
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

async function connectTestClient(applicationName) {
  const client = new Client({ connectionString: testUrl.toString(), application_name: applicationName });
  await client.connect();
  return client;
}

async function waitForDatabaseLock(observer, backendPid, label) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const state = await observer.query(
      `SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1`,
      [backendPid],
    );
    if (state.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`${label} did not reach a deterministic database lock wait.`);
}

try {
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE "${temporaryDatabase}"`);

  testUrl = new URL(baseConnection);
  testUrl.pathname = `/${temporaryDatabase}`;
  testClient = new Client({ connectionString: testUrl.toString() });
  await testClient.connect();
  await testClient.query(bootstrap);
  await testClient.query(productionPhase0Triggers);

  await testClient.query(lifecycleMigration);
  await testClient.query(partnerHandoffMigration);
  await testClient.query(cleanupMigration);
  await testClient.query(hardeningMigration);
  await testClient.query(remediationMigration);
  await testClient.query(remediationMigration);

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
    `INSERT INTO public.partners(id,status) VALUES($1,'active'),($2,'active')`,
    [partnerId, foreignPartnerId],
  );
  await testClient.query(
    `INSERT INTO public.team_access_grants(invited_user_id,access_level,country_scope,permissions,status)
     VALUES($1,'scoped_staff',ARRAY['EG'],ARRAY['products:read','products:write'],'active')`,
    [staffId],
  );

  const productionTriggerParity = await testClient.query(`
    SELECT t.tgname, pg_get_triggerdef(t.oid, true) AS trigger_def,
      pg_get_functiondef(t.tgfoid) AS function_def
    FROM pg_trigger t
    WHERE t.tgrelid='public.products'::regclass
      AND NOT t.tgisinternal
      AND t.tgname IN (
        'trg_phase0_force_new_product_draft_staging',
        'trg_phase0_lock_staging_synthetic_products'
      )
    ORDER BY t.tgname
  `);
  if (productionTriggerParity.rowCount !== 2
      || !productionTriggerParity.rows.some((row) => row.tgname === 'trg_phase0_force_new_product_draft_staging'
        && /new\.synthetic := true/i.test(row.function_def)
        && /new\.environment := 'staging'/i.test(row.function_def))
      || !productionTriggerParity.rows.some((row) => row.tgname === 'trg_phase0_lock_staging_synthetic_products'
        && /before insert or update/i.test(row.trigger_def)
        && /coalesce\(new\.synthetic,false\) = true and new\.environment = 'staging'/i.test(row.function_def))) {
    throw new Error('Disposable fixture does not match the current Production Phase0 trigger definitions.');
  }

  // Reproduce the Production conflict before applying the forward fix: the
  // authorized lifecycle RPC is valid, but the Phase0 trigger rewrites its
  // intended non-synthetic production draft.
  await setAuthenticatedActor(testClient, adminId);
  const phase0BlockedCreate = await testClient.query(
    `SELECT public.create_product_draft_lifecycle(
      'مرحلة صفر','Phase0 blocked create','phase0-blocked-create',100,'Egypt','Cairo',
      'drive','verified_requestable','request_to_confirm','verified_local_partner',true,true,true,'phase0 parity proof'
    ) AS id`,
  );
  const phase0BlockedProductId = phase0BlockedCreate.rows[0]?.id;
  await resetActor(testClient);
  const phase0BlockedTruth = await testClient.query(
    `SELECT status,verified,shield_certified,featured,synthetic,environment,marketplace_environment
     FROM public.products WHERE id=$1`,
    [phase0BlockedProductId],
  );
  if (phase0BlockedTruth.rows[0]?.status !== 'draft'
      || phase0BlockedTruth.rows[0]?.verified !== false
      || phase0BlockedTruth.rows[0]?.shield_certified !== false
      || phase0BlockedTruth.rows[0]?.featured !== false
      || phase0BlockedTruth.rows[0]?.synthetic !== true
      || phase0BlockedTruth.rows[0]?.environment !== 'staging'
      || phase0BlockedTruth.rows[0]?.marketplace_environment !== 'production') {
    throw new Error('Production Phase0 trigger conflict was not reproduced faithfully.');
  }

  await testClient.query(phase0LifecycleReconciliationMigration);
  await testClient.query(phase0LifecycleReconciliationMigration);

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
  const initial = await testClient.query(
    `SELECT status,verified,shield_certified,featured,synthetic,environment,
      marketplace_environment,lifecycle_version
     FROM public.products WHERE id=$1`,
    [productId],
  );
  if (initial.rows[0]?.status !== 'draft'
      || initial.rows[0]?.verified !== false
      || initial.rows[0]?.shield_certified !== false
      || initial.rows[0]?.featured !== false
      || initial.rows[0]?.synthetic !== false
      || initial.rows[0]?.environment !== 'staging'
      || initial.rows[0]?.marketplace_environment !== 'production'
      || initial.rows[0]?.lifecycle_version !== 1) {
    throw new Error('Draft truth or lifecycle version is incorrect.');
  }

  async function directProductInsert(slug) {
    return testClient.query(
      `INSERT INTO public.products(
        name_ar,name_en,slug,country,marketplace_family,fulfilment_state,
        transaction_method,supply_type,supplier_verified,marketplace_environment,
        synthetic,status,featured,verified,shield_certified
      ) VALUES(
        'إدخال مباشر','Direct insert',$1,'Egypt','drive','verified_requestable',
        'request_to_confirm','verified_local_partner',true,'production',
        false,'published',true,true,true
      ) RETURNING id,status,verified,shield_certified,featured,synthetic,environment,marketplace_environment`,
      [slug],
    );
  }

  function assertPhase0DirectSafety(row, label) {
    if (row?.status !== 'draft'
        || row?.verified !== false
        || row?.shield_certified !== false
        || row?.featured !== false
        || row?.synthetic !== true
        || row?.environment !== 'staging') {
      throw new Error(`${label} escaped Phase0 staging/synthetic safety.`);
    }
  }

  // A caller can forge the transaction marker text, but cannot acquire the
  // lifecycle function owner's effective SECURITY DEFINER context.
  await setAuthenticatedActor(testClient, adminId);
  await testClient.query(
    `SELECT set_config('dir3com.lifecycle_create_path','create_product_draft_lifecycle:v1',false)`,
  );
  const authenticatedForged = await directProductInsert('authenticated-forged-marker');
  assertPhase0DirectSafety(authenticatedForged.rows[0], 'Authenticated forged-marker insert');
  await resetActor(testClient);
  await testClient.query(`SELECT set_config('dir3com.lifecycle_create_path','',false)`);

  await testClient.query('SET ROLE service_role');
  await testClient.query(
    `SELECT set_config('dir3com.lifecycle_create_path','create_product_draft_lifecycle:v1',false)`,
  );
  const serviceRoleForged = await directProductInsert('service-role-forged-marker');
  assertPhase0DirectSafety(serviceRoleForged.rows[0], 'Service-role forged-marker insert');
  await expectError(
    testClient,
    `SELECT public.create_product_draft_lifecycle(
      'مرفوض','Denied service role lifecycle','service-role-lifecycle',100,'Egypt','Cairo',
      'drive','verified_requestable','request_to_confirm','verified_local_partner',true,false,false,'denied'
    )`,
    [],
    'permission denied',
  );
  await resetActor(testClient);
  await testClient.query(`SELECT set_config('dir3com.lifecycle_create_path','',false)`);

  const ordinaryDirect = await directProductInsert('ordinary-direct-insert');
  assertPhase0DirectSafety(ordinaryDirect.rows[0], 'Ordinary direct insert');

  await testClient.query(
    `UPDATE public.products
     SET status='published',featured=true,verified=true,shield_certified=true
     WHERE id=$1`,
    [ordinaryDirect.rows[0]?.id],
  );
  const stagingLock = await testClient.query(
    `SELECT status,featured,verified,shield_certified
     FROM public.products WHERE id=$1`,
    [ordinaryDirect.rows[0]?.id],
  );
  if (stagingLock.rows[0]?.status !== 'draft'
      || stagingLock.rows[0]?.featured !== false
      || stagingLock.rows[0]?.verified !== false
      || stagingLock.rows[0]?.shield_certified !== false) {
    throw new Error('Phase0 staging/synthetic update lock was weakened.');
  }

  await setAuthenticatedActor(testClient, adminId);
  await expectError(
    testClient,
    `SELECT public.publish_product_lifecycle($1,1,'synthetic publish blocked')`,
    [ordinaryDirect.rows[0]?.id],
    'PRODUCT_SYNTHETIC_BLOCKED',
  );
  await resetActor(testClient);

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
  if (visibleAudit.rows[0]?.count !== 6) {
    throw new Error(`Scoped staff audit visibility expected 6 Egypt events and no Qatar event; saw ${visibleAudit.rows[0]?.count}`);
  }
  const qatarLeak = await testClient.query('SELECT count(*)::int AS count FROM public.product_audit_events WHERE product_id=$1', [qatarProductId]);
  if (qatarLeak.rows[0]?.count !== 0) {
    throw new Error('Scoped staff could read a Qatar product audit event.');
  }
  await resetActor(testClient);

  // Lifecycle version input is mandatory and positive on every state-changing
  // path; null must never exploit SQL three-valued comparison semantics.
  await setAuthenticatedActor(testClient, adminId);
  for (const invalidVersion of [null, 0, -1]) {
    await expectError(testClient, `SELECT public.publish_product_lifecycle($1,$2,'invalid version')`, [staffProductId, invalidVersion], 'PRODUCT_VERSION_REQUIRED');
    await expectError(testClient, `SELECT public.unpublish_product_lifecycle($1,$2,'invalid version')`, [staffProductId, invalidVersion], 'PRODUCT_VERSION_REQUIRED');
    await expectError(testClient, `SELECT public.archive_product_lifecycle($1,$2,'invalid version')`, [staffProductId, invalidVersion], 'PRODUCT_VERSION_REQUIRED');
  }
  await resetActor(testClient);

  // A stale route-level admission cannot survive profile/grant deactivation.
  await testClient.query(`UPDATE public.profiles SET status='inactive' WHERE id=$1`, [adminId]);
  await setAuthenticatedActor(testClient, adminId);
  await expectError(testClient, `SELECT public.publish_product_lifecycle($1,1,'inactive admin')`, [staffProductId], 'PRODUCT_LIFECYCLE_DENIED');
  await resetActor(testClient);
  await testClient.query(`UPDATE public.profiles SET status='active',deleted_at=now() WHERE id=$1`, [adminId]);
  await setAuthenticatedActor(testClient, adminId);
  await expectError(testClient, `SELECT public.publish_product_lifecycle($1,1,'deleted admin')`, [staffProductId], 'PRODUCT_LIFECYCLE_DENIED');
  await resetActor(testClient);
  await testClient.query(`UPDATE public.profiles SET deleted_at=null WHERE id=$1`, [adminId]);
  await testClient.query(`UPDATE public.team_access_grants SET status='inactive' WHERE invited_user_id=$1`, [staffId]);
  await setAuthenticatedActor(testClient, staffId);
  await expectError(testClient, `SELECT public.publish_product_lifecycle($1,1,'inactive grant')`, [staffProductId], 'PRODUCT_LIFECYCLE_PERMISSION_DENIED');
  await resetActor(testClient);
  await testClient.query(`UPDATE public.team_access_grants SET status='active' WHERE invited_user_id=$1`, [staffId]);

  async function insertDraftTruth(overrides = {}) {
    const values = {
      slug: `truth-${randomBytes(6).toString('hex')}`,
      supply: 'verified_local_partner',
      supplierVerified: true,
      fulfilment: 'verified_requestable',
      transaction: 'request_to_confirm',
      ...overrides,
    };
    await setAuthenticatedActor(testClient, adminId);
    const createdTruth = await testClient.query(
      `SELECT public.create_product_draft_lifecycle(
        'منتج حقيقي','Truth Product',$1,100,'Egypt','Cairo','drive',$2,$3,$4,$5,false,false,'publication truth fixture'
      ) AS id`,
      [values.slug, values.fulfilment, values.transaction, values.supply, values.supplierVerified],
    );
    await resetActor(testClient);
    return createdTruth.rows[0]?.id;
  }

  const quoteProductId = await insertDraftTruth({ fulfilment: 'verified_quote', transaction: 'request_quote' });
  const unavailableProductId = await insertDraftTruth({ fulfilment: 'unavailable', transaction: 'none' });
  const unknownAvailabilityId = await insertDraftTruth({ fulfilment: 'availability_unknown', transaction: 'none' });
  const unknownSupplyId = await insertDraftTruth({ supply: 'unknown' });
  const nullFamilyId = await insertDraftTruth({});
  const nullSupplyId = await insertDraftTruth({ supply: null });
  const nullFulfilmentId = await insertDraftTruth({ fulfilment: null });
  const nullTransactionId = await insertDraftTruth({ transaction: null });
  await testClient.query(`UPDATE public.products SET marketplace_family=null WHERE id=$1`, [nullFamilyId]);
  const unverifiedSupplierId = await insertDraftTruth({ supplierVerified: false });
  const instantProductId = await insertDraftTruth({ fulfilment: 'live_bookable', transaction: 'instant_booking' });
  await setAuthenticatedActor(testClient, adminId);
  await testClient.query(`SELECT public.publish_product_lifecycle($1,1,'verified quote')`, [quoteProductId]);
  await testClient.query(`SELECT public.publish_product_lifecycle($1,1,'truthful unavailable')`, [unavailableProductId]);
  await testClient.query(`SELECT public.publish_product_lifecycle($1,1,'truthful unknown availability')`, [unknownAvailabilityId]);
  await expectError(testClient, `SELECT public.publish_product_lifecycle($1,1,'unknown supply')`, [unknownSupplyId], 'PRODUCT_SUPPLY_NOT_AUTHORITATIVE');
  await expectError(testClient, `SELECT public.publish_product_lifecycle($1,1,'null family')`, [nullFamilyId], 'PRODUCT_FAMILY_REQUIRED');
  await expectError(testClient, `SELECT public.publish_product_lifecycle($1,1,'null supply')`, [nullSupplyId], 'PRODUCT_SUPPLY_NOT_AUTHORITATIVE');
  await expectError(testClient, `SELECT public.publish_product_lifecycle($1,1,'null fulfilment')`, [nullFulfilmentId], 'PRODUCT_TRANSACTION_PATH_UNSUPPORTED');
  await expectError(testClient, `SELECT public.publish_product_lifecycle($1,1,'null transaction')`, [nullTransactionId], 'PRODUCT_TRANSACTION_PATH_UNSUPPORTED');
  await expectError(testClient, `SELECT public.publish_product_lifecycle($1,1,'supplier unverified')`, [unverifiedSupplierId], 'PRODUCT_SUPPLIER_NOT_VERIFIED');
  await expectError(testClient, `SELECT public.publish_product_lifecycle($1,1,'instant without binding')`, [instantProductId], 'PRODUCT_INSTANT_SUPPLY_UNPROVEN');
  await resetActor(testClient);
  const quoteTruth = await testClient.query(`SELECT status,verified FROM public.products WHERE id=$1`, [quoteProductId]);
  if (quoteTruth.rows[0]?.status !== 'published' || quoteTruth.rows[0]?.verified !== false) {
    throw new Error('Verified quote publication changed verification truth.');
  }

  // Audit insertion failure must roll back the product state mutation.
  const rollbackProductId = await insertDraftTruth();
  await testClient.query(`CREATE FUNCTION public.pr93_fail_selected_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.product_id=current_setting('pr93.fail_product')::uuid THEN RAISE EXCEPTION 'PR93_AUDIT_FAILURE'; END IF; RETURN NEW; END $$`);
  await testClient.query(`CREATE TRIGGER pr93_fail_selected_audit BEFORE INSERT ON public.product_audit_events FOR EACH ROW EXECUTE FUNCTION public.pr93_fail_selected_audit()`);
  await testClient.query(`SELECT set_config('pr93.fail_product',$1,false)`, [rollbackProductId]);
  await setAuthenticatedActor(testClient, adminId);
  await expectError(testClient, `SELECT public.publish_product_lifecycle($1,1,'rollback proof')`, [rollbackProductId], 'PR93_AUDIT_FAILURE');
  await resetActor(testClient);
  const rolledBack = await testClient.query(`SELECT status,lifecycle_version FROM public.products WHERE id=$1`, [rollbackProductId]);
  if (rolledBack.rows[0]?.status !== 'draft' || rolledBack.rows[0]?.lifecycle_version !== 1) {
    throw new Error('Audit insertion failure did not roll back lifecycle state.');
  }
  await testClient.query(`DROP TRIGGER pr93_fail_selected_audit ON public.product_audit_events`);
  await testClient.query(`DROP FUNCTION public.pr93_fail_selected_audit()`);

  // Lock-order proof: country authorization is evaluated only after the latest
  // persisted product row has been acquired.
  const countryRaceProductId = await insertDraftTruth();
  const countryLocker = await connectTestClient('pr93_country_locker');
  const countryWaiter = await connectTestClient('pr93_country_waiter');
  try {
    await countryLocker.query('BEGIN');
    await countryLocker.query(`UPDATE public.products SET country='Qatar' WHERE id=$1`, [countryRaceProductId]);
    await setAuthenticatedActor(countryWaiter, staffId);
    const waiterPid = (await countryWaiter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const pendingPublish = countryWaiter.query(`SELECT public.publish_product_lifecycle($1,1,'country race')`, [countryRaceProductId]);
    await waitForDatabaseLock(testClient, waiterPid, 'country authorization race');
    await countryLocker.query('COMMIT');
    try {
      await pendingPublish;
      throw new Error('Country race unexpectedly authorized stale Egypt scope.');
    } catch (error) {
      if (String(error?.message || '').includes('unexpectedly authorized')) throw error;
      if (!String(error?.message || '').includes('COUNTRY_SCOPE_FORBIDDEN')) throw error;
    }
  } finally {
    await countryLocker.query('ROLLBACK').catch(() => {});
    await countryLocker.end();
    await countryWaiter.end();
  }

  await testClient.query('SET ROLE service_role');
  await expectError(
    testClient,
    `SELECT public.publish_product_lifecycle($1,1,'service role spoof')`,
    [staffProductId],
    'permission denied',
  );
  await resetActor(testClient);

  await setAuthenticatedActor(testClient, adminId);
  const handoffProductResult = await testClient.query(
    `SELECT public.create_product_draft_lifecycle(
      'سيارة شريك','Partner Car','partner-car',100,'Egypt','Cairo',
      'drive','verified_requestable','request_to_confirm','verified_local_partner',true,false,false,'handoff fixture'
    ) AS id`,
  );
  const handoffProduct = handoffProductResult.rows[0]?.id;
  await testClient.query(
    `SELECT public.publish_product_lifecycle($1,1,'handoff fixture publish')`,
    [handoffProduct],
  );
  await resetActor(testClient);
  await testClient.query('INSERT INTO public.product_availability(product_id,partner_id) VALUES($1,$2)', [handoffProduct, partnerId]);
  const requestId = randomUUID();
  const requestReference = `REQ-${randomBytes(5).toString('hex')}`;
  await testClient.query(
    `INSERT INTO public.marketplace_requests(id,request_reference,product_id,status,service_name,requested_for,traveller_count)
     VALUES($1,$2,$3,'request_submitted','Original partner car','2026-10-01T12:30:00Z',3)`,
    [requestId, requestReference, handoffProduct],
  );

  // The protected read scopes rows before projecting request fields.
  await testClient.query('SET ROLE service_role');
  const ownedRead = await testClient.query(`SELECT * FROM public.get_partner_marketplace_requests($1,$2)`, [partnerId, requestId]);
  const foreignRead = await testClient.query(`SELECT * FROM public.get_partner_marketplace_requests($1,$2)`, [foreignPartnerId, requestId]);
  await resetActor(testClient);
  if (ownedRead.rowCount !== 1 || foreignRead.rowCount !== 0) throw new Error('Partner protected read leaked or hid an owned request.');
  const submissionTimeline = ownedRead.rows[0]?.get_partner_marketplace_requests?.timeline?.[0];
  if (submissionTimeline?.type !== 'request_submitted' || Object.hasOwn(submissionTimeline, 'status')) {
    throw new Error('Request submission timeline fabricated a current status.');
  }

  // A partner deactivated after route admission is rejected by the RPC after
  // the partner row lock resolves; no handoff mutation may occur.
  const deactivationRequestId = randomUUID();
  await testClient.query(
    `INSERT INTO public.marketplace_requests(id,request_reference,product_id,status) VALUES($1,$2,$3,'request_submitted')`,
    [deactivationRequestId, `REQ-${randomBytes(5).toString('hex')}`, handoffProduct],
  );
  const partnerLocker = await connectTestClient('pr93_partner_locker');
  const partnerWaiter = await connectTestClient('pr93_partner_waiter');
  try {
    await partnerLocker.query('BEGIN');
    await partnerLocker.query(`UPDATE public.partners SET status='inactive' WHERE id=$1`, [partnerId]);
    await partnerWaiter.query('SET ROLE service_role');
    const waiterPid = (await partnerWaiter.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const pendingHandoff = partnerWaiter.query(`SELECT * FROM public.start_partner_marketplace_request_handoff($1,$2,$3)`, [partnerId, deactivationRequestId, '966532867009']);
    await waitForDatabaseLock(testClient, waiterPid, 'partner deactivation race');
    await partnerLocker.query('COMMIT');
    try {
      await pendingHandoff;
      throw new Error('Deactivated partner unexpectedly started a handoff.');
    } catch (error) {
      if (String(error?.message || '').includes('unexpectedly started')) throw error;
      if (!String(error?.message || '').includes('PARTNER_HANDOFF_ACTOR_DENIED')) throw error;
    }
  } finally {
    await partnerLocker.query('ROLLBACK').catch(() => {});
    await partnerLocker.end();
    await partnerWaiter.end();
  }
  await testClient.query(`UPDATE public.partners SET status='active' WHERE id=$1`, [partnerId]);

  // Compatible concurrent retries serialize on the request row, produce one
  // ledger event, and return the same persisted delivery snapshot even when
  // callers observe different current destination configuration.
  const handoffLocker = await connectTestClient('pr93_handoff_locker');
  const compatibleA = await connectTestClient('pr93_handoff_compatible_a');
  const compatibleB = await connectTestClient('pr93_handoff_compatible_b');
  let concurrentResults;
  try {
    await handoffLocker.query('BEGIN');
    await handoffLocker.query(`SELECT id FROM public.marketplace_requests WHERE id=$1 FOR UPDATE`, [requestId]);
    await compatibleA.query('SET ROLE service_role');
    await compatibleB.query('SET ROLE service_role');
    const pidA = (await compatibleA.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const pidB = (await compatibleB.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const callA = compatibleA.query(`SELECT * FROM public.start_partner_marketplace_request_handoff($1,$2,$3)`, [partnerId, requestId, '966532867009']);
    const callB = compatibleB.query(`SELECT * FROM public.start_partner_marketplace_request_handoff($1,$2,$3)`, [partnerId, requestId, '201011676418']);
    await Promise.all([
      waitForDatabaseLock(testClient, pidA, 'compatible handoff A'),
      waitForDatabaseLock(testClient, pidB, 'compatible handoff B'),
    ]);
    await handoffLocker.query('COMMIT');
    concurrentResults = await Promise.all([callA, callB]);
  } finally {
    await handoffLocker.query('ROLLBACK').catch(() => {});
    await handoffLocker.end();
    await compatibleA.end();
    await compatibleB.end();
  }
  const replayFlags = concurrentResults.map((result) => result.rows[0]?.replayed).sort();
  if (replayFlags[0] !== false || replayFlags[1] !== true) throw new Error('Compatible concurrent handoff did not return one commit and one replay.');
  const concurrentSnapshots = concurrentResults.map((result) => ({
    destination: result.rows[0]?.whatsapp_destination,
    message: result.rows[0]?.message_snapshot,
    reference: result.rows[0]?.handoff_reference,
  }));
  if (JSON.stringify(concurrentSnapshots[0]) !== JSON.stringify(concurrentSnapshots[1])) {
    throw new Error('Concurrent handoff retry returned a non-canonical delivery snapshot.');
  }

  await testClient.query(
    `SELECT public.start_partner_marketplace_request_handoff($1,$2,$3)`,
    [partnerId, requestId, '966532867009'],
  );

  const handoff = await testClient.query(
    `SELECT r.handoff_type,r.fulfilment_method,r.handoff_reference,r.next_action,
      (SELECT count(*)::int FROM public.marketplace_request_handoff_events e WHERE e.request_id=r.id) AS event_count,
      (SELECT whatsapp_destination FROM public.marketplace_request_handoff_events e WHERE e.request_id=r.id) AS whatsapp_destination,
      (SELECT message_snapshot FROM public.marketplace_request_handoff_events e WHERE e.request_id=r.id) AS message_snapshot
     FROM public.marketplace_requests r WHERE r.id=$1`,
    [requestId],
  );
  const row = handoff.rows[0];
  if (row?.handoff_type !== 'whatsapp' || row?.fulfilment_method !== 'whatsapp_handoff' || row?.handoff_reference !== `WA:${requestReference}` || row?.next_action !== 'await_partner_response' || row?.event_count !== 1
      || !['966532867009','201011676418'].includes(row?.whatsapp_destination)
      || !String(row?.message_snapshot || '').includes(`DIR3COM ${requestReference}`)
      || !String(row?.message_snapshot || '').includes('Service: Original partner car')
      || !String(row?.message_snapshot || '').includes('Travellers: 3')) {
    throw new Error('Partner handoff was not atomically persisted with one event.');
  }

  await testClient.query(
    `UPDATE public.marketplace_requests SET service_name='Changed after handoff',traveller_count=9,status='under_review' WHERE id=$1`,
    [requestId],
  );
  const replay = await testClient.query(
    `SELECT * FROM public.start_partner_marketplace_request_handoff($1,$2,$3)`,
    [partnerId, requestId, ''],
  );
  if (replay.rows[0]?.replayed !== true
      || replay.rows[0]?.whatsapp_destination !== row.whatsapp_destination
      || replay.rows[0]?.message_snapshot !== row.message_snapshot) {
    throw new Error('Compatible handoff retry did not return the immutable canonical delivery snapshot.');
  }

  const missingDestinationRequestId = randomUUID();
  await testClient.query(
    `INSERT INTO public.marketplace_requests(id,request_reference,product_id,status) VALUES($1,$2,$3,'request_submitted')`,
    [missingDestinationRequestId, `REQ-${randomBytes(5).toString('hex')}`, handoffProduct],
  );
  await expectError(
    testClient,
    `SELECT * FROM public.start_partner_marketplace_request_handoff($1,$2,$3)`,
    [partnerId, missingDestinationRequestId, ''],
    'WHATSAPP_DESTINATION_INVALID',
  );

  const incompatibleRequestId = randomUUID();
  await testClient.query(
    `INSERT INTO public.marketplace_requests(id,request_reference,product_id,status) VALUES($1,$2,$3,'request_submitted')`,
    [incompatibleRequestId, `REQ-${randomBytes(5).toString('hex')}`, handoffProduct],
  );
  await testClient.query('INSERT INTO public.product_availability(product_id,partner_id) VALUES($1,$2)', [handoffProduct, foreignPartnerId]);
  const incompatibleA = await connectTestClient('pr93_handoff_incompatible_a');
  const incompatibleB = await connectTestClient('pr93_handoff_incompatible_b');
  try {
    await incompatibleA.query('SET ROLE service_role');
    await incompatibleB.query('SET ROLE service_role');
    const outcomes = await Promise.allSettled([
      incompatibleA.query(`SELECT * FROM public.start_partner_marketplace_request_handoff($1,$2,$3)`, [partnerId, incompatibleRequestId, '966532867009']),
      incompatibleB.query(`SELECT * FROM public.start_partner_marketplace_request_handoff($1,$2,$3)`, [foreignPartnerId, incompatibleRequestId, '201011676418']),
    ]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    if (fulfilled.length !== 1 || rejected.length !== 1 || !String(rejected[0].reason?.message || '').includes('REQUEST_HANDOFF_CONFLICT')) {
      throw new Error('Incompatible concurrent handoff did not produce one canonical event and one conflict.');
    }
  } finally {
    await incompatibleA.end();
    await incompatibleB.end();
  }
  const incompatibleEvents = await testClient.query(`SELECT count(*)::int AS count FROM public.marketplace_request_handoff_events WHERE request_id=$1`, [incompatibleRequestId]);
  if (incompatibleEvents.rows[0]?.count !== 1) throw new Error('Incompatible concurrent handoff produced duplicate events.');
  await testClient.query('DELETE FROM public.product_availability WHERE product_id=$1 AND partner_id=$2', [handoffProduct, foreignPartnerId]);

  const foreignRequestId = randomUUID();
  await testClient.query(
    `INSERT INTO public.marketplace_requests(id,request_reference,product_id,status) VALUES($1,$2,$3,'request_submitted')`,
    [foreignRequestId, `REQ-${randomBytes(5).toString('hex')}`, handoffProduct],
  );
  await expectError(
    testClient,
    `SELECT public.start_partner_marketplace_request_handoff($1,$2,$3)`,
    [foreignPartnerId, foreignRequestId, '966532867009'],
    'REQUEST_PARTNER_SCOPE_DENIED',
  );

  await testClient.query('SET ROLE service_role');
  await expectError(testClient, 'UPDATE public.marketplace_request_handoff_events SET handoff_reference=handoff_reference', [], 'permission denied');
  await expectError(testClient, 'DELETE FROM public.marketplace_request_handoff_events', [], 'permission denied');
  await resetActor(testClient);
  await expectError(testClient, 'UPDATE public.marketplace_request_handoff_events SET handoff_reference=handoff_reference', [], 'MARKETPLACE_REQUEST_HANDOFF_APPEND_ONLY');
  await expectError(testClient, 'TRUNCATE public.marketplace_request_handoff_events', [], 'MARKETPLACE_REQUEST_HANDOFF_APPEND_ONLY');

  const obsolete = await testClient.query("SELECT to_regprocedure('public.start_marketplace_request_handoff(uuid,text,uuid,text)') AS proc");
  if (obsolete.rows[0]?.proc !== null) throw new Error('Obsolete admin handoff RPC still exists after cleanup migration.');

  console.log('ADMIN_PARTNER_LIFECYCLE_POSTGRESQL=PASS phase0_parity=PASS lifecycle_create=PASS direct_insert_safety=PASS forged_marker=PASS staging_lock=PASS synthetic_publish_block=PASS instant_booking_block=PASS audit_scope=PASS session_actor=PASS handoff=PASS ownership=PASS append_only=PASS');
} finally {
  if (testClient) await testClient.end().catch(() => {});
  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS "${temporaryDatabase}" WITH (FORCE)`).catch(() => {});
    await admin.end().catch(() => {});
  }
}
