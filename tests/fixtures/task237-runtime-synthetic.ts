// Synthetic fixture reused from Task217 runtime coverage. No real provider traffic.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {loadPublicDialoguePolicy} from '../../lib/dabra/public-dialogue-store';
import {canonicalOutputContract} from '../../lib/dabra/agent-output-contract';
import {durableAuthorityBindingSha256,durableProfileSha256,type DurableAccountChargeProof} from '../../lib/dabra/dialogue-durable-authority';
import {approvedPublicPricingContract} from '../../lib/dabra/dialogue-pricing-refresh';
import type {AgentContext} from '../../lib/dabra/agent-contract';
import type {AgentCapabilityProfile} from '../../lib/dabra/agent-capabilities';
import type {FundingRpc} from '../../lib/dabra/dialogue-funding-store';
const credential='SYNTHETIC-NOT-A-CREDENTIAL';
const pricingBody=readFileSync(new URL('./task217-approved-openai-pricing.md',import.meta.url),'utf8');
export function syntheticProviderEnvironment() {
 const names=['NODE_ENV','DABRA_INTERNAL_AI_ENABLED','DABRA_AI_PROVIDER','DABRA_OPENAI_MODEL','OPENAI_API_KEY','DABRA_DIALOGUE_FUNDING_POLICY'] as const;
 const prior=Object.fromEntries(names.map(k=>[k,process.env[k]])), oldFetch=globalThis.fetch;
 Object.assign(process.env,{NODE_ENV:'test',DABRA_INTERNAL_AI_ENABLED:'true',DABRA_AI_PROVIDER:'auto',DABRA_OPENAI_MODEL:'gpt-6-luna',OPENAI_API_KEY:credential,DABRA_DIALOGUE_FUNDING_POLICY:'dabra-public-monthly-v1'});
 return ()=>{globalThis.fetch=oldFetch;for(const name of names){if(prior[name]===undefined)delete process.env[name];else Object.assign(process.env,{[name]:prior[name]});}};
}
export function successfulTaskRuntimeFixture(role:Exclude<AgentContext['role'],'guest'>='customer',fault=''){
 let lastUnits:string[]=[];
 const now=Date.now(),actor=randomUUID(),grantId=randomUUID(),requestId=randomUUID();let active=true,projectCurrent=fault!=='project-mismatch',claims=0,models=0,reads=0,pricing=0;
 const price=approvedPublicPricingContract('openai','gpt-6-luna','f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a');assert.ok(price);
 const profiles:AgentCapabilityProfile[]=(['ar','en']as const).map(language=>({provider:'openai',measurement:{capability:'discover',language,model:'gpt-6-luna',environment:'provider-benchmark',sourceSha:'b'.repeat(40),caseSetSha:canonicalOutputContract('platform-dialogue-v2',language).caseSetSha,cases:4,passed:4,measuredAtMs:now-4000,expiresAtMs:now+600000,latencyMs:1,inputTokenCeiling:4096,outputTokenCeiling:1024,costCeilingUsd:0.002141}}));
 const unbound:DurableAccountChargeProof={mode:'bounded-account-charge',grantId,provider:'openai',model:'gpt-6-luna',environment:'provider-benchmark',accountId:'SYNTHETIC-account',projectId:'SYNTHETIC-project',credentialSha256:createHash('sha256').update(credential).digest('hex'),evidenceSha256:'a'.repeat(64),currency:'USD',serviceTier:'standard',pricingEvidenceSha256:'f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a',
  accountTerms:{schema:'task217-account-charge-terms-v1',observedAtMs:now-5000,evidenceSha256:'c'.repeat(64),validity:'until-contract-change',risks:{autoReload:'off',postpaid:'blocked',overdraft:'blocked',concurrentAccountUsage:'bounded'},fundingChargeProtection:{kind:'documented-manual-funding-only',evidenceSha256:'d'.repeat(64)},allInChargeBound:{schema:'all-in-account-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-tax-fx-and-funding-charges',maxAdditionalMicros:0,evidenceSha256:'e'.repeat(64)}},
  limitedOperation:{schema:'task217-limited-operation-v2',authorizationId:randomUUID(),taskId:'task217-text-pilot-2026-11-01',dataScope:'redacted-travel-or-server-units',maxCostMicros:1000000,maxAttempts:28,authorizedAtMs:now-3000,duration:'until-revoked-or-binding-change',providerRisk:'bounded-account-liability-with-observed-risks',acceptedProfileSha256s:['f'.repeat(64)],contractSha256:price.digest,bindingSha256:'0'.repeat(64)}};
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
