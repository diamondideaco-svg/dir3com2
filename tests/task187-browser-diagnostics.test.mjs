import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {TASK187_DIAGNOSTIC_PREFIX as prefix,task187BrowserDiagnostic,task187BrowserExitSummary,task187BrowserFailure} from '../scripts/sandbox/task187-browser-diagnostics.mjs';
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

for(const mode of ['spawn-error','ready-error'])test('preflight lifecycle delta preserves bounded '+mode+' and owned-child cleanup',async()=>{
 const source=[
  "import assert from 'node:assert/strict';",
  "import {spawn} from 'node:child_process';",
  "import {existsSync} from 'node:fs';",
  "import {TASK187_DIAGNOSTIC_PREFIX,task187BrowserDiagnostic,waitTask187ChildSpawn} from './scripts/sandbox/task187-browser-diagnostics.mjs';",
  "const mode="+JSON.stringify(mode)+";",
  "const missing=process.execPath+'.TASK217_'+"+JSON.stringify(secret)+";if(mode==='spawn-error')assert.equal(existsSync(missing),false);",
  "let stage='preflight-driver-start',adopted=false;",
  "const candidate=spawn(mode==='spawn-error'?missing:process.execPath,mode==='spawn-error'?[]:['-e','setTimeout(()=>{},30)'],{stdio:'ignore'});",
  "const closed=new Promise(resolve=>candidate.once('close',resolve));",
  "try{await waitTask187ChildSpawn(candidate);adopted=true;stage='preflight-driver-ready';throw Error('TASK187_BROWSER_WAIT_DRIVER');}",
  "catch(error){assert.equal(stage,mode==='spawn-error'?'preflight-driver-start':'preflight-driver-ready');assert.equal(adopted,mode==='ready-error');assert.equal(Number.isInteger(candidate.pid),mode==='ready-error');console.error(TASK187_DIAGNOSTIC_PREFIX+JSON.stringify(task187BrowserDiagnostic(error,stage)));process.exitCode=1;}",
  "finally{await closed;}",
 ].join('\n');
 await new Promise((resolve,reject)=>execFile(process.execPath,['--input-type=module','-e',source],{maxBuffer:32768,timeout:5000},(error,stdout,stderr)=>{
  try{
   assert.ok(error);assert.equal(error.code,1);assert.equal(stdout,'');
   const expected=mode==='spawn-error'?{stage:'preflight-driver-start',reason:'TASK187_PREFLIGHT_COMMAND_NOT_FOUND'}:{stage:'preflight-driver-ready',reason:'TASK187_BROWSER_WAIT_DRIVER'};
   const failure=task187BrowserFailure(stderr);assert.deepEqual(failure.diagnostic,expected);
   assert.ok(!stderr.includes(secret));assert.ok(!failure.error.message.includes(secret));
   assert.equal(stderr.trim(),marker(expected));resolve();
  }catch(failure){reject(failure)}
 }));
});


test('browser exit summary emits only closed scalar metadata from a real failed child',async()=>{
 const diagnostic={stage:'ar-390-login',reason:'TASK187_BROWSER_WAIT_LOGIN'};
 const stderr='Error [ERR_MODULE_NOT_FOUND]: '+secret+'\n'+marker(diagnostic)+'\n';
 const source='console.error('+JSON.stringify(stderr)+');process.exitCode=7';
 await new Promise((resolve,reject)=>execFile(process.execPath,['-e',source],{maxBuffer:32768},(error,stdout,output)=>{
  try{
   assert.ok(error);assert.equal(stdout,'');
   const summary=task187BrowserExitSummary(error,output);
   assert.deepEqual(summary,{exitCode:7,spawnCode:null,signal:null,killed:false,stderrBytes:Buffer.byteLength(output),stderrInspection:'bounded',markerCount:1,startupCode:'ERR_MODULE_NOT_FOUND'});
   assert.ok(!JSON.stringify(summary).includes(secret));
   assert.equal(task187BrowserFailure(output).error.message,'TASK187_BROWSER_ACCEPTANCE_FAILED:ar-390-login:TASK187_BROWSER_WAIT_LOGIN');resolve();
  }catch(failure){reject(failure)}
 }));
});

test('browser exit summary rejects arbitrary exit, spawn and signal values',()=>{
 for(const code of ['ENOENT','EACCES','EPERM','EAGAIN','EMFILE','ENFILE','ETIMEDOUT','ERR_CHILD_PROCESS_STDIO_MAXBUFFER']){
  assert.equal(task187BrowserExitSummary({code},'').spawnCode,code);
 }
 for(const code of [-1,256,1.5,NaN,Infinity,'1',secret,{}]){
  const summary=task187BrowserExitSummary({code},'');assert.equal(summary.exitCode,null);assert.equal(summary.spawnCode,null);
 }
 for(const code of [0,1,255])assert.equal(task187BrowserExitSummary({code},'').exitCode,code);
 for(const signal of ['SIGTERM','SIGKILL','SIGABRT','SIGSEGV','SIGILL','SIGBUS'])assert.equal(task187BrowserExitSummary({signal},'').signal,signal);
 for(const signal of [secret,1,null,'SIGUSR1'])assert.equal(task187BrowserExitSummary({signal},'').signal,null);
 assert.equal(task187BrowserExitSummary({killed:true},'').killed,true);
 for(const killed of [false,1,'true',null])assert.equal(task187BrowserExitSummary({killed},'').killed,false);
});

test('browser exit summary distinguishes absent and uninspected stderr without coercion',()=>{
 for(const stderr of [undefined,null,false,0,Buffer.from(secret),{toString(){throw Error(secret)}}]){
  const summary=task187BrowserExitSummary(null,stderr);
  assert.deepEqual(summary,{exitCode:null,spawnCode:null,signal:null,killed:false,stderrBytes:null,stderrInspection:'absent',markerCount:null,startupCode:null});
 }
 assert.equal(task187BrowserExitSummary(undefined,'').stderrInspection,'bounded');
 assert.equal(task187BrowserExitSummary(undefined,'').markerCount,0);
});

test('browser exit summary enforces the exact UTF-8 byte boundary',()=>{
 const line=marker({stage:'preflight',reason:'ASSERTION_FAILED'})+'\n';
 const bounded=line+'x'.repeat(32768-Buffer.byteLength(line));
 assert.equal(Buffer.byteLength(bounded),32768);
 assert.equal(task187BrowserExitSummary(null,bounded).markerCount,1);
 for(const text of [bounded+'x','é'.repeat(16385),'😀'.repeat(8193)]){
  const summary=task187BrowserExitSummary(null,text);
  assert.equal(summary.stderrBytes,Buffer.byteLength(text));assert.equal(summary.stderrInspection,'oversized');
  assert.equal(summary.markerCount,null);assert.equal(summary.startupCode,null);
 }
 for(const text of ['é'.repeat(16384),'😀'.repeat(8192)]){
  assert.equal(Buffer.byteLength(text),32768);
  assert.equal(task187BrowserExitSummary(null,text).stderrInspection,'bounded');
  assert.equal(task187BrowserExitSummary(null,text).markerCount,0);
 }
 assert.equal(task187BrowserFailure(bounded+'x').diagnostic.reason,'DIAGNOSTIC_UNAVAILABLE');
});

test('browser exit summary counts markers without accepting malformed or ambiguous diagnostics',()=>{
 const known=marker({stage:'preflight',reason:'ASSERTION_FAILED'});
 for(const [stderr,count] of [[secret,0],[prefix+'{bad',1],[known+'\n'+known,2]]){
  assert.equal(task187BrowserExitSummary(null,stderr).markerCount,count);
  assert.equal(task187BrowserFailure(stderr).error.message,'TASK187_BROWSER_ACCEPTANCE_FAILED:unknown:DIAGNOSTIC_UNAVAILABLE');
 }
 assert.equal(task187BrowserExitSummary(null,known).markerCount,1);
 assert.equal(task187BrowserFailure(known).error.message,'TASK187_BROWSER_ACCEPTANCE_FAILED:preflight:ASSERTION_FAILED');
});

test('browser exit summary exposes only allowlisted startup hints and never private content',()=>{
 const privateText=secret+' https://private.invalid/?token='+secret+' C:\\private\\'+secret+' '+JSON.stringify({password:secret});
 for(const code of ['ERR_MODULE_NOT_FOUND','ERR_UNKNOWN_FILE_EXTENSION','ERR_UNSUPPORTED_DIR_IMPORT','ERR_DLOPEN_FAILED']){
  const summary=task187BrowserExitSummary({message:privateText,stdout:privateText,stderr:privateText,stack:privateText,args:[privateText]},'Error ['+code+']: '+privateText);
  assert.equal(summary.startupCode,code);
  assert.deepEqual(Object.keys(summary).sort(),['exitCode','killed','markerCount','signal','spawnCode','startupCode','stderrBytes','stderrInspection'].sort());
  for(const text of [secret,'private.invalid','password','C:\\private'])assert.ok(!JSON.stringify(summary).includes(text));
 }
 for(const text of ['Error [ERR_'+secret+']: '+privateText,'prefix Error [ERR_MODULE_NOT_FOUND]: '+privateText,'Error [ERR_ASSERTION]: '+privateText]){
  assert.equal(task187BrowserExitSummary(null,text).startupCode,null);
 }
});

for(const mode of ['helper-throws','logging-throws','normal'])test('actual browser wrapper preserves original rejection when '+mode,async()=>{
 const source=readFileSync(new URL('../scripts/test-customer-upload-local.ts',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const start=source.indexOf('report.task187Browser = await new Promise<unknown>');
 const end=source.indexOf('\n  const browser=',start);
 assert.ok(start>=0&&end>start);
 // Execute the actual callback statement; erase only its two TypeScript annotations.
 const statement=source.slice(start,end).replace('new Promise<unknown>','new Promise').replace('child.stdin!.end','child.stdin.end');
 const report={},logged=[];
 const stderr=secret+'\n'+prefix+'{bad';
 const original=task187BrowserFailure(stderr).error.message;
 const context={report,process:{execPath:'synthetic-node'},url:'http://127.0.0.1',anon:secret,password:secret,aid:'synthetic-a',bid:'synthetic-b',JSON,
  task187BrowserFailure,
  task187BrowserExitSummary:(...args)=>{if(mode==='helper-throws')throw Error(secret);return task187BrowserExitSummary(...args)},
  console:{error(value){if(mode==='logging-throws')throw Error(secret);logged.push(value)}},
  execFile(_file,_args,options,callback){assert.equal(options.timeout,300000);assert.equal(options.maxBuffer,32768);queueMicrotask(()=>callback(Object.assign(Error(secret),{code:1}),'',stderr));return {stdin:{end(){}}}},
 };
 await assert.rejects(runInNewContext('(async()=>{'+statement+'})()',context),error=>error.message===original);
 assert.deepEqual(report.task187BrowserFailure,{stage:'unknown',reason:'DIAGNOSTIC_UNAVAILABLE'});
 for(const value of logged){assert.ok(value.startsWith('TASK187_BROWSER_EXIT='));assert.ok(!value.includes(secret));}
 if(mode==='normal')assert.equal(logged.length,1);else assert.equal(logged.length,0);
});
