import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const serverOnlyTests = new Set(['ticketmaster-discovery.test.ts']);
const databaseTests = new Set([
  'customer-documents-postgres.integration.test.ts',
  'marketplace-production-schema-contract.integration.test.ts',
  'schema-compatibility.integration.test.ts',
]);
const testFiles = readdirSync(new URL('../tests/', import.meta.url))
  .filter((file) => file.endsWith('.test.ts'))
  .sort();

function run(files, conditions = []) {
  if (files.length === 0) return;

  const result = spawnSync(
    process.execPath,
    [...conditions, '--import', 'tsx', '--test', ...files.map((file) => `tests/${file}`)],
    { stdio: 'inherit' },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(testFiles.filter((file) => !serverOnlyTests.has(file) && !databaseTests.has(file)));
for (const file of testFiles.filter((candidate) => databaseTests.has(candidate))) {
  run([file]);
}
run(testFiles.filter((file) => serverOnlyTests.has(file)), ['--conditions=react-server']);
