import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {BASELINE,PENDING,pendingVersions,modelAdoption,renderBaseline} from '../scripts/production-baseline-contract.mjs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const capture=JSON.parse(read('docs/production-schema-capture-2026-09-06.json'));
const plan=JSON.parse(read('docs/production-baseline-cutover-plan-2026-09-06.json'));
const ledger=JSON.parse(read('docs/production-ledger-capture-2026-09-06.json')).records;
test('checkpoint is unique, precedes pending versions, and never claims historical execution',()=>{
  assert.ok(BASELINE<PENDING[0]);assert.match(BASELINE,/^\d{14}$/);
  assert.ok(!ledger.some(r=>r.version===BASELINE));
  assert.ok(!plan.archive_files.some(r=>r.source.includes(BASELINE)));
  assert.equal(plan.active_directory_unchanged,true);assert.equal(plan.production_write_authorized,false);
});
test('archive plan preserves every immutable Git blob and both ambiguous migrations',()=>{
  assert.equal(plan.archive_files.length,45);
  assert.equal(plan.archive_files.filter(f=>f.source.includes('20260808120000')).length,2);
  assert.equal(plan.archive_files.filter(f=>f.pending_after_baseline).length,3);
  for(const f of plan.archive_files){
    const bytes=execFileSync('git',['cat-file','blob',f.git_blob]);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);
    assert.ok(f.archive.startsWith('supabase/migrations-history/'));
  }
});
test('baseline is exactly generated from capture, outside delivery directory, without pending effects',()=>{
  assert.equal(read(plan.baseline_file).replaceAll('\r\n','\n').trim(),renderBaseline(capture).trim());
  assert.ok(!capture.tables.some(t=>t.schema==='public'&&t.name==='customer_documents'));
  assert.ok(!capture.functions.some(f=>f.name==='activate_partner_with_attestation'));
  assert.ok(capture.grants.some(g=>g.schema==='public'&&g.object==='dabra_provider_attempts'&&g.grantee==='service_role'&&g.privilege==='TRUNCATE'));
  assert.ok(plan.baseline_file.startsWith('supabase/baseline/'));
});
test('pure adoption model fails closed and lists only the three forwards then empty',()=>{
  const before=structuredClone(ledger);
  const adopted=modelAdoption(ledger,before,false);
  assert.deepEqual(ledger,before);assert.deepEqual(pendingVersions(adopted),PENDING);
  assert.deepEqual(pendingVersions([...adopted,...PENDING]),[]);
  assert.throws(()=>modelAdoption(ledger.slice(1),ledger,false));
  assert.throws(()=>modelAdoption(ledger,ledger,true));
  const changed=structuredClone(ledger);changed[0].statement_md5='changed';
  assert.throws(()=>modelAdoption(changed,ledger,false));
});
test('function ACL identities retain the complete signature, never PostgreSQL name truncation',()=>{
  const known=new Set(capture.functions.filter(f=>f.schema==='public').map(f=>f.name+'('+f.arguments+')'));
  for(const g of capture.grants.filter(g=>g.schema==='public'&&g.kind==='function'))assert.ok(known.has(g.object),g.object);
  assert.match(JSON.parse(read('scripts/baseline-catalog-queries.json')).grants,/c\.relname::text AS object/);
});
