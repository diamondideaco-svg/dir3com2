import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('real db: canonical products contract works without is_active and fails closed', { skip: !databaseUrl }, async () => {
  assert.ok(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS marketplace_contract CASCADE; CREATE SCHEMA marketplace_contract');
    await client.query(`
      CREATE TABLE marketplace_contract.products (
        id uuid PRIMARY KEY,
        status text NOT NULL DEFAULT 'draft',
        deleted_at timestamptz,
        synthetic boolean NOT NULL DEFAULT false,
        marketplace_environment text NOT NULL DEFAULT 'production',
        fulfilment_state text NOT NULL DEFAULT 'catalog_only',
        transaction_method text NOT NULL DEFAULT 'none'
      )
    `);

    const rows = [
      ['00000000-0000-4000-8000-000000000001', 'published', null, false, 'production', 'verified_requestable', 'request_to_confirm'],
      ['00000000-0000-4000-8000-000000000002', 'published', null, false, 'production', 'verified_quote', 'request_quote'],
      ['00000000-0000-4000-8000-000000000003', 'published', null, false, 'production', 'live_bookable', 'instant_booking'],
      ['00000000-0000-4000-8000-000000000004', 'hidden', null, false, 'production', 'live_bookable', 'instant_booking'],
      ['00000000-0000-4000-8000-000000000005', 'draft', null, true, 'production', 'catalog_only', 'none'],
    ];
    for (const row of rows) {
      await client.query('INSERT INTO marketplace_contract.products VALUES ($1,$2,$3,$4,$5,$6,$7)', row);
    }

    const columns = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='marketplace_contract' AND table_name='products'`);
    assert.equal(columns.rows.some((row) => row.column_name === 'is_active'), false);

    const selected = await client.query('SELECT id, status, deleted_at, synthetic, marketplace_environment, fulfilment_state, transaction_method FROM marketplace_contract.products');
    assert.equal(selected.rowCount, 5);

    const publicRows = await client.query(`
      SELECT id FROM marketplace_contract.products
      WHERE status IN ('published', 'active', 'featured')
        AND deleted_at IS NULL
        AND synthetic = false
        AND marketplace_environment = 'production'
        AND fulfilment_state <> 'test_sandbox'
    `);
    assert.deepEqual(publicRows.rows.map((row) => row.id), rows.slice(0, 3).map((row) => row[0]));

    const transactional = await client.query(`
      SELECT id FROM marketplace_contract.products
      WHERE status IN ('published', 'active', 'featured')
        AND deleted_at IS NULL
        AND synthetic = false
        AND marketplace_environment = 'production'
        AND (
          (fulfilment_state = 'live_bookable' AND transaction_method = 'instant_booking') OR
          (fulfilment_state = 'verified_requestable' AND transaction_method = 'request_to_confirm') OR
          (fulfilment_state = 'verified_quote' AND transaction_method = 'request_quote')
        )
    `);
    assert.deepEqual(transactional.rows.map((row) => row.id), rows.slice(0, 3).map((row) => row[0]));
  } finally {
    await client.query('DROP SCHEMA IF EXISTS marketplace_contract CASCADE');
    await client.end();
  }
});
