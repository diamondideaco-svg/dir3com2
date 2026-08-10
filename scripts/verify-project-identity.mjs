import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const registryPath = path.join(root, 'config', 'project-identity.json');
const humanRegistryPath = path.join(root, 'PROJECT_IDENTITY.md');
const sensitiveProductionOperations = new Set([
  'production-migration',
  'production-deployment',
  'database-write',
  'backup-restore',
]);

function fail(message) {
  throw new Error(`PROJECT_IDENTITY_BLOCKED: ${message}`);
}

function readRegistry() {
  if (!fs.existsSync(registryPath) || !fs.existsSync(humanRegistryPath)) {
    fail('canonical registry files are missing');
  }
  const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  if (!parsed || parsed.schemaVersion !== 1) {
    fail('unsupported or missing registry schema version');
  }
  return parsed;
}

function normalizeRepository(value) {
  return String(value || '').trim().replace(/^git@github\.com:/i, '').replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').toLowerCase();
}

function resolveRepositoryIdentity() {
  if (process.env.GITHUB_REPOSITORY) return normalizeRepository(process.env.GITHUB_REPOSITORY);
  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' });
  if (remote.status !== 0) fail('repository identity cannot be resolved from GITHUB_REPOSITORY or git origin');
  return normalizeRepository(remote.stdout);
}

function projectRefFromValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (/^[a-z0-9]{20}$/.test(raw)) return raw;
  const hostMatch = raw.match(/(?:https?:\/\/)?(?:db\.)?([a-z0-9]{20})\.supabase\.co/);
  if (hostMatch) return hostMatch[1];
  const poolerMatch = raw.match(/postgres\.([a-z0-9]{20})@/);
  return poolerMatch?.[1] || null;
}

function requestedOperation() {
  const flag = process.argv.find((arg) => arg.startsWith('--operation='));
  return String(flag?.slice('--operation='.length) || process.env.PROJECT_IDENTITY_OPERATION || 'audit').trim().toLowerCase();
}

function requestedTargetRef() {
  return projectRefFromValue(process.env.TARGET_SUPABASE_REF) || projectRefFromValue(process.env.SUPABASE_PROJECT_REF) || projectRefFromValue(process.env.SUPABASE_URL) || projectRefFromValue(process.env.NEXT_PUBLIC_SUPABASE_URL) || projectRefFromValue(process.env.DATABASE_URL) || projectRefFromValue(process.env.POSTGRES_URL);
}

function normalizeProjectName(value) {
  return String(value || '').trim().toLowerCase();
}

function requestedVercelProjectName() {
  return normalizeProjectName(process.env.VERCEL_PROJECT_NAME || process.env.VERCEL_PROJECT || process.env.NEXT_PUBLIC_VERCEL_PROJECT_NAME);
}

function isVercelProductionEnvironment() {
  return normalizeProjectName(process.env.VERCEL_ENV) === 'production';
}

function walkFiles(startPath) {
  if (!fs.existsSync(startPath)) return [];
  const files = [];
  for (const entry of fs.readdirSync(startPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(startPath, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function assertNoLegacyProductionReferences(registry) {
  const legacyChecks = registry.legacyIdentifiers.map((entry) => ({
    type: String(entry.type || '').trim(),
    value: String(entry.value || '').trim(),
  }));
  const candidates = [...walkFiles(path.join(root, '.github')), ...walkFiles(path.join(root, 'scripts')), path.join(root, 'package.json'), path.join(root, 'vercel.json')].filter((file) => fs.existsSync(file));
  const allowedFiles = new Set([path.normalize(path.join(root, 'scripts', 'verify-project-identity.mjs'))]);
  const violations = [];
  for (const file of candidates) {
    if (allowedFiles.has(path.normalize(file))) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const legacy of legacyChecks) {
      if (!legacy.value) continue;
      if (legacy.type === 'vercel_project_name') {
        const escaped = legacy.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const contextualPatterns = [
          new RegExp(`"projectName"\\s*:\\s*"${escaped}"`, 'i'),
          new RegExp(`['\"]VERCEL_PROJECT_NAME['\"]?\\s*[:=]\\s*['\"]${escaped}['\"]`, 'i'),
          new RegExp(`\\b--project\\s+${escaped}\\b`, 'i'),
        ];
        if (contextualPatterns.some((pattern) => pattern.test(content))) {
          violations.push(`${path.relative(root, file)} -> ${legacy.value}`);
        }
        continue;
      }
      if (content.includes(legacy.value)) violations.push(`${path.relative(root, file)} -> ${legacy.value}`);
    }
  }
  if (violations.length) fail(`legacy identifiers found in production-sensitive files: ${violations.join(', ')}`);
}

function verify() {
  const registry = readRegistry();
  const actualRepository = resolveRepositoryIdentity();
  const expectedRepository = normalizeRepository(registry.repository.fullName);
  if (actualRepository !== expectedRepository) fail(`repository mismatch: expected ${expectedRepository}, received ${actualRepository || 'UNKNOWN'}`);
  if (registry.supabase.stagingRef === registry.supabase.productionRef) fail('Staging and Production Supabase refs must never match');
  assertNoLegacyProductionReferences(registry);

  const operation = requestedOperation();
  const targetRef = requestedTargetRef();
  const isProductionContext = sensitiveProductionOperations.has(operation) || isVercelProductionEnvironment();
  const requestedVercelProject = requestedVercelProjectName();
  const legacySupabaseRefs = new Set(registry.legacyIdentifiers.filter((entry) => entry.type === 'supabase_project_ref').map((entry) => entry.value));
  const legacyVercelProjectNames = new Set(registry.legacyIdentifiers.filter((entry) => entry.type === 'vercel_project_name').map((entry) => normalizeProjectName(entry.value)));
  if (targetRef && legacySupabaseRefs.has(targetRef)) fail(`target Supabase ref ${targetRef} is explicitly LEGACY — DO NOT USE`);
  if (requestedVercelProject && legacyVercelProjectNames.has(requestedVercelProject)) fail(`Vercel project name ${requestedVercelProject} is explicitly LEGACY — DO NOT USE`);

  if (operation === 'sandbox-migration' && (!targetRef || targetRef !== registry.supabase.stagingRef)) {
    fail('sandbox migration requires the exact canonical Staging Supabase ref');
  }

  if (isProductionContext) {
    const vercelProjectId = String(process.env.VERCEL_PROJECT_ID || '').trim();
    if (!vercelProjectId) fail('Production operation requires VERCEL_PROJECT_ID');
    if (vercelProjectId !== registry.vercel.projectId) fail('Production deployment is not targeting the canonical Vercel project');
    if (!targetRef) fail('Production operation target is UNKNOWN');
    if (registry.supabase.productionStatus !== 'VERIFIED' || !registry.supabase.productionRef) fail(`Production Supabase is ${registry.supabase.productionStatus || 'UNVERIFIED'}`);
    if (targetRef !== registry.supabase.productionRef) fail('Production operation target does not match the verified Production Supabase ref');
  }

  console.log(JSON.stringify({ ok: true, repository: expectedRepository, vercelProject: registry.vercel.projectName, operation, productionSupabaseStatus: registry.supabase.productionStatus, productionDatabaseOperationsBlocked: registry.supabase.productionStatus !== 'VERIFIED' }, null, 2));
}

try {
  verify();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'PROJECT_IDENTITY_BLOCKED');
  process.exitCode = 1;
}
