import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { type AgentContext } from '../lib/dabra/agent-contract';
import { runInternalAgentTask } from '../lib/dabra/agent-handoff';
import { planInternalAgentTool } from '../lib/dabra/agent-planner';
import { prepareAgentProviderAttempt, PUBLIC_DIALOGUE_DAILY_LIMITS, dialogueDay, type AgentDialoguePolicy } from '../lib/dabra/agent-dialogue';
import { dialogueCostCeilingMicros, fundingProofCurrent, type DialogueFundingProof } from '../lib/dabra/dialogue-funding';
import { createFundingDialogueAdmission, loadFundingDialoguePolicy, type FundingRpc } from '../lib/dabra/dialogue-funding-store';
import type { AgentCapabilityProfile } from '../lib/dabra/agent-capabilities';

const realNow=Date.now, realFetch=globalThis.fetch;
let clock=realNow(), remote=0;
const grantA='11111111-1111-4111-8111-111111111111',grantB='22222222-2222-4222-8222-222222222222';
const credential='SYNTHETIC-NOT-A-CREDENTIAL';
const envNames=['OPENAI_API_KEY','GEMINI_API_KEY','DABRA_INTERNAL_AI_ENABLED','DABRA_INTERNAL_AI_MODEL','DABRA_OPENAI_MODEL','DABRA_GEMINI_MODEL','DABRA_AI_PROVIDER','DABRA_PROVIDER_FALLBACK_ENABLED','DABRA_DIALOGUE_FUNDING_POLICY'];
const original=Object.fromEntries(envNames.map(n=>[n,process.env[n]]));
test.beforeEach(()=>{
 clock=realNow();Date.now=()=>clock;remote=0;
 Object.assign(process.env,{OPENAI_API_KEY:credential,GEMINI_API_KEY:credential,DABRA_INTERNAL_AI_ENABLED:'true',DABRA_INTERNAL_AI_MODEL:'test-model',DABRA_OPENAI_MODEL:'test-model',DABRA_GEMINI_MODEL:'test-model',DABRA_AI_PROVIDER:'openai',DABRA_PROVIDER_FALLBACK_ENABLED:'false'});
 delete process.env.DABRA_DIALOGUE_FUNDING_POLICY;
 globalThis.fetch=async (_url,init)=>{
  remote++;assert.ok(init?.signal);
  const body=JSON.parse(String(init?.body));assert.equal(body.tools,undefined);
  let text:string;
  try{const data=JSON.parse(body.messages.at(-1).content);text=JSON.stringify(data.general?{kind:'general-travel',advice:'For a quieter family day, take short breaks in shaded places and keep the pace relaxed. Would indoor breaks suit you?'}:{opening:'none',paragraphs:data.units.map((_:string,i:number)=>[i])});}
  catch{text='{"tool":"discover"}';}
  return Response.json({model:'test-model',usage:{prompt_tokens:16,completion_tokens:16},choices:[{message:{content:text}}]});
 };
});
test.afterEach(()=>{Date.now=realNow;globalThis.fetch=realFetch;for(const[n,v]of Object.entries(original))if(v===undefined)delete process.env[n];else process.env[n]=v;});
function actor(subject='synthetic-customer',current=async()=>true):AgentContext{return{role:'customer',taskAuthority:{kind:'customer',actorId:subject,ownerId:subject},isTaskAuthorityCurrent:current,readRequests:async()=>({kind:'forbidden'})};}
function measurement(provider:'openai'|'gemini'='openai',language:'ar'|'en'='en',capability:'discover'|'intent.classify'='discover'):AgentCapabilityProfile{return{provider,measurement:{capability,language,model:'test-model',environment:'synthetic',caseSetSha:'a'.repeat(64),sourceSha:'b'.repeat(40),cases:1,passed:1,measuredAtMs:clock-1,expiresAtMs:clock+600000,latencyMs:provider==='openai'?1:2,inputTokenCeiling:4096,outputTokenCeiling:256,costCeilingUsd:provider==='openai'?0.004608:0}};}
function evidence(provider:'openai'|'gemini'='openai',ceiling=30000):DialogueFundingProof{
 const base={grantId:provider==='openai'?grantA:grantB,provider,model:'test-model',environment:'synthetic' as const,accountId:'SYNTHETIC-account',projectId:'SYNTHETIC-project',evidenceSha256:'c'.repeat(64),credentialSha256:createHash('sha256').update(credential).digest('hex'),verifiedAtMs:clock-1,expiresAtMs:clock+600000,quotaWindowStartMs:clock-3600000,quotaWindowEndMs:clock+3600000,remainingRequests:1000,remainingInputTokens:1000000,remainingOutputTokens:1000000,autoReload:'off' as const,postpaid:'blocked' as const,overdraft:'blocked' as const,concurrentAccountUsage:'bounded' as const};
 return provider==='openai'?{...base,provider,mode:'existing-credit',currency:'USD',authorizedCreditMicros:ceiling,remainingCreditMicros:ceiling,pricing:'synthetic',serviceTier:'standard'}:{...base,provider,mode:'no-new-charge',enforcement:'provider-hard-no-new-charge'};
}
/** TEST-ONLY serialized RPC fixture. It tests real server integration, NOT PostgreSQL execution or durability. */
class RpcFixture{
 ledger:Array<{attempt:string;subject:string;day:number;grant:string;input:number;output:number;cost:number;stage:string}>=[];
 held=new Map<string,number>();ceilings=new Map([[grantA,30000],[grantB,0]]);calls=0;lost=false;
 rpc:FundingRpc=async(name,p,signal)=>{
  this.calls++;await Promise.resolve();
  if(signal.aborted||name!=='reserve_dabra_dialogue_attempt')return{data:null,error:'denied'};
  const attempt=String(p.p_attempt_id),subject=String(p.p_subject_hash),grant=String(p.p_grant_id);
  const day=Number(p.p_day_start_ms),input=Number(p.p_input_tokens),output=Number(p.p_output_tokens),cost=Number(p.p_cost_micros),held=this.held.get(grant)??0;
  const proof=p.p_proof as DialogueFundingProof;
  const rows=this.ledger.filter(r=>r.day===day),user=rows.filter(r=>r.subject===subject);
  const sum=(a:typeof rows,k:'input'|'output')=>a.reduce((s,r)=>s+r[k],0);
  if(this.ledger.some(r=>r.attempt===attempt)||!this.ceilings.has(grant)||held+cost>this.ceilings.get(grant)!
   ||proof.mode==='existing-credit'&&(proof.authorizedCreditMicros!==this.ceilings.get(grant)||held+cost>proof.remainingCreditMicros)
   ||user.length>=6||rows.length>=60||new Set(rows.map(r=>r.subject)).size>=10&&!user.length
   ||sum(user,'input')+input>24576||sum(user,'output')+output>6144||sum(rows,'input')+input>245760||sum(rows,'output')+output>61440)return{data:{decision:'denied'},error:null};
  this.held.set(grant,held+cost);this.ledger.push({attempt,subject,day,grant,input,output,cost,stage:String(p.p_stage)});
  if(this.lost)return{data:null,error:'lost_response_after_commit'};
  return{data:{decision:'admitted',attempt_id:attempt},error:null};
 };
}
function policy(fixture=new RpcFixture(),locale:'ar'|'en'='en',proofs:DialogueFundingProof[]=[evidence()]):AgentDialoguePolicy{
 return{trial:true,environment:'synthetic',profiles:[measurement('openai',locale),measurement('openai',locale,'intent.classify')],freeProofs:[],daily:PUBLIC_DIALOGUE_DAILY_LIMITS,limits:{maxAttempts:1,maxElapsedMs:12000,maxInputTokens:4096,maxOutputTokens:1024,maxCostUsd:0.004608},funding:{kind:'existing-credit-v2',requestId:randomUUID(),proofs,admission:createFundingDialogueAdmission(fixture.rpc)}};
}
function handler(p:AgentDialoguePolicy,context=actor()){
 const require=createRequire(import.meta.url),exports={};
 const deps:Record<string,unknown>={'next/server':{NextRequest,NextResponse,after:()=>{}},'@/lib/dabra/agent-planner':{planInternalAgentTool},'@/lib/dabra/agent-dialogue':{getAgentDialoguePolicy:async()=>p},'@/lib/dabra/agent-context':{resolveAgentContext:async()=>context},'@/lib/dabra/agent-handoff':{runInternalAgentTask}};
 runInNewContext(ts.transpileModule(readFileSync('app/api/ai2/chat/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(id:string)=>deps[id]??require(id),process,Date},{filename:'funding-actual-route.ts'});
 return(exports as typeof import('../app/api/ai2/chat/route')).POST;
}
const car={en:'I need a car for five people in Cairo for three days. Ask for missing information first.',ar:'أبغى سيارة لعائلة من خمسة أشخاص في القاهرة لمدة ثلاثة أيام. اسألني عن المعلومات الناقصة.'};
const post=(p:AgentDialoguePolicy,locale:'ar'|'en'='en',message=car[locale],context=actor())=>handler(p,context)(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',body:JSON.stringify({locale,message})}));
for(const locale of ['ar','en']as const)test('credit actual POST '+locale+': one held charge and Core question survive',async()=>{
 const store=new RpcFixture();const body=await(await post(policy(store,locale),locale)).json();
 assert.equal(body.provider,'openai');assert.equal(remote,1);assert.equal(store.held.get(grantA),4608);assert.equal(store.ledger.length,1);assert.equal(store.ledger[0].stage,'discover');
 assert.match(body.answer,locale==='ar'?/ما تاريخا بدء الاستخدام وانتهائه لهذه المدة/:/dates/i);assert.equal(body.agent.mutations,0);
});
for(const change of ['autoReload','postpaid','overdraft','concurrentAccountUsage','expired','unknown-price','no-balance']as const)test('funding rejects '+change+' before claim/network',async()=>{
 let proof=evidence();if(proof.mode!=='existing-credit')throw Error('fixture');
 if(change==='autoReload')proof={...proof,autoReload:'on'};
 if(change==='postpaid')proof={...proof,postpaid:'unknown'};
 if(change==='overdraft')proof={...proof,overdraft:'allowed'};
 if(change==='concurrentAccountUsage')proof={...proof,concurrentAccountUsage:'unknown'};
 if(change==='expired')proof={...proof,expiresAtMs:clock-1};
 if(change==='unknown-price')proof={...proof,pricing:'standard-2026-10-28'};
 if(change==='no-balance')proof={...proof,remainingCreditMicros:0};
 const store=new RpcFixture(),body=await(await post(policy(store,'en',[proof]))).json();
 assert.equal(body.provider,'local');assert.equal(remote,0);assert.equal(store.calls,0);
});
test('lost committed admission response never retries, calls provider or refunds the hold',async()=>{
 const store=new RpcFixture();store.lost=true;
 const body=await(await post(policy(store))).json();assert.equal(body.provider,'local');assert.equal(remote,0);assert.equal(store.calls,1);assert.equal(store.held.get(grantA),4608);
});
test('two server adapters share one claim: six concurrent permits, no per-worker budget multiplication',async()=>{
 const store=new RpcFixture();store.ceilings.set(grantA,27648);
 const a=policy(store,'en',[evidence('openai',27648)]),b=policy(store,'en',[evidence('openai',27648)]);
 const results=await Promise.all(Array.from({length:20},(_,i)=>prepareAgentProviderAttempt(actor(),'en',i%2?a:b,{capability:'discover',message:'{}',prompt:'public synthetic',inputDigestValue:{}},clock+1000)));
 assert.equal(results.filter(Boolean).length,6);assert.equal(store.ledger.length,6);assert.equal(store.held.get(grantA),27648);
 assert.equal(remote,0);
});
test('lifetime credit cannot renew at Riyadh midnight, proof refresh or new request ID',async()=>{
 const store=new RpcFixture();store.ceilings.set(grantA,10000);
 for(let n=0;n<3;n++){
  if(n)clock=dialogueDay(clock).dayEndMs+1;
  const body=await(await post(policy(store,'en',[evidence('openai',10000)]))).json();
  assert.equal(body.provider,n<2?'openai':'local');
 }
 assert.equal(store.held.get(grantA),9216);assert.equal(store.ledger.length,2);assert.equal(remote,2);
});
test('classifier, transient fallback and answer share claims, counting the uncertain first attempt',async()=>{
 const store=new RpcFixture();let calls=0;const success=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  calls++;
  if(calls===1){remote++;throw Error('synthetic timeout');}
  if(String(input).includes('googleapis.com')){remote++;return Response.json({modelVersion:'test-model',usageMetadata:{promptTokenCount:16,candidatesTokenCount:16,thoughtsTokenCount:0},candidates:[{content:{parts:[{text:'{"tool":"discover"}'}]}}]});}
  return success(input,init);
 };
 process.env.DABRA_PROVIDER_FALLBACK_ENABLED='true';
 const p=policy(store,'en',[evidence(),evidence('gemini')]);
 const governed={...p,profiles:[...p.profiles,measurement('gemini'),measurement('gemini','en','intent.classify')]};
 const body=await(await post(governed,'en','Make my family day quieter')).json();
 assert.equal(body.understandingProvider,'gemini');assert.equal(body.provider,'openai');
 assert.equal(store.ledger.length,3);assert.deepEqual(store.ledger.map(r=>r.stage),['intent.classify','intent.classify','discover']);
 assert.equal(store.held.get(grantA),9216);assert.equal(store.held.get(grantB),0);assert.equal(remote,3);
});
test('unknown billing while new policy is selected never falls through to the legacy classifier',async()=>{
 const policy=await loadFundingDialoguePolicy(actor(),undefined,async()=>({data:null,error:'missing_binding'}));
 const body=await(await post(policy,'en','Plan my trip')).json();
 assert.equal(body.provider,'local');assert.equal(body.understanding,'unavailable');assert.equal(remote,0);
});
test('no-new-charge accepts hard enforcement only; no paid profile can borrow the zero-cost path',()=>{
 const p=evidence('gemini'),m=measurement('gemini');assert.equal(fundingProofCurrent(p,m,clock),true);assert.equal(dialogueCostCeilingMicros(p,m,clock),0);
 assert.equal(dialogueCostCeilingMicros(p,{...m,measurement:{...m.measurement,costCeilingUsd:0.01}},clock),null);
});
test('integer quote rounds up and rejects a measurement below the priced bound',()=>{
 const p=evidence(),m=measurement();assert.equal(dialogueCostCeilingMicros(p,m,clock),4608);
 assert.equal(dialogueCostCeilingMicros(p,{...m,measurement:{...m.measurement,costCeilingUsd:0.004607}},clock),null);
});
test('current Standard reference is conditional on exact model, tier, evidence environment and pricing day',()=>{
 const p=evidence();if(p.mode!=='existing-credit')throw Error('fixture');const now=Date.parse('2026-10-28T12:00:00Z');
 const proof={...p,model:'gpt-5',environment:'provider-benchmark' as const,pricing:'standard-2026-10-28' as const,verifiedAtMs:now-1,expiresAtMs:now+600000,quotaWindowStartMs:now-1000,quotaWindowEndMs:now+3600000,authorizedCreditMicros:100000,remainingCreditMicros:100000};
 const m={...measurement(),measurement:{...measurement().measurement,model:'gpt-5',environment:'provider-benchmark' as const,costCeilingUsd:0.01}};
 assert.equal(dialogueCostCeilingMicros(proof,m,now),7680);
 assert.equal(dialogueCostCeilingMicros({...proof,pricing:'synthetic'},m,now),null);
});
test('request identity and client funding fields cannot create authority',async()=>{
 const store=new RpcFixture();const bad={...actor(),taskAuthority:{kind:'customer' as const,actorId:'one',ownerId:'other'}};
 const body=await(await post(policy(store),'en',car.en,bad)).json();assert.equal(body.provider,'local');assert.equal(remote,0);assert.equal(store.calls,0);
});
test('migration artifact is disabled, service-only and immutable; PostgreSQL execution is NOT claimed',()=>{
 const sql=readFileSync('supabase/migrations/20261028174710_task217_dialogue_funding_admission.sql','utf8');

 assert.equal((sql.match(/^BEGIN;$/gm)??[]).length,1);
 assert.equal((sql.match(/^COMMIT;$/gm)??[]).length,1);
 assert.equal((sql.match(/^CREATE TABLE /gm)??[]).length,3);
 assert.equal((sql.match(/^CREATE FUNCTION /gm)??[]).length,3);
 assert.equal((sql.match(/^CREATE TRIGGER /gm)??[]).length,1);
 assert.equal((sql.match(/^GRANT EXECUTE ON FUNCTION /gm)??[]).length,2);
 assert.ok(sql.indexOf('BEGIN;')<sql.indexOf('CREATE TABLE'));
 assert.ok(sql.lastIndexOf('GRANT EXECUTE')<sql.lastIndexOf('COMMIT;'));
 assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);assert.match(sql,/UNIQUE\(provider,account_id\)/);
 assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/clock_timestamp\(\)/);
 assert.match(sql,/NEW.reserved_credit_micros<OLD.reserved_credit_micros/);
 assert.equal((sql.match(/FORCE ROW LEVEL SECURITY/g)??[]).length,3);
 assert.doesNotMatch(sql,/GRANT[^;]*TO (?:PUBLIC|anon|authenticated)/i);
 assert.doesNotMatch(sql,/INSERT INTO private.dabra_dialogue_funding_grants|TRUNCATE|DELETE FROM private.dabra_dialogue_admissions/i);
});

test('Standard tier is explicit only on funded OpenAI/Claude requests; total thinking stays inside the output cap',async()=>{
 const {callInternalAgentProvider}=await import('../lib/ai2/runtime/agent-provider-dispatch');
 const seen:Record<string,unknown>[]=[];
 globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));seen.push(body);remote++;
  return String(_url).includes('anthropic.com')
   ?Response.json({model:'test-model',usage:{input_tokens:16,output_tokens:128,output_tokens_details:{thinking_tokens:120}},content:[{type:'thinking',thinking:'PRIVATE_THINKING'},{type:'text',text:'Visible answer'}]})
   :Response.json({model:'test-model',usage:{prompt_tokens:16,completion_tokens:128,completion_tokens_details:{reasoning_tokens:120}},choices:[{message:{content:'Visible answer'}}]});};
 for(const provider of ['openai','anthropic']as const){
  const result=await callInternalAgentProvider(provider,{apiKey:credential,model:'test-model'},'public synthetic',{prompt:'public',language:'en',timeoutMs:1000,maxOutputTokens:256,standardBilling:true});
  assert.equal(result.outputTokens,128);assert.equal(result.answer,'Visible answer');assert.equal(seen.at(-1)?.service_tier,provider==='openai'?'default':'standard_only');
  assert.equal(seen.at(-1)?.max_tokens,256);assert.equal(seen.at(-1)?.temperature,provider==='anthropic'?undefined:0);
 }
 await callInternalAgentProvider('openai',{apiKey:credential,model:'test-model'},'public',{prompt:'public',language:'en',timeoutMs:1000,maxOutputTokens:256});
 assert.equal(seen.at(-1)?.service_tier,undefined);assert.equal(remote,3);
});
test('aborted policy read returns blocked Core policy even if the RPC fixture ignores cancellation',async()=>{
 const c=new AbortController();let calls=0;
 const pending=loadFundingDialoguePolicy(actor(),c.signal,async()=>{calls++;return new Promise(()=>{});});
 await Promise.resolve();c.abort();const p=await pending;
 assert.equal(p.trial,true);assert.equal(p.profiles.length,0);assert.equal(p.funding?.proofs.length,0);assert.equal(calls,1);
});
test('server RPC payload contains hashes and reservation metadata without raw message or actor text',async()=>{
 const store=new RpcFixture();const rpc:FundingRpc=async(n,p,s)=>{assert.doesNotMatch(JSON.stringify(p),/synthetic-customer|I need a car|PRIVATE/);assert.match(String(p.p_subject_hash),/^[a-f0-9]{64}$/);return store.rpc(n,p,s);};
 const p=policy(store);const selected={...p,funding:{...p.funding!,admission:createFundingDialogueAdmission(rpc)}};
 const body=await(await post(selected)).json();assert.equal(body.provider,'openai');assert.equal(store.ledger.length,1);
});
test('ten distinct server subjects share the same v2 cap across server adapters',async()=>{
 const store=new RpcFixture();store.ceilings.set(grantA,1000000);
 for(let i=0;i<11;i++){
  const permit=await prepareAgentProviderAttempt(actor('customer-'+i),'en',policy(store,'en',[evidence('openai',1000000)]),{capability:'discover',message:'{}',prompt:'public',inputDigestValue:{}},clock+1000);
  assert.equal(Boolean(permit),i<10);
 }
 assert.equal(store.ledger.length,10);assert.equal(remote,0);
});
