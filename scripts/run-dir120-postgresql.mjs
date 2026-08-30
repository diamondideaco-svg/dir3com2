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
const migration = readFileSync(
  new URL('../supabase/migrations/20260829234937_dir120_revenue_request_transition_safety.sql', import.meta.url),
  'utf8',
);
const suiteTemplate = readFileSync(
  new URL('../tests/postgresql/dir120-revenue-safety.sql', import.meta.url),
  'utf8',
);
const includeMarker = '-- DIR120_MIGRATION_INCLUDE';

if (!suiteTemplate.includes(includeMarker)) {
  throw new Error('DIR120 PostgreSQL suite migration marker is missing.');
}

const suite = suiteTemplate.replace(includeMarker, () => migration);
const admin = new Client({ connectionString: baseConnection });
let testClient;
let adminConnected = false;

async function expectPermissionDenied(client, role, sql, params = []) {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
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

  const roleRequestId = randomUUID();
  const roleUserId = randomUUID();
  const roleProductId = randomUUID();
  const roleEvidenceReference = `ROLE-${randomUUID()}`;
  await testClient.query(
    `INSERT INTO public.marketplace_requests (
      id, request_reference, user_id, product_id, request_type, transaction_method,
      supplier_name, status, payment_status, quote_amount, quote_currency
    ) VALUES ($1, $2, $3, $4, 'request_to_confirm', 'request_to_confirm',
      'Role Boundary Supplier', 'request_submitted', 'payment_verified', 500, 'SAR')`,
    [roleRequestId, `REQ-${roleEvidenceReference}`, roleUserId, roleProductId],
  );

  await testClient.query('BEGIN');
  try {
    await testClient.query('SET LOCAL ROLE service_role');
    await testClient.query('SELECT count(*) FROM public.marketplace_request_evidence');
    const insertedEvidence = await testClient.query(
      `INSERT INTO public.marketplace_request_evidence (
        request_id, user_id, product_id, supplier_context, evidence_type,
        source_type, evidence_reference, status, accepted_at
      ) VALUES ($1, $2, $3, 'Role Boundary Supplier', 'supplier_confirmation',
        'supplier', $4, 'confirmed', NOW()) RETURNING id`,
      [roleRequestId, roleUserId, roleProductId, roleEvidenceReference],
    );
    const evidenceId = insertedEvidence.rows[0]?.id;
    await testClient.query(
      'UPDATE public.marketplace_request_evidence SET updated_at = NOW() WHERE id = $1',
      [evidenceId],
    );
    await testClient.query('DELETE FROM public.marketplace_request_evidence WHERE id = $1', [evidenceId]);
    await testClient.query(
      `SELECT public.transition_marketplace_request($1, 'request_submitted', 'under_review', $2, '{}'::jsonb)`,
      [roleRequestId, roleUserId],
    );
    await testClient.query('COMMIT');
  } catch (error) {
    await testClient.query('ROLLBACK');
    throw error;
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
      `SELECT public.transition_marketplace_request($1, 'under_review', 'awaiting_supplier', $2, '{}'::jsonb)`,
      [roleRequestId, roleUserId],
    );
  }

  console.log('DIR120_POSTGRESQL=PASS cases=20 role_boundary=PASS');
} finally {
  if (testClient) {
    await testClient.end().catch(() => undefined);
  }

  if (adminConnected) {
    await admin.query(`DROP DATABASE IF EXISTS "${temporaryDatabase}" WITH (FORCE)`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}
