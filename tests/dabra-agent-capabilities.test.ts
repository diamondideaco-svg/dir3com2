import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_PROVIDER_IDS, APPROVED_AGENT_CAPABILITY_PROFILES, selectQualifiedAgentCapability, type AgentCapabilityProfile, type AgentProviderId } from '../lib/dabra/agent-capabilities';
import { AGENT_PRODUCT_ROLES, agentProductRole } from '../lib/dabra/agent-contract';
const now = 1000000;
const limits = { maxAttempts: 1, maxElapsedMs: 1000, maxInputTokens: 100, maxOutputTokens: 50, maxCostUsd: 0.01 };
function profile(provider: AgentProviderId, latencyMs = 20): AgentCapabilityProfile {
  return { provider, measurement: { capability: 'intent.classify', language: 'ar', model: 'measured-model',
    environment: 'synthetic', caseSetSha: 'a'.repeat(64), sourceSha: 'b'.repeat(40), cases: 5, passed: 5,
    measuredAtMs: now - 100, expiresAtMs: now + 10000, latencyMs, inputTokenCeiling: 50, outputTokenCeiling: 10, costCeilingUsd: 0.001 } };
}
const request = { capability: 'intent.classify' as const, language: 'ar' as const, environment: 'synthetic' as const, nowMs: now, limits };
test('Task217: five product responsibilities and seven providers are separate domains', () => {
  assert.equal(AGENT_PRODUCT_ROLES.length, 5); assert.equal(AGENT_PROVIDER_IDS.length, 7);
  assert.deepEqual(['discover','support','call_center','operations','executive'].map(t => agentProductRole(t === 'discover' ? 'discover' : t === 'support' ? 'support' : t === 'call_center' ? 'call_center' : t === 'operations' ? 'operations' : 'executive')), [...AGENT_PRODUCT_ROLES]);
  assert.equal(APPROVED_AGENT_CAPABILITY_PROFILES.length, 0);
  assert.deepEqual(selectQualifiedAgentCapability(APPROVED_AGENT_CAPABILITY_PROFILES, request), { kind: 'blocked', reason: 'unqualified' });
});
for (const provider of AGENT_PROVIDER_IDS) test('Task217: measured local eligibility for ' + provider + ' does not qualify live execution', () => {
  const result = selectQualifiedAgentCapability([profile(provider)], request);
  assert.equal(result.kind, 'selected'); if (result.kind === 'selected') assert.equal(result.destination.provider, provider);
  assert.deepEqual(selectQualifiedAgentCapability([profile(provider)], { ...request, environment: 'provider-benchmark' }), { kind: 'blocked', reason: 'unqualified' });
});
test('Task217: case evidence, language, model and freshness fail closed', () => {
  const p = profile('qwen');
  for (const measurement of [{ ...p.measurement, passed: 4 }, { ...p.measurement, cases: 0, passed: 0 },
    { ...p.measurement, sourceSha: 'not-evidence' }, { ...p.measurement, expiresAtMs: now },
    { ...p.measurement, measuredAtMs: now + 1 }, { ...p.measurement, model: 'https://untrusted.example/anything?a=b' },
    { ...p.measurement, costCeilingUsd: NaN }]) {
    assert.equal(selectQualifiedAgentCapability([{ ...p, measurement }], request).kind, 'blocked');
  }
  assert.equal(selectQualifiedAgentCapability([p], { ...request, language: 'en' }).kind, 'blocked');
});
test('Task217: measured selection is deterministic and does not prefer a vendor name', () => {
  const profiles = AGENT_PROVIDER_IDS.map((p, i) => profile(p, p === 'qwen' ? 1 : 100 + i));
  for (const order of [profiles, [...profiles].reverse()]) {
    const result = selectQualifiedAgentCapability(order, request); assert.equal(result.kind, 'selected');
    if (result.kind === 'selected') assert.equal(result.destination.provider, 'qwen');
  }
  const expensive = profile('mistral');
  assert.deepEqual(selectQualifiedAgentCapability([expensive], { ...request, limits: { ...limits, maxCostUsd: 0 } }), { kind: 'blocked', reason: 'budget' });
});
test('Task217: a selected evidence snapshot cannot be changed through the source profile', () => {
  const measurement = { ...profile('gemini').measurement };
  const selected = selectQualifiedAgentCapability([{ provider: 'gemini', measurement }], request);
  measurement.model = 'tampered-model'; assert.equal(selected.kind, 'selected');
  if (selected.kind === 'selected') assert.equal(selected.destination.measurement.model, 'measured-model');
});
