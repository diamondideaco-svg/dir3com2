import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadFundingMeasurement, type FundingRpc } from '../lib/dabra/dialogue-funding-store';
import { FIRST_PROFILE_CASES, FIRST_PROFILE_CASE_SET_SHA, measureFirstProfile, type ApprovedFirstProfilePlan, type MeasurementDependencies } from '../lib/dabra/agent-measurement';
import { PUBLIC_DIALOGUE_DAILY_LIMITS } from '../lib/dabra/agent-dialogue';
import { fundingSubject } from '../lib/dabra/dialogue-funding';
import { callInternalAgentProvider } from '../lib/ai2/runtime/agent-provider-dispatch';
import assert from 'node:assert/strict';
import { APPROVED_DIALOGUE_STANDARD_PRICING } from '../lib/dabra/dialogue-pricing-approvals';
import { quoteDialogueFunding, dialogueCostCeilingMicros, type DialogueFundingProof } from '../lib/dabra/dialogue-funding';
import type { AgentCapabilityProfile, AgentProviderId } from '../lib/dabra/agent-capabilities';

// Synthetic observations only. No live account, financial approval, credential or provider request.
const now = Date.parse('2026-11-01T15:00:00Z');
const marker = { schema: 'task217-seven-provider-pilot-v1', id: 'task217-text-pilot-2026-11-01', maxCostMicros: 1000000, maxAttempts: 28 };
function fixture(provider: AgentProviderId, extra = 0) {
  const rate = APPROVED_DIALOGUE_STANDARD_PRICING.find(r => r.provider === provider);
  assert.ok(rate, 'reviewed current semantic tariff for ' + provider);
  return { grantId: '11111111-1111-4111-8111-111111111111', provider, model: rate.model, environment: 'provider-benchmark',
    accountId: 'SYNTHETIC-account', projectId: 'SYNTHETIC-project', evidenceSha256: 'a'.repeat(64), credentialSha256: 'b'.repeat(64),
    verifiedAtMs: now - 1000, expiresAtMs: now + 600000, quotaWindowStartMs: now - 10000, quotaWindowEndMs: now + 1000000,
    remainingRequests: 4, remainingInputTokens: 16384, remainingOutputTokens: 4096,
    autoReload: 'off', postpaid: 'blocked', overdraft: 'blocked', concurrentAccountUsage: 'bounded',
    mode: 'existing-credit', currency: 'USD', serviceTier: 'standard', pricing: 'standard-2026-10-28',
    authorizedCreditMicros: 1000000, remainingCreditMicros: 1000000,
    pilotEnvelope: marker, measurementPermit: { synthetic: true }, pricingEvidenceSha256: rate.sha256,
    pricingVerification: { schema: 'standard-pricing-verification-v1', snapshotSha256: rate.sha256, sourceUrl: rate.sourceUrl,
      inputMicrosPerMillion: rate.inputMicrosPerMillion, outputMicrosPerMillion: rate.outputMicrosPerMillion,
      observedAtMs: now - 1000, evidenceSha256: 'c'.repeat(64) },
    allInChargeBound: { schema: 'all-in-charge-bound-v1', currency: 'USD', coverage: 'all-applicable-api-charges',
      maxAdditionalMicros: extra, observedAtMs: now - 1000, evidenceSha256: 'd'.repeat(64) },
  } as const;
}
function quote(proof: DialogueFundingProof) {
  return quoteDialogueFunding(proof, { provider: proof.provider, model: proof.model, environment: proof.environment,
    inputTokenCeiling: 4096, outputTokenCeiling: 1024 }, now);
}
const five = ['gemini','xai','deepseek','qwen','mistral'] as const;
for (const provider of five) test(provider + ' paid-credit pilot has an exact reviewed quote', () => {
  const proof = fixture(provider), rate = APPROVED_DIALOGUE_STANDARD_PRICING.find(r => r.provider === provider)!;
  assert.equal(quote(proof), Math.ceil((4096 * rate.inputMicrosPerMillion + 1024 * rate.outputMicrosPerMillion) / 1000000));
  assert.equal(quote({ ...proof, pilotEnvelope: undefined }), null);
});
test('pilot rejects missing all-in evidence and adds evidenced upper bound to true tariff', () => {
  const p = fixture('anthropic');
  assert.equal(quote({ ...p, allInChargeBound: undefined }), null);
  assert.equal(quote(fixture('anthropic', 700)), quote(p)! + 700);
});
test('pilot cannot be used by ordinary qualified-profile path', () => {
  const p = fixture('anthropic');
  const profile: AgentCapabilityProfile = { provider: p.provider, measurement: { model: p.model, environment: p.environment,
    sourceSha: 'f'.repeat(40), caseSetSha: 'e'.repeat(64), capability: 'discover', language: 'en', cases: 1, passed: 1,
    measuredAtMs: now - 1000, expiresAtMs: now + 600000, latencyMs: 1, inputTokenCeiling: 4096, outputTokenCeiling: 1024, costCeilingUsd: 1 } };
  assert.equal(dialogueCostCeilingMicros(p, profile, now), null);
});

for (const provider of ['openai','anthropic',...five] as const) test(provider + ' loader uses exact stored pilot and rejects missing envelope', async t => {
  t.mock.method(Date, 'now', () => now);
  const subject = 'SYNTHETIC-pilot-' + provider, planId = '22222222-2222-4222-8222-222222222222', sourceSha = 'f'.repeat(40);
  const permit = { schema: 'task217-first-profile-v1', planId, sourceSha, caseSetSha: FIRST_PROFILE_CASE_SET_SHA,
    subjectHash: fundingSubject(subject), expiresAtMs: now + 600000, inputTokenCeiling: 4096, outputTokenCeiling: 1024,
    cases: FIRST_PROFILE_CASES.map((c,i) => ({ caseId: c.caseId, stage: c.stage, language: c.language, requestId: '00000000-0000-4000-8000-00000000000' + i })) };
  const proof = { ...fixture(provider), measurementPermit: permit };
  let stored: unknown = proof;
  const rpc: FundingRpc = async () => ({ error: null, data: { enabled: true, profiles: [], proofs: [stored],
    maxCostMicros: 1000000, dailyLimits: PUBLIC_DIALOGUE_DAILY_LIMITS } });
  const signal = new AbortController().signal;
  assert.ok(await loadFundingMeasurement(subject, planId, sourceSha, signal, rpc));
  for (const value of [{ ...proof, pilotEnvelope: undefined }, { ...proof, allInChargeBound: undefined },
    { ...proof, credentialSha256: 'unknown' }, { ...proof, pricingVerification: undefined },
    { ...proof, pilotEnvelope: { ...marker, id: 'caller-budget' } }]) {
    stored = value; assert.equal(await loadFundingMeasurement(subject, planId, sourceSha, signal, rpc), null);
  }
});
test('all-in bound rejects stale, unknown, inflated, malformed or unbound observations', () => {
  const p = fixture('anthropic');
  for (const bound of [null, {}, { ...p.allInChargeBound, maxAdditionalMicros: -1 },
    { ...p.allInChargeBound, maxAdditionalMicros: 1000001 }, { ...p.allInChargeBound, maxAdditionalMicros: 0.5 },
    { ...p.allInChargeBound, currency: 'EUR' }, { ...p.allInChargeBound, coverage: 'unknown' },
    { ...p.allInChargeBound, observedAtMs: now }, { ...p.allInChargeBound, observedAtMs: now - 3600000 },
    { ...p.allInChargeBound, evidenceSha256: 'unknown' }]) assert.equal(quote({ ...p, allInChargeBound: bound }), null);
  assert.equal(quote({ ...fixture('anthropic', 999999), remainingCreditMicros: 500000 }), null);
});
test('measurement model pin does not change ordinary ENV or require discovery', () => {
  const source = readFileSync(new URL('../lib/ai2/runtime/agent-provider-dispatch.ts', import.meta.url), 'utf8');
  const mod = { exports: {} }; const syntheticEnv = { OPENAI_API_KEY: 'SYNTHETIC-KEY', DABRA_INTERNAL_AI_MODEL: 'gpt-5', GEMINI_API_KEY: 'SYNTHETIC-KEY' };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module: mod, exports: mod.exports, require: () => ({}), process: { env: syntheticEnv } });
  const api = mod.exports as typeof import('../lib/ai2/runtime/agent-provider-dispatch');
  assert.equal(api.internalAgentConfiguration('openai')?.model, 'gpt-5');
  assert.equal(api.internalAgentConfiguration('openai', 'gpt-6-luna')?.model, 'gpt-6-luna');
  assert.equal(api.internalAgentConfiguration('gemini'), null);
  assert.equal(api.internalAgentConfiguration('gemini', 'gemini-3.8-flash')?.model, 'gemini-3.8-flash');
  assert.equal(api.internalAgentConfiguration('gemini', 'https://untrusted.invalid'), null);
  assert.equal(syntheticEnv.DABRA_INTERNAL_AI_MODEL, 'gpt-5');
});
test('exact Luna pilot request bounds total completion and preserves ordinary encoding, no tools/retries', async t => {
  const seen: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    const body: unknown = JSON.parse(String(init?.body));
    assert.ok(body && typeof body === 'object' && !Array.isArray(body));
    seen.push(body as Record<string, unknown>);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"tool":"weather"}' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }), { status: 200 });
  });
  const opts = { prompt: 'SYNTHETIC public case', language: 'en' as const, timeoutMs: 1000, standardBilling: true, classifier: true };
  await callInternalAgentProvider('openai', { apiKey: 'SYNTHETIC-KEY', model: 'gpt-6-luna' }, 'SYNTHETIC', { ...opts, pilotMeasurement: true, maxOutputTokens: 2048 });
  await callInternalAgentProvider('openai', { apiKey: 'SYNTHETIC-KEY', model: 'gpt-5' }, 'SYNTHETIC', { ...opts, maxOutputTokens: 128 });
  await callInternalAgentProvider('openai', { apiKey: 'SYNTHETIC-KEY', model: 'gpt-6-luna' }, 'SYNTHETIC', { ...opts, maxOutputTokens: 128 });
  assert.equal(seen.length, 3);
  assert.equal(seen[0].reasoning_effort, 'none'); assert.equal(seen[0].max_completion_tokens, 1024);
  assert.equal(seen[0].temperature, undefined); assert.equal(seen[0].max_tokens, undefined); assert.equal(seen[0].service_tier, 'default');
  assert.equal(seen[1].reasoning_effort, 'minimal'); assert.equal(seen[1].max_completion_tokens, 128);
  assert.equal(seen[2].temperature, 0); assert.equal(seen[2].max_tokens, 128);
  for (const body of seen) { assert.equal(body.tools, undefined); assert.equal(body.web_search, undefined); }
});

function measurementPlan(provider: AgentProviderId): ApprovedFirstProfilePlan {
  const subject = 'SYNTHETIC-pilot-' + provider;
  const permit = { schema: 'task217-first-profile-v1' as const, planId: '22222222-2222-4222-8222-222222222222', sourceSha: 'f'.repeat(40),
    caseSetSha: FIRST_PROFILE_CASE_SET_SHA, subjectHash: fundingSubject(subject), expiresAtMs: now + 600000,
    inputTokenCeiling: 4096, outputTokenCeiling: 1024,
    cases: FIRST_PROFILE_CASES.map((c,i) => ({ caseId: c.caseId, stage: c.stage, language: c.language, requestId: '00000000-0000-4000-8000-00000000000' + i })) };
  return { subject, permit, daily: PUBLIC_DIALOGUE_DAILY_LIMITS, maxCostMicros: 1000000,
    proof: { ...fixture(provider, 700), measurementPermit: permit, credentialSha256: createHash('sha256').update('SYNTHETIC-KEY').digest('hex') } };
}
for (const unknown of [false,true]) test('pilot measurement pins stored model and reserves all-in before dispatch, unknown=' + unknown, async t => {
  t.mock.method(Date, 'now', () => now);
  const plan = measurementPlan('openai'); let held = 0, claims = 0, dispatches = 0;
  // Synthetic serial seam only. Lifetime races/holds are tested by the real isolated PostgreSQL delta.
  const dependencies: MeasurementDependencies = {
    sourceSha: () => plan.permit.sourceSha, authorityCurrent: async () => true,
    configuration: (provider, approvedModel) => {
      assert.equal(provider, plan.proof.provider); assert.equal(approvedModel, plan.proof.model);
      return { apiKey: 'SYNTHETIC-KEY', model: approvedModel! };
    },
    admission: { reserve: async r => {
      claims++; held += r.costMicros; assert.equal(r.costMicros, quote(plan.proof));
      assert.equal(r.proof, plan.proof); assert.equal(r.measurementRequest?.planId, plan.permit.planId);
      return unknown ? { kind: 'denied' } : { kind: 'admitted', attemptId: r.attemptId };
    } },
    dispatch: async (provider, config, message, options) => {
      const fixed = FIRST_PROFILE_CASES[dispatches++];
      assert.equal(provider, plan.proof.provider); assert.equal(config.model, plan.proof.model);
      assert.equal(message, fixed.message); assert.equal(options.prompt, fixed.prompt);
      assert.equal(options.pilotMeasurement, true); assert.equal(options.maxOutputTokens, 1024); assert.equal(options.standardBilling, true);
      return { ok: true, model: config.model, citations: [], inputTokens: 100, outputTokens: 50,
        answer: options.classifier ? JSON.stringify({ tool: options.language === 'ar' ? 'weather' : 'maps' })
          : JSON.stringify({ kind: 'general-travel', advice: options.language === 'ar'
            ? 'رتّب حقيبة السفر بأغراض خفيفة، وخذ فترات راحة في الظل مع الأطفال. هل تفضّلون نشاطًا داخليًا أم خارجيًا؟'
            : 'Pack a light bag and plan quiet rest breaks in the shade with children. Would you prefer an indoor or outdoor stop?' }) };
    },
  };
  const result = await measureFirstProfile(plan, dependencies);
  assert.equal(result.kind, unknown ? 'stopped' : 'candidate'); assert.equal(result.qualified, false);
  assert.equal(claims, unknown ? 1 : 4); assert.equal(dispatches, unknown ? 0 : 4);
  assert.equal(held, quote(plan.proof)! * claims); assert.equal(result.observations.length, dispatches);
});
