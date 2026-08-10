import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  isMissingSyntheticColumnError,
  keepPublicNonSynthetic,
  resolveArrayWithSyntheticCompatibility,
  resolveSingleWithSyntheticCompatibility,
  sanitizeServiceProductsForCompatibility,
} from '@/lib/marketplace/synthetic-compat';

const coreMigrationPath = path.resolve('supabase/migrations/20260810102000_dgr071_core_synthetic_compatibility.sql');
const stagingMigrationPath = path.resolve('supabase/staging-only/sandbox/20260810090000_sandbox_synthetic_training_layer.sql');
const rollbackPath = path.resolve('supabase/staging-only/sandbox/20260810090000_sandbox_synthetic_training_layer.rollback.sql');
const runbookPath = path.resolve('docs/DABRA_SANDBOX_LOCAL_STAGING_RUNBOOK.md');

function read(filePath: string) {
  return fs.readFileSync(filePath, 'utf8');
}

test('schema compatibility: core migration adds required synthetic columns only', () => {
  const sql = read(coreMigrationPath);
  assert.match(sql, /ALTER TABLE IF EXISTS public\.products[\s\S]*ADD COLUMN IF NOT EXISTS synthetic boolean/i);
  assert.match(sql, /ALTER TABLE IF EXISTS public\.product_categories[\s\S]*ADD COLUMN IF NOT EXISTS synthetic boolean/i);
  assert.match(sql, /ALTER TABLE IF EXISTS public\.product_images[\s\S]*ADD COLUMN IF NOT EXISTS synthetic boolean/i);
  assert.match(sql, /ALTER TABLE IF EXISTS public\.product_features[\s\S]*ADD COLUMN IF NOT EXISTS synthetic boolean/i);
  assert.equal(/ALTER\s+COLUMN\s+currency\s+SET\s+DEFAULT\s+'EGP'/i.test(sql), false);
  assert.equal(/INSERT\s+INTO\s+public\./i.test(sql), false);
});

test('schema compatibility: existing rows become synthetic=false and non-null', () => {
  const sql = read(coreMigrationPath);
  assert.match(sql, /UPDATE public\.products SET synthetic = false WHERE synthetic IS NULL;/i);
  assert.match(sql, /UPDATE public\.product_categories SET synthetic = false WHERE synthetic IS NULL;/i);
  assert.match(sql, /UPDATE public\.product_images SET synthetic = false WHERE synthetic IS NULL;/i);
  assert.match(sql, /UPDATE public\.product_features SET synthetic = false WHERE synthetic IS NULL;/i);
  assert.match(sql, /ALTER COLUMN synthetic SET NOT NULL;/i);
  assert.match(sql, /ALTER COLUMN synthetic SET DEFAULT false,/i);
});

test('public compatibility fallback detects missing synthetic column error', () => {
  assert.equal(isMissingSyntheticColumnError({ code: '42703', message: 'column synthetic does not exist' }), true);
  assert.equal(isMissingSyntheticColumnError({ message: 'other error' }), false);
});

test('public compatibility fallback keeps non-synthetic active products visible', async () => {
  const data = await resolveArrayWithSyntheticCompatibility(
    async () => ({
      data: null,
      error: { code: '42703', message: 'column synthetic does not exist' },
    }),
    async () => ({
      data: [
        { id: '1', slug: 'city-ride', status: 'active', synthetic: false },
        { id: '2', slug: 'sandbox-ride', status: 'active' },
        { id: '3', slug: 'featured-trip', status: 'published' },
      ],
      error: null,
    }),
    keepPublicNonSynthetic,
  );

  assert.equal(data.error, null);
  assert.equal(data.data.length, 2);
  assert.deepEqual(
    data.data.map((row) => row.id),
    ['1', '3'],
  );
});

test('public compatibility fallback for item/category/services does not hard-fail to 500', async () => {
  const itemResult = await resolveSingleWithSyntheticCompatibility(
    async () => ({ data: null, error: { code: '42703', message: 'synthetic missing' } }),
    async () => ({ data: { id: 'p1', slug: 'city-transfer', status: 'published' }, error: null }),
    () => false,
  );

  assert.equal(itemResult.error, null);
  assert.equal(itemResult.data?.id, 'p1');

  const serviceProducts = sanitizeServiceProductsForCompatibility([
    { id: 'a', slug: 'sandbox-car', synthetic: true },
    { id: 'b', slug: 'regular-car', synthetic: false },
    { id: 'c', slug: 'city-hotel' },
  ]);

  assert.deepEqual(serviceProducts.map((row) => (row as { id: string }).id), ['b', 'c']);
});

test('staging migration does not override bookings.currency default to EGP', () => {
  const sql = read(stagingMigrationPath);
  assert.equal(/ALTER\s+TABLE\s+IF\s+EXISTS\s+public\.bookings\s+\s*ALTER\s+COLUMN\s+currency\s+SET\s+DEFAULT\s+'EGP'/i.test(sql), false);
});

test('staging rollback is non-destructive and ownership-aware', () => {
  const sql = read(rollbackPath);
  assert.equal(/DROP\s+COLUMN/i.test(sql), false);
  assert.match(sql, /sandbox_migration_journal/i);
  assert.match(sql, /ALTER TABLE IF EXISTS public\.bookings[\s\S]*ALTER COLUMN currency SET DEFAULT 'SAR';/i);
});

test('guard remains fail-closed for production, mismatch, and unverified target', () => {
  const resolver = read(path.resolve('scripts/sandbox/resolve-target-env.mjs'));
  assert.match(resolver, /stagingRefAllowed/);
  assert.match(resolver, /isProbablyProduction/);
  assert.match(resolver, /decision: 'BLOCKED'/);
});

test('migration ordering is documented and verifiable', () => {
  const runbook = read(runbookPath);
  assert.match(runbook, /Safe Rollout Order/i);
  assert.match(runbook, /1\. Apply Core additive migration/i);
  assert.match(runbook, /2\. Verify Production schema compatibility/i);
  assert.match(runbook, /3\. Deploy code that depends on synthetic filters/i);
});
