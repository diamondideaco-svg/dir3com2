import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1')), '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

test('customer documents reconciliation is additive, PostgreSQL 17 compatible, and least privilege', () => {
  const migration = read('supabase/migrations/20260903220000_reconcile_customer_documents_postgres17.sql');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.customer_documents/i);
  assert.match(migration, /FOREIGN KEY \(customer_id\)[\s\S]*REFERENCES public\.customers\(id\)/i);
  assert.match(migration, /idx_customer_documents_customer_uploaded_at/i);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /TO authenticated[\s\S]*public\.is_admin_actor\(\)/i);
  assert.match(migration, /TO service_role/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.customer_documents FROM PUBLIC, anon, authenticated, service_role/i);
  assert.doesNotMatch(migration, /CREATE POLICY IF NOT EXISTS/i);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|INSERT INTO public\.customer_documents/i);
});

test('admin customer documents route keeps using canonical customer_documents relation', () => {
  const page = read('app/admin/customers/[id]/page.tsx');
  const actions = read('lib/actions/customer-actions.ts');

  assert.match(page, /from\('customer_documents'\)/);
  assert.match(page, /eq\('customer_id', id\)/);
  assert.match(actions, /from\('customer_documents'\)\.insert/);
});
