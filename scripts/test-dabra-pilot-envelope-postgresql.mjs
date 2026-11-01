import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
const image='sha256:99b1729aeb0bac314445024fc149fbd39306170b61dd50800ccf180327ab3459';
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
 check(query(aclSQL)===acl,'RPC signatures, SECURITY DEFINER/search path and existing ACL unchanged');check(query(rlsSQL)===rls,'same three private tables, forced RLS and direct table ACL unchanged');
 query('UPDATE private.dabra_dialogue_funding_control SET enabled=true,subject_hashes=ARRAY['+subjects.map(literal).join(',')+'],max_attempt_cost_micros=1000000;');
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

}finally{if(started){docker(['stop','--time','10',name]);check(docker(['inspect',name,'--format','{{.State.Running}}'])==='false','owned cluster stopped; original files/container retained');}}
process.stdout.write('POSTGRES_PILOT_DELTA=PASS CHECKS='+checks+'\nNo provider/API calls; synthetic isolated PostgreSQL only.\n');
