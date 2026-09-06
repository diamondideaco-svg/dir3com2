import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {validateCutover as validate} from '../scripts/check-migration-baseline.mjs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root));
const plan=JSON.parse(read('docs/production-baseline-cutover-plan-2026-09-06.json'));
const active=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql'));
const archive=readdirSync(new URL('supabase/migrations-archive/',root)).filter(f=>f.endsWith('.sql'));
const forwards=JSON.parse(read('docs/post-cutover-migrations.json'));
const validateCutover=(plan,active,archive,read)=>validate(plan,active,archive,read,forwards);
test('frozen cutover plus explicitly registered forwards and 45 immutable archive blobs pass',()=>assert.equal(validateCutover(plan,active,archive,read),true));
test('forward registration fails closed for absent, duplicate, old, escaped or changed SQL',()=>{
 assert.throws(()=>validate(plan,active,archive,read),/active migration chain/);
 assert.throws(()=>validate(plan,active,archive,read,[...forwards,...forwards]),/Duplicate forward/);
 for(const path of ['../escaped.sql','supabase/migrations/20260808120000_old.sql'])
  assert.throws(()=>validate(plan,active,archive,read,[{...forwards[0],path}]),/Invalid forward/);
 assert.throws(()=>validate(plan,active,archive,p=>p===forwards[0].path?Buffer.from('changed'):read(p),forwards),/Forward SQL hash/);
 assert.equal(validate(plan,plan.active_files.map(f=>f.path.split('/').at(-1)),archive,read),true);
});
test('active duplicate rejected, including future duplicate names',()=>assert.throws(()=>validateCutover(plan,[...active,'20260906034500_future.sql'],archive,read),/Duplicate active/));
test('malformed, legacy or unapproved active files fail closed',()=>{
 for(const f of ['bad.sql','20260808120000_dgr055_canonical_profile_provisioning.sql','20990101000000_future.sql'])assert.throws(()=>validateCutover(plan,[...active,f],archive,read));
 assert.throws(()=>validateCutover(plan,active.slice(1),archive,read),/active migration chain/);
});
test('missing or extra archived evidence is denied',()=>{
 assert.throws(()=>validateCutover(plan,active,archive.slice(1),read),/archived evidence/);
 assert.throws(()=>validateCutover(plan,active,[...archive,'extra.sql'],read),/archived evidence/);
});
test('modified bytes fail even when SQL semantics are unchanged',()=>assert.throws(()=>validateCutover(plan,active,archive,p=>p===plan.archive_files[0].archive?Buffer.concat([read(p),Buffer.from(' ')]):read(p)),/Modified archived bytes/));
test('archive path escape, active SQL drift and ordering mismatch fail closed',()=>{
 const changed=structuredClone(plan);changed.archive_files[0].archive='../other.sql';
 assert.throws(()=>validateCutover(changed,active,archive,read));
 assert.throws(()=>validateCutover(plan,active,archive,p=>p===plan.active_files[0].path?Buffer.from('changed'):read(p)),/Active SQL hash/);
 const order=structuredClone(plan);order.proposed_active_versions.reverse();assert.throws(()=>validateCutover(order,active,archive,read),/ordering/);
});
