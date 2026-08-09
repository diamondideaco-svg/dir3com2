import fs from 'node:fs';
import path from 'node:path';

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    result[key] = value;
  }
  return result;
}

function parseSupabaseRef(url) {
  try {
    const host = new URL(url).hostname;
    const ref = host.split('.')[0];
    return { host, ref };
  } catch {
    return { host: null, ref: null };
  }
}

const root = process.cwd();
const envLocal = readEnvFile(path.join(root, '.env.local'));
const linkedProjectPath = path.join(root, 'supabase', '.temp', 'linked-project.json');
const linkedRefPath = path.join(root, 'supabase', '.temp', 'project-ref');

const supabaseUrl = (process.env.SUPABASE_URL || envLocal.SUPABASE_URL || envLocal.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const appEnv = (process.env.APP_ENV || process.env.NEXT_PUBLIC_APP_ENV || '').trim().toLowerCase();
const hasServiceRoleKey = Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || envLocal.SUPABASE_SERVICE_ROLE_KEY || '').trim());

const parsed = parseSupabaseRef(supabaseUrl);
const linkedProject = fs.existsSync(linkedProjectPath) ? JSON.parse(fs.readFileSync(linkedProjectPath, 'utf8')) : null;
const linkedRef = fs.existsSync(linkedRefPath) ? fs.readFileSync(linkedRefPath, 'utf8').trim() : null;

const linkedName = String(linkedProject?.name || '').toLowerCase();
const isLinkedStaging = linkedName.includes('staging');
const isProbablyProduction = appEnv === 'production' || /prod/i.test(parsed.host || '') || /prod/i.test(linkedName);

const localDockerReady = false;
const selectedEnvironment = localDockerReady ? 'local' : 'staging';

const checks = {
  hasSupabaseUrl: Boolean(supabaseUrl),
  hasServiceRoleKey,
  linkedRefMatch: Boolean(parsed.ref && linkedRef && parsed.ref === linkedRef),
  isLinkedStaging,
  isProbablyProduction,
};

const safeResult = {
  selectedEnvironment,
  supabaseHost: parsed.host,
  projectRef: parsed.ref || linkedRef,
  linkedProjectName: linkedProject?.name || null,
  checks,
};

if (!checks.hasSupabaseUrl || !checks.hasServiceRoleKey || !checks.linkedRefMatch || !checks.isLinkedStaging || checks.isProbablyProduction) {
  console.log(JSON.stringify({ ...safeResult, decision: 'BLOCKED' }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ...safeResult, decision: 'OK' }, null, 2));
}
