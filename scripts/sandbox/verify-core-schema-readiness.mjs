import process from 'node:process';
import { Client } from 'pg';

const REQUIRED_TABLES = ['products', 'product_categories', 'product_images', 'product_features'];

function fail(message) {
  throw new Error(message);
}

async function main() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    fail('Missing DATABASE_URL.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const { rows } = await client.query(
      `
      SELECT
        c.table_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        EXISTS (
          SELECT 1
          FROM pg_attribute a
          JOIN pg_class cl ON cl.oid = a.attrelid
          JOIN pg_namespace ns ON ns.oid = cl.relnamespace
          WHERE ns.nspname = 'public'
            AND cl.relname = c.table_name
            AND a.attname = 'synthetic'
            AND a.attnotnull = true
        ) AS attnotnull
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.column_name = 'synthetic'
        AND c.table_name = ANY($1::text[])
      ORDER BY c.table_name
      `,
      [REQUIRED_TABLES],
    );

    const byTable = new Map(rows.map((row) => [String(row.table_name), row]));
    const errors = [];

    for (const table of REQUIRED_TABLES) {
      const row = byTable.get(table);
      if (!row) {
        errors.push(`${table}.synthetic missing`);
        continue;
      }

      if (String(row.data_type).toLowerCase() !== 'boolean') {
        errors.push(`${table}.synthetic type must be boolean`);
      }

      if (String(row.is_nullable).toUpperCase() !== 'NO' || row.attnotnull !== true) {
        errors.push(`${table}.synthetic must be NOT NULL`);
      }

      const defaultText = String(row.column_default || '').toLowerCase();
      if (!(defaultText.includes('false'))) {
        errors.push(`${table}.synthetic default must be false`);
      }
    }

    const expectedIndexes = [
      'idx_products_public_status_synthetic',
      'idx_products_public_category_synthetic',
      'idx_product_categories_synthetic',
      'idx_product_images_product_synthetic',
      'idx_product_features_product_synthetic',
    ];

    const { rows: indexRows } = await client.query(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = ANY($1::text[])
      `,
      [expectedIndexes],
    );

    const seen = new Set(indexRows.map((row) => String(row.indexname)));
    for (const indexName of expectedIndexes) {
      if (!seen.has(indexName)) {
        errors.push(`missing index ${indexName}`);
      }
    }

    const checks = {};
    for (const table of REQUIRED_TABLES) {
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::bigint AS total_rows, COUNT(*) FILTER (WHERE synthetic IS NULL)::bigint AS null_synthetic_rows FROM public.${table}`,
      );
      checks[table] = {
        totalRows: Number(countRows[0].total_rows),
        nullSyntheticRows: Number(countRows[0].null_synthetic_rows),
      };
      if (checks[table].nullSyntheticRows !== 0) {
        errors.push(`${table} has NULL synthetic rows`);
      }
    }

    if (errors.length > 0) {
      console.error(
        JSON.stringify(
          {
            pass: false,
            errors,
            tableChecks: checks,
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      JSON.stringify(
        {
          pass: true,
          tableChecks: checks,
          validatedTables: REQUIRED_TABLES,
          validatedIndexes: expectedIndexes,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Core schema verification failed.');
  process.exitCode = 1;
});
