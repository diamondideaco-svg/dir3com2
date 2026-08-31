import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { resolveDocumentQuery } from '@/lib/customer/document-query';

const pagePath = path.resolve('app/my-documents/page.tsx');
const verificationMigrationPath = path.resolve(
  'supabase/migrations/20260730220000_create_verification_engine.sql',
);
const engineRlsMigrationPath = path.resolve(
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

test('the canonical verification migration defines the existing document contract', () => {
  const migration = fs.readFileSync(verificationMigrationPath, 'utf8');

  assert.match(migration, /create table if not exists verification_documents/i);
  assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(migration, /verification_request_id uuid references verification_requests\(id\)/i);
  assert.match(migration, /document_type text not null/i);
  assert.match(migration, /owner_type text not null/i);
  assert.match(migration, /owner_id text not null/i);
  assert.match(migration, /file_url text/i);
  assert.match(migration, /verification_status text not null default 'Pending'/i);
  assert.match(migration, /created_at timestamptz not null default now\(\)/i);
  assert.match(migration, /updated_at timestamptz not null default now\(\)/i);
  assert.match(migration, /idx_verification_documents_owner/i);
  assert.doesNotMatch(migration, /deleted_at/i);
});

test('the canonical RLS contract derives customer ownership from auth.uid()', () => {
  const migration = fs.readFileSync(engineRlsMigrationPath, 'utf8');
  const policyStart = migration.indexOf('customer_read_own_verification_documents');
  assert.notEqual(policyStart, -1);
  const policy = migration.slice(policyStart, policyStart + 320);

  assert.match(policy, /FOR SELECT USING/i);
  assert.match(policy, /owner_type = 'customer'/i);
  assert.match(policy, /owner_id = auth\.uid\(\)::text/i);
  assert.doesNotMatch(policy, /request|input|parameter/i);
});
