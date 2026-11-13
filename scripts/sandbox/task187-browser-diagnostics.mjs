import {once} from 'node:events';

export const TASK187_DIAGNOSTIC_PREFIX='TASK187_BROWSER_DIAGNOSTIC=';

/** Reject asynchronous spawn errors before the caller adopts a running child.
 * @param {import('node:child_process').ChildProcess} child
 */
export async function waitTask187ChildSpawn(child){await once(child,'spawn');}

const preflightStages=['preflight-input','preflight-environment','preflight-chrome-version','preflight-driver-version','preflight-version-contract','preflight-temp','preflight-font','preflight-proxy-create','preflight-proxy-port','preflight-next-start','preflight-driver-port','preflight-driver-start','preflight-driver-ready'];
const commandStages=new Set(['preflight-chrome-version','preflight-driver-version','preflight-next-start','preflight-driver-start']);
const portStages=new Set(['preflight-proxy-port','preflight-driver-port']);

const phases=['login','save','resume','journey','forget','B-isolation'];
const stages=new Set(['unknown','preflight',...preflightStages,...['ar','en'].flatMap(language=>[390,1440].flatMap(width=>phases.map(phase=>`${language}-${width}-${phase}`)))]);
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
/** Closed exit metadata only. Startup codes are observed hints, not proven causes.
 * @param {unknown} error @param {unknown} stderr
 */
export function task187BrowserExitSummary(error,stderr){
 const value=error&&typeof error==='object'?error:{};
 const code='code' in value?value.code:null;
 const signal='signal' in value?value.signal:null;
 const stderrBytes=typeof stderr==='string'?Buffer.byteLength(stderr,'utf8'):null;
 const stderrInspection=stderrBytes===null?'absent':stderrBytes>32768?'oversized':'bounded';
 const text=typeof stderr==='string'&&stderrInspection==='bounded'?stderr:null;
 const match=text?.match(/^Error \[(ERR_[A-Z_]+)\]:/m);
 return {
  ...closedErrorHints(text),
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
 if(typeof stderr==='string'&&stderr.length<=32768){
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