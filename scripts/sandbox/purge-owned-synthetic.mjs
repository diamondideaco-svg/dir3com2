import process from 'node:process';
import { Client } from 'pg';

const REQUIRED_TABLES = [
  'product_categories',
  'partners',
  'partner_services',
  'partner_coverage',
  'products',
  'product_images',
  'product_features',
  'product_prices',
  'product_availability',
  'bookings',
  'booking_status_history',
  'payment_transactions',
];

const OWNERSHIP_COLUMNS = ['sandbox_run_id', 'dataset_id', 'seed_batch_id'];

function fail(message) {
  throw new Error(message);
}

async function loadColumns(client) {
  const sql = `
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
      AND column_name = ANY($2::text[])
  `;

  const { rows } = await client.query(sql, [REQUIRED_TABLES, OWNERSHIP_COLUMNS]);
  const byTable = new Map();
  for (const row of rows) {
    const table = String(row.table_name);
    const col = String(row.column_name);
    if (!byTable.has(table)) byTable.set(table, new Set());
    byTable.get(table).add(col);
  }

  return byTable;
}

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  const ownerColumn = String(process.env.SANDBOX_PURGE_OWNER_COLUMN || '').trim();
  const ownerValue = String(process.env.SANDBOX_PURGE_OWNER_VALUE || '').trim();

  if (!databaseUrl) {
    fail('Missing DATABASE_URL.');
  }

  if (!ownerColumn || !OWNERSHIP_COLUMNS.includes(ownerColumn)) {
    fail(`SANDBOX_PURGE_OWNER_COLUMN must be one of: ${OWNERSHIP_COLUMNS.join(', ')}`);
  }

  if (!ownerValue) {
    fail('Missing SANDBOX_PURGE_OWNER_VALUE. Refusing broad synthetic purge.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const columnsByTable = await loadColumns(client);
    const missingOwnership = REQUIRED_TABLES.filter((table) => !columnsByTable.get(table)?.has(ownerColumn));

    if (missingOwnership.length > 0) {
      fail(`Ownership column ${ownerColumn} is missing from: ${missingOwnership.join(', ')}. Refusing purge.`);
    }

    await client.query('BEGIN');
    const result = {};

    for (const table of REQUIRED_TABLES) {
      const sql = `DELETE FROM public.${table} WHERE synthetic = true AND ${ownerColumn} = $1`;
      const res = await client.query(sql, [ownerValue]);
      result[table] = res.rowCount || 0;
    }

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          pass: true,
          ownershipColumn: ownerColumn,
          ownerValueRedacted: true,
          deletedRowsByTable: result,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Owned synthetic purge failed.');
  process.exitCode = 1;
});
