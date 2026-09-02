import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20260902125155_reconcile_assignment_engine_tables.sql', import.meta.url),
  'utf8',
);

test('assignment schema reconciliation restores both canonical active tables', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.assignment_rules/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.assignment_logs/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_assignment_rules_enabled/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_assignment_logs_booking_id/);
});

test('assignment tables remain RLS-protected and anonymous access stays revoked', () => {
  for (const table of ['assignment_rules', 'assignment_logs']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`DROP POLICY IF EXISTS admin_full_access ON public\\.${table}`));
    assert.match(migration, new RegExp(`CREATE POLICY admin_full_access ON public\\.${table}`));
    assert.match(migration, new RegExp(`DROP POLICY IF EXISTS service_role_full_access ON public\\.${table}`));
    assert.match(migration, new RegExp(`CREATE POLICY service_role_full_access ON public\\.${table}`));
  }
  assert.match(migration, /REVOKE ALL ON TABLE public\.assignment_rules, public\.assignment_logs FROM anon, authenticated/);
  assert.match(migration, /USING \(public\.is_admin_actor\(\)\)/);
});

test('forward reconciliation is idempotent and PostgreSQL 17 compatible', () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.doesNotMatch(migration, /CREATE POLICY IF NOT EXISTS/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/);
});
