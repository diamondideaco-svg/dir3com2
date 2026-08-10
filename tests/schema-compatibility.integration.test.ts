import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

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
const verifyIdentityPath = path.resolve('scripts/verify-project-identity.mjs');
const stagingRunnerPath = path.resolve('scripts/sandbox/staging-sql-runner.mjs');
const canonicalRepository = 'diamondideaco-svg/dir3com2';
const canonicalStagingRef = 'ynupwivgvwcyrsdhtkcc';
const canonicalVercelProjectId = 'prj_V2AquQE4YbkpKWoq5GNtT4ImxWon';

function read(filePath: string) {
  return fs.readFileSync(filePath, 'utf8');
}

function runIdentityGuard(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of [
    'PROJECT_IDENTITY_OPERATION',
    'TARGET_SUPABASE_REF',
    'SUPABASE_PROJECT_REF',
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'DATABASE_URL',
    'POSTGRES_URL',
    'VERCEL_PROJECT_ID',
    'VERCEL_PROJECT_NAME',
    'VERCEL_PROJECT',
    'NEXT_PUBLIC_VERCEL_PROJECT_NAME',
    'VERCEL_ENV',
  ]) {
    delete env[key];
  }

  env.GITHUB_REPOSITORY = canonicalRepository;

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'undefined') {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  const result = spawnSync(process.execPath, [verifyIdentityPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  });

  return {
    status: result.status,
    output: String(result.stderr || result.stdout || '').trim(),
  };
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

test('identity guard blocks legacy Vercel project name', () => {
  const result = runIdentityGuard({
    VERCEL_PROJECT_NAME: 'dir3com',
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /Vercel project name dir3com is explicitly LEGACY/i);
});

test('identity guard blocks production operation when VERCEL_PROJECT_ID is missing', () => {
  const result = runIdentityGuard({
    PROJECT_IDENTITY_OPERATION: 'production-deployment',
    TARGET_SUPABASE_REF: canonicalStagingRef,
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /Production operation requires VERCEL_PROJECT_ID/i);
});

test('identity guard blocks production operation when VERCEL_PROJECT_ID is wrong', () => {
  const result = runIdentityGuard({
    PROJECT_IDENTITY_OPERATION: 'production-deployment',
    TARGET_SUPABASE_REF: canonicalStagingRef,
    VERCEL_PROJECT_ID: 'prj_Opnf0pOAm1nsL3E7n7awjyEaKHm4',
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /not targeting the canonical Vercel project/i);
});

test('identity guard does not block canonical Vercel project ID on its own', () => {
  const result = runIdentityGuard({
    PROJECT_IDENTITY_OPERATION: 'production-deployment',
    TARGET_SUPABASE_REF: canonicalStagingRef,
    VERCEL_PROJECT_ID: canonicalVercelProjectId,
  });

  assert.equal(result.status, 1);
  assert.doesNotMatch(result.output, /not targeting the canonical Vercel project/i);
  assert.match(result.output, /Production Supabase is UNVERIFIED/i);
});

test('identity guard keeps production supabase unverified state blocked', () => {
  const result = runIdentityGuard({
    PROJECT_IDENTITY_OPERATION: 'production-migration',
    TARGET_SUPABASE_REF: canonicalStagingRef,
    VERCEL_PROJECT_ID: canonicalVercelProjectId,
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /Production Supabase is UNVERIFIED/i);
});

test('identity guard blocks production environment when VERCEL_PROJECT_ID is missing without explicit operation', () => {
  const result = runIdentityGuard({
    VERCEL_ENV: 'production',
    TARGET_SUPABASE_REF: canonicalStagingRef,
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /Production operation requires VERCEL_PROJECT_ID/i);
});

test('identity guard blocks production environment when VERCEL_PROJECT_ID is empty without explicit operation', () => {
  const result = runIdentityGuard({
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_ID: '   ',
    TARGET_SUPABASE_REF: canonicalStagingRef,
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /Production operation requires VERCEL_PROJECT_ID/i);
});

test('identity guard blocks production environment when VERCEL_PROJECT_ID is wrong without explicit operation', () => {
  const result = runIdentityGuard({
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_ID: 'prj_Opnf0pOAm1nsL3E7n7awjyEaKHm4',
    TARGET_SUPABASE_REF: canonicalStagingRef,
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /not targeting the canonical Vercel project/i);
});

test('identity guard blocks production environment with canonical Vercel project ID while production supabase is unverified', () => {
  const result = runIdentityGuard({
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_ID: canonicalVercelProjectId,
    TARGET_SUPABASE_REF: canonicalStagingRef,
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /Production Supabase is UNVERIFIED/i);
});

test('sandbox canonical flow stays allowed and defaults to DRY_RUN_ONLY path', () => {
  const guardResult = runIdentityGuard({
    PROJECT_IDENTITY_OPERATION: 'sandbox-migration',
    TARGET_SUPABASE_REF: canonicalStagingRef,
  });

  assert.equal(guardResult.status, 0);
  assert.match(guardResult.output, /"ok"\s*:\s*true/);

  const runner = read(stagingRunnerPath);
  assert.match(runner, /if \(!execute\)/);
  assert.match(runner, /decision:\s*'DRY_RUN_ONLY'/);
});

test('migration ordering is documented and verifiable', () => {
  const runbook = read(runbookPath);
  assert.match(runbook, /Safe Rollout Order/i);
  assert.match(runbook, /1\. Apply Core additive migration/i);
  assert.match(runbook, /2\. Verify Production schema compatibility/i);
  assert.match(runbook, /3\. Deploy code that depends on synthetic filters/i);
});
