import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {TASK187_DIAGNOSTIC_PREFIX as prefix,task187BrowserDiagnostic,task187BrowserFailure} from '../scripts/sandbox/task187-browser-diagnostics.mjs';
const secret='SYNTHETIC_PASSWORD_JWT_NEVER_PRINT';
const marker=(value)=>prefix+JSON.stringify(value);

test('preserves the exact known stage and timeout, without making a failing child PASS',()=>{
 const diagnostic=task187BrowserDiagnostic(Error('TASK187_BROWSER_WAIT_LOGIN'),'ar-390-login');
 const failure=task187BrowserFailure(marker(diagnostic));
 assert.deepEqual(failure.diagnostic,{stage:'ar-390-login',reason:'TASK187_BROWSER_WAIT_LOGIN'});
 assert.equal(failure.error.message,'TASK187_BROWSER_ACCEPTANCE_FAILED:ar-390-login:TASK187_BROWSER_WAIT_LOGIN');
});

test('unknown exception text and stage cannot expose credentials',()=>{
 const value=task187BrowserDiagnostic(Error(secret),secret);
 assert.deepEqual(value,{stage:'unknown',reason:'UNCLASSIFIED'});
 assert.ok(!JSON.stringify(value).includes(secret));
});

test('assertion values and native command details remain private',()=>{
 let assertion;try{assert.equal(secret,'different synthetic value')}catch(error){assertion=error}
 assert.equal(task187BrowserDiagnostic(assertion,'en-1440-journey').reason,'ASSERTION_FAILED');
 for(const name of ['Task187ClickError','Task187CommandError']){
  const error=Error(secret);error.name=name;
  const value=task187BrowserDiagnostic(error,'ar-390-save');assert.ok(!JSON.stringify(value).includes(secret));
  assert.equal(value.reason,name==='Task187ClickError'?'NATIVE_CLICK_FAILED':'WEBDRIVER_COMMAND_FAILED');
 }
});

test('cleanup failure is distinguished from an application assertion',()=>{
 let failure;try{assert.ok(false,'owned process cleanup must complete')}catch(error){failure=error}
 assert.equal(task187BrowserDiagnostic(failure,'preflight').reason,'OWNED_PROCESS_CLEANUP_FAILED');
});

for(const value of ['',null,secret,prefix+'{bad',marker({stage:'ar-390-login',reason:secret}),
 marker({stage:secret,reason:'ASSERTION_FAILED'}),marker({stage:'preflight',reason:'ASSERTION_FAILED',password:secret}),
 marker({stage:'preflight',reason:'ASSERTION_FAILED'})+'\n'+marker({stage:'preflight',reason:'ASSERTION_FAILED'}),
 'x'.repeat(32769)])test('malformed or ambiguous child diagnostic fails closed '+String(value).slice(0,35),()=>{
 const result=task187BrowserFailure(value);assert.deepEqual(result.diagnostic,{stage:'unknown',reason:'DIAGNOSTIC_UNAVAILABLE'});
 assert.ok(!result.error.message.includes(secret));
});

test('raw stderr noise is discarded while exactly one bounded marker is retained',()=>{
 const result=task187BrowserFailure(secret+'\n'+marker({stage:'en-390-resume',reason:'TASK187_BROWSER_WAIT_STAGED'})+'\r\n'+secret);
 assert.deepEqual(result.diagnostic,{stage:'en-390-resume',reason:'TASK187_BROWSER_WAIT_STAGED'});
 assert.ok(!result.error.message.includes(secret));
});

test('real failed subprocess propagates bounded reason without logging its raw stderr',async()=>{
 const source=`console.error(${JSON.stringify(secret)});console.error(${JSON.stringify(marker({stage:'ar-390-login',reason:'TASK187_BROWSER_WAIT_LOGIN'}))});process.exitCode=1`;
 await new Promise((resolve,reject)=>execFile(process.execPath,['-e',source],{maxBuffer:32768},(error,_stdout,stderr)=>{
  try{assert.ok(error);const result=task187BrowserFailure(stderr);assert.equal(result.error.message,'TASK187_BROWSER_ACCEPTANCE_FAILED:ar-390-login:TASK187_BROWSER_WAIT_LOGIN');assert.ok(!result.error.message.includes(secret));resolve();}catch(failure){reject(failure)}
 }));
});