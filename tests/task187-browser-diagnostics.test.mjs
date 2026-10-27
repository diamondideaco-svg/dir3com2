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
for(const [stage,code,reason] of [
 ['preflight-chrome-version','ENOENT','TASK187_PREFLIGHT_COMMAND_NOT_FOUND'],
 ['preflight-driver-version','EACCES','TASK187_PREFLIGHT_COMMAND_DENIED'],
 ['preflight-driver-version','EPERM','TASK187_PREFLIGHT_COMMAND_DENIED'],
 ['preflight-next-start','ETIMEDOUT','TASK187_PREFLIGHT_COMMAND_TIMEOUT'],
 ['preflight-driver-start','UNTRUSTED_'+secret,'TASK187_PREFLIGHT_COMMAND_FAILED'],
 ['preflight-proxy-port','EADDRINUSE','TASK187_PREFLIGHT_PORT_IN_USE'],
 ['preflight-driver-port','EACCES','TASK187_PREFLIGHT_PORT_DENIED'],
 ['preflight-driver-port','EPERM','TASK187_PREFLIGHT_PORT_DENIED'],
 ['preflight-driver-port','UNTRUSTED_'+secret,'TASK187_PREFLIGHT_PORT_FAILED'],
])test('preflight diagnostic delta classifies bounded failure '+stage+' '+reason,()=>{
 const error=Object.assign(Error(secret),{code,stderr:secret,stdout:secret,env:{token:secret}});
 const diagnostic=task187BrowserDiagnostic(error,stage),failure=task187BrowserFailure(marker(diagnostic));
 assert.deepEqual(diagnostic,{stage,reason});assert.deepEqual(failure.diagnostic,diagnostic);
 assert.equal(failure.error.message,'TASK187_BROWSER_ACCEPTANCE_FAILED:'+stage+':'+reason);
 assert.ok(!JSON.stringify(failure.diagnostic).includes(secret));assert.ok(!failure.error.message.includes(secret));
});

test('preflight diagnostic delta preserves version assertion and existing explicit stop reasons',()=>{
 let version;try{assert.equal('154.0.1','153.0.1')}catch(error){version=error}
 assert.deepEqual(task187BrowserDiagnostic(version,'preflight-version-contract'),{stage:'preflight-version-contract',reason:'ASSERTION_FAILED'});
 assert.deepEqual(task187BrowserDiagnostic(Error('TASK187_NEXT_EXIT'),'preflight-next-start'),{stage:'preflight-next-start',reason:'TASK187_NEXT_EXIT'});
 assert.deepEqual(task187BrowserDiagnostic(Error('TASK187_BROWSER_WAIT_DRIVER'),'preflight-driver-ready'),{stage:'preflight-driver-ready',reason:'TASK187_BROWSER_WAIT_DRIVER'});
});

test('preflight diagnostic delta exposes only fixed setup phases and never unknown identifiers',()=>{
 for(const stage of ['preflight-input','preflight-environment','preflight-temp','preflight-font','preflight-proxy-create']){
  const diagnostic=task187BrowserDiagnostic(Error(secret),stage);
  assert.deepEqual(task187BrowserFailure(marker(diagnostic)).diagnostic,{stage,reason:'UNCLASSIFIED'});
 }
 assert.deepEqual(task187BrowserDiagnostic(Object.assign(Error(secret),{code:'ENOENT'}),'preflight-'+secret),{stage:'unknown',reason:'UNCLASSIFIED'});
 assert.equal(task187BrowserFailure(marker({stage:'preflight-driver-version',reason:'TASK187_PREFLIGHT_COMMAND_NOT_FOUND',stderr:secret})).diagnostic.reason,'DIAGNOSTIC_UNAVAILABLE');
});

test('preflight diagnostic delta real failed child retains fixed command boundary without stderr values',async()=>{
 const source="import {TASK187_DIAGNOSTIC_PREFIX,task187BrowserDiagnostic} from './scripts/sandbox/task187-browser-diagnostics.mjs';const error=Object.assign(Error("+JSON.stringify(secret)+"),{code:'ENOENT',stderr:"+JSON.stringify(secret)+"});console.error("+JSON.stringify(secret)+");console.error(TASK187_DIAGNOSTIC_PREFIX+JSON.stringify(task187BrowserDiagnostic(error,'preflight-driver-version')));process.exitCode=1";
 await new Promise((resolve,reject)=>execFile(process.execPath,['--input-type=module','-e',source],{maxBuffer:32768},(error,_stdout,stderr)=>{
  try{assert.ok(error);const result=task187BrowserFailure(stderr);assert.deepEqual(result.diagnostic,{stage:'preflight-driver-version',reason:'TASK187_PREFLIGHT_COMMAND_NOT_FOUND'});assert.ok(!result.error.message.includes(secret));resolve();}catch(failure){reject(failure)}
 }));
});
