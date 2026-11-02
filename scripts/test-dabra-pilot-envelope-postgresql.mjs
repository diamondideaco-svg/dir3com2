import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
const image='sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459';
const scopeArgs=process.argv.slice(2);
if(scopeArgs.length>1||scopeArgs.some(a=>!['--funding-scope-delta','--snapshot-use-delta'].includes(a)))throw Error('unsupported_pilot_test_argument');
const scopeDelta=scopeArgs[0]==='--funding-scope-delta',snapshotDelta=scopeArgs[0]==='--snapshot-use-delta';
const parent=process.env.TASK217_PG_WORKDIR;
if(!parent || !isAbsolute(parent) || (process.platform==='win32' && !/^D:[\\/]/i.test(parent))) throw Error('isolated_D_workdir_required');
const runId=randomUUID(), name='task217-pilot-'+runId, cluster=join(resolve(parent),name);
mkdirSync(cluster,{recursive:false});
const env={...process.env,PGCONNECT_TIMEOUT:'3',PGSSLMODE:'disable',PGPASSFILE:join(cluster,'absent-password'),PGSERVICEFILE:join(cluster,'absent-service')};
delete env.PGPASSWORD; delete env.PGSERVICE; delete env.PGOPTIONS;
function docker(args,input){const r=spawnSync('docker',args,{env,input,encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:8*1024*1024});if(r.error||r.status!==0)throw Error('isolated_pg: '+(r.error?.message??r.stderr));return r.stdout.trim();}
const args=['-X','-q','-w','-h','127.0.0.1','-p','5432','-d','postgres','-U','task217_pilot_test','-v','ON_ERROR_STOP=1','-At'];
const query=sql=>docker(['exec','-i',name,'psql',...args],sql);
const literal=v=>"'"+String(v).replaceAll("'","''")+"'";
const json=v=>literal(JSON.stringify(v))+'::jsonb';
let checks=0,started=false;
function check(ok,label){assert.ok(ok,label);process.stdout.write('OK '+(++checks)+' '+label+'\n');}
const marker={schema:'task217-seven-provider-pilot-v1',id:'task217-text-pilot-2026-11-01',maxCostMicros:1000000,maxAttempts:28};
const providers=['openai','anthropic','gemini','xai','deepseek','qwen','mistral'];
const subjects=providers.map(p=>createHash('sha256').update('SYNTHETIC-pilot-'+p).digest('hex'));
const cases=[['intent-ar','intent.classify','ar'],['intent-en','intent.classify','en'],['discover-ar','discover','ar'],['discover-en','discover','en']];
function seed(provider='gemini',extra=100,change={}){
 const id=randomUUID(),now=Date.now(),who=subjects[providers.indexOf(provider)];
 const permit={schema:'task217-first-profile-v1',planId:randomUUID(),sourceSha:'b'.repeat(40),caseSetSha:'c'.repeat(64),subjectHash:who,expiresAtMs:now+600000,inputTokenCeiling:4096,outputTokenCeiling:1024,cases:cases.map(([caseId,stage,language])=>({caseId,stage,language,requestId:randomUUID()}))};
 const proof={grantId:id,provider,model:'SYNTHETIC-'+provider,environment:'provider-benchmark',accountId:'SYNTHETIC-'+id,projectId:'SYNTHETIC-project',evidenceSha256:'d'.repeat(64),credentialSha256:'e'.repeat(64),verifiedAtMs:now-1000,expiresAtMs:now+600000,quotaWindowStartMs:now-3600000,quotaWindowEndMs:now+3600000,remainingRequests:60,remainingInputTokens:245760,remainingOutputTokens:61440,autoReload:'off',postpaid:'blocked',overdraft:'blocked',concurrentAccountUsage:'bounded',mode:'existing-credit',currency:'USD',serviceTier:'standard',pricing:'standard-2026-10-28',authorizedCreditMicros:1000000,remainingCreditMicros:1000000,measurementPermit:permit,pilotEnvelope:marker,pricingEvidenceSha256:'a'.repeat(64),pricingVerification:{schema:'standard-pricing-verification-v1',snapshotSha256:'a'.repeat(64),sourceUrl:'https://ai.google.dev/SYNTHETIC-tariff',inputMicrosPerMillion:1000000,outputMicrosPerMillion:2000000,observedAtMs:now-1000,evidenceSha256:'f'.repeat(64)},allInChargeBound:{schema:'all-in-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-charges',maxAdditionalMicros:extra,observedAtMs:now-1000,evidenceSha256:'9'.repeat(64)},...change};
 const insert='INSERT INTO private.dabra_dialogue_funding_grants(id,provider,account_id,project_id,funding_mode,authorized_credit_micros,input_rate_micros_per_million,output_rate_micros_per_million,pricing_expires_at,enabled,proof,authorized_at) VALUES('+[literal(id),literal(provider),literal(proof.accountId),literal(proof.projectId),"'existing-credit'",1000000,1000000,2000000,"clock_timestamp()+interval '10 minutes'",true,json(proof),"clock_timestamp()-interval '1 second'"].join(',')+');';
 return {id,proof,permit,insert,cost:6144+extra};
}
function claim(g,index=0,changes={}){
 const c=g.permit.cases[index],v={attempt:randomUUID(),request:c.requestId,stage:c.stage,subject:g.permit.subjectHash,cost:g.cost,proof:{...g.proof,measurementRequest:{planId:g.permit.planId,caseId:c.caseId}},...changes};
 return 'SELECT public.reserve_dabra_dialogue_attempt('+[literal(v.attempt)+'::uuid',literal(v.request)+'::uuid',literal(v.stage),literal(v.subject),literal(g.id)+'::uuid',json(v.proof),4096,1024,v.cost,'(SELECT daily_limits FROM private.dabra_dialogue_funding_control WHERE singleton)',"floor((floor(extract(epoch FROM clock_timestamp())*1000)+10800000)::numeric/86400000)::bigint*86400000-10800000"].join(',')+');';
}
const transaction=sql=>query('BEGIN;'+sql+'ROLLBACK;');
const decision=(g,index=0,change={})=>JSON.parse(transaction(g.insert+claim(g,index,change))).decision;
function blocked(sql,expected){try{transaction(sql);return false;}catch(e){return String(e).includes(expected);}}
function concurrent(sql){return new Promise((resolveResult,reject)=>{const c=spawn('docker',['exec','-i',name,'psql',...args],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{c.kill();reject(Error('isolated_pg_timeout'));},20000);c.stdout.on('data',v=>out+=v);c.stderr.on('data',v=>err+=v);c.on('error',reject);c.on('exit',code=>{clearTimeout(timer);if(code===0)resolveResult(out.trim());else reject(Error(err));});c.stdin.end(sql);});}

function snapshotSeed(provider='openai',extra=100,change={}){
 const now=Date.now(),g=seed(provider,extra,{verifiedAtMs:now-7200000,expiresAtMs:now-6600000,...change}),before=json(g.proof);
 const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 const p=g.proof,m=p.measurementPermit;
 p.snapshotUse={schema:'task217-funding-snapshot-use-v1',authorizationId:randomUUID(),
  financialSnapshotSha256:digest([p.grantId,p.provider,p.model,p.environment,p.accountId,p.projectId,p.mode,p.currency,p.serviceTier,
   p.authorizedCreditMicros,p.remainingCreditMicros,p.evidenceSha256,p.credentialSha256,p.verifiedAtMs,p.expiresAtMs,p.autoReload,p.postpaid,p.overdraft,p.concurrentAccountUsage]),
  measurementPermitSha256:digest([m.schema,m.planId,m.sourceSha,m.caseSetSha,m.subjectHash,m.expiresAtMs,m.inputTokenCeiling,m.outputTokenCeiling,
   m.cases.map(c=>[c.caseId,c.requestId,c.stage,c.language])]),authorizedAtMs:Date.now(),expiresAtMs:m.expiresAtMs};
 g.insert=g.insert.replace(before,json(p));g.runId=randomUUID();return g;
}
function snapshotClaim(g,index=0,changes={},runId=g.runId){
 return claim(g,index,{attempt:index===0?runId:randomUUID(),
  proof:{...g.proof,measurementRequest:{planId:g.permit.planId,caseId:g.permit.cases[index].caseId,runId}},...changes});
}
const snapshotDecision=(g,index=0,changes={})=>JSON.parse(transaction(g.insert+snapshotClaim(g,index,changes))).decision;
function storedChange(g,change){const before=json(g.proof);Object.assign(g.proof,change);g.insert=g.insert.replace(before,json(g.proof));return g;}

try{
 docker(['run','--detach','--pull=never','--read-only','--network=none','--name',name,'--user','postgres','--mount','type=bind,source='+cluster+',target=/task217','--env','TMPDIR=/task217/tmp','--entrypoint','/bin/sh',image,'-c','mkdir -p /task217/data /task217/tmp && initdb -D /task217/data -A trust -U task217_pilot_test --encoding=UTF8 --locale=C --no-instructions > /task217/initdb.log 2>&1 && exec postgres -D /task217/data -h 127.0.0.1 -p 5432 -k "" -c shared_buffers=16MB -c max_connections=10 > /task217/postgres.log 2>&1']);started=true;
 const iso=JSON.parse(docker(['inspect',name,'--format','{{json .HostConfig}}'])),mounts=JSON.parse(docker(['inspect',name,'--format','{{json .Mounts}}']));
 check(iso.NetworkMode==='none'&&iso.ReadonlyRootfs===true&&Object.keys(iso.PortBindings??{}).length===0,'no external network or host ports, read-only image');
 check(mounts.some(m=>m.Destination==='/task217'&&m.Type==='bind'&&m.Source.replaceAll('\\','/').toLowerCase()===cluster.replaceAll('\\','/').toLowerCase()),'cluster/log/temp actually on D');
 let ready=false;for(let i=0;i<30;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-p','5432','-U','task217_pilot_test']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,3000));}}
 if(!ready)throw Error('isolated_pg_start_failed: '+readFileSync(join(cluster,'initdb.log'),'utf8').slice(-1200));
 process.stdout.write('ENGINE '+query('SELECT version();')+'\nDATA '+cluster+'\n');
 query('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
 for(const f of ['20261028174710_task217_dialogue_funding_admission.sql','20261101102846_task217_first_profile_measurement_guard.sql'])query(readFileSync('supabase/migrations/'+f,'utf8'));
 const aclSQL="SELECT oid::regprocedure::text,proacl::text,prosecdef,proconfig::text FROM pg_proc WHERE oid IN ('public.reserve_dabra_dialogue_attempt(uuid,uuid,text,text,uuid,jsonb,integer,integer,bigint,jsonb,bigint)'::regprocedure,'public.get_dabra_dialogue_funding_policy(text)'::regprocedure,'private.protect_dabra_dialogue_grant()'::regprocedure) ORDER BY 1;";
 const rlsSQL="SELECT relname,relrowsecurity,relforcerowsecurity,relacl::text FROM pg_class WHERE relnamespace='private'::regnamespace AND relkind='r' ORDER BY 1;";
 const acl=query(aclSQL),rls=query(rlsSQL);
 query(readFileSync('supabase/migrations/20261101153907_task217_seven_provider_pilot_envelope.sql','utf8'));
 query(readFileSync("supabase/migrations/20261102043035_task217_pilot_ledger_funding_scope.sql",'utf8'));
 if(snapshotDelta){
  const old=seed('anthropic'),previousDay=Math.floor((Date.now()+10800000)/86400000)*86400000-10800000-86400000;
  const rows=Array.from({length:3},()=>"INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros) VALUES ("+[literal(randomUUID()),literal(randomUUID()),"'discover'",literal(old.permit.subjectHash),literal(old.id),previousDay,0,1,1,1,18432].join(',')+");").join('');
  query(old.insert+'UPDATE private.dabra_dialogue_funding_grants SET enabled=false,reserved_credit_micros=55296 WHERE id='+literal(old.id)+';'+rows);
  const dataSQL='SELECT row_to_json(g)::text FROM private.dabra_dialogue_funding_grants g ORDER BY id;SELECT row_to_json(a)::text FROM private.dabra_dialogue_admissions a ORDER BY attempt_id;';
  const before=query(dataSQL);query(readFileSync('supabase/migrations/20261102182200_task217_saved_funding_snapshot_use.sql','utf8'));
  check(query(dataSQL)===before,'new forward preserves original grant and all three admissions/holds exactly');
 }
 check(query(aclSQL)===acl,'RPC signatures, SECURITY DEFINER/search path and existing ACL unchanged');check(query(rlsSQL)===rls,'same three private tables, forced RLS and direct table ACL unchanged');
 query('UPDATE private.dabra_dialogue_funding_control SET enabled=true,subject_hashes=ARRAY['+subjects.map(literal).join(',')+'],max_attempt_cost_micros=1000000;');
 if(snapshotDelta){

  const g=snapshotSeed();
  const compiled={exports:{}};
  runInNewContext(ts.transpileModule(readFileSync('lib/dabra/dialogue-funding.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:compiled,exports:compiled.exports,require:id=>{if(id==='server-only')return {};if(id==='node:crypto')return {createHash};if(id==='./dialogue-pricing-approvals')return {APPROVED_DIALOGUE_STANDARD_PRICING:[]};throw Error('unexpected_snapshot_binding_dependency');}});
  const bindings=compiled.exports.fundingSnapshotBindings(g.proof);
  check(bindings?.financialSnapshotSha256===g.proof.snapshotUse.financialSnapshotSha256&&bindings?.measurementPermitSha256===g.proof.snapshotUse.measurementPermitSha256,'actual TS bindings match the identical proof/permit admitted by PostgreSQL');
  check(snapshotDecision(g)==='admitted','expired financial snapshot accepted only with exact new private authorization');
  const truth=transaction(g.insert+snapshotClaim(g)+"SELECT proof->>'verifiedAtMs'||':'||(proof->>'expiresAtMs')||':'||(proof->>'remainingCreditMicros') FROM private.dabra_dialogue_funding_grants WHERE id="+literal(g.id)+';').split('\n').at(-1);
  check(truth===[g.proof.verifiedAtMs,g.proof.expiresAtMs,1000000].join(':'),'original financial timestamps and value remain unmodified');
  const noAuth=snapshotSeed();storedChange(noAuth,{snapshotUse:undefined});
  check(snapshotDecision(noAuth)==='denied','expired original without explicit authorization remains denied');
  for(const change of [{expiresAtMs:Date.now()-1},{authorizedAtMs:Date.now()+60000},
   {authorizedAtMs:Date.now()-3600001},{financialSnapshotSha256:'0'.repeat(64)},{measurementPermitSha256:'0'.repeat(64)}]){
   const f=snapshotSeed();storedChange(f,{snapshotUse:{...f.proof.snapshotUse,...change}});
   check(snapshotDecision(f)==='denied','expired/future/wide/unbound snapshot authorization denied');
  }
  for(const change of [{accountId:'SYNTHETIC-other'},{projectId:'SYNTHETIC-other'},{credentialSha256:'8'.repeat(64)},
   {model:'SYNTHETIC-other'},{evidenceSha256:'8'.repeat(64)},{verifiedAtMs:g.proof.verifiedAtMs+1}]){
   check(snapshotDecision(g,0,{proof:{...g.proof,...change,measurementRequest:{planId:g.permit.planId,caseId:'intent-ar',runId:g.runId}}})==='denied','caller cannot substitute financial identity/evidence');
  }
  for(const field of ['sourceSha','subjectHash','planId','cases']){
   const f=snapshotSeed(),m={...f.permit,[field]:field==='cases'?[...f.permit.cases].reverse():field==='planId'?randomUUID():'8'.repeat(field==='sourceSha'?40:64)};
   storedChange(f,{measurementPermit:m});f.permit=m;
   check(snapshotDecision(f)==='denied','authorization binds original permit '+field);
  }
  for(const field of ['pricingVerification','allInChargeBound']){
   const f=snapshotSeed(),v={...f.proof[field],observedAtMs:Date.now()-3600000};
   storedChange(f,{[field]:v});check(snapshotDecision(f)==='denied','snapshot-use cannot refresh stale independent '+field);
  }
  for(const change of [{quotaWindowEndMs:Date.now()-1},{remainingRequests:0}]){
   const f=snapshotSeed('openai',100,change);
   check(snapshotDecision(f)==='denied','snapshot-use cannot bypass expired quota or exhausted calls');
  }
  const permitExpired=snapshotSeed('openai',100,{measurementPermit:{...g.permit,expiresAtMs:Date.now()-1}});
  check(snapshotDecision(permitExpired)==='denied','measurement permit has no implicit extension');
  const noRunProof={...g.proof,measurementRequest:{planId:g.permit.planId,caseId:'intent-ar'}};
  check(snapshotDecision(g,0,{proof:noRunProof})==='denied','new authorization requires one run owner');
  check(snapshotDecision(g,0,{attempt:randomUUID()})==='denied','first attempt must be its run identity');
  check(snapshotDecision(g,1)==='denied','cannot start from a later case');
  const all=transaction(g.insert+g.permit.cases.map((_,i)=>snapshotClaim(g,i)).join('')+snapshotClaim(g)).split('\n').map(v=>JSON.parse(v).decision);
  check(all.slice(0,4).every(v=>v==='admitted')&&all[4]==='denied','exactly four fixed cases, no reuse or replacement');
  check(blocked(g.insert+"UPDATE private.dabra_dialogue_funding_grants SET proof=proof-'snapshotUse' WHERE id="+literal(g.id)+';','DIALOGUE_SNAPSHOT_USE_IMMUTABLE'),'authorization cannot be removed');
  check(blocked(g.insert+"UPDATE private.dabra_dialogue_funding_grants SET proof=jsonb_set(proof,'{snapshotUse,expiresAtMs}',to_jsonb("+String(Date.now()+1200000)+"::bigint)) WHERE id="+literal(g.id)+';','DIALOGUE_SNAPSHOT_USE_IMMUTABLE'),'authorization cannot be renewed');
  for(const field of ['verifiedAtMs','expiresAtMs','remainingCreditMicros','evidenceSha256']){
   const value=field==='evidenceSha256'?json('8'.repeat(64)):json(Date.now());
   check(blocked(g.insert+"UPDATE private.dabra_dialogue_funding_grants SET proof=jsonb_set(proof,'{"+field+"}',"+value+") WHERE id="+literal(g.id)+';','DIALOGUE_SNAPSHOT_FINANCIAL_IMMUTABLE'),'original financial '+field+' frozen');
  }
  const collision=snapshotSeed('gemini');storedChange(collision,{snapshotUse:{...collision.proof.snapshotUse,authorizationId:g.proof.snapshotUse.authorizationId}});
  check(blocked(g.insert+collision.insert,'DIALOGUE_SNAPSHOT_USE_BINDING_REQUIRED'),'one authorization ID cannot enroll a second grant');
  const original=seed('openai'),auth=snapshotSeed().proof.snapshotUse;
  check(blocked(original.insert+"UPDATE private.dabra_dialogue_funding_grants SET proof=jsonb_set(jsonb_set(proof,'{snapshotUse}',"+json(auth)+"),'{verifiedAtMs}',"+json(Date.now()-7200000)+") WHERE id="+literal(original.id)+';','DIALOGUE_SNAPSHOT_FINANCIAL_IMMUTABLE'),'adding authorization cannot rewrite original observation');
  function ordinaryOld(fresh){
   const now=Date.now(),o=seed('openai',0,{pilotEnvelope:undefined,measurementPermit:undefined,
    ...(fresh?{}:{verifiedAtMs:now-7200000,expiresAtMs:now-6600000})});
   const profiles=[{provider:'openai',measurement:{model:o.proof.model,capability:'intent.classify'}}];
   return JSON.parse(transaction('UPDATE private.dabra_dialogue_funding_control SET profiles='+json(profiles)+';'+o.insert+claim(o,0,{proof:o.proof}))).decision;
  }
  check(ordinaryOld(true)==='admitted'&&ordinaryOld(false)==='denied','ordinary customer retains original one-hour freshness guard');
  for(const [cost,expected] of [[944704,'admitted'],[944705,'denied']]){
   check(snapshotDecision(snapshotSeed('openai',cost-6144))===expected,'original55296 held within USD1 lifetime boundary '+cost);
  }
  const oldRow=(cost)=>'INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros) SELECT '+literal(randomUUID())+'::uuid,'+literal(randomUUID())+"::uuid,'discover',"+literal(subjects[1])+",id,-86400000,0,1,1,1,"+cost+" FROM private.dabra_dialogue_funding_grants WHERE provider='anthropic';";
  check(JSON.parse(transaction(g.insert+Array.from({length:25},()=>oldRow(1)).join('')+snapshotClaim(g))).decision==='denied','28 lifetime calls cannot be renewed by snapshot authorization');
  for(const role of ['anon','authenticated']){
   const limits=json(JSON.parse(query('SELECT daily_limits FROM private.dabra_dialogue_funding_control WHERE singleton;')));
   check(blocked(g.insert+'SET LOCAL ROLE '+role+';'+snapshotClaim(g).replace('(SELECT daily_limits FROM private.dabra_dialogue_funding_control WHERE singleton)',limits),'permission denied for function reserve_dabra_dialogue_attempt'),'existing '+role+' RPC denial unchanged');
  }
  // Commit one race so independent PostgreSQL sessions contend on the real lock.
  const raceSeed=snapshotSeed('openai',400000-6144),other=snapshotSeed('gemini',600000-6144);
  query(raceSeed.insert+other.insert);
  const runs=[raceSeed.runId,randomUUID()];
  const race=await Promise.all(runs.map(run=>concurrent(snapshotClaim(raceSeed,0,{},run))));
  const winner=race.findIndex(v=>JSON.parse(v).decision==='admitted'),loser=1-winner;
  check(winner>=0&&race.filter(v=>JSON.parse(v).decision==='admitted').length===1,'two concurrent executions have exactly one durable run owner');
  check(JSON.parse(query(snapshotClaim(raceSeed,1,{},runs[loser]))).decision==='denied','losing run cannot join the winning authorization');
  check(JSON.parse(query(snapshotClaim(raceSeed,2,{},runs[winner]))).decision==='denied','winning run cannot skip the next fixed case');
  check(JSON.parse(query(snapshotClaim(raceSeed,0,{},runs[winner]))).decision==='denied','unknown first outcome cannot be retried');
  check(JSON.parse(query(snapshotClaim(other))).decision==='denied','other provider cannot spend reserved unknown hold beyond global envelope');
  check(query("SELECT sum(reserved_credit_micros)||':'||(SELECT count(*) FROM private.dabra_dialogue_admissions) FROM private.dabra_dialogue_funding_grants;")==='455296:4','prior three holds55296 plus unknown new400000 remain intact');
  check(query("SELECT reserved_credit_micros FROM private.dabra_dialogue_funding_grants WHERE provider='anthropic';")==='55296','original disabled provider holds never released or reallocated');

 }else if(scopeDelta){

  const unknown={postpaid:'unknown',overdraft:'unknown',concurrentAccountUsage:'unknown'};
  const g=seed('openai',100,unknown);
  check(decision(g)==='admitted','pilot accepts truthful unknown account properties with exact stored permit');
  const truthful=transaction(g.insert+claim(g)+'SELECT proof->>\'overdraft\'||\':\'||(proof->>\'concurrentAccountUsage\') FROM private.dabra_dialogue_funding_grants WHERE id='+literal(g.id)+';').split('\n');
  check(truthful.at(-1)==='unknown:unknown','admission does not relabel account observations');
  check(decision(seed('openai',100,{...unknown,postpaid:'allowed',overdraft:'allowed'}))==='admitted','pilot does not assert provider account-wide guarantees');
  function ordinary(state){
    const o=seed('openai',0,{pilotEnvelope:undefined,measurementPermit:undefined,...state});
    const profiles=[{provider:'openai',measurement:{model:o.proof.model,capability:'intent.classify'}}];
    return JSON.parse(transaction('UPDATE private.dabra_dialogue_funding_control SET profiles='+json(profiles)+';'+o.insert+claim(o,0,{proof:o.proof}))).decision;
  }
  check(ordinary({})==='admitted','ordinary qualified SQL baseline remains admissible');
  for(const state of [{postpaid:'unknown'},{overdraft:'unknown'},{overdraft:'allowed'},{concurrentAccountUsage:'unknown'}])
    check(ordinary(state)==='denied','ordinary SQL rejects unproven account-wide condition');
  for(const state of [{autoReload:'on'},{autoReload:'unknown'},{remainingCreditMicros:0},{expiresAtMs:Date.now()-1},{overdraft:'fabricated'},{concurrentAccountUsage:'fabricated'}])
    check(decision(seed('openai',100,{...unknown,...state}))==='denied','pilot still rejects recharge, missing credit, expiry or invalid account-state shape');
  for(const proof of [
    {...g.proof,accountId:'SYNTHETIC-other'}, {...g.proof,projectId:'SYNTHETIC-other'},
    {...g.proof,credentialSha256:'8'.repeat(64)}, {...g.proof,model:'SYNTHETIC-other'},
    {...g.proof,pilotEnvelope:{...marker,id:'another-budget'}},
    {...g.proof,allInChargeBound:undefined},
  ])check(decision(g,0,{proof:{...proof,measurementRequest:{planId:g.permit.planId,caseId:'intent-ar'}}})==='denied','caller cannot replace bound identity, model, envelope or all-in proof');
  check(blocked(seed('openai',100,{...unknown,measurementPermit:undefined}).insert,'DIALOGUE_PILOT_BINDING_REQUIRED'),'pilot requires server-stored measurement permit');
  const fixed=transaction(g.insert+g.permit.cases.map((_,i)=>claim(g,i)).join('')+claim(g,0,{request:randomUUID()})).split('\n').map(v=>JSON.parse(v).decision);
  check(fixed.slice(0,4).every(v=>v==='admitted')&&fixed[4]==='denied','only four fixed cases; no fifth or replacement request');
  const unprivilegedLimits=json(JSON.parse(query('SELECT daily_limits FROM private.dabra_dialogue_funding_control WHERE singleton;')));
  for(const role of ['anon','authenticated']){
    const call=claim(g).replace('(SELECT daily_limits FROM private.dabra_dialogue_funding_control WHERE singleton)',unprivilegedLimits);
    check(blocked(g.insert+'SET LOCAL ROLE '+role+';'+call,'permission denied for function reserve_dabra_dialogue_attempt'),'unprivileged role '+role+' cannot invoke reservation');
  }
  const previousDay=Math.floor((Date.now()+10800000)/86400000)*86400000-10800000-86400000;
  const oldRow=(gr)=>'INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros) VALUES('+[literal(randomUUID()),literal(randomUUID()),"'discover'",literal(gr.permit.subjectHash),literal(gr.id),previousDay,0,1,1,1,18432].join(',')+');';
  const old=seed('anthropic',100);
  const previous=old.insert+'UPDATE private.dabra_dialogue_funding_grants SET enabled=false,reserved_credit_micros=55296 WHERE id='+literal(old.id)+';'+Array.from({length:3},()=>oldRow(old)).join('');
  for(const [cost,expected] of [[944704,'admitted'],[944705,'denied']]){
    const target=seed('openai',cost-6144,unknown);
    check(JSON.parse(transaction(previous+target.insert+claim(target))).decision===expected,'prior-day55296 retained at lifetime USD1 boundary '+cost);
  }
  const a=seed('openai',400000-6144,unknown),b=seed('gemini',400000-6144,unknown);
  query(previous+a.insert+b.insert);
  const duplicates=await Promise.all([concurrent(claim(a)),concurrent(claim(a))]);
  check(duplicates.filter(v=>JSON.parse(v).decision==='admitted').length===1,'concurrent duplicate request admits exactly once');
  const races=await Promise.all([concurrent(claim(a,1)),concurrent(claim(b))]);
  check(races.filter(v=>JSON.parse(v).decision==='admitted').length===1,'concurrent providers respect USD1 with retained prior holds');
  const ledger=query("SELECT sum(reserved_credit_micros)||':'||(SELECT count(*) FROM private.dabra_dialogue_admissions) FROM private.dabra_dialogue_funding_grants;");
  check(ledger==='855296:5','three previous holds and two new admissions retained exactly');
  const held=transaction('SELECT reserved_credit_micros FROM private.dabra_dialogue_funding_grants WHERE id='+literal(old.id)+';');
  check(held==='55296','previous failed or unknown provider holds remain unchanged');
  check(JSON.parse(query(claim(a,2))).decision==='denied','remaining capacity cannot fund another full case');
  check(query('SELECT sum(reserved_credit_micros) FROM private.dabra_dialogue_funding_grants;')==='855296','denial does not release or reset any hold');

 }else{
 for(const provider of providers){const g=seed(provider);check(decision(g)==='admitted',provider+' existing-credit pilot admitted without waiting for six other accounts');}
 const g=seed(),h=seed('xai');
 check(decision(g,0,{proof:g.proof})==='denied','pilot cannot reserve through ordinary path');
 check(decision(g,0,{cost:6144})==='denied','token-only quote cannot omit all-in upper bound');
 for(const bound of [undefined,null,{}, {...g.proof.allInChargeBound,coverage:'unknown'}, {...g.proof.allInChargeBound,currency:'EUR'}, {...g.proof.allInChargeBound,maxAdditionalMicros:-1}, {...g.proof.allInChargeBound,maxAdditionalMicros:1.5}, {...g.proof.allInChargeBound,observedAtMs:Date.now()+60000}, {...g.proof.allInChargeBound,observedAtMs:Date.now()-3600000}, {...g.proof.allInChargeBound,evidenceSha256:'unknown'}]){
  const f=seed('gemini',100,{allInChargeBound:bound});check(decision(f)==='denied','missing/malformed/stale/unproven all-in bound denied');
 }
 const badRates=seed('gemini',100,{pricingVerification:{...g.proof.pricingVerification,inputMicrosPerMillion:999999}});
 check(decision(badRates)==='denied','pricing proof cannot replace trusted stored token rates');
 check(decision(g,0,{proof:{...g.proof,allInChargeBound:{...g.proof.allInChargeBound,maxAdditionalMicros:0},measurementRequest:{planId:g.permit.planId,caseId:'intent-ar'}}})==='denied','full proof equality rejects caller-supplied cheaper evidence');
 const all=transaction(g.insert+g.permit.cases.map((_,i)=>claim(g,i)).join('')+claim(g,0,{request:randomUUID()})).split('\n').map(v=>JSON.parse(v).decision);
 check(all.slice(0,4).every(v=>v==='admitted')&&all[4]==='denied','four fixed cases only; no fifth or replaced request');
 const again=transaction(g.insert+claim(g)+claim(g)).split('\n').map(v=>JSON.parse(v).decision);
 check(again[0]==='admitted'&&again[1]==='denied','new attempt cannot replay an admitted request');
 for(const [label,expression] of [['remove',"proof-'pilotEnvelope'"],['null',"jsonb_set(proof,'{pilotEnvelope}','null'::jsonb)"],['id',"jsonb_set(proof,'{pilotEnvelope,id}','\"other-budget\"'::jsonb)"],['cap',"jsonb_set(proof,'{pilotEnvelope,maxCostMicros}','2000000'::jsonb)"]]){
  check(blocked(g.insert+'UPDATE private.dabra_dialogue_funding_grants SET proof='+expression+' WHERE id='+literal(g.id)+';','DIALOGUE_PILOT_IMMUTABLE'),'cannot '+label+' fixed envelope during proof refresh');
 }
 check(blocked(g.insert+'DELETE FROM private.dabra_dialogue_funding_grants WHERE id='+literal(g.id)+';','DIALOGUE_PILOT_IMMUTABLE'),'grant cannot be deleted even before first claim');
 check(blocked(g.insert+seed('gemini').insert,'dabra_task217_pilot_provider'),'changing grant/account cannot mint another provider plan');
 for(const field of ['planId','cases','sourceSha','subjectHash']){
  const replacement=field==='cases'?[]:field==='planId'?randomUUID():'f'.repeat(field==='sourceSha'?40:64);
  check(blocked(g.insert+"UPDATE private.dabra_dialogue_funding_grants SET proof=jsonb_set(proof,'{measurementPermit,"+field+"}',"+json(replacement)+') WHERE id='+literal(g.id)+';','DIALOGUE_MEASUREMENT_IMMUTABLE'),'proof renewal cannot reset '+field);
 }
 for(const mutation of ['DELETE FROM private.dabra_dialogue_admissions','UPDATE private.dabra_dialogue_admissions SET cost_micros=0','UPDATE private.dabra_dialogue_admissions SET day_start_ms=day_start_ms-86400000']){
  check(blocked(g.insert+claim(g)+mutation+' WHERE grant_id='+literal(g.id)+';','DIALOGUE_PILOT_ADMISSION_IMMUTABLE'),'durable admission identity/cost/day cannot be reset');
 }
 const ordinary=seed('openai',100,{pilotEnvelope:undefined});
 check(blocked(ordinary.insert+"UPDATE private.dabra_dialogue_funding_grants SET proof=jsonb_set(proof,'{pilotEnvelope}',"+json(marker)+') WHERE id='+literal(ordinary.id)+';','DIALOGUE_PILOT_IMMUTABLE'),'existing untagged grant cannot be enrolled later to escape historical sums');
 const paidFive=seed('mistral',100,{pilotEnvelope:undefined});
 check(blocked(paidFive.insert,'dabra_dialogue_funding_grants_check'),'legacy paid-five restriction opened only for fixed marked pilot');
 check(blocked(g.insert+"UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=1 WHERE id="+literal(g.id)+";UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=0 WHERE id="+literal(g.id)+';','DIALOGUE_GRANT_IMMUTABLE'),'reserved hold never decreases');
 const oldRow=(gr,cost,dayOffset=0)=>'INSERT INTO private.dabra_dialogue_admissions(attempt_id,request_id,stage,subject_hash,grant_id,day_start_ms,quota_start_ms,quota_end_ms,input_tokens,output_tokens,cost_micros) VALUES('+[literal(randomUUID()),literal(randomUUID()),"'discover'",literal(gr.permit.subjectHash),literal(gr.id),String(dayOffset),0,1,1,1,cost].join(',')+');';
 // T217-PILOT-S1 on rejected7325: max(600000,300000)+150000 admitted; per-grant maxima sum to1050000 and must deny.
 const counterOnly=seed('anthropic'),ledgerOnly=seed('xai'),mixedTarget=seed('gemini',143856);
 const mixedResult=transaction(counterOnly.insert+ledgerOnly.insert+mixedTarget.insert
  +'UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=600000 WHERE id='+literal(counterOnly.id)+';'
  +oldRow(ledgerOnly,300000,-86400000)+claim(mixedTarget));
 check(mixedTarget.cost===150000&&JSON.parse(mixedResult).decision==='denied','T217-PILOT-S1 mixed per-grant counter600000 plus prior-day ledger300000 blocks all-in150000');
 check(JSON.parse(transaction(g.insert+h.insert+'UPDATE private.dabra_dialogue_funding_grants SET reserved_credit_micros=999000,enabled=false WHERE id='+literal(h.id)+';'+claim(g))).decision==='denied','disabled/expired historical grant holds remain in lifetime budget');
 check(JSON.parse(transaction(g.insert+h.insert+oldRow(h,1000000,-86400000)+claim(g))).decision==='denied','prior-day admission cost survives missing/zero grant hold conservatively');
 const refresh={...g.proof,verifiedAtMs:Date.now()-1000,expiresAtMs:Date.now()+600000,remainingCreditMicros:1000000,quotaWindowStartMs:Date.now()-2000,quotaWindowEndMs:Date.now()+600000};
 check(JSON.parse(transaction(g.insert+h.insert+oldRow(h,1000000,-86400000)+'UPDATE private.dabra_dialogue_funding_grants SET proof='+json(refresh)+' WHERE id='+literal(g.id)+';'+claim(g,0,{proof:{...refresh,measurementRequest:{planId:g.permit.planId,caseId:'intent-ar'}}}))).decision==='denied','financial/quota refresh cannot reopen the aggregate budget');
 check(JSON.parse(transaction(g.insert+h.insert+Array.from({length:28},()=>oldRow(h,1,-86400000)).join('')+claim(g))).decision==='denied','28 lifetime admissions block a fresh approved case independently of day');
 check(query("SELECT has_function_privilege('anon','private.protect_dabra_pilot_admission()','EXECUTE') OR has_function_privilege('authenticated','private.protect_dabra_pilot_admission()','EXECUTE') OR has_function_privilege('service_role','private.protect_dabra_pilot_admission()','EXECUTE');")==='f','new private trigger helper has no PUBLIC/anon/authenticated/service EXECUTE');
 // Committed final race. Neither unknown result nor leftover hold is erased/refunded; cluster is retained.
 const a=seed('anthropic',493857),b=seed('gemini',493857);query(a.insert+b.insert);
 const race=await Promise.all([concurrent(claim(a)),concurrent(claim(b))]);
 check(race.filter(v=>JSON.parse(v).decision==='admitted').length===1,'two concurrent providers cannot exceed USD1 aggregate');
 check(query("SELECT sum(reserved_credit_micros)||':'||(SELECT count(*) FROM private.dabra_dialogue_admissions) FROM private.dabra_dialogue_funding_grants;")==='500001:1','unknown/committed hold and admission retained exactly once');
 const next=query(claim(a,1));check(JSON.parse(next).decision==='denied','another full quote cannot reopen remaining envelope after unknown result');
 check(query('SELECT sum(reserved_credit_micros) FROM private.dabra_dialogue_funding_grants;')==='500001','denied or unknown outcome never refunds prior hold');

 }
}finally{if(started){docker(['stop','--time','10',name]);check(docker(['inspect',name,'--format','{{.State.Running}}'])==='false','owned cluster stopped; original files/container retained');}}
process.stdout.write((snapshotDelta?'POSTGRES_SNAPSHOT_USE_DELTA':scopeDelta?'POSTGRES_PILOT_SCOPE_DELTA':'POSTGRES_PILOT_DELTA')+'=PASS CHECKS='+checks+'\nNo provider/API calls; synthetic isolated PostgreSQL only.\n');
