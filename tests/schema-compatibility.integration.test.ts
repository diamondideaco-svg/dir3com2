import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';

import { isSyntheticSchemaRolloutError } from '@/lib/marketplace/synthetic-compat';

const coreMigrationPath = path.resolve('supabase/migrations/20260810102000_dgr071_core_synthetic_compatibility.sql');
const stagingMigrationPath = path.resolve('supabase/staging-only/sandbox/20260810090000_sandbox_synthetic_training_layer.sql');
const rollbackPath = path.resolve('supabase/staging-only/sandbox/20260810090000_sandbox_synthetic_training_layer.rollback.sql');

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

function read(filePath: string) {
  return fs.readFileSync(filePath, 'utf8');
}

function requireDatabaseUrl() {
  if (!databaseUrl) {
    throw new Error('Missing TEST_DATABASE_URL or DATABASE_URL for real PostgreSQL integration tests.');
  }
  return databaseUrl;
}

function randomId(seed: string) {
  const clean = seed.padEnd(32, '0').slice(0, 32);
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
}

async function withDb<T>(run: (client: Client) => Promise<T>) {
  const connectionString = requireDatabaseUrl();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      try {
        return await run(client);
      } finally {
        await client.end();
      }
    } catch (error) {
      lastError = error;
      try {
        await client.end();
      } catch {
        // Best effort cleanup between retries.
      }

      if (attempt < 20) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  throw new Error(
    `Failed to connect to test PostgreSQL after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function resetPublicSchema(client: Client) {
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
}

async function createProductionLikeSchema(client: Client) {
  await client.query(`
    CREATE TABLE public.product_categories (
      id uuid PRIMARY KEY,
      slug text,
      name_ar text,
      name_en text,
      description_ar text,
      description_en text
    );

    CREATE TABLE public.products (
      id uuid PRIMARY KEY,
      slug text,
      status text,
      name_ar text,
      name_en text,
      description_ar text,
      description_en text,
      city text,
      base_price numeric(12,2),
      currency text,
      featured boolean DEFAULT false,
      created_at timestamptz DEFAULT now(),
      category_id uuid REFERENCES public.product_categories(id),
      verified boolean DEFAULT false,
      shield_certified boolean DEFAULT false
    );

    CREATE TABLE public.product_images (
      id uuid PRIMARY KEY,
      product_id uuid REFERENCES public.products(id),
      image_url text,
      is_primary boolean DEFAULT false,
      sort_order integer DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      caption text
    );

    CREATE TABLE public.product_features (
      id uuid PRIMARY KEY,
      product_id uuid REFERENCES public.products(id),
      feature_text_ar text,
      feature_text_en text,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.product_prices (
      id uuid PRIMARY KEY,
      product_id uuid REFERENCES public.products(id),
      price numeric(12,2),
      currency text,
      valid_from date,
      valid_to date,
      rule_name text
    );

    CREATE TABLE public.product_availability (
      id uuid PRIMARY KEY,
      product_id uuid REFERENCES public.products(id),
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.partners (
      id uuid PRIMARY KEY,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.partner_services (
      id uuid PRIMARY KEY,
      partner_id uuid REFERENCES public.partners(id),
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.partner_coverage (
      id uuid PRIMARY KEY,
      partner_id uuid REFERENCES public.partners(id),
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.bookings (
      id uuid PRIMARY KEY,
      currency text DEFAULT 'SAR',
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.booking_status_history (
      id uuid PRIMARY KEY,
      booking_id uuid REFERENCES public.bookings(id),
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE public.payment_transactions (
      id uuid PRIMARY KEY,
      booking_id uuid REFERENCES public.bookings(id),
      created_at timestamptz DEFAULT now()
    );
  `);
}

test('real db: core migration enforces synthetic schema and preserves bookings currency default', { concurrency: false }, async () => {
  await withDb(async (client) => {
    await resetPublicSchema(client);
    await createProductionLikeSchema(client);

    const categoryId = randomId('1001');
    const businessProductId = randomId('2001');
    const syntheticProductId = randomId('2002');

    await client.query(
      `INSERT INTO public.product_categories (id, slug, name_ar, name_en) VALUES ($1, 'cars', 'سيارات', 'Cars')`,
      [categoryId],
    );

    await client.query(
      `INSERT INTO public.products (id, slug, status, name_ar, name_en, category_id, currency, base_price, featured)
       VALUES ($1, 'city-transfer', 'published', 'انتقال مدينة', 'City Transfer', $2, 'SAR', 100, true)`,
      [businessProductId, categoryId],
    );

    await client.query(
      `INSERT INTO public.product_images (id, product_id, image_url, is_primary) VALUES ($1, $2, 'https://img/business', true)`,
      [randomId('3001'), businessProductId],
    );

    await client.query(
      `INSERT INTO public.product_features (id, product_id, feature_text_en) VALUES ($1, $2, 'Business feature')`,
      [randomId('4001'), businessProductId],
    );

    await client.query(read(coreMigrationPath));

    const expectedTables = ['products', 'product_categories', 'product_images', 'product_features'];
    for (const tableName of expectedTables) {
      const { rows } = await client.query(
        `SELECT data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 AND column_name='synthetic'`,
        [tableName],
      );
      assert.equal(rows.length, 1, `${tableName}.synthetic missing`);
      assert.equal(String(rows[0].data_type).toLowerCase(), 'boolean');
      assert.equal(String(rows[0].is_nullable).toUpperCase(), 'NO');
      assert.match(String(rows[0].column_default || '').toLowerCase(), /false/);

      const nullCheck = await client.query(`SELECT COUNT(*)::int AS c FROM public.${tableName} WHERE synthetic IS NULL`);
      assert.equal(Number(nullCheck.rows[0].c), 0, `${tableName} contains null synthetic values`);
    }

    const bookingDefault = await client.query(
      `SELECT column_default
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name='bookings' AND column_name='currency'`,
    );
    assert.match(String(bookingDefault.rows[0].column_default || ''), /SAR/i);

    await client.query(
      `INSERT INTO public.products (id, slug, status, name_ar, name_en, category_id, currency, base_price, featured, synthetic)
       VALUES ($1, 'sandbox-transfer', 'published', 'رحلة صناعية', 'Synthetic Transfer', $2, 'SAR', 120, false, true)`,
      [syntheticProductId, categoryId],
    );

    await client.query(
      `INSERT INTO public.product_images (id, product_id, image_url, is_primary, synthetic) VALUES ($1, $2, 'https://img/synth', true, true)`,
      [randomId('3002'), syntheticProductId],
    );

    const visibleProducts = await client.query(
      `SELECT slug
       FROM public.products
       WHERE status IN ('published', 'active', 'featured')
         AND synthetic = false
       ORDER BY slug`,
    );
    assert.deepEqual(visibleProducts.rows.map((row) => row.slug), ['city-transfer']);

    const visibleImages = await client.query(
      `SELECT image_url
       FROM public.product_images
       WHERE product_id = $1
         AND synthetic = false`,
      [businessProductId],
    );
    assert.equal(visibleImages.rows.length, 1);
  });
});

test('real db: error classifier does not trigger for unrelated schema/permission/errors', { concurrency: false }, async () => {
  await withDb(async (client) => {
    await resetPublicSchema(client);
    await createProductionLikeSchema(client);
    await client.query(read(coreMigrationPath));

    try {
      await client.query('SELECT missing_col FROM public.products WHERE synthetic = false');
      assert.fail('Expected missing column error');
    } catch (error) {
      const dbErr = error as { code?: string; message?: string };
      assert.equal(dbErr.code, '42703');
      assert.equal(isSyntheticSchemaRolloutError(dbErr), false);
    }

    try {
      await client.query("DO $$ BEGIN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'permission denied for relation products'; END $$;");
      assert.fail('Expected simulated permission error');
    } catch (error) {
      const dbErr = error as { code?: string; message?: string };
      assert.equal(dbErr.code, '42501');
      assert.equal(isSyntheticSchemaRolloutError(dbErr), false);
    }

    try {
      await client.query("DO $$ BEGIN RAISE EXCEPTION 'synthetic keyword appears but this is not missing column'; END $$;");
      assert.fail('Expected custom error');
    } catch (error) {
      const dbErr = error as { code?: string; message?: string };
      assert.notEqual(dbErr.code, '42703');
      assert.equal(isSyntheticSchemaRolloutError(dbErr), false);
    }

    assert.equal(
      isSyntheticSchemaRolloutError({ code: '42703', message: 'column "synthetic" does not exist' }),
      true,
    );
  });
});

test('real db: staging rollback stays non-destructive and purge fails closed without ownership marker', { concurrency: false }, async () => {
  await withDb(async (client) => {
    await resetPublicSchema(client);
    await createProductionLikeSchema(client);
    await client.query(read(stagingMigrationPath));

    const categoryId = randomId('5001');
    const productIdOwned = randomId('5002');
    const productIdOther = randomId('5003');

    await client.query(
      `INSERT INTO public.product_categories (id, slug, name_ar, name_en, synthetic, environment, reference_code)
       VALUES ($1, 'sandbox-cars', 'سيارات صناعية', 'Synthetic Cars', true, 'staging', 'TEST-OWN-CAT')`,
      [categoryId],
    );

    await client.query(
      `INSERT INTO public.products (id, slug, status, name_ar, name_en, category_id, currency, base_price, synthetic, environment, reference_code)
       VALUES
       ($1, 'sandbox-owned', 'published', 'منتج مملوك', 'Owned Synthetic', $3, 'SAR', 200, true, 'staging', 'TEST-OWN-1'),
       ($2, 'sandbox-unowned', 'published', 'منتج غير مملوك', 'Unowned Synthetic', $3, 'SAR', 220, true, 'staging', 'TEST-OTHER-1')`,
      [productIdOwned, productIdOther, categoryId],
    );

    await client.query(read(rollbackPath));

    const afterRollback = await client.query(
      `SELECT slug FROM public.products WHERE slug IN ('sandbox-owned', 'sandbox-unowned') ORDER BY slug`,
    );
    assert.deepEqual(afterRollback.rows.map((row) => row.slug), ['sandbox-owned', 'sandbox-unowned']);

    const purgeColumnCheck = await client.query(
      `SELECT COUNT(*)::int AS c
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='products'
         AND column_name IN ('sandbox_run_id', 'dataset_id', 'seed_batch_id')`,
    );
    assert.equal(Number(purgeColumnCheck.rows[0].c), 0);

    const purgeRun = spawnSync('node', ['scripts/sandbox/purge-owned-synthetic.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: requireDatabaseUrl(),
        SANDBOX_PURGE_OWNER_COLUMN: 'seed_batch_id',
        SANDBOX_PURGE_OWNER_VALUE: 'RUN-OWNED-001',
      },
      encoding: 'utf8',
    });
    assert.notEqual(purgeRun.status, 0);
    assert.match(`${purgeRun.stderr}\n${purgeRun.stdout}`, /ownership column seed_batch_id is missing/i);
  });
});
