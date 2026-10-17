export const TASK187_DIAGNOSTIC_PREFIX='TASK187_BROWSER_DIAGNOSTIC=';
const phases=['login','save','resume','journey','forget','B-isolation'];
const stages=new Set(['unknown','preflight',...['ar','en'].flatMap(language=>[390,1440].flatMap(width=>phases.map(phase=>`${language}-${width}-${phase}`)))]);
const reasons=new Set(['UNCLASSIFIED','DIAGNOSTIC_UNAVAILABLE','ASSERTION_FAILED','NATIVE_CLICK_FAILED','WEBDRIVER_COMMAND_FAILED','OWNED_PROCESS_CLEANUP_FAILED',
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
 }
 return {stage:where,reason};
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