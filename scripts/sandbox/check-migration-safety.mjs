import fs from 'node:fs';
import path from 'node:path';

const coreMigrationPath = path.resolve('supabase/migrations/20260810102000_dgr071_core_synthetic_compatibility.sql');
const servicesMigrationPath = path.resolve('supabase/migrations/20260810113000_dgr072_services_synthetic_compatibility.sql');
const stagingMigrationPath = path.resolve('supabase/staging-only/sandbox/20260810090000_sandbox_synthetic_training_layer.sql');
const rollbackPath = path.resolve('supabase/staging-only/sandbox/20260810090000_sandbox_synthetic_training_layer.rollback.sql');
const sqlRootPath = path.resolve('supabase');

function read(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function collectSqlFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSqlFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sql')) {
      files.push(fullPath);
    }
  }
  return files;
}

function startsWithUtf8Bom(filePath) {
  const bytes = fs.readFileSync(filePath);
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

try {
  const core = read(coreMigrationPath);
  const services = read(servicesMigrationPath);
  const staging = read(stagingMigrationPath);
  const rollback = read(rollbackPath);
  const sqlFiles = collectSqlFiles(sqlRootPath);
  const bomFiles = sqlFiles.filter(startsWithUtf8Bom);

  assert(bomFiles.length === 0, `SQL files must be UTF-8 without BOM. Found BOM in: ${bomFiles.join(', ')}`);

  assert(
    includesAll(core, [
      'ALTER TABLE IF EXISTS public.products',
      'ALTER TABLE IF EXISTS public.product_categories',
      'ALTER TABLE IF EXISTS public.product_images',
      'ALTER TABLE IF EXISTS public.product_features',
      'ALTER COLUMN synthetic SET DEFAULT false',
      'ALTER COLUMN synthetic SET NOT NULL',
    ]),
    'Core compatibility migration is missing required synthetic column changes.',
  );

  assert(
    includesAll(services, [
      'ALTER TABLE IF EXISTS public.services',
      'ADD COLUMN IF NOT EXISTS synthetic boolean',
      'UPDATE public.services SET synthetic = false WHERE synthetic IS NULL',
      'ALTER COLUMN synthetic SET DEFAULT false',
      'ALTER COLUMN synthetic SET NOT NULL',
    ]),
    'Services compatibility migration is missing required synthetic column changes.',
  );

  assert(!/ALTER\s+COLUMN\s+currency\s+SET\s+DEFAULT\s+'EGP'/i.test(core), 'Core migration must not change currency defaults.');
  assert(!/INSERT\s+INTO\s+public\.products/i.test(core), 'Core migration must not insert synthetic data.');
  assert(!/INSERT\s+INTO\s+public\.services/i.test(services), 'Services migration must not insert synthetic data.');
  assert(!/DROP\s+COLUMN/i.test(services), 'Services migration must be additive and non-destructive.');

  assert(!/ALTER\s+TABLE\s+IF\s+EXISTS\s+public\.bookings\s+\s*ALTER\s+COLUMN\s+currency\s+SET\s+DEFAULT\s+'EGP'/i.test(staging), 'Staging migration must not set bookings.currency default to EGP.');
  assert(/sandbox_migration_journal/i.test(staging), 'Staging migration must track ownership in sandbox_migration_journal.');

  assert(!/DROP\s+COLUMN/i.test(rollback), 'Rollback must be non-destructive and cannot drop columns.');
  assert(!/DELETE\s+FROM\s+public\.[a-z_]+\s+WHERE\s+synthetic\s*=\s*true/i.test(rollback), 'Rollback must not perform broad synthetic row deletions.');
  assert(!/ALTER\s+TABLE\s+IF\s+EXISTS\s+public\.bookings[\s\S]*ALTER\s+COLUMN\s+currency\s+SET\s+DEFAULT/i.test(rollback), 'Rollback must not mutate bookings.currency defaults.');
  assert(/sandbox_migration_journal/i.test(rollback), 'Rollback must verify ownership tracking before actions.');

  console.log(
    JSON.stringify(
      {
        pass: true,
        checks: {
          coreSyntheticCompatibility: true,
          coreNoCurrencyDefaultMutation: true,
          coreNoSyntheticSeedWrites: true,
          servicesSyntheticCompatibility: true,
          servicesNoSyntheticSeedWrites: true,
          servicesAdditiveNonDestructive: true,
          stagingNoBookingsCurrencyMutation: true,
          rollbackNonDestructive: true,
          rollbackNoBroadSyntheticDeletes: true,
          rollbackNoBookingsCurrencyMutation: true,
          rollbackOwnershipAware: true,
          noSqlUtf8Bom: true,
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Migration safety check failed.');
  process.exitCode = 1;
}
