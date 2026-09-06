import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const targetError = () => new Error('SANDBOX_DATABASE_TARGET_REQUIRED');
const forbiddenProjects = ['ynupwivgvwcyrsdhtkcc', 'rcrdjhoicbxiwgtyrift'];
// Fixed fixture hosts, never an environment-configurable allowlist.
const fixtureHosts = new Set(['localhost', '127.0.0.1', '[::1]', 'postgres', 'dir3com-pr93-pg17']);

export function disposableTarget(env) {
  try {
    if (env.SANDBOX_DISPOSABLE_DATABASE !== 'true' || env.NODE_ENV === 'production') throw targetError();
    const raw = env.DATABASE_URL;
    if (typeof raw !== 'string' || !raw || raw.trim() !== raw || /[\s\\]/.test(raw)) throw targetError();
    const decoded = decodeURIComponent(raw).toLowerCase();
    if (decoded.includes('supabase') || forbiddenProjects.some(ref => decoded.includes(ref))) throw targetError();
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !fixtureHosts.has(hostname)) throw targetError();
    // Reject pg host/hostaddr/service/options overrides rather than forwarding them.
    if (url.search || url.hash || !url.username) throw targetError();
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!/^(dir3com_test|pr101_sandbox_[a-f0-9]{16})$/.test(database)) throw targetError();
    const port = url.port ? Number(url.port) : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw targetError();
    // Explicit fields avoid pg re-parsing and ambient PGHOST/PGDATABASE defaults.
    return { host: hostname === 'localhost' ? '127.0.0.1' : hostname.replace(/^\[|\]$/g, ''),
      port, database, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      ssl: false, connectionTimeoutMillis: 5000 };
  } catch { throw targetError(); }
}

export async function applyCoreMigration({ env = process.env, createClient, readSql } = {}) {
  const config = disposableTarget(env); // Before reading SQL or constructing a client.
  const sql = (readSql || (() => fs.readFileSync(new URL('../../supabase/migrations-archive/20260810102000_dgr071_core_synthetic_compatibility.sql', import.meta.url), 'utf8')))();
  const client = createClient ? createClient(config) : new (await import('pg')).Client(config);
  try { await client.connect(); await client.query(sql); }
  finally { await client.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  applyCoreMigration().then(() => console.log('core_migration_applied_to_disposable_db')).catch(error => {
    console.error(error?.message === 'SANDBOX_DATABASE_TARGET_REQUIRED' ? error.message : 'SANDBOX_MIGRATION_FAILED');
    process.exitCode = 1;
  });
}
