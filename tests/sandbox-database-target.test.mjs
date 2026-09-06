import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { disposableTarget, applyCoreMigration } from '../scripts/sandbox/apply-core-migration-to-db.mjs';
const root = new URL('../', import.meta.url);
const flag = { SANDBOX_DISPOSABLE_DATABASE: 'true' };
const good = 'postgresql://fixture:fixture@localhost:5432/dir3com_test';
for (const host of ['localhost','127.0.0.1','[::1]','postgres','dir3com-pr93-pg17']) {
  test('approved fixture accepted: '+host, async () => {
    const calls=[];
    await applyCoreMigration({env:{...flag,DATABASE_URL:good.replace('localhost',host)},
      readSql:()=>{calls.push('read');return '-- fixture';},
      createClient:config=>{assert.equal(config.database,'dir3com_test');assert.equal(config.ssl,false);return {
        connect:async()=>calls.push('connect'),query:async sql=>{assert.equal(sql,'-- fixture');calls.push('query');},end:async()=>calls.push('end')};}});
    assert.deepEqual(calls,['read','connect','query','end']);
  });
}
const rejected = [
  ['missing',undefined],['malformed','not-a-url'],['remote','postgres://fixture:fixture@remote.example/dir3com_test'],
  ['production host','postgres://fixture:fixture@db.ynupwivgvwcyrsdhtkcc.supabase.co/dir3com_test'],
  ['UAT host','postgres://fixture:fixture@db.rcrdjhoicbxiwgtyrift.supabase.co/dir3com_test'],
  ['production pooler identity','postgres://postgres.ynupwivgvwcyrsdhtkcc:fixture@localhost/dir3com_test'],
  ['UAT identity','postgres://postgres.rcrdjhoicbxiwgtyrift:fixture@localhost/dir3com_test'],
  ['encoded project','postgres://postgres.%79nupwivgvwcyrsdhtkcc:fixture@localhost/dir3com_test'],
  ['host override',good+'?host=remote.example'],['hostaddr override',good+'?hostaddr=203.0.113.1'],
  ['SSL override',good+'?sslmode=require'],['fragment',good+'#x'],['wrong scheme',good.replace('postgresql:','https:')],
  ['host suffix',good.replace('localhost','localhost.remote.example')],['wrong database',good.replace('dir3com_test','production')],
  ['invalid escape',good.replace('fixture:fixture','fixture:%zz')],['missing db','postgres://fixture:fixture@localhost'],
  ['malformed IPv6','postgres://fixture:fixture@[::1/dir3com_test'],['multiple hosts','postgres://fixture:fixture@localhost,remote.example/dir3com_test'],
];
for(const [name,url] of rejected) test('reject before SQL/client/connect/query even with spoofed flag: '+name,async()=>{
  const calls=[];
  await assert.rejects(applyCoreMigration({env:{...flag,DATABASE_URL:url},readSql:()=>{calls.push('read');return '';},
    createClient:()=>{calls.push('construct');return {connect:async()=>calls.push('connect'),query:async()=>calls.push('query'),end:async()=>calls.push('end')};}}),
    {message:'SANDBOX_DATABASE_TARGET_REQUIRED'});
  assert.deepEqual(calls,[]);
});
test('flag alone is insufficient; local fixture also needs explicit opt-in',()=>{
  for(const env of [{DATABASE_URL:good},{...flag,DATABASE_URL:good,NODE_ENV:'production'}])assert.throws(()=>disposableTarget(env),{message:'SANDBOX_DATABASE_TARGET_REQUIRED'});
});
test('localhost is pinned and connection parameters cannot inherit a remote PGHOST',()=>{
  const config=disposableTarget({...flag,DATABASE_URL:good,PGHOST:'remote.example',PGDATABASE:'production'});
  assert.equal(config.host,'127.0.0.1');assert.equal(config.database,'dir3com_test');assert.equal(config.port,5432);
  assert.equal(config.connectionString,undefined);
  assert.equal(disposableTarget({...flag,DATABASE_URL:good.replace('localhost','LOCALHOST')}).host,'127.0.0.1');
});
test('actual CLI exits nonzero with a stable sanitized error',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('scripts/sandbox/apply-core-migration-to-db.mjs',root))],
    {encoding:'utf8',env:{...process.env,...flag,DATABASE_URL:'postgres://fixture:DO_NOT_LOG_THIS@remote.example/dir3com_test'}});
  assert.equal(result.status,1);assert.equal(result.stdout,'');
  assert.equal(result.stderr.trim(),'SANDBOX_DATABASE_TARGET_REQUIRED');
});
test('all 45 archived SQL files retain their approved bytes',()=>{
  const plan=JSON.parse(readFileSync(new URL('docs/production-baseline-cutover-plan-2026-09-06.json',root),'utf8'));
  for(const f of plan.archive_files)assert.equal(createHash('sha256').update(readFileSync(new URL(f.archive,root))).digest('hex'),f.sha256);
});
