import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const migrationPath = path.resolve('supabase/migrations/20260810102000_dgr071_core_synthetic_compatibility.sql');

if (!databaseUrl) {
  console.error('Missing DATABASE_URL.');
  process.exitCode = 1;
} else {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const client = new Client({ connectionString: databaseUrl });
  client
    .connect()
    .then(() => client.query(sql))
    .then(() => {
      console.log('core_migration_applied_to_target_db');
    })
    .finally(async () => {
      await client.end();
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Failed to apply core migration.');
      process.exitCode = 1;
    });
}
