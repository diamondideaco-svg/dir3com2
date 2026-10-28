import 'server-only';
import type { AgentCapabilityProfile, AgentProviderId, CapabilityMeasurement } from './agent-capabilities';
import type { DialogueDailyLimits } from './agent-dialogue';

type EvidenceBase = Readonly<{
  grantId: string; provider: AgentProviderId; model: string; environment: CapabilityMeasurement['environment'];
  accountId: string; projectId: string; evidenceSha256: string; credentialSha256: string;
  verifiedAtMs: number; expiresAtMs: number; quotaWindowStartMs: number; quotaWindowEndMs: number;
  remainingRequests: number; remainingInputTokens: number; remainingOutputTokens: number;
  autoReload: 'off' | 'on' | 'unknown'; postpaid: 'blocked' | 'allowed' | 'unknown';
  overdraft: 'blocked' | 'allowed' | 'unknown'; concurrentAccountUsage: 'bounded' | 'unknown';
}>;
export type DialogueFundingProof = EvidenceBase & (
  | Readonly<{ mode: 'existing-credit'; provider: 'openai' | 'anthropic'; currency: 'USD';
      authorizedCreditMicros: number; remainingCreditMicros: number; pricing: 'standard-2026-10-28' | 'synthetic';
      serviceTier: 'standard'; }>
  | Readonly<{ mode: 'no-new-charge'; provider: Exclude<AgentProviderId, 'openai' | 'anthropic'>;
      enforcement: 'provider-hard-no-new-charge'; }>
);
export type FundedDialogueReservation = Readonly<{
  policyId: 'task217-existing-credit-v2'; attemptId: string; requestId: string;
  stage: 'discover' | 'intent.classify'; subject: string; nowMs: number; dayStartMs: number; dayEndMs: number;
  proof: DialogueFundingProof; inputTokens: number; outputTokens: number; costMicros: number; limits: DialogueDailyLimits;
}>;
export type FundingAdmissionResult =
  | Readonly<{ kind: 'admitted'; attemptId: string }>
  | Readonly<{ kind: 'denied' }>;
/** Atomic durable claim. Unknown outcomes are denied locally and are never retried or refunded. */
export interface FundingDialogueAdmission {
  reserve(request: FundedDialogueReservation, signal: AbortSignal): Promise<FundingAdmissionResult>;
}
export type DialogueFundingBinding = Readonly<{
  kind: 'existing-credit-v2'; requestId: string; proofs: readonly DialogueFundingProof[];
  admission: FundingDialogueAdmission;
}>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest = /^[a-f0-9]{64}$/;
const identifier = /^[a-zA-Z0-9:_-]{1,100}$/;
const count = (n: number) => Number.isSafeInteger(n) && n >= 0;
// Conditional public Standard tariff references only. These are NOT account/model bindings or credit grants.
// https://developers.openai.com/api/docs/models/gpt-5 (deprecated; no automatic replacement)
// https://platform.claude.com/docs/en/models/sonnet-5-5/overview
// No cache writes, tools, search, priority/Flex/Fast service or unbounded thinking is authorized here.
export const DIALOGUE_STANDARD_RATE_REFERENCES = Object.freeze([
  Object.freeze({ provider: 'openai', model: 'gpt-5', inputMicrosPerMillion: 1250000, outputMicrosPerMillion: 10000000,
    source: 'https://developers.openai.com/api/docs/models/gpt-5' }),
  Object.freeze({ provider: 'anthropic', model: 'claude-sonnet-5-5', inputMicrosPerMillion: 2000000, outputMicrosPerMillion: 10000000,
    source: 'https://platform.claude.com/docs/en/models/sonnet-5-5/overview' }),
]);
export function fundingProofCurrent(proof: DialogueFundingProof, profile: AgentCapabilityProfile, now: number) {
  const m = profile.measurement;
  if (!uuid.test(proof.grantId) || proof.provider !== profile.provider || proof.model !== m.model || proof.environment !== m.environment
    || !identifier.test(proof.accountId) || !identifier.test(proof.projectId)
    || !digest.test(proof.evidenceSha256) || !digest.test(proof.credentialSha256)
    || !Number.isSafeInteger(proof.verifiedAtMs) || proof.verifiedAtMs > now
    || !Number.isSafeInteger(proof.expiresAtMs) || proof.expiresAtMs <= now
    || proof.expiresAtMs <= proof.verifiedAtMs || proof.expiresAtMs - proof.verifiedAtMs > 3600000
    || !Number.isSafeInteger(proof.quotaWindowStartMs) || proof.quotaWindowStartMs > now
    || !Number.isSafeInteger(proof.quotaWindowEndMs) || proof.quotaWindowEndMs <= now
    || proof.autoReload !== 'off' || proof.postpaid !== 'blocked' || proof.overdraft !== 'blocked'
    || proof.concurrentAccountUsage !== 'bounded'
    || !count(proof.remainingRequests) || proof.remainingRequests < 1
    || !count(proof.remainingInputTokens) || proof.remainingInputTokens < m.inputTokenCeiling
    || !count(proof.remainingOutputTokens) || proof.remainingOutputTokens < m.outputTokenCeiling) return false;
  if (proof.mode === 'existing-credit') return (proof.provider === 'openai' || proof.provider === 'anthropic')
    && proof.currency === 'USD' && proof.serviceTier === 'standard'
    && count(proof.authorizedCreditMicros) && proof.authorizedCreditMicros > 0
    && count(proof.remainingCreditMicros);
  return !['openai', 'anthropic'].includes(proof.provider) && proof.mode === 'no-new-charge'
    && proof.enforcement === 'provider-hard-no-new-charge';
}
export function dialogueCostCeilingMicros(proof: DialogueFundingProof, profile: AgentCapabilityProfile, now: number): number | null {
  if (!fundingProofCurrent(proof, profile, now)) return null;
  if (proof.mode === 'no-new-charge') return profile.measurement.costCeilingUsd === 0 ? 0 : null;
  const rates = proof.pricing === 'synthetic' && proof.environment === 'synthetic' && proof.model === 'test-model'
    ? { inputMicrosPerMillion: 1000000, outputMicrosPerMillion: 2000000 }
    : proof.pricing === 'standard-2026-10-28' && now >= Date.parse('2026-10-28T00:00:00Z') && now < Date.parse('2026-10-29T00:00:00Z')
      ? DIALOGUE_STANDARD_RATE_REFERENCES.find(r => r.provider === proof.provider && r.model === proof.model) : undefined;
  if (!rates) return null;
  const m = profile.measurement;
  if (!count(m.inputTokenCeiling) || !count(m.outputTokenCeiling)) return null;
  const numerator = BigInt(m.inputTokenCeiling) * BigInt(rates.inputMicrosPerMillion)
    + BigInt(m.outputTokenCeiling) * BigInt(rates.outputMicrosPerMillion);
  const cost = Number((numerator + BigInt(999999)) / BigInt(1000000));
  return count(cost) && cost > 0 && cost <= proof.authorizedCreditMicros && cost <= proof.remainingCreditMicros
    && cost / 1000000 <= m.costCeilingUsd ? cost : null;
}
export function validFundingRequestIdentity(binding: DialogueFundingBinding) { return uuid.test(binding.requestId); }
