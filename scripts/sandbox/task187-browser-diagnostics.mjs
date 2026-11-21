import {once} from 'node:events';
import {TASK187_PROXY_RESET_PREFIX,TASK187_PROXY_RESET_SOURCES} from './task187-browser-network.mjs';

export const TASK187_DIAGNOSTIC_PREFIX='TASK187_BROWSER_DIAGNOSTIC=';
export const TASK187_PHASE_PREFIX='TASK187_BROWSER_PHASE=';

/** Reject asynchronous spawn errors before the caller adopts a running child.
 * @param {import('node:child_process').ChildProcess} child
 */
export async function waitTask187ChildSpawn(child){await once(child,'spawn');}

const preflightStages=['preflight-input','preflight-environment','preflight-chrome-version','preflight-driver-version','preflight-version-contract','preflight-temp','preflight-font','preflight-proxy-create','preflight-proxy-port','preflight-next-start','preflight-driver-port','preflight-driver-start','preflight-driver-ready'];
const commandStages=new Set(['preflight-chrome-version','preflight-driver-version','preflight-next-start','preflight-driver-start']);
const portStages=new Set(['preflight-proxy-port','preflight-driver-port']);

const phases=['login','save','resume','journey','forget','B-isolation'];
const stages=new Set(['unknown','preflight',...preflightStages,...['ar','en'].flatMap(language=>[390,1440].flatMap(width=>phases.map(phase=>`${language}-${width}-${phase}`)))]);
/** Only closed stage names may be written to the browser child's stderr. @param {unknown} stage */
export function task187BrowserPhase(stage){return TASK187_PHASE_PREFIX+(typeof stage==='string'&&stages.has(stage)?stage:'unknown');}
const reasons=new Set(['TASK187_PREFLIGHT_COMMAND_NOT_FOUND','TASK187_PREFLIGHT_COMMAND_DENIED','TASK187_PREFLIGHT_COMMAND_TIMEOUT','TASK187_PREFLIGHT_COMMAND_FAILED','TASK187_PREFLIGHT_PORT_IN_USE','TASK187_PREFLIGHT_PORT_DENIED','TASK187_PREFLIGHT_PORT_FAILED','UNCLASSIFIED','DIAGNOSTIC_UNAVAILABLE','ASSERTION_FAILED','NATIVE_CLICK_FAILED','WEBDRIVER_COMMAND_FAILED','OWNED_PROCESS_CLEANUP_FAILED',
 'TASK187_NEXT_START_TIMEOUT','TASK187_NEXT_EXIT','TASK187_DRIVER_EXIT','TASK187_TEST_STOPPED','TASK187_OWNED_PROCESS_STOP_TIMEOUT',
 ...['DRIVER','ELEMENT','LOGIN','A_STATE','RESET','SAVED','RELOADED','STAGED','CHAT_RESULT','DESTINATION','EGYPT_CARDS','FORGOTTEN','RESAVED'].map(name=>'TASK187_BROWSER_WAIT_'+name)]);
/** Only fixed phase/reason identifiers may cross the child boundary. @param {unknown} error @param {unknown} stage */
export function task187BrowserDiagnostic(error,stage){
 const where=typeof stage==='string'&&stages.has(stage)?stage:'unknown';
 let reason='UNCLASSIFIED';
 if(error instanceof Error){
  if(reasons.has(error.message))reason=error.message;
  else if(error.name==='Task187ClickError')reason='NATIVE_CLICK_FAILED';
  else if(error.name==='Task187CommandError')reason='WEBDRIVER_COMMAND_FAILED';
  else if('code' in error&&error.code==='ERR_ASSERTION')reason=error.message==='owned process cleanup must complete'?'OWNED_PROCESS_CLEANUP_FAILED':'ASSERTION_FAILED';
  else if(commandStages.has(where)){
   const code='code' in error?error.code:null;
   reason=code==='ENOENT'?'TASK187_PREFLIGHT_COMMAND_NOT_FOUND'
    :code==='EACCES'||code==='EPERM'?'TASK187_PREFLIGHT_COMMAND_DENIED'
    :code==='ETIMEDOUT'?'TASK187_PREFLIGHT_COMMAND_TIMEOUT':'TASK187_PREFLIGHT_COMMAND_FAILED';
  }else if(portStages.has(where)){
   const code='code' in error?error.code:null;
   reason=code==='EADDRINUSE'?'TASK187_PREFLIGHT_PORT_IN_USE'
    :code==='EACCES'||code==='EPERM'?'TASK187_PREFLIGHT_PORT_DENIED':'TASK187_PREFLIGHT_PORT_FAILED';
  }

 }
 return {stage:where,reason};
}
const browserSpawnCodes=new Set(['ENOENT','EACCES','EPERM','EAGAIN','EMFILE','ENFILE','ETIMEDOUT','ERR_CHILD_PROCESS_STDIO_MAXBUFFER']);
const browserExitSignals=new Set(['SIGTERM','SIGKILL','SIGABRT','SIGSEGV','SIGILL','SIGBUS']);
const browserStartupCodes=new Set(['ERR_MODULE_NOT_FOUND','ERR_UNKNOWN_FILE_EXTENSION','ERR_UNSUPPORTED_DIR_IMPORT','ERR_DLOPEN_FAILED']);
const browserErrorClasses=new Set(['Error','SyntaxError','TypeError','ReferenceError','RangeError','TransformError']);
const browserErrorCodes=new Set([...browserStartupCodes,'ERR_UNHANDLED_REJECTION','ERR_MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED','ERR_REQUIRE_ESM','ERR_INVALID_ARG_TYPE','ENOENT','EACCES','EPERM','EADDRINUSE','ECONNRESET','EPIPE','ERR_IPC_CHANNEL_CLOSED']);
// Hints only: never return captured messages or infer a failing execution phase.
// Classes remain unambiguous; repeated codes must all agree and be allowlisted.
function closedErrorHints(text){
 if(text===null)return {errorClass:null,errorCode:null};
 const classes=[...text.matchAll(/^([A-Za-z][A-Za-z0-9]*Error|Error)(?: \[[A-Z][A-Z0-9_]*\])?:/gm)].map(match=>match[1]);
 const codes=[...text.matchAll(/^(?:[A-Za-z][A-Za-z0-9]*Error|Error) \[([A-Z][A-Z0-9_]*)\]:/gm)].map(match=>match[1]);
 for(const match of text.matchAll(/^[ \t]*code: (?:'([A-Z][A-Z0-9_]*)'|"([A-Z][A-Z0-9_]*)")[,]?[ \t]*$/gm))codes.push(match[1]??match[2]);
 return {errorClass:classes.length===1&&browserErrorClasses.has(classes[0])?classes[0]:null,
  errorCode:codes.length>0&&codes.every(code=>browserErrorCodes.has(code)&&code===codes[0])?codes[0]:null};
}
// Phase markers say only what the child most recently reported, not where the
// failure necessarily occurred. Reject an oversized or malformed trace.
function phaseTrace(text){
 if(text===null)return {phaseMarkerCount:null,lastReportedPhase:null};
 const markers=text.split(/\r?\n/).filter(line=>line.startsWith(TASK187_PHASE_PREFIX));
 const values=markers.map(line=>line.slice(TASK187_PHASE_PREFIX.length));
 return {phaseMarkerCount:markers.length,lastReportedPhase:values.length>0&&values.length<=64&&values.every(value=>stages.has(value))?values.at(-1):null};
}
// Recognize fixed file categories in Node stack-frame lines only. Never copy a
// message, path, function name, line number, URL or any other captured text.
const stackCategories=[
 [/\bnode:internal\/stream_base_commons:\d+:\d+\)?$/,'node-stream-base'],
 [/\bnode:internal\/streams\/[a-z_]+:\d+:\d+\)?$/,'node-stream'],
 [/\bnode:events:\d+:\d+\)?$/,'node-events'],
 [/\bnode:net:\d+:\d+\)?$/,'node-net'],
 [/\bnode:internal\/child_process:\d+:\d+\)?$/,'node-child-process'],
 [/\bnode:internal\/process\/task_queues:\d+:\d+\)?$/,'node-process-tasks'],
 [/\bnode:internal\/timers:\d+:\d+\)?$/,'node-timers'],
 [/(?:^|[\s(])(?:file:\/\/)?[^\s()]*\/scripts\/test-task187-browser\.ts:\d+:\d+\)?$/,'browser-harness'],
 [/(?:^|[\s(])(?:file:\/\/)?[^\s()]*\/scripts\/task187-browser-next\.mjs:\d+:\d+\)?$/,'next-harness'],
];
function safeStackCategories(text){
 if(text===null)return [];
 const result=[];
 for(const line of text.split(/\r?\n/)){
  if(!/^\s*at\s/.test(line))continue;
  const found=stackCategories.find(([pattern])=>pattern.test(line));
  if(found&&!result.includes(found[1]))result.push(found[1]);
  if(result.length===8)break;
 }
 return result;
}
// The proxy emits only fixed source names for an unhandled reset. Reject
// unknown, repeated or incomplete markers; neither their origin nor a missing
// hint is proof of cause. Never copy untrusted text into the result.
function unhandledProxyResetHint(text){
 if(text===null)return null;
 const lines=text.split(/\r?\n/).filter(line=>line.startsWith(TASK187_PROXY_RESET_PREFIX));
 if(lines.length!==1)return null;
 const source=lines[0].slice(TASK187_PROXY_RESET_PREFIX.length);
 return TASK187_PROXY_RESET_SOURCES.includes(source)?source:null;
}
/** Closed exit metadata only. Startup codes are observed hints, not proven causes.
 * @param {unknown} error @param {unknown} stderr
 */
export function task187BrowserExitSummary(error,stderr){
 const value=error&&typeof error==='object'?error:{};
 const code='code' in value?value.code:null;
 const signal='signal' in value?value.signal:null;
 const stderrBytes=typeof stderr==='string'?Buffer.byteLength(stderr,'utf8'):null;
 // execFile may return exactly maxBuffer bytes while signalling truncation.
 // Treat all captured output as incomplete even if its length looks bounded.
 const stderrInspection=code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'?'incomplete':stderrBytes===null?'absent':stderrBytes>32768?'oversized':'bounded';
 const text=typeof stderr==='string'&&stderrInspection==='bounded'?stderr:null;
 const match=text?.match(/^Error \[(ERR_[A-Z_]+)\]:/m);
 const hints=closedErrorHints(text);
 const proxyResetSource=hints.errorCode==='ECONNRESET'?unhandledProxyResetHint(text):null;
 return {
  ...hints,...phaseTrace(text),stackFrames:hints.errorCode==='ECONNRESET'?safeStackCategories(text):[],
  ...(proxyResetSource?{unhandledProxyResetSource:proxyResetSource}:{}),
  exitCode:Number.isSafeInteger(code)&&typeof code==='number'&&code>=0&&code<=255?code:null,
  spawnCode:typeof code==='string'&&browserSpawnCodes.has(code)?code:null,
  signal:typeof signal==='string'&&browserExitSignals.has(signal)?signal:null,
  killed:'killed' in value&&value.killed===true,
  stderrBytes,stderrInspection,
  markerCount:text===null?null:text.split(/\r?\n/).filter(line=>line.startsWith(TASK187_DIAGNOSTIC_PREFIX)).length,
  startupCode:match&&browserStartupCodes.has(match[1])?match[1]:null,
 };
}

/** Never return raw stderr, error messages, identities, tokens or DOM content. @param {unknown} stderr */
export function task187BrowserFailure(stderr){
 let diagnostic={stage:'unknown',reason:'DIAGNOSTIC_UNAVAILABLE'};
 // A buffer exactly at the limit may be truncated; this caller has no exit
 // metadata, so fail closed at that boundary as well as above it.
 if(typeof stderr==='string'&&Buffer.byteLength(stderr,'utf8')<32768){
  const markers=stderr.split(/\r?\n/).filter(line=>line.startsWith(TASK187_DIAGNOSTIC_PREFIX));
  if(markers.length===1){
   try{
    const value=JSON.parse(markers[0].slice(TASK187_DIAGNOSTIC_PREFIX.length));
    if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2
      &&typeof value.stage==='string'&&stages.has(value.stage)&&typeof value.reason==='string'&&reasons.has(value.reason)){
     diagnostic={stage:value.stage,reason:value.reason};
    }
   }catch{ /* Malformed child output stays unavailable and never becomes PASS. */ }
  }
 }
 return {diagnostic,error:new Error(`TASK187_BROWSER_ACCEPTANCE_FAILED:${diagnostic.stage}:${diagnostic.reason}`)};
}