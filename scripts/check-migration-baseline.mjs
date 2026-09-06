import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { BASELINE, PENDING } from './production-baseline-contract.mjs';

export function validateCutover(plan, active, archived, readBytes) {
  if (JSON.stringify(plan.proposed_active_versions) !== JSON.stringify([BASELINE,...PENDING])) throw new Error('Invalid active ordering/approved versions');
  if (duplicateVersions(active).length) throw new Error('Duplicate active version');
  const expected = plan.active_files.map(f => f.path.replace('supabase/migrations/', '')).sort();
  if (JSON.stringify([...active].sort()) !== JSON.stringify(expected)) throw new Error('Unexpected active migration chain');
  if (JSON.stringify(plan.proposed_active_versions) !== JSON.stringify(expected.map(f => f.slice(0,14)))) throw new Error('Invalid active ordering');
  if (plan.archive_files.length !== 45) throw new Error('Archive inventory mismatch');
  const archiveNames = plan.archive_files.map(f => f.archive.replace('supabase/migrations-archive/', '')).sort();
  if (new Set(archiveNames).size !== 45 || JSON.stringify([...archived].sort()) !== JSON.stringify(archiveNames)) throw new Error('Missing or unexpected archived evidence');
  for (const f of plan.archive_files) {
    if (f.archive !== 'supabase/migrations-archive/' + f.source.split('/').at(-1)) throw new Error('Archive path mismatch');
    const bytes = readBytes(f.archive);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const blob = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    if (hash !== f.sha256 || blob !== f.git_blob) throw new Error('Modified archived bytes: ' + f.archive);
  }
  for (const f of plan.active_files) {
    if (!/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(f.path)) throw new Error('Invalid active path');
    if (createHash('sha256').update(readBytes(f.path)).digest('hex') !== f.sha256) throw new Error('Active SQL hash mismatch');
  }
  return true;
}

export function duplicateVersions(files) {
  const groups = new Map();
  for (const file of files) {
    const match = /^(\d{14})_.+\.sql$/.exec(file);
    if (!match) throw new Error(`Invalid migration filename: ${file}`);
    groups.set(match[1], [...(groups.get(match[1]) || []), file]);
  }
  return [...groups].filter(([, names]) => names.length > 1);
}

export function validateManifest(manifest, files) {
  const required = ['remote_version', 'remote_name', 'local_version', 'local_filename', 'classification', 'sql_equivalence', 'production_object_evidence', 'safe_history_action', 'reason', 'provenance_commit_or_pr', 'reviewer_required'];
  const classes = new Set(['E', 'V', 'H', 'M', 'U', 'PENDING']);
  const actions = new Set(['PRESERVE', 'PAIRED_REPAIR', 'DO_NOT_REPAIR', 'PENDING_SCHEMA']);
  const ids = new Set();
  for (const row of manifest.records) {
    for (const key of required) if (!(key in row)) throw new Error(`Missing ${key}`);
    if (!classes.has(row.classification) || !actions.has(row.safe_history_action)) throw new Error('Invalid classification/action');
    if (ids.has(row.record_id)) throw new Error('Duplicate manifest record');
    ids.add(row.record_id);
    if (row.reviewer_required !== true) throw new Error('Independent review required');
    if (row.remote_version !== null && !/^\d{14}$/.test(row.remote_version)) throw new Error('Invalid remote version');
    if (row.local_filename && row.local_filename.match(/\/(\d{14})_/)?.[1] !== row.local_version) throw new Error('Local version/filename mismatch');
    if (!row.reason || !row.production_object_evidence) throw new Error('Evidence and rationale required');
    if (row.classification === 'U' && row.safe_history_action !== 'PRESERVE') throw new Error('Unknown history must be preserved');
    if (row.classification === 'PENDING' && row.safe_history_action !== 'PENDING_SCHEMA') throw new Error('Pending schema cannot be repaired as applied');
    if (row.safe_history_action === 'PAIRED_REPAIR' && (row.sql_equivalence !== 'EXACT_AFTER_LINE_ENDING_AND_EDGE_WHITESPACE_NORMALIZATION' || !row.remote_version || !row.local_version)) throw new Error('Repair requires exact mapped SQL');
    if (row.local_filename && !files.includes(row.local_filename.replace('supabase/migrations/', ''))) throw new Error(`Missing local file: ${row.local_filename}`);
  }
  for (const file of files) if (!manifest.records.some(r => r.local_filename === `supabase/migrations/${file}`)) throw new Error(`Unclassified local file: ${file}`);
  const remote = manifest.records.filter(r => r.record_id.startsWith('remote:'));
  if (remote.length !== manifest.remote_snapshot_count || new Set(remote.map(r => r.remote_version)).size !== remote.length) throw new Error('Remote snapshot coverage mismatch');
  if (manifest.production_write_authorized !== false) throw new Error('Manifest must not authorize Production writes');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = readdirSync(resolve(root, 'supabase/migrations')).filter(f => f.endsWith('.sql'));
  const manifest = JSON.parse(readFileSync(resolve(root, 'docs/production-migration-reconciliation-2026-09-06.json'), 'utf8'));
  const plan = JSON.parse(readFileSync(resolve(root, 'docs/production-baseline-cutover-plan-2026-09-06.json'), 'utf8'));
  const archived = readdirSync(resolve(root, 'supabase/migrations-archive')).filter(f => f.endsWith('.sql'));
  validateManifest(manifest, archived);
  validateCutover(plan, files, archived, p => readFileSync(resolve(root, p)));
  for (const row of manifest.records.filter(r => r.local_filename)) {
    const entry = plan.archive_files.find(f => f.source === row.local_filename);
    if (!entry || row.archive_filename !== entry.archive || row.archive_sha256 !== entry.sha256 || row.archive_git_blob !== entry.git_blob) throw new Error('Manifest archive mapping mismatch');
  }
  console.log('MIGRATION_MANIFEST=PASS');
  console.log('ACTIVE_PATH=PASS ARCHIVE_INTEGRITY=PASS');
  const duplicates = duplicateVersions(files);
  if (duplicates.length) {
    console.error(`DUPLICATE_MIGRATION_VERSIONS=${JSON.stringify(duplicates)}`);
    process.exitCode = 1;
  } else console.log('DUPLICATE_MIGRATION_VERSIONS=NONE');
}
