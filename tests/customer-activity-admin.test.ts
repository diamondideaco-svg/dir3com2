import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1')), '..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

test('Admin customer details degrades explicitly when customer_activity is unavailable', () => {
  const page = read('app/admin/customers/[id]/page.tsx');
  const timeline = read('components/customers/CustomerTimeline.tsx');

  assert.match(page, /from\('customer_activity'\)/);
  assert.match(page, /activityAvailable: !activityError/);
  assert.match(page, /activityError \? \[\]/);
  assert.match(page, /CustomerTimeline items=\{activity\} available=\{activityAvailable\}/);
  assert.doesNotMatch(page, /throw new Error\(`Customer activity query failed:/);
  assert.doesNotMatch(page, /activityError\.message/);

  assert.match(timeline, /available\?\: boolean/);
  assert.match(timeline, /Customer activity is currently unavailable/);
  assert.match(timeline, /تعذر تحميل سجل نشاط العميل حاليًا/);
  assert.match(timeline, /AdminRetryButton/);
  assert.match(timeline, /available && items\.length === 0/);
});

test('customer activity unavailable state does not replace real rows or truthful empty state', () => {
  const timeline = read('components/customers/CustomerTimeline.tsx');

  assert.match(timeline, /available \? items\.map/);
  assert.match(timeline, /item\.activity_type/);
  assert.match(timeline, /item\.details \|\| '—'/);
  assert.match(timeline, /No activity yet\./);
  assert.match(timeline, /لا يوجد نشاط حتى الآن\./);
  assert.doesNotMatch(timeline, /PGRST205|relation .* does not exist|customer_activity.*missing/i);
});

test('Admin customer details keeps sibling documents schema failures out of the route error boundary', () => {
  const page = read('app/admin/customers/[id]/page.tsx');
  const documents = read('components/customers/CustomerDocuments.tsx');

  assert.match(page, /documentsAvailable: !documentError/);
  assert.match(page, /documentError \? \[\]/);
  assert.match(page, /CustomerDocuments documents=\{documents\} available=\{documentsAvailable\}/);
  assert.doesNotMatch(page, /throw new Error\(`Customer documents query failed:/);
  assert.doesNotMatch(page, /documentError\.message/);

  assert.match(documents, /available\?: boolean/);
  assert.match(documents, /Customer documents are currently unavailable/);
  assert.match(documents, /تعذر تحميل مستندات العميل حاليًا/);
  assert.match(documents, /AdminRetryButton/);
  assert.match(documents, /available && documents\.length === 0/);
  assert.doesNotMatch(documents, /PGRST205|relation .* does not exist|customer_documents.*missing/i);
});

test('forward reconciliation is canonical, PostgreSQL 17 compatible, and least privilege', () => {
  const migration = read('supabase/migrations/20260902163712_reconcile_customer_activity_postgres17.sql');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.customer_activity/i);
  assert.match(migration, /FOREIGN KEY \(customer_id\)[\s\S]*REFERENCES public\.customers\(id\)/i);
  assert.match(migration, /idx_customer_activity_customer_created_at/i);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /TO authenticated[\s\S]*public\.is_admin_actor\(\)/i);
  assert.match(migration, /TO service_role/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.customer_activity FROM PUBLIC, anon, authenticated, service_role/i);
  assert.doesNotMatch(migration, /CREATE POLICY IF NOT EXISTS/i);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|INSERT INTO public\.customer_activity/i);
});
