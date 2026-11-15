import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('standalone Task187 runner uses Next server navigation and preserves continuity boundaries',()=>{
  const result=spawnSync(process.execPath,['--conditions=react-server','--import','tsx','tests/fixtures/task187-server-navigation.mjs'],{
    encoding:'utf8',timeout:20_000,maxBuffer:65_536,env:{...process.env,NODE_ENV:'test'},
  });
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()),{status:'PASS',valid:4,denied:3,external:0,actualNavigation:true});
});

// Emulate the absence of Node 22.15+'s synchronous hook in an isolated child;
// this exercises Next's Node 20 fallback without claiming a real Node 20 run.
test('standalone Task187 runner preserves the server alias without synchronous Node hooks',()=>{
  const preload='data:text/javascript,'+encodeURIComponent('import m from "node:module";m.registerHooks=undefined;m.syncBuiltinESMExports();');
  const result=spawnSync(process.execPath,['--conditions=react-server','--import',preload,'--import','tsx','tests/fixtures/task187-server-navigation.mjs'],{
    encoding:'utf8',timeout:20_000,maxBuffer:65_536,env:{...process.env,NODE_ENV:'test'},
  });
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()),{status:'PASS',valid:4,denied:3,external:0,actualNavigation:true});
});

import { readTask187ChatDiagnostic, task187ChatDiagnosticLine } from '../scripts/sandbox/task187-chat-diagnostics.mjs';

test('genuine-chat failure diagnostics expose fixed categories only',()=>{
  const marker=task187ChatDiagnosticLine('chat_json','assertion');assert.equal(marker,'TASK187_CHAT_DIAGNOSTIC=chat_json:assertion');
  const secret='synthetic-sensitive-value';const stderr=`Authorization: ${secret}\n${marker}\n${secret}`;
  const result=readTask187ChatDiagnostic({code:1},stderr);
  assert.deepEqual(result,{phase:'chat_json',kind:'assertion'});assert.doesNotMatch(JSON.stringify(result),new RegExp(secret));
  assert.equal(readTask187ChatDiagnostic({code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'},stderr),null);
  assert.equal(readTask187ChatDiagnostic({code:1},stderr+'x'.repeat(32768)),null);
  assert.equal(readTask187ChatDiagnostic({code:1},`${marker}\n${marker}`),null);
  assert.equal(readTask187ChatDiagnostic({code:1},'TASK187_CHAT_DIAGNOSTIC=customer_secret:assertion'),null);
  assert.equal(task187ChatDiagnosticLine(secret,'assertion'),null);
});

test('actual genuine-chat child reports an allowlisted failure without its input',()=>{
  const secret='synthetic-private-config';
  const result=spawnSync(process.execPath,['--conditions=react-server','--import','tsx','scripts/test-task187-chat-real-auth.ts'],{
    input:JSON.stringify({url:secret}),encoding:'utf8',timeout:20_000,maxBuffer:65_536,env:{...process.env,NODE_ENV:'test'},
  });
  assert.equal(result.status,1);assert.deepEqual(readTask187ChatDiagnostic({code:result.status},result.stderr),{phase:'configuration',kind:'assertion'});
  assert.doesNotMatch(result.stderr,new RegExp(secret));assert.doesNotMatch(result.stdout,new RegExp(secret));
});
