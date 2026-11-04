import 'server-only';
import { createQualificationAdmission, parseQualificationProof, type QualificationAdmission, type ApprovedQualificationPlan } from './dialogue-qualification';
import { measurePlatformUnitsProfile, type QualificationMeasurementDependencies } from './agent-measurement';
import { callInternalAgentProvider, internalAgentConfiguration } from '../ai2/runtime/agent-provider-dispatch';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parseFirstProfilePermit, type ApprovedFirstProfilePlan } from './agent-measurement';
import { supabaseAdmin } from '../supabase/server';
import { AGENT_PROVIDER_IDS, type AgentCapabilityProfile } from './agent-capabilities';
import { PUBLIC_DIALOGUE_DAILY_LIMITS, type AgentDialoguePolicy } from './agent-dialogue';
import type { AgentContext } from './agent-contract';
import { validDurableAccountChargeProof } from './dialogue-durable-authority';
import { refreshPublicDialoguePricing, publicPricingObservationCurrent } from './dialogue-pricing-refresh';
import { fundingSubject, fundingAuthorizationWindow, validFundingDailyLimits, validTask217PilotEnvelope, validTask217LimitedOperation, quoteDialogueFunding, type DialogueFundingProof, type FundedDialogueReservation, type FundingDialogueAdmission } from './dialogue-funding';

export type FundingRpc = (name: string, params: Record<string, unknown>, signal: AbortSignal) =>
  Promise<{ data: unknown; error: unknown }>;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
// RPC evidence is JSON data. Compare every value independent of its decoding realm.
function samePolicyData(left: unknown, right: unknown) {
  return isDeepStrictEqual(JSON.parse(JSON.stringify(left)), JSON.parse(JSON.stringify(right)));
}
const defaultRpc: FundingRpc = async (name, params, signal) => {
  if (!supabaseAdmin || signal.aborted) return { data: null, error: 'unavailable' };
  return supabaseAdmin.rpc(name, params).abortSignal(signal);
};
export { fundingSubject } from './dialogue-funding';
export function createFundingDialogueAdmission(rpc: FundingRpc = defaultRpc): FundingDialogueAdmission & QualificationAdmission {
  return {
    ...createQualificationAdmission(rpc),
    async reserve(r: FundedDialogueReservation, signal: AbortSignal) {
      if (signal.aborted) return { kind: 'denied' };
      try {
        const continuous = r.proof.mode === 'bounded-account-charge';
        if (continuous && (!validDurableAccountChargeProof(r.proof, Date.now()) || !r.pricing
          || !r.proof.limitedOperation.acceptedProfileSha256s.includes(r.pricing.profileSha256)
          || !publicPricingObservationCurrent(r.pricing.observation, r.proof, Date.now()))) return { kind: 'denied' };
        if (!continuous && r.pricing) return { kind: 'denied' };
        const executionPricing = continuous && r.pricing ? { schema: 'task217-execution-pricing-v1',
          observation: r.pricing.observation, authorityBindingSha256: r.proof.limitedOperation.bindingSha256,
          profileSha256: r.pricing.profileSha256, attemptId: r.attemptId, requestId: r.requestId,
          subjectHash: fundingSubject(r.subject), stage: r.stage, inputTokenCeiling: r.inputTokens, outputTokenCeiling: r.outputTokens } : undefined;
        const serializedProof = executionPricing ? { ...r.proof, executionPricing } : r.proof;
        const { data, error } = await rpc('reserve_dabra_dialogue_attempt', {
          p_attempt_id: r.attemptId, p_request_id: r.requestId, p_stage: r.stage, p_subject_hash: fundingSubject(r.subject),
          p_grant_id: r.proof.grantId, p_proof: r.measurementRequest === undefined ? serializedProof : { ...serializedProof, measurementRequest: r.measurementRequest }, p_input_tokens: r.inputTokens, p_output_tokens: r.outputTokens,
          p_cost_micros: r.costMicros, p_limits: r.limits, p_day_start_ms: r.dayStartMs,
        }, signal);
        // No RPC retry: a timeout or lost claim response may already have committed.
        if (signal.aborted || error || !object(data) || data.decision !== 'admitted' || data.attempt_id !== r.attemptId) return { kind: 'denied' };
        if ('snapshotUse' in r.proof || 'limitedOperation' in r.proof) {
          // This deadline comes from the same atomic reservation, not caller proof
          // or a policy reload. A late/missing receipt never releases its hold.
          const deadline = data.pricing_expires_at_ms;
          if (!integer(deadline) || deadline <= Date.now()) return { kind: 'denied' };
          return { kind: 'admitted', attemptId: r.attemptId, pricingExpiresAtMs: deadline };
        }
        return { kind: 'admitted', attemptId: r.attemptId };
      } catch { return { kind: 'denied' }; }
    },
  };
}
function profile(value: unknown): value is AgentCapabilityProfile {
  if (!object(value) || !AGENT_PROVIDER_IDS.some(p => p === value.provider) || !object(value.measurement)) return false;
  const m = value.measurement;
  return ['discover', 'intent.classify'].includes(String(m.capability)) && ['ar', 'en'].includes(String(m.language))
    && m.environment === 'provider-benchmark' && typeof m.model === 'string' && /^[a-zA-Z0-9._:/-]{1,120}$/.test(m.model)
    && typeof m.sourceSha === 'string' && /^[a-f0-9]{40}$/.test(m.sourceSha)
    && typeof m.caseSetSha === 'string' && /^[a-f0-9]{64}$/.test(m.caseSetSha)
    && ['cases','passed','measuredAtMs','expiresAtMs','latencyMs','inputTokenCeiling','outputTokenCeiling'].every(k => integer(m[k]))
    && typeof m.costCeilingUsd === 'number' && Number.isFinite(m.costCeilingUsd) && m.costCeilingUsd >= 0;
}
function proof(value: unknown): value is DialogueFundingProof {
  if (object(value) && value.mode === 'bounded-account-charge') return validDurableAccountChargeProof(value, Date.now());
  if (!object(value) || !AGENT_PROVIDER_IDS.some(p => p === value.provider)
    || !['synthetic','provider-benchmark'].includes(String(value.environment))
    || !['off','on','unknown'].includes(String(value.autoReload))
    || !['blocked','allowed','unknown'].includes(String(value.postpaid))
    || !['blocked','allowed','unknown'].includes(String(value.overdraft))
    || !['bounded','unknown'].includes(String(value.concurrentAccountUsage))) return false;
  return ['grantId','provider','model','environment','accountId','projectId','evidenceSha256','credentialSha256',
    'autoReload','postpaid','overdraft','concurrentAccountUsage'].every(k => typeof value[k] === 'string')
    && ['verifiedAtMs','expiresAtMs','quotaWindowStartMs','quotaWindowEndMs','remainingRequests','remainingInputTokens','remainingOutputTokens'].every(k => integer(value[k]))
    && (value.mode === 'existing-credit'
      ? (['openai','anthropic'].includes(String(value.provider)) || validTask217PilotEnvelope(value.pilotEnvelope) || validTask217LimitedOperation(value, Date.now())) && value.currency === 'USD' && value.serviceTier === 'standard'
        && ['standard-2026-10-28','synthetic'].includes(String(value.pricing))
        && integer(value.authorizedCreditMicros) && integer(value.remainingCreditMicros)
      : value.mode === 'no-new-charge' && AGENT_PROVIDER_IDS.some(p => p === value.provider)
        && !['openai','anthropic'].includes(String(value.provider)) && value.enforcement === 'provider-hard-no-new-charge');
}
/** Explicit opt-in only. Missing data/store returns a governed, blocked policy, never the legacy classifier. */
export async function loadFundingDialoguePolicy(context?: AgentContext, signal?: AbortSignal, rpc: FundingRpc = defaultRpc, requestId?: string): Promise<AgentDialoguePolicy> {
  const base: AgentDialoguePolicy = {
    trial: true, environment: 'provider-benchmark', profiles: [], freeProofs: [],
    limits: { maxAttempts: 1, maxElapsedMs: 12000, maxInputTokens: 4096, maxOutputTokens: 1024, maxCostUsd: 0 },
    daily: PUBLIC_DIALOGUE_DAILY_LIMITS,
    funding: { kind: 'existing-credit-v2', requestId: requestId && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId) ? requestId : randomUUID(), proofs: [], admission: createFundingDialogueAdmission(rpc) },
  };
  const actor = context?.taskAuthority;
  if (context?.role !== 'customer' || actor?.kind !== 'customer' || actor.actorId !== actor.ownerId
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(actor.actorId) || !context.isTaskAuthorityCurrent || signal?.aborted) return base;
  try {
    const bounded = AbortSignal.any([AbortSignal.timeout(1000), ...(signal ? [signal] : [])]);
    if (!await context.isTaskAuthorityCurrent()) return base;
    let stop: (() => void) | undefined;
    const stopped = new Promise<{data: unknown; error: unknown}>(resolve => {
      stop = () => resolve({data: null, error: 'aborted'});
      if (bounded.aborted) stop(); else bounded.addEventListener('abort', stop, {once: true});
    });
    const { data, error } = await Promise.race([rpc('get_dabra_dialogue_funding_policy', { p_subject_hash: fundingSubject(actor.actorId) }, bounded), stopped])
      .finally(() => { if (stop) bounded.removeEventListener('abort', stop); });
    if (bounded.aborted || error || !object(data) || data.enabled !== true || !Array.isArray(data.profiles)
      || !Array.isArray(data.proofs) || !integer(data.maxCostMicros)
      || !validFundingDailyLimits(data.dailyLimits,base.limits.maxInputTokens,base.limits.maxOutputTokens) || !await context.isTaskAuthorityCurrent()) return base;
    const outputAcceptances: readonly unknown[] = Array.isArray(data.outputAcceptances) && data.outputAcceptances.length<=28
      ? Object.freeze(JSON.parse(JSON.stringify(data.outputAcceptances))) : [];
    return { ...base, outputAcceptances, daily: Object.freeze({...data.dailyLimits}), profiles: data.profiles.filter(profile),
      limits: { ...base.limits, maxCostUsd: data.maxCostMicros / 1000000 },
      funding: { kind: 'existing-credit-v2', requestId: base.funding!.requestId, proofs: data.proofs.filter(proof).filter(p => !('pilotEnvelope' in p) && (!('limitedOperation' in p) || (requestId !== undefined && base.funding!.requestId === requestId))),
        admission: base.funding!.admission, refreshPricing: refreshPublicDialoguePricing,
        async isCurrent(expectedProof, expectedProfile, currentSignal) {
          try {
            const fresh = await rpc('get_dabra_dialogue_funding_policy', { p_subject_hash: fundingSubject(actor.actorId) }, currentSignal);
            if (currentSignal.aborted || fresh.error || !object(fresh.data) || fresh.data.enabled !== true
              || !Array.isArray(fresh.data.proofs) || !Array.isArray(fresh.data.profiles)
              || fresh.data.maxCostMicros !== data.maxCostMicros || !samePolicyData(fresh.data.dailyLimits, data.dailyLimits) || !samePolicyData(fresh.data.outputAcceptances ?? [], outputAcceptances)) return false;
            return fresh.data.proofs.filter(proof).some(p => samePolicyData(p, expectedProof))
              && fresh.data.profiles.filter(profile).some(p => samePolicyData({ provider: p.provider, measurement: p.measurement }, expectedProfile));
          } catch { return false; }
        } } };
  } catch { return base; }
}

/** Server-stored approval only. Neither a CLI argument nor a profile-shaped object approves a measurement. */
export async function loadFundingMeasurement(subject: string, planId: string, sourceSha: string, signal: AbortSignal,
  rpc: FundingRpc = defaultRpc): Promise<ApprovedFirstProfilePlan | null> {
  if (signal.aborted || !/^[a-zA-Z0-9_-]{1,128}$/.test(subject) || !/^[a-f0-9]{40}$/.test(sourceSha)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(planId)) return null;
  try {
    const { data, error } = await rpc('get_dabra_dialogue_funding_policy', { p_subject_hash: fundingSubject(subject) }, signal);
    if (signal.aborted || error || !object(data) || data.enabled !== true || !Array.isArray(data.proofs)
      || !integer(data.maxCostMicros) || !validFundingDailyLimits(data.dailyLimits, 4096, 1024)) return null;
    const matches = data.proofs.filter(proof).filter(p => {
      if (p.mode === 'bounded-account-charge') return false;
      const permit = parseFirstProfilePermit(p.measurementPermit);
      return permit && permit.planId === planId && permit.sourceSha === sourceSha
        && permit.subjectHash === fundingSubject(subject) && p.environment === 'provider-benchmark';
    });
    if (matches.length !== 1) return null;
    // Snapshot trusted JSON, including any private one-use authorization. Never mutate observations during dispatch.
    const snapshot: unknown = JSON.parse(JSON.stringify(matches[0]));
    if (!proof(snapshot)) return null;
    if (snapshot.mode === 'bounded-account-charge') return null;
    const permit = parseFirstProfilePermit(snapshot.measurementPermit), window = fundingAuthorizationWindow(snapshot, Date.now());
    if (!permit || !window || ('snapshotUse' in snapshot && permit.expiresAtMs > window.expiresAtMs)
      || Date.now() >= permit.expiresAtMs || !validTask217PilotEnvelope(snapshot.pilotEnvelope)
      || quoteDialogueFunding(snapshot, { provider: snapshot.provider, model: snapshot.model, environment: snapshot.environment,
        inputTokenCeiling: permit.inputTokenCeiling, outputTokenCeiling: permit.outputTokenCeiling }, Date.now()) === null) return null;
    return Object.freeze({ subject, proof: Object.freeze(snapshot), permit,
      daily: Object.freeze({ ...data.dailyLimits }), maxCostMicros: data.maxCostMicros });
  } catch { return null; }
}

/** Qualification-only stored authority. Never exposed as Customer funding/profile approval. */
export async function loadFundingQualification(subject: string, planId: string, sourceSha: string, signal: AbortSignal,
 rpc: FundingRpc = defaultRpc): Promise<ApprovedQualificationPlan | null> {
 if(signal.aborted || !/^[a-zA-Z0-9_-]{1,128}$/.test(subject) || !/^[a-f0-9]{40}$/.test(sourceSha)
  || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(planId))return null;
 const bounded=AbortSignal.any([signal,AbortSignal.timeout(1000)]);
 let stopped:(()=>void)|undefined;
 try {
  const unavailable=new Promise<{data:unknown;error:unknown}>(resolve=>{
   stopped=()=>resolve({data:null,error:'aborted'});if(bounded.aborted)stopped();else bounded.addEventListener('abort',stopped,{once:true});
  });
  const result=await Promise.race([rpc('get_dabra_dialogue_qualification_plan',{p_plan_id:planId,p_subject_hash:fundingSubject(subject)},bounded),unavailable]);
  if(bounded.aborted || result.error || !object(result.data) || Object.keys(result.data).length!==4
   || result.data.schema!=='task217-stored-qualification-plan-v1' || !integer(result.data.maxCostMicros) || result.data.maxCostMicros>1000000
   || !validFundingDailyLimits(result.data.dailyLimits,4096,1024))return null;
  const snapshot:unknown=JSON.parse(JSON.stringify(result.data.proof)),proof=parseQualificationProof(snapshot,Date.now()),permit=proof?.limitedOperation.permit;
  if(!proof || !permit || permit.planId!==planId || permit.sourceSha!==sourceSha || permit.subjectHash!==fundingSubject(subject))return null;
  return Object.freeze({kind:'platform-units-qualification',subject,proof,permit,daily:Object.freeze({...result.data.dailyLimits}),maxCostMicros:result.data.maxCostMicros});
 }catch{return null;}finally{if(stopped)bounded.removeEventListener('abort',stopped);}
}
/** Actual loader -> fresh stored authority -> shared reserve -> existing dispatch.
 * Optional dependency is external DB transport only; no permit/profile bypass. */
export async function runFundingQualification(subject: string, planId: string, signal: AbortSignal, rpc: FundingRpc = defaultRpc,
 runtime: Pick<QualificationMeasurementDependencies,'configuration'|'dispatch'|'sourceSha'> = {
  configuration:internalAgentConfiguration,dispatch:callInternalAgentProvider,sourceSha:()=>process.env.VERCEL_GIT_COMMIT_SHA??'',
 }) {
 const plan=await loadFundingQualification(subject,planId,runtime.sourceSha(),signal,rpc);
 if(!plan)return Object.freeze({kind:'blocked' as const,qualified:false as const,semanticReview:'required' as const,observations:Object.freeze([])});
 const result = await measurePlatformUnitsProfile(plan,{...runtime,admission:createFundingDialogueAdmission(rpc),
  authorityCurrent:async currentSignal=>{
   const fresh=await loadFundingQualification(subject,planId,runtime.sourceSha(),currentSignal,rpc);
   return fresh!==null && samePolicyData(fresh,plan);
  }},signal);
 return Object.freeze({scope:Object.freeze({provider:plan.proof.provider,approvedModel:plan.proof.model,sourceSha:plan.permit.sourceSha,
  caseSetSha:plan.permit.caseSetSha,languages:plan.permit.languages,inputTokenCeiling:plan.permit.inputTokenCeiling,outputTokenCeiling:plan.permit.outputTokenCeiling}),...result});
}
