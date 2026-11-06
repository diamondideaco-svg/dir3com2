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
import {durableAuthorityBindingSha256,durableProfileSha256,type DurableAccountChargeProof} from '../lib/dabra/dialogue-durable-authority';
import {approvedPublicPricingContract} from '../lib/dabra/dialogue-pricing-refresh';
const pricingBody=readFileSync(new URL('./fixtures/task217-approved-openai-pricing.md',import.meta.url),'utf8');
import type {AgentContext} from '../lib/dabra/agent-contract';
import type {AgentCapabilityProfile} from '../lib/dabra/agent-capabilities';
import type {FundingRpc} from '../lib/dabra/dialogue-funding-store';

const credential='SYNTHETIC-NOT-A-CREDENTIAL';
const envNames=['DABRA_INTERNAL_AI_ENABLED','DABRA_AI_PROVIDER','DABRA_OPENAI_MODEL','OPENAI_API_KEY','DABRA_DIALOGUE_FUNDING_POLICY']as const;
const realNow=Date.now;let sequence=0;
let prior:Record<string,string|undefined>,oldFetch:typeof fetch;
test.beforeEach(()=>{const instant=realNow()+(++sequence)*900001;Date.now=()=>instant;prior=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));Object.assign(process.env,{DABRA_INTERNAL_AI_ENABLED:'true',DABRA_AI_PROVIDER:'auto',DABRA_OPENAI_MODEL:'gpt-6-luna',OPENAI_API_KEY:credential,DABRA_DIALOGUE_FUNDING_POLICY:'dabra-public-monthly-v1'});oldFetch=globalThis.fetch;});
test.afterEach(()=>{Date.now=realNow;globalThis.fetch=oldFetch;for(const name of envNames){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}});

function fixture(role:Exclude<AgentContext['role'],'guest'>='customer',fault=''){
 const now=Date.now(),actor=randomUUID(),grantId=randomUUID(),requestId=randomUUID();let active=true,claims=0,models=0,reads=0,pricing=0;
 const price=approvedPublicPricingContract('openai','gpt-6-luna','f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a');assert.ok(price);
 const profiles:AgentCapabilityProfile[]=(['ar','en']as const).map(language=>({provider:'openai',measurement:{capability:'discover',language,model:'gpt-6-luna',environment:'provider-benchmark',sourceSha:'b'.repeat(40),caseSetSha:canonicalOutputContract('platform-dialogue-v2',language).caseSetSha,cases:4,passed:4,measuredAtMs:now-4000,expiresAtMs:now+600000,latencyMs:1,inputTokenCeiling:4096,outputTokenCeiling:1024,costCeilingUsd:0.002141}}));
 const unbound:DurableAccountChargeProof={mode:'bounded-account-charge',grantId,provider:'openai',model:'gpt-6-luna',environment:'provider-benchmark',accountId:'SYNTHETIC-account',projectId:'SYNTHETIC-project',credentialSha256:createHash('sha256').update(credential).digest('hex'),evidenceSha256:'a'.repeat(64),currency:'USD',serviceTier:'standard',pricingEvidenceSha256:'f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a',
  accountTerms:{schema:'task217-account-charge-terms-v1',observedAtMs:now-5000,evidenceSha256:'c'.repeat(64),validity:'until-contract-change',risks:{autoReload:'off',postpaid:'blocked',overdraft:'blocked',concurrentAccountUsage:'bounded'},fundingChargeProtection:{kind:'documented-manual-funding-only',evidenceSha256:'d'.repeat(64)},allInChargeBound:{schema:'all-in-account-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-tax-fx-and-funding-charges',maxAdditionalMicros:0,evidenceSha256:'e'.repeat(64)}},
  limitedOperation:{schema:'task217-limited-operation-v2',authorizationId:randomUUID(),taskId:'task217-text-pilot-2026-11-01',dataScope:'redacted-travel-or-server-units',maxCostMicros:1000000,maxAttempts:28,authorizedAtMs:now-3000,duration:'until-revoked-or-binding-change',providerRisk:'bounded-account-liability-with-observed-risks',acceptedProfileSha256s:['f'.repeat(64)],contractSha256:price.digest,bindingSha256:'0'.repeat(64)}};
 const proof:DurableAccountChargeProof={...unbound,limitedOperation:{...unbound.limitedOperation,bindingSha256:durableAuthorityBindingSha256(unbound)}};
 const authorities=profiles.map(p=>({id:randomUUID(),source_grant_id:grantId,source_proof:proof,profile:p,model_tier:fault==='strong-only'?'strong':'economy',enabled:true,authorized_at:new Date(now-1000).toISOString(),output_acceptance:{schema:'task217-profile-output-acceptance-v1',profileSha256:durableProfileSha256(p),contractSha256:canonicalOutputContract('platform-dialogue-v2',p.measurement.language).digest,sourceSha:p.measurement.sourceSha,provider:p.provider,model:p.measurement.model,environment:p.measurement.environment,capability:'discover',language:p.measurement.language,caseSetSha:p.measurement.caseSetSha,reviewedAtMs:now-2000,receipt:{implementationSession:'11111111-1111-4111-8111-111111111111',reviewerSession:'22222222-2222-4222-8222-222222222222',reference:'https://github.com/diamondideaco-svg/dir3com2/issues/217#issuecomment-999999999',artifactSha256:'e'.repeat(64),verdict:'PASS',authorship:'none'}}}));
 if(fault==='one-expired')authorities[0]={...authorities[0],profile:{...authorities[0].profile,measurement:{...authorities[0].profile.measurement,expiresAtMs:now-1}}};
 const context:AgentContext={role,taskAuthority:role==='customer'?{kind:'customer',actorId:actor,ownerId:actor}:role==='partner'?{kind:'partner',actorId:actor}:{kind:'operator',actorId:actor,role,country:null},isTaskAuthorityCurrent:async()=>active,readRequests:async()=>({kind:'forbidden'})};
 const holds:Array<{requestId:string;cost:number}>=[];
 const rpc:FundingRpc=async(name,p)=>{
  if(name==='get_dabra_public_dialogue_policy'){reads++;if(reads===2&&fault==='auth-revoked-after-policy-read')active=false;if(reads===2&&fault==='credential-changed')process.env.OPENAI_API_KEY='SYNTHETIC-CHANGED';if(fault==='policy-hangs')return new Promise(()=>{});return {error:null,data:{policyId:'dabra-public-monthly-v1',authorities:fault==='missing-acceptance'?authorities.map(a=>({...a,output_acceptance:null})):authorities}};}
  assert.equal(name,'reserve_dabra_public_dialogue_attempt');claims++;
  if(fault==='denied')return{error:null,data:{decision:'denied'}};
  assert.equal(p.p_actor_id,actor);holds.push({requestId:String(p.p_request_id),cost:Number(p.p_cost_micros)});
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
  assert.deepEqual(Object.keys(data),['language','question','trip','units']);assert.doesNotMatch(JSON.stringify(data),/SYNTHETIC-account|SYNTHETIC-project/);
  const guidance=data.language==='ar'?'خلينا نرتب التفاصيل خطوة بخطوة ونركز على احتياجك.':'Let us work through your needs step by step.';
  return Response.json({model:'gpt-6-luna',usage:{prompt_tokens:16,completion_tokens:16},choices:[{message:{content:JSON.stringify({kind:'platform-dialogue-v2',guidance,units:data.units.map((_:string,i:number)=>i)})}}]});
 };
 const policy=()=>loadPublicDialoguePolicy(context,undefined,requestId,rpc);
 return {context,requestId,policy,authorities,proof,profiles,rpc,stats:()=>({claims,models,reads,pricing,holds}),revoke:()=>{active=false;}};
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
 assert.equal(result.response.provider,'openai');assert.match(result.response.answer,/خلينا نرتب/);assert.match(result.response.answer,/destination=cairo/);assert.equal(f.stats().models,1);assert.equal(f.stats().claims,1);
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
 assert.deepEqual(current.contracts.filter((c:{id:string})=>c.id!=='platform-dialogue-v2'),old.contracts);assert.deepEqual(current.pricing,old.pricing);assert.deepEqual(current.cases,old.cases);
 for(const language of ['ar','en']as const)assert.deepEqual(current.contracts.find((c:{id:string;language:string})=>c.id==='platform-dialogue-v2'&&c.language===language),canonicalOutputContract('platform-dialogue-v2',language));
 assert.equal(createHash('sha256').update(readFileSync('lib/dabra/agent-platform-dialogue.ts','utf8').replace(/\r\n/g,'\n')).digest('hex'),OUTPUT_PARSER_SHA256S['platform-dialogue-v2']);
});
