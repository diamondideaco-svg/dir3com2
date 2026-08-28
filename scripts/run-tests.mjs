import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const serverOnlyTests = new Set(['ticketmaster-discovery.test.ts']);
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

run(testFiles.filter((file) => !serverOnlyTests.has(file)));
run(testFiles.filter((file) => serverOnlyTests.has(file)), ['--conditions=react-server']);
