import 'server-only';
import {isDeepStrictEqual} from 'node:util';
import {supabaseAdmin} from '../supabase/server';
import {publicDialogueActor,PUBLIC_DIALOGUE_POLICY} from './public-dialogue-policy';
import type {AgentContext} from './agent-contract';
import {DEFAULT_AGENT_DIALOGUE_POLICY,isAgentTaskAuthorityCurrent,type AgentDialoguePolicy} from './agent-dialogue';
import {validDurableAccountChargeProof,durableProfileSha256,type DurableAccountChargeProof} from './dialogue-durable-authority';
import {canonicalOutputContract,profileOutputAccepted} from './agent-output-contract';
import {publicPricingObservationCurrent,refreshPublicDialoguePricing} from './dialogue-pricing-refresh';
import type {FundingRpc} from './dialogue-funding-store';
import type {AgentCapabilityProfile} from './agent-capabilities';
type Authority=Readonly<{id:string;source_grant_id:string;source_proof:DurableAccountChargeProof;profile:AgentCapabilityProfile;output_acceptance:unknown;model_tier:'economy'|'strong';enabled:true;authorized_at:string}>;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
function authority(v:unknown,now:number):v is Authority {
 if(!object(v)||Object.keys(v).length!==8||!uuid(v.id)||!uuid(v.source_grant_id)||v.enabled!==true
  ||!['economy','strong'].includes(String(v.model_tier))||typeof v.authorized_at!=='string'||!Number.isFinite(Date.parse(v.authorized_at))||Date.parse(v.authorized_at)>now
  ||!validDurableAccountChargeProof(v.source_proof,now)||v.source_grant_id!==v.source_proof.grantId
  ||!object(v.profile)||!object(v.profile.measurement))return false;
 const p=v.profile as AgentCapabilityProfile,m=p.measurement;
 return p.provider===v.source_proof.provider&&m.model===v.source_proof.model&&m.environment==='provider-benchmark'
  &&m.measuredAtMs<=Date.parse(v.authorized_at)&&Number.isSafeInteger(m.expiresAtMs)&&m.expiresAtMs>now
  &&profileOutputAccepted(p,canonicalOutputContract('platform-dialogue-v2',m.language),[v.output_acceptance],now);
}
const defaultRpc:FundingRpc=async(name,params,signal)=>!supabaseAdmin||signal.aborted?{data:null,error:'unavailable'}:supabaseAdmin.rpc(name,params).abortSignal(signal);
/** Explicitly selected server policy only; not reachable from client role/provider JSON. */
export async function loadPublicDialoguePolicy(context:AgentContext|undefined,signal:AbortSignal|undefined,requestId:string|undefined,rpc:FundingRpc=defaultRpc,selectedTier:'economy'|'strong'='economy'):Promise<AgentDialoguePolicy> {
 const blocked:AgentDialoguePolicy={...DEFAULT_AGENT_DIALOGUE_POLICY,trial:true,publicMonthly:true,profiles:[],outputAcceptances:[],
  limits:{...DEFAULT_AGENT_DIALOGUE_POLICY.limits,maxCostUsd:PUBLIC_DIALOGUE_POLICY.attemptCostMicros/1_000_000}};
 const actor=context&&publicDialogueActor(context);
 const projectCurrent=()=>{try{return context?.isDialogueFundingProjectCurrent?.()===true;}catch{return false;}};
 if(!['economy','strong'].includes(selectedTier)||!actor||!uuid(actor)||!uuid(requestId)||signal?.aborted||!projectCurrent())return blocked;
 const read=async(currentSignal:AbortSignal)=>{
  if(currentSignal.aborted||!projectCurrent())return null;
  let stop:(()=>void)|undefined;
  const aborted=new Promise<{data:unknown;error:unknown}>(resolve=>{stop=()=>resolve({data:null,error:'aborted'});if(currentSignal.aborted)stop();else currentSignal.addEventListener('abort',stop,{once:true});});
  const result=await Promise.race([rpc('get_dabra_public_dialogue_policy',{p_actor_id:actor},currentSignal),aborted]).finally(()=>{if(stop)currentSignal.removeEventListener('abort',stop);});
  if(currentSignal.aborted||!projectCurrent()||result.error||!object(result.data)||result.data.policyId!==PUBLIC_DIALOGUE_POLICY.id||!Array.isArray(result.data.authorities)||result.data.authorities.length>56)return null;
  // Reject the affected provider/profile without hiding independent valid authorities.
  return result.data.authorities.filter((v):v is Authority=>authority(v,Date.now()));
 };
 try {
  const bounded=AbortSignal.any([AbortSignal.timeout(1000),...(signal?[signal]:[])]);
  if(!await isAgentTaskAuthorityCurrent(context,bounded)||bounded.aborted||!projectCurrent())return blocked;
  const authorities=await read(bounded);
  if(!authorities||bounded.aborted||!await isAgentTaskAuthorityCurrent(context,bounded)||bounded.aborted||!projectCurrent())return blocked;
  // Only the selected successful-task path supplies a tier; legacy stays economy.
  // Core independently enforces its account/revision spending approval at admission.
  const eligible=authorities.filter(a=>a.model_tier===selectedTier);
  const forProfile=(proof:DurableAccountChargeProof,profile:AgentCapabilityProfile)=>eligible.find(a=>a.source_grant_id===proof.grantId&&isDeepStrictEqual(a.source_proof,proof)&&durableProfileSha256(a.profile)===durableProfileSha256(profile));
  return {...blocked,profiles:eligible.map(a=>a.profile),outputAcceptances:eligible.map(a=>a.output_acceptance),
   publicProfileAuthorized:(proof,profile)=>projectCurrent()&&proof.mode==='bounded-account-charge'&&!!forProfile(proof,profile),
   funding:{kind:'public-monthly-v1',requestId,proofs:eligible.map(a=>a.source_proof),refreshPricing:refreshPublicDialoguePricing,
    async isCurrent(proof,profile,currentSignal){
     const fresh=await read(currentSignal);return !!fresh&&isDeepStrictEqual(fresh,authorities)&&proof.mode==='bounded-account-charge'&&!!forProfile(proof,profile);
    },
    admission:{async reserve(r,currentSignal){
     try {
      if(currentSignal.aborted||!projectCurrent()||r.policyId!=='dabra-public-monthly-v1'||r.stage!=='discover'||r.subject!==actor||r.requestId!==requestId
       ||r.proof.mode!=='bounded-account-charge'||!r.pricing||!publicPricingObservationCurrent(r.pricing.observation,r.proof,Date.now()))return {kind:'denied'};
      const matches=eligible.filter(a=>a.source_grant_id===r.proof.grantId&&a.output_acceptance&&durableProfileSha256(a.profile)===r.pricing!.profileSha256);
      if(matches.length!==1)return {kind:'denied'};
      const a=matches[0],execution={schema:'dabra-public-execution-v1',authorityId:a.id,profileSha256:r.pricing.profileSha256,attemptId:r.attemptId,requestId:r.requestId,observation:r.pricing.observation};
      const {data,error}=await rpc('reserve_dabra_public_dialogue_attempt',{p_attempt_id:r.attemptId,p_request_id:r.requestId,p_actor_id:actor,p_authority_id:a.id,p_execution:execution,p_input_tokens:r.inputTokens,p_output_tokens:r.outputTokens,p_cost_micros:r.costMicros},currentSignal);
      // One RPC only. Unknown/late replies preserve any committed hold.
      if(currentSignal.aborted||!projectCurrent()||error||!object(data)||data.decision!=='admitted'||data.attempt_id!==r.attemptId||typeof data.pricing_expires_at_ms!=='number'||!Number.isSafeInteger(data.pricing_expires_at_ms)||data.pricing_expires_at_ms<=Date.now())return {kind:'denied'};
      return {kind:'admitted',attemptId:r.attemptId,pricingExpiresAtMs:data.pricing_expires_at_ms};
     }catch{return {kind:'denied'};}
    }}},
  };
 }catch{return blocked;}
}
