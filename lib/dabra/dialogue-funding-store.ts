import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../supabase/server';
import { AGENT_PROVIDER_IDS, type AgentCapabilityProfile } from './agent-capabilities';
import { PUBLIC_DIALOGUE_DAILY_LIMITS, type AgentDialoguePolicy } from './agent-dialogue';
import type { AgentContext } from './agent-contract';
import { validFundingDailyLimits, type DialogueFundingProof, type FundedDialogueReservation, type FundingDialogueAdmission } from './dialogue-funding';

export type FundingRpc = (name: string, params: Record<string, unknown>, signal: AbortSignal) =>
  Promise<{ data: unknown; error: unknown }>;
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const defaultRpc: FundingRpc = async (name, params, signal) => {
  if (!supabaseAdmin || signal.aborted) return { data: null, error: 'unavailable' };
  return supabaseAdmin.rpc(name, params).abortSignal(signal);
};
export const fundingSubject = (subject: string) => createHash('sha256').update('task217-dialogue:' + subject).digest('hex');
export function createFundingDialogueAdmission(rpc: FundingRpc = defaultRpc): FundingDialogueAdmission {
  return {
    async reserve(r: FundedDialogueReservation, signal: AbortSignal) {
      if (signal.aborted) return { kind: 'denied' };
      try {
        const { data, error } = await rpc('reserve_dabra_dialogue_attempt', {
          p_attempt_id: r.attemptId, p_request_id: r.requestId, p_stage: r.stage, p_subject_hash: fundingSubject(r.subject),
          p_grant_id: r.proof.grantId, p_proof: r.proof, p_input_tokens: r.inputTokens, p_output_tokens: r.outputTokens,
          p_cost_micros: r.costMicros, p_limits: r.limits, p_day_start_ms: r.dayStartMs,
        }, signal);
        // No RPC retry: a timeout or lost claim response may already have committed.
        return !signal.aborted && !error && object(data) && data.decision === 'admitted' && data.attempt_id === r.attemptId
          ? { kind: 'admitted', attemptId: r.attemptId } : { kind: 'denied' };
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
      ? ['openai','anthropic'].includes(String(value.provider)) && value.currency === 'USD' && value.serviceTier === 'standard'
        && ['standard-2026-10-28','synthetic'].includes(String(value.pricing))
        && integer(value.authorizedCreditMicros) && integer(value.remainingCreditMicros)
      : value.mode === 'no-new-charge' && AGENT_PROVIDER_IDS.some(p => p === value.provider)
        && !['openai','anthropic'].includes(String(value.provider)) && value.enforcement === 'provider-hard-no-new-charge');
}
/** Explicit opt-in only. Missing data/store returns a governed, blocked policy, never the legacy classifier. */
export async function loadFundingDialoguePolicy(context?: AgentContext, signal?: AbortSignal, rpc: FundingRpc = defaultRpc): Promise<AgentDialoguePolicy> {
  const base: AgentDialoguePolicy = {
    trial: true, environment: 'provider-benchmark', profiles: [], freeProofs: [],
    limits: { maxAttempts: 1, maxElapsedMs: 12000, maxInputTokens: 4096, maxOutputTokens: 1024, maxCostUsd: 0 },
    daily: PUBLIC_DIALOGUE_DAILY_LIMITS,
    funding: { kind: 'existing-credit-v2', requestId: randomUUID(), proofs: [], admission: createFundingDialogueAdmission(rpc) },
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
    return { ...base, daily: Object.freeze({...data.dailyLimits}), profiles: data.profiles.filter(profile),
      limits: { ...base.limits, maxCostUsd: data.maxCostMicros / 1000000 },
      funding: { kind: 'existing-credit-v2', requestId: base.funding!.requestId, proofs: data.proofs.filter(proof),
        admission: base.funding!.admission } };
  } catch { return base; }
}
