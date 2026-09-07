import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { waitForPostgres } from '../scripts/sandbox/wait-for-postgres';

test('upload SQL and readiness use final TCP server, not Docker bootstrap socket', () => {
  const source=readFileSync(new URL('../scripts/test-customer-upload-local.ts',import.meta.url),'utf8');
  assert.match(source,/PGPASSWORD="\$POSTGRES_PASSWORD" PGCONNECT_TIMEOUT=2 exec psql -h 127\.0\.0\.1 -p 5432/);
  assert.match(source,/await waitForPostgres\(\(\)=>sql\('SELECT 1'\)\)/);
  assert.ok(source.indexOf('await waitForPostgres')<source.indexOf('sql("CREATE SCHEMA auth'));
  assert.match(source,/report\.postgresReadiness=/);
});

test('socket-only bootstrap and restart cannot release dependent tests before TCP readiness', async () => {
  const phases=['initializing','socket-only-bootstrap','restarting','final-tcp'];
  let index=0,dependentQueries=0;
  const attempts=await waitForPostgres(()=>{
    const phase=phases[index++];
    assert.equal(dependentQueries,0);
    if(phase!=='final-tcp')throw new Error('connection refused');
    return '1';
  },{intervalMs:1,timeoutMs:1000});
  dependentQueries++;
  assert.equal(attempts,4);assert.equal(dependentQueries,1);
});

test('successful readiness completes once without retrying dependent SQL', async () => {
  let probes=0;
  assert.equal(await waitForPostgres(()=>{probes++;return '1\n';}),1);
  assert.equal(probes,1);
});

test('timeout fails closed, emits only stable diagnostics and never runs dependent SQL', async () => {
  let dependentQueries=0;
  await assert.rejects(async()=>{
    await waitForPostgres(()=>{throw new Error('private connection diagnostic');},{timeoutMs:10,intervalMs:1});
    dependentQueries++;
  },{message:'LOCAL_DB_START_TIMEOUT'});
  assert.equal(dependentQueries,0);
  await assert.rejects(waitForPostgres(()=>'',{timeoutMs:0}),{message:'LOCAL_DB_START_TIMEOUT'});
});
