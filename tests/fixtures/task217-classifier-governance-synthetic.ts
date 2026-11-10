// TEST-ONLY governed classifier setup. All transports remain supplied by each test.
// Each policy owns isolated synthetic admission state; this is not a live quota store.
import { createHash } from 'node:crypto';
import type { AgentContext } from '../../lib/dabra/agent-contract';
import { AGENT_PROVIDER_IDS } from '../../lib/dabra/agent-capabilities';
import { PUBLIC_DIALOGUE_DAILY_LIMITS, type AgentDialoguePolicy, type DialogueAdmission, type DialogueReservation } from '../../lib/dabra/agent-dialogue';
import { internalAgentConfiguration } from '../../lib/ai2/runtime/agent-provider-dispatch';
import { syntheticContractMeasurement, withSyntheticOutputAcceptances } from './task217-output-qualification-synthetic';

export function syntheticClassifierContext(): AgentContext {
  return { role: 'customer', taskAuthority: { kind: 'customer', actorId: 'SYNTHETIC-classifier-customer', ownerId: 'SYNTHETIC-classifier-customer' },
    isTaskAuthorityCurrent: async () => true, readRequests: async () => { throw new Error('Unexpected account read'); } };
}
export class SyntheticClassifierAdmission implements DialogueAdmission {
  private claims: DialogueReservation[] = [];
  get reservations(): readonly DialogueReservation[] { return this.claims.slice(); }
  async reserve(r: DialogueReservation, signal: AbortSignal): Promise<'admitted' | 'denied'> {
    const at = Date.now();
    if (signal.aborted || at < r.dayStartMs || at >= r.dayEndMs || at >= r.proof.expiresAtMs
      || at < r.proof.quotaWindowStartMs || at >= r.proof.quotaWindowEndMs) return 'denied';
    const daily = this.claims.filter(row => row.dayStartMs === r.dayStartMs);
    const own = daily.filter(row => row.subject === r.subject);
    const quota = this.claims.filter(row => row.provider === r.provider && row.model === r.model
      && row.proof.accountId === r.proof.accountId && row.proof.projectId === r.proof.projectId
      && row.proof.quotaWindowStartMs === r.proof.quotaWindowStartMs && row.proof.quotaWindowEndMs === r.proof.quotaWindowEndMs);
    const sum = (rows: DialogueReservation[], key: 'inputTokens' | 'outputTokens') => rows.reduce((n, row) => n + row[key], 0);
    const subjects = new Set(daily.map(row => row.subject)), d = r.limits;
    if ((!subjects.has(r.subject) && subjects.size >= d.uniqueUsers) || own.length + 1 > d.requestsPerUser
      || daily.length + 1 > d.requestsTotal || sum(own, 'inputTokens') + r.inputTokens > d.inputTokensPerUser
      || sum(own, 'outputTokens') + r.outputTokens > d.outputTokensPerUser
      || sum(daily, 'inputTokens') + r.inputTokens > d.inputTokensTotal
      || sum(daily, 'outputTokens') + r.outputTokens > d.outputTokensTotal
      || quota.length + 1 > r.proof.remainingRequests || sum(quota, 'inputTokens') + r.inputTokens > r.proof.remainingInputTokens
      || sum(quota, 'outputTokens') + r.outputTokens > r.proof.remainingOutputTokens) return 'denied';
    this.claims.push(r);
    return 'admitted';
  }
}
export function syntheticClassifierPolicy(credential: string, admission: DialogueAdmission = new SyntheticClassifierAdmission()): AgentDialoguePolicy {
  const at = Date.now();
  const configured = AGENT_PROVIDER_IDS.flatMap(provider => {
    const config = internalAgentConfiguration(provider);
    // Never manufacture approval for an ambient real credential.
    return config?.apiKey === credential ? [{ provider, model: config.model }] : [];
  });
  return withSyntheticOutputAcceptances({
    trial: true, environment: 'synthetic',
    profiles: configured.flatMap(({ provider, model }) => (['ar', 'en'] as const).map(language => ({
      provider, measurement: { capability: 'intent.classify' as const, language, model, environment: 'synthetic' as const,
        ...syntheticContractMeasurement('intent.classify', language), sourceSha: 'b'.repeat(40),
        measuredAtMs: at - 1, expiresAtMs: at + 600000, latencyMs: 1, inputTokenCeiling: 4096, outputTokenCeiling: 700, costCeilingUsd: 0 },
    }))),
    freeProofs: configured.map(({ provider, model }) => ({ provider, model, environment: 'synthetic' as const,
      accountId: 'SYNTHETIC-account', projectId: 'SYNTHETIC-project', evidenceSha256: 'c'.repeat(64),
      credentialSha256: createHash('sha256').update(credential).digest('hex'), verifiedAtMs: at - 1, expiresAtMs: at + 600000,
      quotaWindowStartMs: at - 3600000, quotaWindowEndMs: at + 3600000, billingEnforcement: 'provider-hard-free-only' as const,
      paidFallback: false as const, remainingRequests: 1000, remainingInputTokens: 1000000, remainingOutputTokens: 1000000 })),
    limits: { maxAttempts: 1, maxElapsedMs: 12000, maxInputTokens: 4096, maxOutputTokens: 1024, maxCostUsd: 0 },
    daily: PUBLIC_DIALOGUE_DAILY_LIMITS, admission,
  }, at);
}
