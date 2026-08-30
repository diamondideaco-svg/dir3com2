import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

const baseConnection = process.env.DIR120_TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
if (!baseConnection) {
  throw new Error('DIR120_TEST_DATABASE_URL or TEST_DATABASE_URL is required.');
}

const baseUrl = new URL(baseConnection);
const host = baseUrl.hostname.toLowerCase();
const databaseName = decodeURIComponent(baseUrl.pathname.replace(/^\//, ''));
const safeHost = host === '127.0.0.1' || host === 'localhost' || host === 'postgres';
const safeDatabase = /(^|[_-])test($|[_-])/i.test(databaseName) || /_test$/i.test(databaseName);

if (!safeHost || !safeDatabase) {
  throw new Error(`DIR120 refuses non-disposable database target: ${host}/${databaseName}`);
}

const temporaryDatabase = `dir120_${randomBytes(8).toString('hex')}`;
const baseMigration = readFileSync(
  new URL('../supabase/migrations/20260829234937_dir120_revenue_request_transition_safety.sql', import.meta.url),
  'utf8',
);
const correctiveMigration = readFileSync(
  new URL('../supabase/migrations/20260830033103_dir120_marketplace_request_audit_logs.sql', import.meta.url),
  'utf8',
);
const suiteTemplate = readFileSync(
  new URL('../tests/postgresql/dir120-revenue-safety.sql', import.meta.url),
  'utf8',
);
const baseIncludeMarker = '-- DIR120_BASE_MIGRATION_INCLUDE';
const correctiveIncludeMarker = '-- DIR120_CORRECTIVE_MIGRATION_INCLUDE';

if (!suiteTemplate.includes(baseIncludeMarker) || !suiteTemplate.includes(correctiveIncludeMarker)) {
  throw new Error('DIR120 PostgreSQL suite migration-chain markers are missing.');
}

const suite = suiteTemplate
  .replace(baseIncludeMarker, () => baseMigration)
  .replace(correctiveIncludeMarker, () => correctiveMigration);
const admin = new Client({ connectionString: baseConnection });
let testClient;
let adminConnected = false;

async function expectPermissionDenied(client, role, sql, params = [], userId) {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role, ...(userId ? { sub: userId } : {}) }),
    ]);
    await client.query(sql, params);
    throw new Error(`DIR120 ${role} unexpectedly crossed a denied database boundary.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DIR120 ')) {
      throw error;
    }
    if (error?.code !== '42501') {
      throw error;
    }
  } finally {
    await client.query('ROLLBACK');
  }
}

async function expectDatabaseError(client, sql, params, code, message) {
  await client.query('BEGIN');
  try {
    await client.query(sql, params);
    throw new Error(`DIR120 expected database error ${message} was not raised.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('DIR120 expected')) {
      throw error;
    }
    if (error?.code !== code || !error?.message?.includes(message)) {
      throw error;
    }
  } finally {
    await client.query('ROLLBACK');
  }
}

async function beginRoleContext(client, role, userId) {
  await client.query('BEGIN');
  await client.query(`SET LOCAL ROLE ${role}`);
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role, ...(userId ? { sub: userId } : {}) }),
  ]);
}

try {
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE "${temporaryDatabase}"`);

  const testUrl = new URL(baseConnection);
  testUrl.pathname = `/${temporaryDatabase}`;
  testClient = new Client({ connectionString: testUrl.toString() });
  await testClient.connect();

  const result = await testClient.query(suite);
  const resultSets = Array.isArray(result) ? result : [result];
  const marker = resultSets
    .flatMap((entry) => entry.rows ?? [])
    .map((row) => row.result)
    .find((value) => value === 'DIR120_POSTGRESQL=PASS cases=20');

  if (!marker) {
    throw new Error('DIR120 PostgreSQL suite did not emit the required 20-case PASS marker.');
  }

  const roleUserId = randomUUID();
  const roleProductId = randomUUID();
  const adminAId = randomUUID();
  const adminBId = randomUUID();
  const customerUserId = randomUUID();
  const partnerUserId = randomUUID();
  const inactiveAdminId = randomUUID();
  const bannedAdminId = randomUUID();
  const deletedAdminId = randomUUID();
  const roleEvidenceReference = `ROLE-${randomUUID()}`;
  await testClient.query(
    `INSERT INTO public.profiles (id, role, status, deleted_at) VALUES
      ($1, 'admin', 'active', NULL),
      ($2, 'admin', 'active', NULL),
      ($3, 'customer', 'active', NULL),
      ($4, 'partner', 'active', NULL),
      ($5, 'admin', 'inactive', NULL),
      ($6, 'admin', 'banned', NULL),
      ($7, 'admin', 'active', NOW())`,
    [adminAId, adminBId, customerUserId, partnerUserId, inactiveAdminId, bannedAdminId, deletedAdminId],
  );

  async function seedRoleRequest(label) {
    const requestId = randomUUID();
    await testClient.query(
      `INSERT INTO public.marketplace_requests (
        id, request_reference, user_id, product_id, request_type, transaction_method,
        supplier_name, status, payment_status, quote_amount, quote_currency
      ) VALUES ($1, $2, $3, $4, 'request_to_confirm', 'request_to_confirm',
        'Role Boundary Supplier', 'request_submitted', 'payment_verified', 500, 'SAR')`,
      [requestId, `REQ-${label}-${roleEvidenceReference}`, roleUserId, roleProductId],
    );
    return requestId;
  }

  const roleRequestId = await seedRoleRequest('ADMIN-A');
  await beginRoleContext(testClient, 'authenticated', adminAId);
  try {
    await testClient.query(
      `SELECT public.transition_marketplace_request(
        $1, 'request_submitted', 'under_review', $2::jsonb
      )`,
      [roleRequestId, JSON.stringify({ actor_user_id: adminBId, actor_id: adminBId })],
    );
    await testClient.query('COMMIT');
  } catch (error) {
    await testClient.query('ROLLBACK');
    throw error;
  }

  const humanAudit = await testClient.query(
    `SELECT actor_user_id, actor_identity, actor_role, actor_source
     FROM public.marketplace_request_audit_logs
     WHERE request_id = $1`,
    [roleRequestId],
  );
  if (
    humanAudit.rows.length !== 1
    || humanAudit.rows[0]?.actor_user_id !== adminAId
    || humanAudit.rows[0]?.actor_identity !== adminAId
    || humanAudit.rows[0]?.actor_role !== 'admin'
    || humanAudit.rows[0]?.actor_source !== 'authenticated_admin'
  ) {
    throw new Error('DIR120 authenticated Admin A was not bound to the truthful audit actor.');
  }

  for (const actorCase of [
    { label: 'customer', actorId: customerUserId },
    { label: 'partner-cross-tenant', actorId: partnerUserId },
    { label: 'inactive-admin', actorId: inactiveAdminId },
    { label: 'banned-admin', actorId: bannedAdminId },
    { label: 'deleted-admin', actorId: deletedAdminId },
  ]) {
    const unauthorizedActorRequestId = await seedRoleRequest(`ACTOR-${actorCase.label}`);

    await expectPermissionDenied(
      testClient,
      'authenticated',
      `SELECT public.transition_marketplace_request(
        $1, 'request_submitted', 'under_review', $2::jsonb
      )`,
      [unauthorizedActorRequestId, JSON.stringify({ actor_user_id: adminBId, actor_id: adminBId })],
      actorCase.actorId,
    );

    const unchanged = await testClient.query(
      `SELECT status,
        (SELECT count(*)::int FROM public.marketplace_request_audit_logs WHERE request_id = $1) AS audit_count
       FROM public.marketplace_requests WHERE id = $1`,
      [unauthorizedActorRequestId],
    );
    if (unchanged.rows[0]?.status !== 'request_submitted' || unchanged.rows[0]?.audit_count !== 0) {
      throw new Error(`DIR120 ${actorCase.label} actor denial changed authoritative state.`);
    }
  }

  const systemRequestId = await seedRoleRequest('SYSTEM');
  await beginRoleContext(testClient, 'service_role', adminBId);
  try {
    await testClient.query('SELECT count(*) FROM public.marketplace_request_evidence');
    const insertedEvidence = await testClient.query(
      `INSERT INTO public.marketplace_request_evidence (
        request_id, user_id, product_id, supplier_context, evidence_type,
        source_type, evidence_reference, status, accepted_at
      ) VALUES ($1, $2, $3, 'Role Boundary Supplier', 'supplier_confirmation',
        'supplier', $4, 'confirmed', NOW()) RETURNING id`,
      [systemRequestId, roleUserId, roleProductId, roleEvidenceReference],
    );
    const evidenceId = insertedEvidence.rows[0]?.id;
    await testClient.query(
      'UPDATE public.marketplace_request_evidence SET updated_at = NOW() WHERE id = $1',
      [evidenceId],
    );
    await testClient.query('DELETE FROM public.marketplace_request_evidence WHERE id = $1', [evidenceId]);
    await testClient.query(
      `SELECT public.transition_marketplace_request(
        $1, 'request_submitted', 'under_review', $2::jsonb
      )`,
      [systemRequestId, JSON.stringify({ actor_user_id: adminBId, actor_id: adminBId })],
    );
    await testClient.query('COMMIT');
  } catch (error) {
    await testClient.query('ROLLBACK');
    throw error;
  }

  const systemAudit = await testClient.query(
    `SELECT actor_user_id, actor_identity, actor_role, actor_source
     FROM public.marketplace_request_audit_logs
     WHERE request_id = $1`,
    [systemRequestId],
  );
  if (
    systemAudit.rows.length !== 1
    || systemAudit.rows[0]?.actor_user_id !== null
    || systemAudit.rows[0]?.actor_identity !== 'system:service_role'
    || systemAudit.rows[0]?.actor_role !== 'service_role'
    || systemAudit.rows[0]?.actor_source !== 'system_service'
  ) {
    throw new Error('DIR120 service role fabricated a human actor instead of system provenance.');
  }

  const unsafeOverload = await testClient.query(
    "SELECT to_regprocedure('public.transition_marketplace_request(uuid,text,text,uuid,jsonb)') AS procedure",
  );
  if (unsafeOverload.rows[0]?.procedure !== null) {
    throw new Error('DIR120 forgeable actor-UUID RPC overload still exists.');
  }

  await expectPermissionDenied(
    testClient,
    'service_role',
    `INSERT INTO public.marketplace_request_audit_logs (
      request_id, actor_user_id, actor_identity, actor_role, actor_source,
      previous_status, new_status, event_type, metadata
    ) VALUES ($1, $2::uuid, $2::text, 'admin', 'authenticated_admin',
      'under_review', 'awaiting_supplier', 'request_status_updated', '{}'::jsonb)`,
    [roleRequestId, adminBId],
  );

  await testClient.query('DELETE FROM public.profiles WHERE id = $1', [adminAId]);
  const retainedActorAudit = await testClient.query(
    `SELECT actor_user_id, actor_identity
     FROM public.marketplace_request_audit_logs
     WHERE request_id = $1`,
    [roleRequestId],
  );
  if (
    retainedActorAudit.rows.length !== 1
    || retainedActorAudit.rows[0]?.actor_user_id !== adminAId
    || retainedActorAudit.rows[0]?.actor_identity !== adminAId
  ) {
    throw new Error('DIR120 profile deletion did not preserve immutable actor identity.');
  }

  for (const role of ['anon', 'authenticated']) {
    await expectPermissionDenied(testClient, role, 'SELECT * FROM public.marketplace_request_evidence LIMIT 1');
    await expectPermissionDenied(
      testClient,
      role,
      `INSERT INTO public.marketplace_request_evidence (
        request_id, user_id, product_id, supplier_context, evidence_type,
        source_type, evidence_reference, status, accepted_at
      ) VALUES ($1, $2, $3, 'Denied Supplier', 'supplier_confirmation',
        'supplier', $4, 'confirmed', NOW())`,
      [roleRequestId, roleUserId, roleProductId, `DENIED-${role}-${randomUUID()}`],
    );
    await expectPermissionDenied(
      testClient,
      role,
      'UPDATE public.marketplace_request_evidence SET updated_at = NOW() WHERE request_id = $1',
      [roleRequestId],
    );
    await expectPermissionDenied(
      testClient,
      role,
      'DELETE FROM public.marketplace_request_evidence WHERE request_id = $1',
      [roleRequestId],
    );
    await expectPermissionDenied(
      testClient,
      role,
      `SELECT public.transition_marketplace_request(
        $1, 'under_review', 'awaiting_supplier', '{}'::jsonb
      )`,
      [roleRequestId],
      role === 'authenticated' ? customerUserId : undefined,
    );
  }

  await expectPermissionDenied(
    testClient,
    'service_role',
    'UPDATE public.marketplace_request_audit_logs SET metadata = metadata WHERE request_id = $1',
    [roleRequestId],
  );

  await expectDatabaseError(
    testClient,
    'UPDATE public.marketplace_request_audit_logs SET metadata = metadata WHERE request_id = $1',
    [roleRequestId],
    '55000',
    'DIR120_REQUEST_AUDIT_APPEND_ONLY',
  );
  await expectDatabaseError(
    testClient,
    'DELETE FROM public.marketplace_request_audit_logs WHERE request_id = $1',
    [roleRequestId],
    '55000',
    'DIR120_REQUEST_AUDIT_APPEND_ONLY',
  );
  await expectDatabaseError(
    testClient,
    'TRUNCATE TABLE public.marketplace_request_audit_logs',
    [],
    '55000',
    'DIR120_REQUEST_AUDIT_APPEND_ONLY',
  );
  await expectPermissionDenied(
    testClient,
    'service_role',
    'DELETE FROM public.marketplace_request_audit_logs WHERE request_id = $1',
    [roleRequestId],
  );

  for (const identity of [
    { label: 'customer', userId: customerUserId },
    { label: 'partner', userId: partnerUserId },
  ]) {
    await expectPermissionDenied(
      testClient,
      'authenticated',
      `INSERT INTO public.marketplace_request_audit_logs (
        request_id, actor_user_id, actor_identity, actor_role, actor_source,
        previous_status, new_status, event_type, metadata
      ) VALUES ($1, $2, $3, 'admin', 'authenticated_admin',
        'request_submitted', 'under_review', 'request_status_updated', '{}'::jsonb)`,
      [roleRequestId, identity.userId, identity.userId],
      identity.userId,
    );
    await expectPermissionDenied(
      testClient,
      'authenticated',
      'UPDATE public.marketplace_request_audit_logs SET metadata = metadata WHERE request_id = $1',
      [roleRequestId],
      identity.userId,
    );
    await expectPermissionDenied(
      testClient,
      'authenticated',
      'DELETE FROM public.marketplace_request_audit_logs WHERE request_id = $1',
      [roleRequestId],
      identity.userId,
    );
  }

  console.log('DIR120_POSTGRESQL=PASS cases=20 role_boundary=PASS audit_boundary=PASS actor_provenance=PASS');
  console.log('ACTOR_PROVENANCE_TEST=PASS');
} finally {
  if (testClient) {
    await testClient.end().catch(() => undefined);
  }

  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS "${temporaryDatabase}" WITH (FORCE)`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}
