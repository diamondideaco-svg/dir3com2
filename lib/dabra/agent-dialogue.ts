import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import { internalAgentConfiguration } from '../ai2/runtime/agent-provider-dispatch';
import { AGENT_DIALOGUE_PROMPT } from './agent-platform-units';
export { AGENT_DIALOGUE_PROMPT, composePublicAgentDialogue } from './agent-platform-units';
import { requestOutputContract, profileOutputAccepted, APPROVED_PROFILE_OUTPUT_ACCEPTANCES } from './agent-output-contract';
import { dialogueCostCeilingMicros, fundingProofCurrent, fundingAuthorizationWindow, validFundingRequestIdentity, type DialogueFundingBinding } from './dialogue-funding';
import { durableAuthorityAcceptsProfile, durableProfileSha256 } from './dialogue-durable-authority';
import type { PublicPricingObservation } from './dialogue-pricing-refresh';
import { coreRequiredDialogueUnits } from './conversation-renderer';
import { generalTravelContext, GENERAL_TRAVEL_PROMPT } from './agent-general-travel';
import { APPROVED_AGENT_CAPABILITY_PROFILES, selectQualifiedAgentCapability, type AgentCapabilityProfile, type AgentProviderId, type CapabilityMeasurement } from './agent-capabilities';
import { agentIntent, type AgentTaskLimits, type AgentContext } from './agent-contract';
import type { runInternalAgent } from './agent';

type Input = Parameters<typeof runInternalAgent>[0];
type Reply = Awaited<ReturnType<typeof runInternalAgent>>;
export type FreeDialogueProof = Readonly<{
  provider: AgentProviderId; model: string; environment: CapabilityMeasurement['environment'];
  accountId: string; projectId: string; evidenceSha256: string; credentialSha256: string;
  verifiedAtMs: number; expiresAtMs: number; quotaWindowStartMs: number; quotaWindowEndMs: number;
  billingEnforcement: 'provider-hard-free-only'; paidFallback: false;
  remainingRequests: number; remainingInputTokens: number; remainingOutputTokens: number;
}>;
export type DialogueDailyLimits = Readonly<{
  uniqueUsers: number; requestsPerUser: number; requestsTotal: number;
  inputTokensPerUser: number; outputTokensPerUser: number;
  inputTokensTotal: number; outputTokensTotal: number;
}>;
export type DialogueReservation = Readonly<{
  policyId: 'task217-public-free-v1'; subject: string;
  dayStartMs: number; dayEndMs: number; nowMs: number;
  provider: AgentProviderId; model: string; proof: FreeDialogueProof;
  inputTokens: number; outputTokens: number; limits: DialogueDailyLimits;
}>;
/**
 * REQUIRED binding: one atomic, durable counter shared by all workers, sessions,
 * providers and projects. Deduplicate subjects across vendors and charge every
 * reservation, including failed/unknown attempts. Recheck proof/limits atomically.
 * A process-local Map is NOT a production implementation of this interface.
 */
export interface DialogueAdmission {
  reserve(request: DialogueReservation, signal: AbortSignal): Promise<'admitted' | 'denied'>;
}
export type AgentDialoguePolicy = Readonly<{
  trial: boolean; environment: CapabilityMeasurement['environment'];
  profiles: readonly AgentCapabilityProfile[];
  outputAcceptances?: readonly unknown[];
  freeProofs: readonly FreeDialogueProof[];
  limits: AgentTaskLimits; daily: DialogueDailyLimits;
  admission?: DialogueAdmission;
  funding?: DialogueFundingBinding;
}>;
export const PUBLIC_DIALOGUE_DAILY_LIMITS: DialogueDailyLimits = Object.freeze({
  uniqueUsers: 10, requestsPerUser: 6, requestsTotal: 60,
  inputTokensPerUser: 24576, outputTokensPerUser: 6144,
  inputTokensTotal: 245760, outputTokensTotal: 61440,
});
// No live qualification, free-only account proof or durable quota binding is installed.
// Absence is an honest Core fallback; this change authorizes no spending.
export const DEFAULT_AGENT_DIALOGUE_POLICY: AgentDialoguePolicy = Object.freeze({
  trial: false, environment: 'provider-benchmark', profiles: APPROVED_AGENT_CAPABILITY_PROFILES,
  freeProofs: Object.freeze([]),
  limits: Object.freeze({ maxAttempts: 1, maxElapsedMs: 12000, maxInputTokens: 4096, maxOutputTokens: 1024, maxCostUsd: 0 }),
  daily: PUBLIC_DIALOGUE_DAILY_LIMITS,
});
// New server-only opt-in is unset by default. This source change sets no environment values.
export async function getAgentDialoguePolicy(context?: AgentContext, signal?: AbortSignal, requestId?: string): Promise<AgentDialoguePolicy> {
  const mode = process.env.DABRA_DIALOGUE_FUNDING_POLICY?.trim();
  if (!mode) return DEFAULT_AGENT_DIALOGUE_POLICY;
  if (mode !== 'task217-existing-credit-v2') return Object.freeze({...DEFAULT_AGENT_DIALOGUE_POLICY, trial: true});
  const { loadFundingDialoguePolicy } = await import('./dialogue-funding-store');
  return loadFundingDialoguePolicy(context, signal, undefined, requestId);
}

export function dialogueDay(nowMs: number) {
  // One explicit day for all workers and providers: Asia/Riyadh (UTC+03).
  const dayStartMs = Math.floor((nowMs + 10800000) / 86400000) * 86400000 - 10800000;
  return { dayStartMs, dayEndMs: dayStartMs + 86400000 };
}
function validPolicy(policy: AgentDialoguePolicy) {
  const l = policy.limits, d = policy.daily;
  return l.maxAttempts === 1 && (policy.funding ? Number.isFinite(l.maxCostUsd) && l.maxCostUsd >= 0 && validFundingRequestIdentity(policy.funding) : l.maxCostUsd === 0) && l.maxElapsedMs > 0 && l.maxElapsedMs <= 12000
    && Number.isSafeInteger(l.maxElapsedMs) && Number.isSafeInteger(l.maxInputTokens) && l.maxInputTokens > 0 && l.maxInputTokens <= 4096
    && Number.isSafeInteger(l.maxOutputTokens) && l.maxOutputTokens > 0 && l.maxOutputTokens <= 1024
    && Object.values(d).every(n => Number.isSafeInteger(n) && n > 0)
    && d.uniqueUsers <= 20 && d.requestsPerUser <= 6 && d.requestsTotal <= PUBLIC_DIALOGUE_DAILY_LIMITS.requestsTotal
    && d.inputTokensTotal <= PUBLIC_DIALOGUE_DAILY_LIMITS.inputTokensTotal && d.outputTokensTotal <= PUBLIC_DIALOGUE_DAILY_LIMITS.outputTokensTotal
    && d.requestsTotal <= d.uniqueUsers * d.requestsPerUser
    && d.inputTokensPerUser <= d.requestsPerUser * l.maxInputTokens && d.outputTokensPerUser <= d.requestsPerUser * l.maxOutputTokens
    && d.inputTokensTotal <= d.requestsTotal * l.maxInputTokens && d.outputTokensTotal <= d.requestsTotal * l.maxOutputTokens;
}
function matchesProof(proof: FreeDialogueProof, profile: AgentCapabilityProfile, policy: AgentDialoguePolicy, now: number) {
  const m = profile.measurement;
  return proof.provider === profile.provider && proof.model === m.model && proof.environment === policy.environment
    && /^[a-zA-Z0-9:_-]{1,100}$/.test(proof.accountId) && /^[a-zA-Z0-9:_-]{1,100}$/.test(proof.projectId)
    && /^[a-f0-9]{64}$/.test(proof.evidenceSha256) && /^[a-f0-9]{64}$/.test(proof.credentialSha256)
    && Number.isFinite(proof.verifiedAtMs) && proof.verifiedAtMs <= now
    && Number.isFinite(proof.expiresAtMs) && proof.expiresAtMs > now
    && Number.isSafeInteger(proof.quotaWindowStartMs) && proof.quotaWindowStartMs <= now
    && Number.isSafeInteger(proof.quotaWindowEndMs) && proof.quotaWindowEndMs > now
    && proof.expiresAtMs > proof.verifiedAtMs && proof.expiresAtMs - proof.verifiedAtMs <= 3600000
    && proof.billingEnforcement === 'provider-hard-free-only' && proof.paidFallback === false
    && Number.isSafeInteger(proof.remainingRequests) && proof.remainingRequests >= 1
    && Number.isSafeInteger(proof.remainingInputTokens) && proof.remainingInputTokens >= m.inputTokenCeiling
    && Number.isSafeInteger(proof.remainingOutputTokens) && proof.remainingOutputTokens >= m.outputTokenCeiling;
}
export type PreparedAgentAttempt = Readonly<{
  profile: AgentCapabilityProfile; credentialSha256: string; limits: AgentTaskLimits; standardBilling?: boolean;
  message: string; prompt: string; inputDigestValue: unknown; deadlineAtMs: number;
  signal: AbortSignal; isCurrent: () => Promise<boolean>; isReadyToDispatch: () => boolean;
  acceptExpiredMeasurement?: (profile: AgentCapabilityProfile) => boolean;
}>;
type AgentAttemptBinding = Pick<PreparedAgentAttempt, 'profile' | 'credentialSha256'>;
type ConfigurationFailure = 'configuration_missing' | 'model_mismatch' | 'credential_mismatch' | 'configuration_unavailable';
type AgentRuntimeCheck = (binding: AgentAttemptBinding) => ConfigurationFailure | null;
const preparationDiagnostics = channel('dir3com.dabra.agent-preparation');
function inspectConfiguration(binding: AgentAttemptBinding) {
  try {
    const config = internalAgentConfiguration(binding.profile.provider);
    if (!config) return { kind: 'configuration_missing' } as const;
    if (config.model !== binding.profile.measurement.model) return { kind: 'model_mismatch' } as const;
    if (createHash('sha256').update(config.apiKey).digest('hex') !== binding.credentialSha256)
      return { kind: 'credential_mismatch' } as const;
    return { kind: 'configured', config } as const;
  } catch { return { kind: 'configuration_unavailable' } as const; }
}
/** Fresh server configuration bound to the already selected, validated proof. */
export function agentAttemptConfiguration(binding: AgentAttemptBinding) {
  const result = inspectConfiguration(binding);
  return result.kind === 'configured' ? result.config : null;
}
/** Runtime callers use this adapter; its guard is compiled code, never policy or request JSON. */
export function prepareRuntimeAgentProviderAttempt(...args: Parameters<typeof prepareAgentProviderAttempt>) {
  const [context, locale, policy, request, deadlineAtMs, signal] = args;
  return prepareAgentProviderAttempt(context, locale, policy, request, deadlineAtMs, signal,
    binding => { const result = inspectConfiguration(binding); return result.kind === 'configured' ? null : result.kind; });
}
export type AgentDialogueResponseContract = 'platform-units' | 'general-travel';
export type PreparedPublicDialogue = PreparedAgentAttempt & Readonly<{
  units: readonly string[]; requiredUnits: readonly string[]; mode: 'core-composition' | 'general-travel';
}>;
export async function prepareAgentProviderAttempt(context: AgentContext, locale: 'ar' | 'en', policy: AgentDialoguePolicy,
  request: { capability: 'discover' | 'intent.classify'; provider?: AgentProviderId; message: string; prompt: string; inputDigestValue: unknown },
  deadlineAtMs: number, signal?: AbortSignal, runtimeCheck?: AgentRuntimeCheck): Promise<PreparedAgentAttempt | null> {
  const now = Date.now(), actor = context.taskAuthority;
  let reservationState: 'not_attempted' | 'unknown' | 'accepted' = 'not_attempted', diagnosed = false;
  // Closed server-only events: never include selection values, payload, actor,
  // account, proof, key, digest, URL or raw error. Logging cannot relax a guard.
  const diagnose = (reason: ConfigurationFailure | 'readiness_lost' | 'authority_or_policy_unavailable'
    | 'admission_unavailable' | 'preparation_exception' | 'policy_or_actor_unavailable'
    | 'output_contract_unavailable' | 'provider_selection_unavailable' | 'funding_proof_unavailable'
    | 'pricing_refresh_unavailable' | 'input_ceiling_exceeded' | 'authorization_window_expired'
    | 'cost_ceiling_unavailable' | 'request_aborted' | 'request_deadline_expired' | 'preparation_timeout'
    | 'context_unavailable' | 'request_timeout') => {
    if (diagnosed) return; diagnosed = true;
    const event = Object.freeze({
      capability: request.capability === 'discover' ? 'discover' : 'intent.classify', reason, reservation: reservationState,
      stage: reservationState === 'accepted' ? 'post_admission' : reservationState === 'unknown' ? 'admission' : 'preflight',
    });
    try { console.warn('DABRA_AGENT_PREPARATION', JSON.stringify(event)); } catch { /* No logging fallback. */ }
    if (preparationDiagnostics.hasSubscribers) preparationDiagnostics.publish(event);
  };
  const requestStopped = () => {
    if (signal?.aborted) { diagnose(signal.reason?.name === 'TimeoutError' ? 'request_timeout' : 'request_aborted'); return true; }
    if (Date.now() >= deadlineAtMs) { diagnose('request_deadline_expired'); return true; }
    return false;
  };
  // An internal context failure is not an anonymous visit. Only its closed code is emitted.
  if (context.taskAuthorityFailure === 'unavailable') { diagnose('context_unavailable'); return null; }
  // Ordinary public/disabled dialogue remains a silent Core path.
  if (!policy.trial || context.role !== 'customer' || actor?.kind !== 'customer') return null;
  if (requestStopped()) return null;
  if (!validPolicy(policy) || (!policy.admission && !policy.funding) || actor.actorId !== actor.ownerId
    || !/^[a-zA-Z0-9_-]{1,128}$/.test(actor.actorId) || !context.isTaskAuthorityCurrent) { diagnose('policy_or_actor_unavailable'); return null; }
  const outputContract = requestOutputContract(request.capability, locale, request.prompt, request.message);
  if (!outputContract) { diagnose('output_contract_unavailable'); return null; }
  const acceptsOutput = (p: AgentCapabilityProfile, at: number) => profileOutputAccepted(p, outputContract,
    policy.outputAcceptances ?? APPROVED_PROFILE_OUTPUT_ACCEPTANCES, at);
  const funded = policy.funding, continuous = funded?.proofs.some(p => p.mode === 'bounded-account-charge') === true;
  const desired = process.env.DABRA_AI_PROVIDER?.trim().toLowerCase() || 'openai';
  const matchingFundingProof = (p: AgentCapabilityProfile) => {
    const proofs = funded?.proofs.filter(proof => fundingProofCurrent(proof, p, now));
    return proofs?.find(proof => proof.mode === 'bounded-account-charge' && durableAuthorityAcceptsProfile(proof, p, now))
      ?? proofs?.find(proof => proof.mode !== 'bounded-account-charge' && p.measurement.expiresAtMs > now
        && dialogueCostCeilingMicros(proof, p, now) !== null);
  };
  const payloadBytes = Buffer.byteLength(request.prompt + request.message, 'utf8') + 128;
  const eligible = policy.profiles.filter(p => (!request.provider || p.provider === request.provider)
    && (!continuous || desired === 'auto' || p.provider === desired));
  const accepts = (p: AgentCapabilityProfile) => funded?.proofs.some(proof => proof.mode === 'bounded-account-charge'
    && durableAuthorityAcceptsProfile(proof, p, Date.now())) === true;
  const selection = selectQualifiedAgentCapability(eligible, {
    capability: request.capability, language: locale, environment: policy.environment, nowMs: now, limits: policy.limits,
    ...(continuous ? { acceptExpiredMeasurement: accepts } : {}),
    // Qualify the actual task and its matching proof before latency/cost ranking.
    // This is one selection before any reservation, not provider failover.
    isEligibleForTask: p => acceptsOutput(p, now) && payloadBytes <= p.measurement.inputTokenCeiling
      && (funded ? matchingFundingProof(p) !== undefined : policy.freeProofs.some(proof => matchesProof(proof, p, policy, now))),
  });
  if (selection.kind !== 'selected') { diagnose('provider_selection_unavailable'); return null; }
  const profile: AgentCapabilityProfile = { provider: selection.destination.provider, measurement: selection.destination.measurement };
  // Select the funding mode from this provider/profile, never from a different
  // provider's standing authority. An expired measurement cannot borrow v1 freshness.
  const fundingProof = matchingFundingProof(profile);
  const matchedProof = funded ? undefined : policy.freeProofs.find(p => matchesProof(p, profile, policy, now));
  if (funded ? !fundingProof : !matchedProof) { diagnose('funding_proof_unavailable'); return null; }
  const candidate = fundingProof ?? matchedProof;
  if (!candidate) { diagnose('funding_proof_unavailable'); return null; }
  const proof = Object.freeze({ ...candidate });
  const binding: AgentAttemptBinding = { profile, credentialSha256: proof.credentialSha256 };
  const configurationFailure = runtimeCheck?.(binding);
  if (configurationFailure) { diagnose(configurationFailure); return null; }
  let pricing: PublicPricingObservation | undefined;
  if (fundingProof?.mode === 'bounded-account-charge') {
    if (!funded?.refreshPricing) { diagnose('pricing_refresh_unavailable'); return null; }
    try {
      const authorizedBeforePricing = await context.isTaskAuthorityCurrent();
      if (requestStopped()) return null;
      if (!authorizedBeforePricing) { diagnose('authority_or_policy_unavailable'); return null; }
      const preparing = AbortSignal.any([AbortSignal.timeout(Math.max(1, deadlineAtMs - Date.now())), ...(signal ? [signal] : [])]);
      const observation = await funded.refreshPricing(fundingProof, preparing);
      if (requestStopped()) return null;
      if (preparing.aborted) { diagnose('preparation_timeout'); return null; }
      if (!observation) { diagnose('pricing_refresh_unavailable'); return null; }
      const authorizedAfterPricing = await context.isTaskAuthorityCurrent();
      if (requestStopped()) return null;
      if (!authorizedAfterPricing) { diagnose('authority_or_policy_unavailable'); return null; }
      pricing = observation;
    } catch { diagnose('preparation_exception'); return null; }
  }
  if (Buffer.byteLength(request.prompt + request.message, 'utf8') + 128 > profile.measurement.inputTokenCeiling) { diagnose('input_ceiling_exceeded'); return null; }
  const authorizationEnd = fundingProof?.mode === 'bounded-account-charge' ? pricing?.expiresAtMs ?? 0
    : fundingProof ? fundingAuthorizationWindow(fundingProof, now)?.expiresAtMs ?? 0 : matchedProof?.expiresAtMs ?? 0;
  const quotaEnd = fundingProof?.mode === 'bounded-account-charge' ? dialogueDay(now).dayEndMs
    : fundingProof?.quotaWindowEndMs ?? matchedProof?.quotaWindowEndMs ?? 0;
  let end = Math.floor(Math.min(deadlineAtMs, now + policy.limits.maxElapsedMs,
    fundingProof?.mode === 'bounded-account-charge' ? deadlineAtMs : profile.measurement.expiresAtMs,
    authorizationEnd, quotaEnd, dialogueDay(now).dayEndMs));
  if (end <= Date.now()) { diagnose('authorization_window_expired'); return null; }
  let bounded = AbortSignal.any([AbortSignal.timeout(Math.max(1, end - Date.now())), ...(signal ? [signal] : [])]);
  const isReadyToDispatch = () => {
    const at = Date.now();
    const failure = runtimeCheck?.(binding);
    if (failure) { diagnose(failure); return false; }
    const ready = !bounded.aborted && at < end && acceptsOutput(profile, at) && (fundingProof
      ? fundingProofCurrent(fundingProof, profile, at) && dialogueCostCeilingMicros(fundingProof, profile, at, pricing) !== null
      : matchesProof(proof as FreeDialogueProof, profile, policy, at));
    if (!ready) diagnose('readiness_lost');
    return ready;
  };
  const current = async () => {
    try {
      if (!isReadyToDispatch() || !await context.isTaskAuthorityCurrent!() || !isReadyToDispatch()) {
        diagnose('authority_or_policy_unavailable'); return false;
      }
      if (fundingProof && 'limitedOperation' in fundingProof) {
        if (!funded?.isCurrent || !await funded.isCurrent(fundingProof, profile, bounded) || !isReadyToDispatch()) {
          diagnose('authority_or_policy_unavailable'); return false;
        }
        // Identity may be revoked while the final funding-policy read is pending.
        if (!await context.isTaskAuthorityCurrent!() || !isReadyToDispatch()) {
          diagnose('authority_or_policy_unavailable'); return false;
        }
      }
      return true;
    } catch { diagnose('preparation_exception'); return false; }
  };
  try {
    if (!await current() || !isReadyToDispatch()) return null;
    const costMicros = fundingProof ? dialogueCostCeilingMicros(fundingProof, profile, Date.now(), pricing) : null;
    if (fundingProof && costMicros === null) { diagnose('cost_ceiling_unavailable'); return null; }
    const attemptId = randomUUID();
    reservationState = 'unknown';
    const reservation = funded && fundingProof && costMicros !== null
      ? funded.admission.reserve({ policyId: 'task217-existing-credit-v2', attemptId, requestId: funded.requestId, stage: request.capability,
        subject: actor.actorId, ...dialogueDay(now), nowMs: now, proof: fundingProof, costMicros,
        inputTokens: profile.measurement.inputTokenCeiling, outputTokens: profile.measurement.outputTokenCeiling, limits: policy.daily,
        ...(pricing ? { pricing: { observation: pricing, profileSha256: durableProfileSha256(profile) } } : {}) }, bounded)
        .then(result => {
          if (result.kind !== 'admitted' || result.attemptId !== attemptId) return 'denied' as const;
          reservationState = 'accepted';
          if ('limitedOperation' in fundingProof) {
            const deadline = result.pricingExpiresAtMs;
            if (typeof deadline !== 'number' || !Number.isSafeInteger(deadline) || deadline <= Date.now()) return 'denied' as const;
            end = Math.min(end, deadline);
            bounded = AbortSignal.any([bounded, AbortSignal.timeout(Math.max(1, end - Date.now()))]);
          }
          return 'admitted' as const;
        })
      : policy.admission!.reserve({
        policyId: 'task217-public-free-v1', subject: actor.actorId, ...dialogueDay(now), nowMs: now,
        provider: profile.provider, model: profile.measurement.model, proof: proof as FreeDialogueProof,
        inputTokens: profile.measurement.inputTokenCeiling, outputTokens: profile.measurement.outputTokenCeiling, limits: policy.daily,
      }, bounded);
    const stopped = new Promise<'denied'>(resolve => {
      if (bounded.aborted) resolve('denied');
      else bounded.addEventListener('abort', () => resolve('denied'), { once: true });
    });
    if (await Promise.race([reservation, stopped]) !== 'admitted') { diagnose('admission_unavailable'); return null; }
    reservationState = 'accepted';
    if (!await current() || !isReadyToDispatch()) return null;
    return { profile, credentialSha256: proof.credentialSha256, limits: policy.limits, standardBilling: fundingProof?.mode === 'existing-credit' || fundingProof?.mode === 'bounded-account-charge',
      ...(fundingProof?.mode === 'bounded-account-charge' ? { acceptExpiredMeasurement: accepts } : {}),
      ...request, deadlineAtMs: end, signal: bounded, isCurrent: current, isReadyToDispatch };
  } catch { diagnose('preparation_exception'); return null; }
}
export async function preparePublicAgentDialogue(input: Input, core: Reply, policy: AgentDialoguePolicy, deadlineAtMs: number, signal?: AbortSignal,
  responseContract: AgentDialogueResponseContract = 'general-travel'): Promise<PreparedPublicDialogue | null> {
  if (input.intent?.tool !== 'discover' || agentIntent(input.message).tool !== 'discover' || input.trip
    || core.agent.tool !== 'discover' || core.agent.mutations !== 0 || core.provider !== 'local') return null;
  const units = core.answer.split(/\n\n+/).filter(Boolean);
  if (!units.length || units.length > 32 || units.some(unit => unit.length > 4000)) return null;
  const subject = input.context.taskAuthority?.kind === 'customer' ? input.context.taskAuthority.actorId : '';
  const general = responseContract === 'general-travel'
    ? generalTravelContext(subject ? input.message.replaceAll(subject, '[redacted]') : input.message, input.history) : null;
  const payload = general ? { language: input.locale, general } : { language: input.locale, units };
  const prepared = await prepareRuntimeAgentProviderAttempt(input.context, input.locale, policy, {
    capability: 'discover', message: JSON.stringify(payload), prompt: general ? GENERAL_TRAVEL_PROMPT : AGENT_DIALOGUE_PROMPT, inputDigestValue: payload,
  }, deadlineAtMs, signal);
  return prepared ? { ...prepared, units, requiredUnits: coreRequiredDialogueUnits(core), mode: general ? 'general-travel' : 'core-composition' } : null;
}
