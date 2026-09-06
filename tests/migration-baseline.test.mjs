import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { duplicateVersions, validateManifest } from '../scripts/check-migration-baseline.mjs';

const manifest = JSON.parse(readFileSync(new URL('../docs/production-migration-reconciliation-2026-09-06.json', import.meta.url), 'utf8'));
const files = readdirSync(new URL('../supabase/migrations', import.meta.url)).filter(f => f.endsWith('.sql'));
test('manifest covers all local migrations and all 47 remote snapshot records', () => {
  assert.equal(validateManifest(manifest, files), true);
  assert.deepEqual(manifest.inventory_counts, {remote_only_versions:42,local_only_files:40,local_only_distinct_versions:39});
});
test('duplicate detector rejects ambiguous timestamps independent of suffix or SQL', () => {
  assert.equal(duplicateVersions(['20260101000000_a.sql','20260101000000_b.sql']).length, 1);
  assert.deepEqual(duplicateVersions(['20260101000000_a.sql','20260101000001_b.sql']), []);
  assert.throws(() => duplicateVersions(['bad.sql']), /Invalid/);
  assert.deepEqual(duplicateVersions(files).map(([version]) => version), ['20260808120000']);
});
test('actual CI command returns nonzero on the unresolved duplicate; no baseline exception', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-migration-baseline.mjs', import.meta.url))], { encoding:'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /MIGRATION_MANIFEST=PASS/);
  assert.match(result.stderr, /DUPLICATE_MIGRATION_VERSIONS=.*20260808120000/);
});
test('unknown history and pending schema cannot be marked applied by the manifest', () => {
  for (const classification of ['U', 'PENDING']) {
    const changed = structuredClone(manifest);
    changed.records.find(r => r.classification === classification).safe_history_action = 'PAIRED_REPAIR';
    assert.throws(() => validateManifest(changed, files));
  }
});
test('repair candidates require exact SQL and complete paired identity', () => {
  const changed = structuredClone(manifest);
  changed.records.find(r => r.safe_history_action === 'PAIRED_REPAIR').sql_equivalence = 'DIFFERENT';
  assert.throws(() => validateManifest(changed, files), /Repair requires/);
});
test('unknown four and shared-version divergences remain preserved or blocked', () => {
  for (const version of manifest.unknown_four) {
    const row = manifest.records.find(r => r.record_id === `remote:${version}`);
    assert.equal(row.classification, 'U'); assert.equal(row.safe_history_action, 'PRESERVE');
  }
  for (const version of ['20260827152245','20260827155608','20260827155935','20260827160824']) {
    const row = manifest.records.find(r => r.record_id === `remote:${version}`);
    assert.equal(row.classification, 'M'); assert.equal(row.safe_history_action, 'DO_NOT_REPAIR');
  }
});
test('manifest rejects missing coverage, duplicates, and Production write authorization', () => {
  const changed = structuredClone(manifest);
  changed.records.push(changed.records[0]);
  assert.throws(() => validateManifest(changed, files), /Duplicate/);
  assert.throws(() => validateManifest(manifest, [...files, '20990101000000_unclassified.sql']), /Unclassified/);
  assert.throws(() => validateManifest({...manifest,production_write_authorized:true}, files), /must not authorize/);
});
