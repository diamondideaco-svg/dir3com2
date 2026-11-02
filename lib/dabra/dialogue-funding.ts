import 'server-only';
import { createHash } from 'node:crypto';
import { APPROVED_DIALOGUE_STANDARD_PRICING } from './dialogue-pricing-approvals';
import type { AgentCapabilityProfile, AgentProviderId, CapabilityMeasurement } from './agent-capabilities';
import type { DialogueDailyLimits } from './agent-dialogue';

export type DialogueFundingCeilings = Readonly<{
  provider: AgentProviderId; model: string; environment: CapabilityMeasurement['environment'];
  inputTokenCeiling: number; outputTokenCeiling: number;
}>;
type EvidenceBase = Readonly<{
  measurementPermit?: unknown; pilotEnvelope?: unknown; allInChargeBound?: unknown;
  grantId: string; provider: AgentProviderId; model: string; environment: CapabilityMeasurement['environment'];
  accountId: string; projectId: string; evidenceSha256: string; credentialSha256: string;
  verifiedAtMs: number; expiresAtMs: number; quotaWindowStartMs: number; quotaWindowEndMs: number;
  remainingRequests: number; remainingInputTokens: number; remainingOutputTokens: number;
  autoReload: 'off' | 'on' | 'unknown'; postpaid: 'blocked' | 'allowed' | 'unknown';
  overdraft: 'blocked' | 'allowed' | 'unknown'; concurrentAccountUsage: 'bounded' | 'unknown';
}>;
export type DialogueFundingProof = EvidenceBase & (
  | Readonly<{ mode: 'existing-credit'; provider: AgentProviderId; currency: 'USD';
      authorizedCreditMicros: number; remainingCreditMicros: number; pricing: 'standard-2026-10-28' | 'synthetic';
      serviceTier: 'standard'; pricingEvidenceSha256?: unknown; pricingVerification?: unknown; }>
  | Readonly<{ mode: 'no-new-charge'; provider: Exclude<AgentProviderId, 'openai' | 'anthropic'>;
      enforcement: 'provider-hard-no-new-charge'; }>
);
export type FundedDialogueReservation = Readonly<{
  policyId: 'task217-existing-credit-v2'; attemptId: string; requestId: string;
  measurementRequest?: Readonly<{ planId: string; caseId: string }>;
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
export const fundingSubject = (subject: string) => createHash('sha256').update('task217-dialogue:' + subject).digest('hex');
/** Fixed experiment identity, not an approval supplied by a caller. RPC requires exact stored proof. */
export const TASK217_PILOT_ENVELOPE = Object.freeze({
  schema: 'task217-seven-provider-pilot-v1', id: 'task217-text-pilot-2026-11-01', maxCostMicros: 1000000, maxAttempts: 28,
} as const);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validTask217PilotEnvelope(value: unknown): value is typeof TASK217_PILOT_ENVELOPE {
  return object(value) && Object.keys(value).length === 4
    && Object.entries(TASK217_PILOT_ENVELOPE).every(([key, expected]) => Object.hasOwn(value, key) && value[key] === expected);
}
function additionalPilotCost(proof: DialogueFundingProof): number | null {
  if (!('pilotEnvelope' in proof)) return 0;
  const v = proof.allInChargeBound;
  if (!validTask217PilotEnvelope(proof.pilotEnvelope) || !object(v) || Object.keys(v).length !== 6
    || v.schema !== 'all-in-charge-bound-v1' || v.currency !== 'USD' || v.coverage !== 'all-applicable-api-charges'
    || typeof v.maxAdditionalMicros !== 'number' || !count(v.maxAdditionalMicros) || v.maxAdditionalMicros > 1000000
    || typeof v.observedAtMs !== 'number' || !count(v.observedAtMs) || v.observedAtMs > proof.verifiedAtMs
    || proof.expiresAtMs - v.observedAtMs > 3600000
    || typeof v.evidenceSha256 !== 'string' || !digest.test(v.evidenceSha256)) return null;
  return v.maxAdditionalMicros;
}
/** Financial identity/ceilings, deliberately independent from capability qualification. */
export function fundingProofForCeilings(proof: DialogueFundingProof, m: DialogueFundingCeilings, now: number) {
  const pilot = validTask217PilotEnvelope(proof.pilotEnvelope);
  if (!count(now) || !count(m.inputTokenCeiling) || m.inputTokenCeiling < 1 || m.inputTokenCeiling > 4096
    || !count(m.outputTokenCeiling) || m.outputTokenCeiling < 1 || m.outputTokenCeiling > 1024
    || !uuid.test(proof.grantId) || proof.provider !== m.provider || proof.model !== m.model || proof.environment !== m.environment
    || !identifier.test(proof.accountId) || !identifier.test(proof.projectId)
    || !digest.test(proof.evidenceSha256) || !digest.test(proof.credentialSha256)
    || !Number.isSafeInteger(proof.verifiedAtMs) || proof.verifiedAtMs > now
    || !Number.isSafeInteger(proof.expiresAtMs) || proof.expiresAtMs <= now
    || proof.expiresAtMs <= proof.verifiedAtMs || proof.expiresAtMs - proof.verifiedAtMs > 3600000
    || !Number.isSafeInteger(proof.quotaWindowStartMs) || proof.quotaWindowStartMs > now
    || !Number.isSafeInteger(proof.quotaWindowEndMs) || proof.quotaWindowEndMs <= now
    || proof.autoReload !== 'off'
    || !['blocked', 'allowed', 'unknown'].includes(proof.postpaid)
    || !['blocked', 'allowed', 'unknown'].includes(proof.overdraft)
    || !['bounded', 'unknown'].includes(proof.concurrentAccountUsage)
    // Pilot reservations bound this experiment, not all use of the provider account.
    // Keep truthful account observations; ordinary dialogue retains its stronger requirements.
    || (!pilot && (proof.postpaid !== 'blocked' || proof.overdraft !== 'blocked' || proof.concurrentAccountUsage !== 'bounded'))
    || !count(proof.remainingRequests) || proof.remainingRequests < 1
    || !count(proof.remainingInputTokens) || proof.remainingInputTokens < m.inputTokenCeiling
    || !count(proof.remainingOutputTokens) || proof.remainingOutputTokens < m.outputTokenCeiling) return false;
  if ('pilotEnvelope' in proof && (!pilot || proof.mode !== 'existing-credit'
    || proof.environment !== 'provider-benchmark' || !object(proof.measurementPermit))) return false;
  if (proof.mode === 'existing-credit') return (['openai','anthropic'].includes(proof.provider)
    || (validTask217PilotEnvelope(proof.pilotEnvelope) && object(proof.measurementPermit)))
    && proof.currency === 'USD' && proof.serviceTier === 'standard'
    && count(proof.authorizedCreditMicros) && proof.authorizedCreditMicros > 0
    && count(proof.remainingCreditMicros);
  return !['openai', 'anthropic'].includes(proof.provider) && proof.mode === 'no-new-charge'
    && proof.enforcement === 'provider-hard-no-new-charge';
}
export function fundingProofCurrent(proof: DialogueFundingProof, profile: AgentCapabilityProfile, now: number) {
  return fundingProofForCeilings(proof, { ...profile.measurement, provider: profile.provider }, now);
}
/** A caller can name evidence, but only the compiled server registry can approve it. */
function reviewedStandardRates(reference: unknown, proof: Extract<DialogueFundingProof, { mode: 'existing-credit' }>, now: number) {
  if (typeof reference !== 'string' || !digest.test(reference) || !count(now)) return undefined;
  const matches = APPROVED_DIALOGUE_STANDARD_PRICING.filter(r => r && r.sha256 === reference);
  if (matches.length !== 1) return undefined;
  const r = matches[0];
  if (r.provider !== proof.provider || r.model !== proof.model || typeof r.model !== 'string'
    || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(r.model)
    || r.serviceTier !== 'standard' || r.currency !== 'USD'
    || !count(r.inputMicrosPerMillion) || !count(r.outputMicrosPerMillion)
    || (r.inputMicrosPerMillion === 0 && r.outputMicrosPerMillion === 0)
    || typeof r.sourceUrl !== 'string') return undefined;
  let url: URL;
  try { url = new URL(r.sourceUrl); } catch { return undefined; }
  const officialHosts = { openai: 'developers.openai.com', anthropic: 'platform.claude.com', gemini: 'ai.google.dev',
    xai: 'docs.x.ai', deepseek: 'api-docs.deepseek.com', qwen: 'www.alibabacloud.com', mistral: 'docs.mistral.ai' };
  const officialHost = officialHosts[proof.provider];
  if (url.protocol !== 'https:' || url.hostname !== officialHost || url.port
    || url.username || url.password || url.search || url.hash) return undefined;
  if (r.schema === 'reviewed-standard-pricing-v2') {
    // This observation is part of the existing exact server-stored grant proof;
    // caller JSON, an official URL or a fresh financial timestamp cannot mint it.
    const v = proof.pricingVerification;
    const record = (value: unknown): value is Record<string, unknown> =>
      value !== null && typeof value === 'object' && !Array.isArray(value);
    if (Object.keys(r).length !== 9 || !record(v) || Object.keys(v).length !== 7
      || v.schema !== 'standard-pricing-verification-v1' || v.snapshotSha256 !== reference
      || v.sourceUrl !== r.sourceUrl || v.inputMicrosPerMillion !== r.inputMicrosPerMillion
      || v.outputMicrosPerMillion !== r.outputMicrosPerMillion
      || typeof v.observedAtMs !== 'number' || !count(v.observedAtMs) || v.observedAtMs > proof.verifiedAtMs
      || proof.expiresAtMs - v.observedAtMs > 3600000
      || typeof v.evidenceSha256 !== 'string' || !digest.test(v.evidenceSha256)
      || v.evidenceSha256 === reference) return undefined;
    // Reuse the financial proof's verifiedAt/expiresAt rather than opening a
    // second expiry window. A financial refresh alone cannot refresh old prices.
    const fingerprint = createHash('sha256').update(JSON.stringify([
      r.schema, r.provider, r.model, r.serviceTier, r.currency,
      r.inputMicrosPerMillion, r.outputMicrosPerMillion, r.sourceUrl,
    ])).digest('hex');
    return fingerprint === reference ? r : undefined;
  }
  // Preserve v1's exact original time-bound validation and fingerprint.
  if (r.schema !== 'reviewed-standard-pricing-v1' || Object.keys(r).length !== 12
    || !count(r.observedAtMs) || !count(r.validFromMs) || !count(r.expiresAtMs)
    || r.observedAtMs > r.validFromMs || r.validFromMs > now || r.expiresAtMs <= now
    || r.expiresAtMs <= r.validFromMs || r.expiresAtMs - r.observedAtMs > 3600000) return undefined;
  const fingerprint = createHash('sha256').update(JSON.stringify([
    r.schema, r.provider, r.model, r.serviceTier, r.currency, r.inputMicrosPerMillion, r.outputMicrosPerMillion,
    r.observedAtMs, r.validFromMs, r.expiresAtMs, r.sourceUrl,
  ])).digest('hex');
  return fingerprint === reference ? r : undefined;
}
export function quoteDialogueFunding(proof: DialogueFundingProof, m: DialogueFundingCeilings, now: number): number | null {
  if (!fundingProofForCeilings(proof, m, now)) return null;
  if (proof.mode === 'no-new-charge') return 0;
  // The old pricing string remains an RPC compatibility tag, not approval of a renewed tariff.
  // A present but invalid reference never falls back to historical or synthetic rates.
  const rates = 'pricingEvidenceSha256' in proof
    ? proof.pricing === 'standard-2026-10-28' ? reviewedStandardRates(proof.pricingEvidenceSha256, proof, now) : undefined
    : proof.pricing === 'synthetic' && proof.environment === 'synthetic' && proof.model === 'test-model'
      ? { inputMicrosPerMillion: 1000000, outputMicrosPerMillion: 2000000 }
      : proof.pricing === 'standard-2026-10-28' && now >= Date.parse('2026-10-28T00:00:00Z') && now < Date.parse('2026-10-29T00:00:00Z')
        ? DIALOGUE_STANDARD_RATE_REFERENCES.find(r => r.provider === proof.provider && r.model === proof.model) : undefined;
  if (!rates) return null;

  const numerator = BigInt(m.inputTokenCeiling) * BigInt(rates.inputMicrosPerMillion)
    + BigInt(m.outputTokenCeiling) * BigInt(rates.outputMicrosPerMillion);
  const extra = additionalPilotCost(proof);
  if (extra === null) return null;
  const cost = Number((numerator + BigInt(999999)) / BigInt(1000000) + BigInt(extra));
  if ('pilotEnvelope' in proof && cost > TASK217_PILOT_ENVELOPE.maxCostMicros) return null;
  return count(cost) && cost > 0 && cost <= proof.authorizedCreditMicros && cost <= proof.remainingCreditMicros
    ? cost : null;
}
/** Ordinary calls still select a real qualified profile before reaching this quote. */
export function dialogueCostCeilingMicros(proof: DialogueFundingProof, profile: AgentCapabilityProfile, now: number): number | null {
  if ('pilotEnvelope' in proof) return null; // Pilot funding cannot enable ordinary customer dialogue.
  const cost = quoteDialogueFunding(proof, { ...profile.measurement, provider: profile.provider }, now);
  return cost !== null && (proof.mode !== 'no-new-charge' || profile.measurement.costCeilingUsd === 0)
    && cost / 1000000 <= profile.measurement.costCeilingUsd ? cost : null;
}
export function validFundingRequestIdentity(binding: DialogueFundingBinding) { return uuid.test(binding.requestId); }

/** Validate persisted pilot limits without supplying active defaults for malformed server data. */
export function validFundingDailyLimits(value: unknown, inputCeiling: number, outputCeiling: number): value is DialogueDailyLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 7) return false;
  const {uniqueUsers,requestsPerUser,requestsTotal,inputTokensPerUser,outputTokensPerUser,inputTokensTotal,outputTokensTotal} = value as Record<string, unknown>;
  const positive = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
  return positive(uniqueUsers) && positive(requestsPerUser) && positive(requestsTotal)
    && positive(inputTokensPerUser) && positive(outputTokensPerUser) && positive(inputTokensTotal) && positive(outputTokensTotal)
    && uniqueUsers <= 20 && requestsPerUser <= 6 && requestsTotal <= 60 && requestsTotal <= uniqueUsers * requestsPerUser
    && inputTokensTotal <= 245760 && outputTokensTotal <= 61440
    && inputTokensPerUser <= requestsPerUser * inputCeiling && outputTokensPerUser <= requestsPerUser * outputCeiling
    && inputTokensTotal <= requestsTotal * inputCeiling && outputTokensTotal <= requestsTotal * outputCeiling;
}
