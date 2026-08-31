import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveDocumentQuery } from '@/lib/customer/document-query';

const pagePath = path.resolve('app/my-documents/page.tsx');
const reconciliationMigrationPath = path.resolve(
  'supabase/migrations/20260831171448_reconcile_verification_documents_postgres17.sql',
);
const historicalVerificationMigrationPath = path.resolve(
  'supabase/migrations/20260730220000_create_verification_engine.sql',
);
const historicalRlsMigrationPath = path.resolve(
  'supabase/migrations/20260801103000_add_rls_for_engine_domains.sql',
);

test('a valid zero-row query remains a truthful empty result', () => {
  assert.deepEqual(resolveDocumentQuery([], null), {
    status: 'ready',
    documents: [],
  });
});

test('a database failure cannot be represented as an empty document list', () => {
  assert.deepEqual(
    resolveDocumentQuery(null, {
      code: '42P01',
      message: 'relation is unavailable',
    }),
    { status: 'error' },
  );
});

test('My Documents keeps auth protection and renders a customer-safe error state', () => {
  const source = fs.readFileSync(pagePath, 'utf8');

  assert.match(source, /redirect\(buildLoginTarget\('\/my-documents'\)\)/);
  assert.match(source, /\.eq\('owner_type', 'customer'\)/);
  assert.match(source, /\.eq\('owner_id', user\.id\)/);
  assert.match(source, /documentsState\.status === 'error'/);
  assert.match(source, /role="alert"/);
  assert.match(source, /تعذر تحميل مستنداتك حالياً/);
  assert.doesNotMatch(source, /error\.message/);
});

test('the PostgreSQL 17 reconciliation migration defines only the current verification contract', () => {
  const migration = fs.readFileSync(reconciliationMigrationPath, 'utf8');

  assert.match(migration, /create table if not exists public\.verification_documents/i);
  assert.match(migration, /create table if not exists public\.verification_requests/i);
  assert.match(migration, /create table if not exists public\.verification_reviews/i);
  assert.match(migration, /create table if not exists public\.verification_status_history/i);
  assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(migration, /verification_request_id uuid references public\.verification_requests\(id\)/i);
  assert.match(migration, /document_type text not null/i);
  assert.match(migration, /owner_type text not null/i);
  assert.match(migration, /owner_id text not null/i);
  assert.match(migration, /file_url text/i);
  assert.match(migration, /verification_status text not null default 'Pending'/i);
  assert.match(migration, /'Pending', 'Under Review', 'Approved', 'Rejected', 'Expired', 'Suspended'/i);
  assert.match(migration, /created_at timestamptz not null default now\(\)/i);
  assert.match(migration, /updated_at timestamptz not null default now\(\)/i);
  assert.match(migration, /idx_verification_documents_owner/i);
  assert.match(migration, /idx_verification_documents_request/i);
  assert.match(migration, /alter table public\.verification_documents enable row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.verification_documents from public, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(migration, /create policy if not exists/i);
  assert.doesNotMatch(
    migration,
    /create table if not exists public\.(identity_profiles|company_profiles|document_templates|document_expiry_tracking)/i,
  );
  assert.doesNotMatch(migration, /metadata jsonb/i);
  assert.doesNotMatch(migration, /deleted_at\s+(date|timestamp|timestamptz)/i);
});

test('the reconciliation RLS contract derives customer ownership from auth.uid() and grants no customer writes', () => {
  const migration = fs.readFileSync(reconciliationMigrationPath, 'utf8');
  const policyStart = migration.indexOf('create policy verification_documents_customer_select_own');
  assert.notEqual(policyStart, -1);
  const policy = migration.slice(policyStart, policyStart + 420);

  assert.match(policy, /for select/i);
  assert.match(policy, /to authenticated/i);
  assert.match(policy, /owner_type = 'customer'/i);
  assert.match(policy, /owner_id = \(select auth\.uid\(\)\)::text/i);
  assert.doesNotMatch(policy, /user_metadata|raw_user_meta_data|current_setting/i);
  assert.doesNotMatch(migration, /verification_documents_customer_(insert|update|delete)/i);
});

test('historical verification migrations remain byte-for-byte unchanged', () => {
  const hash = (filePath: string) =>
    crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();

  assert.equal(
    hash(historicalVerificationMigrationPath),
    'C9589DA755B4642C2FAB7F62FFA5F3825300A629CCA1654720D6EC3964C36399',
  );
  assert.equal(
    hash(historicalRlsMigrationPath),
    '9ED0E8FC482E781F193127B506B5B4B9271ACCAC43961B40032E6FAB756344B6',
  );
});
