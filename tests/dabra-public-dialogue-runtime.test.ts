import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync as realDirectoryRead} from 'node:fs';
const realDirectory=()=>realDirectoryRead('supabase/migrations');
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {NextRequest} from 'next/server';
import {loadPublicDialoguePolicy} from '../lib/dabra/public-dialogue-store';
import {runInternalAgentTask} from '../lib/dabra/agent-handoff';
import {canonicalOutputContract,profileOutputAccepted,OUTPUT_PARSER_SHA256S} from '../lib/dabra/agent-output-contract';
import {PLATFORM_UNITS_QUALIFICATION_CASES,qualificationInputSha256} from '../lib/dabra/agent-qualification-cases';
import {durableAuthorityBindingSha256,durableProfileSha256,validDurableAccountChargeProof,type DurableAccountChargeProof} from '../lib/dabra/dialogue-durable-authority';
import {approvedPublicPricingContract,refreshPublicDialoguePricing} from '../lib/dabra/dialogue-pricing-refresh';
import {approvedDurableDialogueQuoteMicros,quoteDialogueFunding} from '../lib/dabra/dialogue-funding';
import {prepareAgentProviderAttempt} from '../lib/dabra/agent-dialogue';
import {PLATFORM_DIALOGUE_PROMPT} from '../lib/dabra/agent-platform-dialogue';
import {channel} from 'node:diagnostics_channel';
const pricingBody=readFileSync(new URL('./fixtures/task217-approved-openai-pricing.md',import.meta.url),'utf8');
import type {AgentContext} from '../lib/dabra/agent-contract';
import type {AgentCapabilityProfile} from '../lib/dabra/agent-capabilities';
import type {FundingRpc} from '../lib/dabra/dialogue-funding-store';
import type {AgentDialoguePolicy} from '../lib/dabra/agent-dialogue';

const credential='SYNTHETIC-NOT-A-CREDENTIAL';
const envNames=['DABRA_INTERNAL_AI_ENABLED','DABRA_AI_PROVIDER','DABRA_OPENAI_MODEL','OPENAI_API_KEY','DABRA_DIALOGUE_FUNDING_POLICY']as const;
const realNow=Date.now;let sequence=0;
let prior:Record<string,string|undefined>,oldFetch:typeof fetch;
test.beforeEach(()=>{const instant=realNow()+(++sequence)*900001;Date.now=()=>instant;prior=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));Object.assign(process.env,{DABRA_INTERNAL_AI_ENABLED:'true',DABRA_AI_PROVIDER:'auto',DABRA_OPENAI_MODEL:'gpt-6-luna',OPENAI_API_KEY:credential,DABRA_DIALOGUE_FUNDING_POLICY:'dabra-public-monthly-v1'});oldFetch=globalThis.fetch;});
test.afterEach(()=>{Date.now=realNow;globalThis.fetch=oldFetch;for(const name of envNames){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}});

function fixture(role:Exclude<AgentContext['role'],'guest'>='customer',fault=''){
 let lastUnits:string[]=[];
 const now=Date.now(),actor=randomUUID(),grantId=randomUUID(),requestId=randomUUID();let active=true,projectCurrent=fault!=='project-mismatch',claims=0,models=0,reads=0,pricing=0;
 const price=approvedPublicPricingContract('openai','gpt-6-luna','f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a');assert.ok(price);
 const profiles:AgentCapabilityProfile[]=(['ar','en']as const).map(language=>({provider:'openai',measurement:{capability:'discover',language,model:'gpt-6-luna',environment:'provider-benchmark',sourceSha:'b'.repeat(40),caseSetSha:canonicalOutputContract('platform-dialogue-v2',language).caseSetSha,cases:4,passed:4,measuredAtMs:now-(fault==='late-measurement'?2000:4000),expiresAtMs:now+600000,latencyMs:1,inputTokenCeiling:4096,outputTokenCeiling:1024,costCeilingUsd:0.002141}}));
 const unbound:DurableAccountChargeProof={mode:'bounded-account-charge',grantId,provider:'openai',model:'gpt-6-luna',environment:'provider-benchmark',accountId:'SYNTHETIC-account',projectId:'SYNTHETIC-project',credentialSha256:createHash('sha256').update(credential).digest('hex'),evidenceSha256:'a'.repeat(64),currency:'USD',serviceTier:'standard',pricingEvidenceSha256:'f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a',
  accountTerms:{schema:'task217-account-charge-terms-v1',observedAtMs:now-5000,evidenceSha256:'c'.repeat(64),validity:'until-contract-change',risks:{autoReload:'off',postpaid:'blocked',overdraft:'blocked',concurrentAccountUsage:'bounded'},fundingChargeProtection:{kind:'documented-manual-funding-only',evidenceSha256:'d'.repeat(64)},allInChargeBound:{schema:'all-in-account-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-tax-fx-and-funding-charges',maxAdditionalMicros:0,evidenceSha256:'e'.repeat(64)}},
  limitedOperation:{schema:'task217-limited-operation-v2',authorizationId:randomUUID(),taskId:'task217-text-pilot-2026-11-01',dataScope:'redacted-travel-or-server-units',maxCostMicros:1000000,maxAttempts:28,authorizedAtMs:now-3000,duration:'until-revoked-or-binding-change',providerRisk:'bounded-account-liability-with-observed-risks',acceptedProfileSha256s:fault==='unapproved-profile'?['f'.repeat(64)]:(fault==='one-unapproved'?profiles.slice(1):profiles).map(durableProfileSha256).sort(),contractSha256:price.digest,bindingSha256:'0'.repeat(64)}};
 const proof:DurableAccountChargeProof={...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:durableAuthorityBindingSha256(unbound)}};
 const authorities=profiles.map(p=>({id:randomUUID(),source_grant_id:grantId,source_proof:proof,profile:p,model_tier:fault==='strong-only'?'strong':'economy',enabled:true,authorized_at:new Date(now-1000).toISOString(),output_acceptance:{schema:'task217-profile-output-acceptance-v1',profileSha256:durableProfileSha256(p),contractSha256:canonicalOutputContract('platform-dialogue-v2',p.measurement.language).digest,sourceSha:p.measurement.sourceSha,provider:p.provider,model:p.measurement.model,environment:p.measurement.environment,capability:'discover',language:p.measurement.language,caseSetSha:p.measurement.caseSetSha,reviewedAtMs:now-2000,receipt:{implementationSession:'11111111-1111-4111-8111-111111111111',reviewerSession:'22222222-2222-4222-8222-222222222222',reference:'https://github.com/diamondideaco-svg/dir3com2/issues/217#issuecomment-999999999',artifactSha256:'e'.repeat(64),verdict:'PASS',authorship:'none'}}}));
 if(fault==='one-expired')authorities[0]={...authorities[0],profile:{...authorities[0].profile,measurement:{...authorities[0].profile.measurement,expiresAtMs:now-1}}};
 const context:AgentContext={role,taskAuthority:role==='customer'?{kind:'customer',actorId:actor,ownerId:actor}:role==='partner'?{kind:'partner',actorId:actor}:{kind:'operator',actorId:actor,role,country:null},isTaskAuthorityCurrent:async()=>active,isDialogueFundingProjectCurrent:()=>projectCurrent,readRequests:async()=>({kind:'forbidden'})};
 const holds:Array<{requestId:string;cost:number}>=[];
 const rpc:FundingRpc=async(name,p)=>{
  if(name==='get_dabra_public_dialogue_policy'){reads++;if(reads===2&&fault==='auth-revoked-after-policy-read')active=false;if(reads===2&&fault==='credential-changed')process.env.OPENAI_API_KEY='SYNTHETIC-CHANGED';if(fault==='policy-hangs')return new Promise(()=>{});return {error:null,data:{policyId:'dabra-public-monthly-v1',authorities:fault==='missing-acceptance'?authorities.map(a=>({...a,output_acceptance:null})):authorities}};}
  assert.equal(name,'reserve_dabra_public_dialogue_attempt');claims++;
  if(fault==='denied')return{error:null,data:{decision:'denied'}};
  assert.equal(p.p_actor_id,actor);holds.push({requestId:String(p.p_request_id),cost:Number(p.p_cost_micros)});
  if(fault==='project-changed-after-claim')projectCurrent=false;
  if(fault==='lost-reply')return{error:'SYNTHETIC_LOST_AFTER_COMMIT',data:null};
  return{error:null,data:{decision:'admitted',attempt_id:p.p_attempt_id,pricing_expires_at_ms:Date.now()+600000}};
 };
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url==='https://developers.openai.com/api/docs/models/gpt-6-luna.md'){
   pricing++;if(fault==='auth-revoked-during-pricing')active=false;
   const response=new Response(pricingBody,{status:200,headers:{'content-type':'text/markdown'}});Object.defineProperty(response,'url',{value:url});return response;
  }
  assert.equal(url,'https://api.openai.com/v1/chat/completions');models++;
  const body=JSON.parse(String(init?.body));assert.equal(body.tools,undefined);const data=JSON.parse(body.messages.at(-1).content);
  assert.deepEqual(Object.keys(data),['language','question','trip','units','guidanceOptions']);assert.doesNotMatch(JSON.stringify(data),/SYNTHETIC-account|SYNTHETIC-project/);
  lastUnits=[...data.units];
  const guidance=data.guidanceOptions.includes('packing-essentials')?'packing-essentials':'plan';
  return Response.json({model:'gpt-6-luna',usage:{prompt_tokens:16,completion_tokens:16},choices:[{message:{content:JSON.stringify({kind:'platform-dialogue-v2',guidance,units:data.units.map((_:string,i:number)=>i)})}}]});
 };
 const policy=()=>loadPublicDialoguePolicy(context,undefined,requestId,rpc);
 return {context,requestId,policy,authorities,proof,profiles,rpc,stats:()=>({claims,models,reads,pricing,holds}),coreUnits:()=>lastUnits,revoke:()=>{active=false;}};
}

for(const role of ['customer','partner','staff','admin','ceo']as const)test('public monthly actual handoff preserves '+role+' and makes one qualified call',async()=>{
 const f=fixture(role),policy=await f.policy();assert.equal(policy.profiles.length,2);
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},{dialogue:policy,responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind!=='response')throw Error('Unexpected stop');
 assert.equal(result.response.provider,'openai');assert.equal(result.response.agent.role,role);assert.equal(result.response.agent.mutations,0);
 assert.match(result.response.answer,/Let us work through/);assert.equal(f.stats().models,1);assert.equal(f.stats().claims,1);assert.equal(f.stats().holds[0].cost,922);
});
for(const fault of ['denied','lost-reply','auth-revoked-during-pricing','missing-acceptance','strong-only','auth-revoked-after-policy-read','credential-changed'])test('public monthly fail-closed with no retry: '+fault,async()=>{
 const f=fixture('customer',fault),policy=await f.policy();
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},{dialogue:policy,responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind==='response')assert.equal(result.response.provider,'local');
 assert.equal(f.stats().models,0);assert.ok(f.stats().claims<=1);assert.equal(f.stats().holds.length,fault==='lost-reply'?1:0);
});
for(const fault of ['unapproved-profile','late-measurement'])test('public authority cannot extend its source grant: '+fault,async()=>{
 const f=fixture('customer',fault),policy=await f.policy();
 assert.equal(policy.profiles.length,0);
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},{dialogue:policy,responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind==='response')assert.equal(result.response.provider,'local');
 assert.equal(f.stats().pricing,0);assert.equal(f.stats().claims,0);assert.equal(f.stats().models,0);
});
test('an unapproved profile does not hide another profile accepted by the grant',async()=>{
 const f=fixture('customer','one-unapproved'),policy=await f.policy();
 assert.deepEqual(policy.profiles.map(p=>p.measurement.language),['en']);
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},{dialogue:policy,responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind==='response')assert.equal(result.response.provider,'openai');
 assert.equal(f.stats().claims,1);assert.equal(f.stats().models,1);
});
for(const fault of ['outside-list','late-measurement'] as const)test('V3 selects another grant accepted for the same language: '+fault,async()=>{
 const f=fixture(),acceptedAuthority=f.authorities[1].id,rejectedGrant=randomUUID();
 const unbound:DurableAccountChargeProof={...f.proof,grantId:rejectedGrant,accountId:'SYNTHETIC-alternative',
  limitedOperation:{...f.proof.limitedOperation,authorizationId:randomUUID(),
   authorizedAtMs:fault==='late-measurement'?f.profiles[1].measurement.measuredAtMs-1:f.proof.limitedOperation.authorizedAtMs,
   acceptedProfileSha256s:fault==='outside-list'?['f'.repeat(64)]:f.proof.limitedOperation.acceptedProfileSha256s,bindingSha256:'0'.repeat(64)}};
 const rejected:DurableAccountChargeProof={...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:durableAuthorityBindingSha256(unbound)}};
 assert.equal(validDurableAccountChargeProof(rejected,Date.now()),true);
 f.authorities.unshift({...f.authorities[1],id:randomUUID(),source_grant_id:rejectedGrant,source_proof:rejected});
 let selectedAuthority:unknown;
 const rpc:FundingRpc=async(name,params,signal)=>{if(name==='reserve_dabra_public_dialogue_attempt')selectedAuthority=params.p_authority_id;return f.rpc(name,params,signal);};
 const base=await loadPublicDialoguePolicy(f.context,undefined,f.requestId,rpc);
 assert.equal(base.profiles.filter(p=>p.measurement.language==='en').length,1);
 const policy:AgentDialoguePolicy={...base,providerSelection:'auto',successfulTaskCandidateLimits:{leaseMs:12000,inputTokenCeiling:4096,outputTokenCeiling:1024,attemptCostMicros:5000}};
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},{dialogue:policy,responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind==='response')assert.equal(result.response.provider,'openai');
 assert.equal(selectedAuthority,acceptedAuthority);assert.equal(f.stats().claims,1);assert.equal(f.stats().models,1);
});
for(const selection of ['legacy','v3'] as const)test('selection independently enforces the grant even if the public callback permits: '+selection,async()=>{
 const f=fixture(),base=await f.policy(),funding=base.funding;assert.ok(funding&&funding.kind==='public-monthly-v1');
 const unbound:DurableAccountChargeProof={...f.proof,limitedOperation:{...f.proof.limitedOperation,acceptedProfileSha256s:['f'.repeat(64)],bindingSha256:'0'.repeat(64)}};
 const proof:DurableAccountChargeProof={...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:durableAuthorityBindingSha256(unbound)}};
 assert.equal(validDurableAccountChargeProof(proof,Date.now()),true,'the only changed authority scope is the profile allowlist');
 const policy:AgentDialoguePolicy={...base,funding:{...funding,proofs:[proof]},publicProfileAuthorized:()=>true,publicProfileOutputAccepted:()=>true,
  ...(selection==='v3'?{providerSelection:'auto' as const,successfulTaskCandidateLimits:{leaseMs:12000,inputTokenCeiling:4096,outputTokenCeiling:1024,attemptCostMicros:5000}}:{})};
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},{dialogue:policy,responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind==='response')assert.equal(result.response.provider,'local');
 assert.equal(f.stats().pricing,0);assert.equal(f.stats().claims,0);assert.equal(f.stats().models,0);
});
test('guest and invalid request identifiers never read public authority or reserve',async()=>{
 const f=fixture();let calls=0;const rpc:FundingRpc=async()=>{calls++;throw Error('must not read');};
 const guest:AgentContext={role:'guest',taskAuthority:{kind:'guest'},readRequests:async()=>({kind:'authentication_required'})};
 assert.equal((await loadPublicDialoguePolicy(guest,undefined,f.requestId,rpc)).profiles.length,0);
 assert.equal((await loadPublicDialoguePolicy(f.context,undefined,undefined,rpc)).profiles.length,0);assert.equal(calls,0);
});
test('old platform-units semantic acceptance cannot enable dialogue-v2',()=>{
 const f=fixture(),p=f.profiles[0],old=canonicalOutputContract('platform-units-v1','ar');
 assert.equal(profileOutputAccepted(p,old,[f.authorities[0].output_acceptance],Date.now()),false);
});
test('policy read deadline terminates an uncooperative read without retry',async()=>{
 const f=fixture('customer','policy-hangs'),keepAlive=setTimeout(()=>{},1600);
 try{assert.equal((await f.policy()).profiles.length,0);assert.equal(f.stats().reads,1);}finally{clearTimeout(keepAlive);}
});
test('actual POST public policy bypasses the hidden classifier for ambiguous discover',async()=>{
 const f=fixture(),policy=await f.policy(),realRequire=createRequire(new URL('../app/api/ai2/chat/route.ts',import.meta.url));
 const exported:{POST?:typeof import('../app/api/ai2/chat/route').POST}={};
 const code=ts.transpileModule(readFileSync('app/api/ai2/chat/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const dialogue=realRequire('../../../../lib/dabra/agent-dialogue');
 runInNewContext(code,{exports:exported,require:(id:string)=>id==='@/lib/dabra/agent-context'?{resolveAgentContext:async()=>f.context}:id==='@/lib/dabra/agent-dialogue'?{...dialogue,getAgentDialoguePolicy:async()=>policy}:realRequire(id),process,Date,AbortSignal,Headers,Response,Request,FormData,File,Buffer,console,setTimeout,clearTimeout});
 assert.ok(exported.POST);
 const response=await exported.POST(new NextRequest('http://localhost/api/ai2/chat',{method:'POST',headers:{'content-type':'application/json','X-DABRA-Request-Id':f.requestId},body:JSON.stringify({message:'Help me understand my travel options',locale:'en',stream:false})}));
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.provider,'openai');assert.equal(body.understanding,'internal-rules');assert.equal(f.stats().claims,1);assert.equal(f.stats().models,1);
});

test('Arabic actual qualified handoff keeps Core Arabic and its follow-up question',async()=>{
 const f=fixture(),policy=await f.policy();
 const result=await runInternalAgentTask({message:'أحتاج فندق في القاهرة',history:[],locale:'ar',context:f.context,intent:{tool:'discover',reference:null,draft:false}},{dialogue:policy,responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind!=='response')throw Error('Unexpected stop');
 assert.equal(result.response.provider,'openai');assert.match(result.response.answer,/نرتّب ما تحتاجه/);assert.match(result.response.answer,/destination=cairo/);assert.equal(f.stats().models,1);assert.equal(f.stats().claims,1);
});

test('one expired language/profile does not hide an independently qualified language',async()=>{
 const f=fixture('customer','one-expired'),policy=await f.policy();assert.equal(policy.profiles.length,1);assert.equal(policy.profiles[0].measurement.language,'en');
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},{dialogue:policy,responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind==='response')assert.equal(result.response.provider,'openai');assert.equal(f.stats().models,1);assert.equal(f.stats().claims,1);
});

test('SQL manifest preserves old contracts and binds the exact new parser/cases',()=>{
 const old=JSON.parse(readFileSync('supabase/migrations/20261104133500_task217_output_contract_acceptance.sql','utf8').split('$manifest$')[1]);
 const files=realDirectory();const name=files.find(n=>n.endsWith('_task217_public_dialogue_monthly_policy.sql'));assert.ok(name);
 const current=JSON.parse(readFileSync('supabase/migrations/'+name,'utf8').split('$manifest$')[1]);
 const additions=(['general-travel-v1','platform-units-v1','platform-dialogue-v2']as const).flatMap(id=>(['ar','en']as const).map(language=>canonicalOutputContract(id,language)));
 const versionedCases=PLATFORM_UNITS_QUALIFICATION_CASES.map(c=>({caseId:c.caseId,stage:c.stage,language:c.language,inputSha256:qualificationInputSha256(c),
  contractSha256:canonicalOutputContract('platform-units-v1',c.language).digest,inputBytes:Buffer.byteLength(c.prompt+c.message,'utf8')+128}));
 assert.deepEqual(current.contracts,[...old.contracts,...additions]);assert.deepEqual(current.pricing,old.pricing);assert.deepEqual(current.cases,[...old.cases,...versionedCases]);
 assert.equal(new Set(current.contracts.map((c:{digest:string})=>c.digest)).size,12);
 assert.equal(new Set(current.cases.map((c:{caseId:string;contractSha256:string})=>JSON.stringify([c.caseId,c.contractSha256]))).size,8);
 for(const id of ['general-travel-v1','platform-units-v1']as const)for(const language of ['ar','en']as const){
  const historical=old.contracts.find((c:{id:string;language:string})=>c.id===id&&c.language===language);
  assert.ok(historical);assert.notEqual(historical.digest,canonicalOutputContract(id,language).digest);
 }
 for(const language of ['ar','en']as const)assert.deepEqual(current.contracts.find((c:{id:string;language:string})=>c.id==='platform-dialogue-v2'&&c.language===language),canonicalOutputContract('platform-dialogue-v2',language));
 assert.equal(createHash('sha256').update(readFileSync('lib/dabra/agent-platform-dialogue.ts','utf8').replace(/\r\n/g,'\n')).digest('hex'),OUTPUT_PARSER_SHA256S['platform-dialogue-v2']);
});

for(const locale of ['ar','en']as const)test('actual qualified dialogue adds practical packing advice and keeps Core verbatim: '+locale,async()=>{
 const f=fixture(),policy=await f.policy();
 const message=locale==='ar'?'ساعدني في تجهيز حقيبة السفر':'Help me pack my suitcase';
 const result=await runInternalAgentTask({message,history:[],locale,context:f.context,intent:{tool:'discover',reference:null,draft:false}},{dialogue:policy,responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind!=='response')throw Error('Unexpected stop');
 assert.equal(result.response.provider,'openai');assert.match(result.response.answer,locale==='ar'?/أكياس صغيرة/:/small pouches/);
 assert.ok(result.response.answer.endsWith(f.coreUnits().join('\n\n')));
 assert.equal(f.stats().models,1);assert.equal(f.stats().claims,1);
});
for(const fault of ['project-mismatch','project-changed-after-claim'])test('public funding project boundary: '+fault,async()=>{
 const f=fixture('customer',fault),policy=await f.policy();
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},{dialogue:policy,responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind==='response')assert.equal(result.response.provider,'local');
 assert.equal(f.stats().models,0);assert.equal(f.stats().claims,fault==='project-mismatch'?0:1);assert.equal(f.stats().holds.length,fault==='project-mismatch'?0:1);
 if(fault==='project-mismatch')assert.equal(f.stats().reads,0);
});
test('public funding missing client provenance cannot use synthetic stored authorities',async()=>{
 const f=fixture(),policy=await loadPublicDialoguePolicy({...f.context,isDialogueFundingProjectCurrent:undefined},undefined,f.requestId,f.rpc);
 assert.equal(policy.profiles.length,0);assert.equal(f.stats().reads,0);assert.equal(f.stats().claims,0);assert.equal(f.stats().models,0);
});

for(const id of ['general-travel-v1','platform-units-v1']as const)for(const language of ['ar','en']as const)
test('historical receipt cannot authorize current input contract: '+id+'/'+language,()=>{
 const old=JSON.parse(readFileSync('supabase/migrations/20261104133500_task217_output_contract_acceptance.sql','utf8').split('$manifest$')[1]);
 const historical=old.contracts.find((c:{id:string;language:string})=>c.id===id&&c.language===language);assert.ok(historical);
 const f=fixture(),contract=canonicalOutputContract(id,language),source=f.profiles.find(p=>p.measurement.language===language);assert.ok(source);
 const p={...source,measurement:{...source.measurement,caseSetSha:contract.caseSetSha,cases:contract.cases,passed:contract.cases}};
 const acceptance={...f.authorities.find(a=>a.profile.measurement.language===language)!.output_acceptance,
  profileSha256:durableProfileSha256(p),caseSetSha:contract.caseSetSha,contractSha256:contract.digest};
 assert.equal(profileOutputAccepted(p,contract,[acceptance],Date.now()),true);
 assert.equal(profileOutputAccepted(p,contract,[{...acceptance,contractSha256:historical.digest}],Date.now()),false);
});


test('Strong task tier is explicit with no economy fallback and legacy unchanged',async()=>{
 const strong=fixture('customer','strong-only');
 assert.equal((await strong.policy()).profiles.length,0);
 const selected=await loadPublicDialoguePolicy(strong.context,undefined,strong.requestId,strong.rpc,'strong');
 assert.equal(selected.profiles.length,2);assert.equal(selected.limits.maxAttempts,1);
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:strong.context,intent:{tool:'discover',reference:null,draft:false}},{dialogue:selected,responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');assert.equal(strong.stats().claims,1);assert.equal(strong.stats().models,1);
 const economy=fixture();assert.equal((await loadPublicDialoguePolicy(economy.context,undefined,economy.requestId,economy.rpc,'strong')).profiles.length,0);
 assert.equal(economy.stats().claims,0);assert.equal(economy.stats().models,0);
});


function syntheticVariant(f:ReturnType<typeof fixture>, change:{grantId?:ReturnType<typeof randomUUID>;profile?:AgentCapabilityProfile;credentialSha256?:string;additionalMicros?:number}){
 const grantId=change.grantId??randomUUID(),profile=change.profile??f.profiles[1];
 const unbound:DurableAccountChargeProof={...f.proof,grantId,accountId:'SYNTHETIC-variant-'+grantId,
  credentialSha256:change.credentialSha256??f.proof.credentialSha256,
  accountTerms:{...f.proof.accountTerms,allInChargeBound:{...f.proof.accountTerms.allInChargeBound,maxAdditionalMicros:change.additionalMicros??0}},
  limitedOperation:{...f.proof.limitedOperation,authorizationId:randomUUID(),acceptedProfileSha256s:[durableProfileSha256(profile)],bindingSha256:'0'.repeat(64)}};
 const proof:DurableAccountChargeProof={...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:durableAuthorityBindingSha256(unbound)}};
 const authority={...f.authorities[1],id:randomUUID(),source_grant_id:grantId,source_proof:proof,profile,
  output_acceptance:{...f.authorities[1].output_acceptance,profileSha256:durableProfileSha256(profile)}};
 return {proof,profile,authority};
}
const v3Limits={leaseMs:12000,inputTokenCeiling:4096,outputTokenCeiling:1024,attemptCostMicros:5000};

test('V3 ranks the actual quote before the profile cost ceiling and ignores the provider pin',async()=>{
 const f=fixture(),cheapProfile={...f.profiles[1],measurement:{...f.profiles[1].measurement,inputTokenCeiling:2048,outputTokenCeiling:512,latencyMs:2}};
 const cheap=syntheticVariant(f,{profile:cheapProfile});f.authorities.unshift(cheap.authority);
 let selected:unknown,cost:unknown;const rpc:FundingRpc=async(name,p,signal)=>{if(name==='reserve_dabra_public_dialogue_attempt'){selected=p.p_authority_id;cost=p.p_cost_micros;}return f.rpc(name,p,signal);};
 process.env.DABRA_AI_PROVIDER='anthropic';const base=await loadPublicDialoguePolicy(f.context,undefined,f.requestId,rpc);
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},
  {dialogue:{...base,providerSelection:'auto',successfulTaskCandidateLimits:{...v3Limits,attemptCostMicros:500}},responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind==='response')assert.equal(result.response.provider,'openai');
 assert.equal(selected,cheap.authority.id);assert.equal(cost,461);assert.equal(f.stats().claims,1);assert.equal(f.stats().models,1);
});

test('V3 chooses the cheaper quote among two eligible grants regardless of input order',async()=>{
 for(const order of ['expensive-only','expensive-first','cheap-first'] as const){
  const f=fixture(),expensive=f.authorities[1];
  const cheapProfile={...f.profiles[1],measurement:{...f.profiles[1].measurement,inputTokenCeiling:2048,outputTokenCeiling:512,latencyMs:2}};
  const cheap=syntheticVariant(f,{profile:cheapProfile}),limit=1000;
  const expensiveQuote=approvedDurableDialogueQuoteMicros(expensive.source_proof,expensive.profile,Date.now());
  const cheapQuote=approvedDurableDialogueQuoteMicros(cheap.proof,cheap.profile,Date.now());
  assert.equal(expensiveQuote,922);assert.equal(cheapQuote,461);assert.ok(expensiveQuote<=limit&&cheapQuote<=limit);
  f.authorities.splice(0,f.authorities.length,...(order==='expensive-only'?[expensive]:order==='expensive-first'?[expensive,cheap.authority]:[cheap.authority,expensive]));
  let selected:unknown,cost:unknown;const rpc:FundingRpc=async(name,p,signal)=>{if(name==='reserve_dabra_public_dialogue_attempt'){selected=p.p_authority_id;cost=p.p_cost_micros;}return f.rpc(name,p,signal);};
  const base=await loadPublicDialoguePolicy(f.context,undefined,f.requestId,rpc);
  assert.equal(base.profiles.length,order==='expensive-only'?1:2,'the intended authorities are current');
  const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},
   {dialogue:{...base,providerSelection:'auto',successfulTaskCandidateLimits:{...v3Limits,attemptCostMicros:limit}},responseContract:'platform-dialogue'});
  assert.equal(result.kind,'response');if(result.kind==='response')assert.equal(result.response.provider,'openai');
  assert.equal(selected,order==='expensive-only'?expensive.id:cheap.authority.id,order);
  assert.equal(cost,order==='expensive-only'?expensiveQuote:cheapQuote);assert.equal(f.stats().claims,1);assert.equal(f.stats().models,1);
 }
});

test('V3 checks the key of every grant for the same provider and profile',async()=>{
 const f=fixture(),bad=syntheticVariant(f,{credentialSha256:'f'.repeat(64)});f.authorities.unshift(bad.authority);
 let selected:unknown;const rpc:FundingRpc=async(name,p,signal)=>{if(name==='reserve_dabra_public_dialogue_attempt')selected=p.p_authority_id;return f.rpc(name,p,signal);};
 const base=await loadPublicDialoguePolicy(f.context,undefined,f.requestId,rpc);
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},
  {dialogue:{...base,providerSelection:'auto',successfulTaskCandidateLimits:v3Limits},responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind==='response')assert.equal(result.response.provider,'openai');
 assert.equal(selected,f.authorities[2].id);assert.equal(f.stats().claims,1);assert.equal(f.stats().models,1);
});

test('V3 preliminary quote equals refreshed funding quote including bounded extra charges',async()=>{
 const f=fixture();
 for(const [input,output,extra] of [[2048,512,0],[4096,1024,17],[4095,1023,1]] as const){
  const profile={...f.profiles[1],measurement:{...f.profiles[1].measurement,inputTokenCeiling:input,outputTokenCeiling:output}};
  const {proof}=syntheticVariant(f,{profile,additionalMicros:extra});const observation=await refreshPublicDialoguePricing(proof,new AbortController().signal);assert.ok(observation);
  const expected=Number((BigInt(input)*BigInt(100000)+BigInt(output)*BigInt(500000)+BigInt(999999))/BigInt(1000000))+extra;
  assert.equal(approvedDurableDialogueQuoteMicros(proof,profile,Date.now()),expected);
  assert.equal(quoteDialogueFunding(proof,{...profile.measurement,provider:profile.provider},Date.now(),observation),expected);
  assert.equal(quoteDialogueFunding(proof,{...profile.measurement,provider:profile.provider},Date.now()),null);
 }
});

test('V3 diagnostics combine multiple configuration failures without exposing their proofs',async()=>{
 const f=fixture(),base=await f.policy(),funding=base.funding;assert.ok(funding&&funding.kind==='public-monthly-v1');
 const second=syntheticVariant(f,{credentialSha256:'f'.repeat(64)}),events:unknown[]=[];
 const subscriber=(event:unknown)=>{events.push(event);},ch=channel('dir3com.dabra.agent-preparation');ch.subscribe(subscriber);
 try {
  for(const proofs of [[f.proof,second.proof],[second.proof,f.proof]]) {
   const policy:AgentDialoguePolicy={...base,profiles:[f.profiles[1]],funding:{...funding,proofs},providerSelection:'auto',successfulTaskCandidateLimits:v3Limits,
    publicProfileAuthorized:()=>true,publicProfileOutputAccepted:()=>true};
   const message=JSON.stringify({language:'en',question:'hotel',trip:null,units:['SYNTHETIC'],guidanceOptions:['plan']});
   const attempt=await prepareAgentProviderAttempt(f.context,'en',policy,{capability:'discover',message,prompt:PLATFORM_DIALOGUE_PROMPT,inputDigestValue:{}},Date.now()+10000,undefined,
    binding=>binding.credentialSha256===f.proof.credentialSha256?'model_mismatch':'credential_mismatch');
   assert.equal(attempt,null);
  }
  assert.equal(events.length,2);for(const event of events){assert.equal((event as {reason:string}).reason,'configuration_unavailable');
   assert.doesNotMatch(JSON.stringify(event),/SYNTHETIC-account|SYNTHETIC-project|credentialSha256|source_proof/);}
  assert.equal(f.stats().claims,0);assert.equal(f.stats().models,0);
 } finally {ch.unsubscribe(subscriber);}
});


for(const tie of ['latency','grant','profile'] as const)test('V3 resolves equal quotes deterministically by '+tie,async()=>{
 const f=fixture(),original=f.profiles[1];
 const firstProfile={...original,measurement:{...original.measurement,latencyMs:tie==='latency'?2:1}};
 const secondProfile={...original,measurement:{...original.measurement,latencyMs:1,...(tie==='profile'?{expiresAtMs:original.measurement.expiresAtMs+1}:{})}};
 const first=syntheticVariant(f,{grantId:'f0000000-0000-4000-8000-000000000001',profile:firstProfile});
 const second=syntheticVariant(f,{grantId:'a0000000-0000-4000-8000-000000000001',profile:secondProfile});
 let expected:string;
 if(tie==='profile') {
  const unbound:DurableAccountChargeProof={...first.proof,limitedOperation:{...first.proof.limitedOperation,
   acceptedProfileSha256s:[durableProfileSha256(firstProfile),durableProfileSha256(secondProfile)].sort(),bindingSha256:'0'.repeat(64)}};
  const proof:DurableAccountChargeProof={...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:durableAuthorityBindingSha256(unbound)}};
  const a={...first.authority,source_proof:proof},b={...first.authority,id:randomUUID(),source_proof:proof,profile:secondProfile,
   output_acceptance:{...first.authority.output_acceptance,profileSha256:durableProfileSha256(secondProfile)}};
  f.authorities.splice(0,f.authorities.length,a,b);expected=durableProfileSha256(firstProfile)<durableProfileSha256(secondProfile)?a.id:b.id;
 }else{f.authorities.splice(0,f.authorities.length,first.authority,second.authority);expected=second.authority.id;}
 let selected:unknown;const rpc:FundingRpc=async(name,p,signal)=>{if(name==='reserve_dabra_public_dialogue_attempt')selected=p.p_authority_id;return f.rpc(name,p,signal);};
 const base=await loadPublicDialoguePolicy(f.context,undefined,f.requestId,rpc);
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},
  {dialogue:{...base,providerSelection:'auto',successfulTaskCandidateLimits:v3Limits},responseContract:'platform-dialogue'});
 assert.equal(result.kind,'response');if(result.kind==='response')assert.equal(result.response.provider,'openai');assert.equal(selected,expected);
 assert.equal(f.stats().claims,1);assert.equal(f.stats().models,1);
});

test('V3 compares provider identifiers deterministically when quote and latency tie',async()=>{
 const f=fixture(),base=await f.policy(),funding=base.funding;assert.ok(funding&&funding.kind==='public-monthly-v1');
 const openProfile={...f.profiles[1],measurement:{...f.profiles[1].measurement,inputTokenCeiling:2048,outputTokenCeiling:512}};
 const open=syntheticVariant(f,{profile:openProfile,additionalMicros:768});
 const deepProfile:AgentCapabilityProfile={provider:'deepseek',measurement:{...openProfile.measurement,model:'deepseek-flash'}};
 const pricing='760a374be993aa01bd602bbdead31f1e58f642e473207e599816dc0790a28927';
 const contract=approvedPublicPricingContract('deepseek','deepseek-flash',pricing);assert.ok(contract);
 const unbound:DurableAccountChargeProof={...f.proof,grantId:randomUUID(),provider:'deepseek',model:'deepseek-flash',accountId:'SYNTHETIC-deepseek',pricingEvidenceSha256:pricing,
  limitedOperation:{...f.proof.limitedOperation,authorizationId:randomUUID(),contractSha256:contract.digest,acceptedProfileSha256s:[durableProfileSha256(deepProfile)],bindingSha256:'0'.repeat(64)}};
 const deep:DurableAccountChargeProof={...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:durableAuthorityBindingSha256(unbound)}};
 assert.equal(approvedDurableDialogueQuoteMicros(open.proof,openProfile,Date.now()),1229);
 assert.equal(approvedDurableDialogueQuoteMicros(deep,deepProfile,Date.now()),1229);
 let selected:string|undefined;
 const policy:AgentDialoguePolicy={...base,profiles:[openProfile,deepProfile],funding:{...funding,proofs:[open.proof,deep],refreshPricing:async proof=>{selected=proof.provider;return null;}},
  publicProfileAuthorized:()=>true,publicProfileOutputAccepted:()=>true,providerSelection:'auto',successfulTaskCandidateLimits:v3Limits};
 const message=JSON.stringify({language:'en',question:'hotel',trip:null,units:['SYNTHETIC'],guidanceOptions:['plan']});
 assert.equal(await prepareAgentProviderAttempt(f.context,'en',policy,{capability:'discover',message,prompt:PLATFORM_DIALOGUE_PROMPT,inputDigestValue:{}},Date.now()+10000,undefined,()=>null),null);
 assert.equal(selected,'deepseek');assert.equal(f.stats().claims,0);assert.equal(f.stats().models,0);
});

test('V3 does not fail over after the selected provider has an admitted failed dispatch',async()=>{
 const f=fixture(),alternative=syntheticVariant(f,{});f.authorities.unshift(alternative.authority);
 const base=await f.policy(),oldFetch=globalThis.fetch;let dispatches=0;
 globalThis.fetch=async(input,init)=>{if(String(input)==='https://api.openai.com/v1/chat/completions'){dispatches++;throw new TypeError('SYNTHETIC dispatch failure');}return oldFetch(input,init);};
 const result=await runInternalAgentTask({message:'hotel in Cairo',history:[],locale:'en',context:f.context,intent:{tool:'discover',reference:null,draft:false}},
  {dialogue:{...base,providerSelection:'auto',successfulTaskCandidateLimits:v3Limits},responseContract:'platform-dialogue'});
 assert.ok(result.kind==='response'||result.kind==='stopped');assert.equal(dispatches,1);assert.equal(f.stats().claims,1);assert.equal(f.stats().holds.length,1);
});
