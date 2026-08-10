import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const STAGING_PROJECT_REF = 'ynupwivgvwcyrsdhtkcc';

function fail(message) {
  throw new Error(message);
}

function runProjectIdentityGuard() {
  const identityGuard = spawnSync(process.execPath, ['scripts/verify-project-identity.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      PROJECT_IDENTITY_OPERATION: 'sandbox-migration',
      TARGET_SUPABASE_REF: STAGING_PROJECT_REF,
    },
  });

  if (identityGuard.status !== 0) {
    throw new Error(String(identityGuard.stderr || identityGuard.stdout || 'Project identity guard failed.').trim());
  }
}

function runTargetGuard() {
  const guard = spawnSync(process.execPath, ['scripts/sandbox/resolve-target-env.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  const output = String(guard.stdout || '').trim();
  if (guard.status !== 0) {
    throw new Error(output || 'Sandbox target guard failed.');
  }

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error('Sandbox target guard returned unreadable output.');
  }

  if (parsed.decision !== 'OK') {
    throw new Error('Sandbox target guard blocked execution.');
  }

  if (parsed.projectRef !== STAGING_PROJECT_REF) {
    throw new Error('Sandbox target project ref mismatch.');
  }

  return parsed;
}

export function runStagingSqlWithGuard(filePath, mode) {
  if (mode !== 'apply' && mode !== 'rollback') {
    fail('Mode must be apply or rollback.');
  }

  const resolvedFile = path.resolve(filePath);
  if (!fs.existsSync(resolvedFile)) {
    fail(`SQL file not found: ${resolvedFile}`);
  }

  const execute = process.argv.includes('--execute');
  runProjectIdentityGuard();
  const guard = runTargetGuard();

  if (!execute) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode,
          decision: 'DRY_RUN_ONLY',
          projectRef: guard.projectRef,
          sqlFile: resolvedFile,
          next: `Re-run with --execute to apply staging-only ${mode}.`,
        },
        null,
        2,
      ),
    );
    return;
  }

  const run = spawnSync('supabase', ['db', 'query', '--linked', '--file', resolvedFile], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (run.status !== 0) {
    fail(`supabase db query failed for ${mode}.`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        decision: 'EXECUTED',
        projectRef: guard.projectRef,
        sqlFile: resolvedFile,
      },
      null,
      2,
    ),
  );
}
