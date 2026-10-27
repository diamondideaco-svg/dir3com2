import type { AgentCapability, AgentTaskLimits } from './agent-contract';

export const AGENT_PROVIDER_IDS = ['openai', 'gemini', 'anthropic', 'xai', 'deepseek', 'qwen', 'mistral'] as const;
export type AgentProviderId = typeof AGENT_PROVIDER_IDS[number];
export type CapabilityMeasurement = Readonly<{
  capability: AgentCapability; language: 'ar' | 'en'; model: string;
  environment: 'synthetic' | 'provider-benchmark';
  caseSetSha: string; sourceSha: string; cases: number; passed: number;
  measuredAtMs: number; expiresAtMs: number; latencyMs: number;
  inputTokenCeiling: number; outputTokenCeiling: number; costCeilingUsd: number;
}>;
export type AgentCapabilityProfile = Readonly<{ provider: AgentProviderId; measurement: CapabilityMeasurement }>;
export type QualifiedAgentDestination = Readonly<{
  kind: 'provider'; provider: AgentProviderId; measurement: CapabilityMeasurement;
}>;
export type CapabilitySelection =
  | { kind: 'selected'; destination: QualifiedAgentDestination }
  | { kind: 'blocked'; reason: 'unqualified' | 'budget' };

// No vendor is qualified by its name, adapter availability, or a synthetic fixture.
// A future live benchmark/profile change requires its own evidence and authority.
export const APPROVED_AGENT_CAPABILITY_PROFILES: readonly AgentCapabilityProfile[] = Object.freeze([]);
const digest = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
function nonnegative(value: number) { return Number.isFinite(value) && value >= 0; }
function qualified(profile: AgentCapabilityProfile, request: {
  capability: AgentCapability; language: 'ar' | 'en'; environment: CapabilityMeasurement['environment']; nowMs: number;
}) {
  const m = profile.measurement;
  return AGENT_PROVIDER_IDS.includes(profile.provider)
    && m.capability === request.capability && m.language === request.language && m.environment === request.environment
    && /^[a-zA-Z0-9._:/-]{1,120}$/.test(m.model)
    && digest.test(m.caseSetSha) && digest.test(m.sourceSha)
    && Number.isSafeInteger(m.cases) && m.cases > 0 && m.passed === m.cases
    && nonnegative(m.measuredAtMs) && m.measuredAtMs <= request.nowMs
    && Number.isFinite(m.expiresAtMs) && m.expiresAtMs > request.nowMs && m.expiresAtMs > m.measuredAtMs
    && nonnegative(m.latencyMs) && nonnegative(m.costCeilingUsd)
    && Number.isSafeInteger(m.inputTokenCeiling) && m.inputTokenCeiling >= 0
    && Number.isSafeInteger(m.outputTokenCeiling) && m.outputTokenCeiling >= 0;
}
export function selectQualifiedAgentCapability(
  profiles: readonly AgentCapabilityProfile[],
  request: {
    capability: AgentCapability; language: 'ar' | 'en';
    environment: CapabilityMeasurement['environment']; nowMs: number; limits: AgentTaskLimits;
  },
): CapabilitySelection {
  const measured = profiles.filter(profile => qualified(profile, request));
  if (!measured.length) return { kind: 'blocked', reason: 'unqualified' };
  const eligible = measured.filter(({ measurement: m }) =>
    m.latencyMs <= request.limits.maxElapsedMs
    && m.inputTokenCeiling <= request.limits.maxInputTokens
    && m.outputTokenCeiling <= request.limits.maxOutputTokens
    && m.costCeilingUsd <= request.limits.maxCostUsd);
  eligible.sort((a, b) => a.measurement.latencyMs - b.measurement.latencyMs
    || a.measurement.costCeilingUsd - b.measurement.costCeilingUsd || a.provider.localeCompare(b.provider));
  const chosen = eligible[0];
  if (!chosen) return { kind: 'blocked', reason: 'budget' };
  return { kind: 'selected', destination: Object.freeze({
    kind: 'provider', provider: chosen.provider, measurement: Object.freeze({ ...chosen.measurement }),
  }) };
}
