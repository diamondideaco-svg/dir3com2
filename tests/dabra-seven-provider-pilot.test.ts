import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadFundingMeasurement, createFundingDialogueAdmission, type FundingRpc } from '../lib/dabra/dialogue-funding-store';
import { FIRST_PROFILE_CASES, FIRST_PROFILE_CASE_SET_SHA, measureFirstProfile, type ApprovedFirstProfilePlan, type MeasurementDependencies } from '../lib/dabra/agent-measurement';
import { PUBLIC_DIALOGUE_DAILY_LIMITS } from '../lib/dabra/agent-dialogue';
import { fundingSubject } from '../lib/dabra/dialogue-funding';
import { callInternalAgentProvider } from '../lib/ai2/runtime/agent-provider-dispatch';
import assert from 'node:assert/strict';
import { APPROVED_DIALOGUE_STANDARD_PRICING } from '../lib/dabra/dialogue-pricing-approvals';
import { quoteDialogueFunding, dialogueCostCeilingMicros, fundingSnapshotBindings, fundingAuthorizationWindow, type FundedDialogueReservation, type DialogueFundingProof } from '../lib/dabra/dialogue-funding';
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

test('DeepSeek off-peak exact registry quote preserves peak pricing and funding boundaries', () => {
  const peak = fixture('deepseek');
  const offPeak = APPROVED_DIALOGUE_STANDARD_PRICING.find(r => r.provider === 'deepseek'
    && r.inputMicrosPerMillion === 150000 && r.outputMicrosPerMillion === 600000);
  assert.ok(offPeak, 'reviewed applicable off-peak tariff');
  assert.equal(offPeak.sha256, 'c7c88ce9f8f681e8bb6de4645cb9f31007a0624aa659bcc8044c68667c4b3af7');
  assert.equal(peak.pricingEvidenceSha256, '760a374be993aa01bd602bbdead31f1e58f642e473207e599816dc0790a28927');
  const proof: DialogueFundingProof = { ...peak, pricingEvidenceSha256: offPeak.sha256,
    pricingVerification: { ...peak.pricingVerification, snapshotSha256: offPeak.sha256,
      inputMicrosPerMillion: offPeak.inputMicrosPerMillion, outputMicrosPerMillion: offPeak.outputMicrosPerMillion } };
  assert.equal(quote(proof), 1229);
  assert.equal(quote(peak), 2458);
  assert.equal(quote({ ...proof, authorizedCreditMicros: 1228 }), null);
  assert.equal(quote({ ...proof, remainingCreditMicros: 1228 }), null);
  assert.equal(quote({ ...proof, allInChargeBound: { ...peak.allInChargeBound, maxAdditionalMicros: 700 } }), 1929);
  assert.equal(quote({ ...proof, allInChargeBound: undefined }), null);
  assert.equal(quote({ ...proof, pilotEnvelope: undefined }), null);
});

test('DeepSeek off-peak rejects crossed snapshots or rates and missing or forged observations', () => {
  const peak = fixture('deepseek');
  const offPeak = APPROVED_DIALOGUE_STANDARD_PRICING.find(r => r.provider === 'deepseek'
    && r.inputMicrosPerMillion === 150000 && r.outputMicrosPerMillion === 600000);
  assert.ok(offPeak, 'reviewed applicable off-peak tariff');
  const verification = { ...peak.pricingVerification, snapshotSha256: offPeak.sha256,
    inputMicrosPerMillion: offPeak.inputMicrosPerMillion, outputMicrosPerMillion: offPeak.outputMicrosPerMillion };
  const proof: DialogueFundingProof = { ...peak, pricingEvidenceSha256: offPeak.sha256, pricingVerification: verification };
  for (const invalid of [
    { ...proof, pricingEvidenceSha256: peak.pricingEvidenceSha256 },
    { ...peak, pricingEvidenceSha256: offPeak.sha256 },
    { ...proof, pricingVerification: { ...verification,
      inputMicrosPerMillion: peak.pricingVerification.inputMicrosPerMillion,
      outputMicrosPerMillion: peak.pricingVerification.outputMicrosPerMillion } },
    { ...peak, pricingVerification: { ...peak.pricingVerification,
      inputMicrosPerMillion: offPeak.inputMicrosPerMillion, outputMicrosPerMillion: offPeak.outputMicrosPerMillion } },
    { ...proof, pricingVerification: undefined },
    { ...proof, pricingVerification: {} },
    { ...proof, pricingVerification: { ...verification, evidenceSha256: offPeak.sha256 } },
    { ...proof, pricingVerification: { ...verification, sourceUrl: 'https://untrusted.invalid/pricing' } },
    { ...proof, pricingVerification: { ...verification, observedAtMs: now } },
    { ...proof, pricingVerification: { ...verification, observedAtMs: now - 3600000 } },
  ]) assert.equal(quote(invalid), null);
  assert.equal(quote(proof), 1229);
  assert.equal(quote(peak), 2458);
});

test('pilot ledger scope quotes truthful unknown account properties without rewriting them', () => {
  const proof = { ...fixture('openai', 103), postpaid: 'unknown', overdraft: 'unknown', concurrentAccountUsage: 'unknown' } as const;
  assert.equal(quote(proof), 1025);
  assert.equal(quote({ ...proof, overdraft: 'allowed', postpaid: 'allowed' }), 1025);
  assert.equal(proof.postpaid, 'unknown');
  assert.equal(proof.overdraft, 'unknown');
  assert.equal(proof.concurrentAccountUsage, 'unknown');
  for (const value of [
    { ...proof, autoReload: 'on' as const }, { ...proof, autoReload: 'unknown' as const },
    { ...proof, pilotEnvelope: undefined }, { ...proof, measurementPermit: undefined },
    { ...proof, allInChargeBound: undefined }, { ...proof, remainingCreditMicros: 0 },
    { ...proof, expiresAtMs: now - 1 },
  ]) assert.equal(quote(value), null);
});

test('pilot ledger scope requires exact stored measurement authority for the four fixed cases', async t => {
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('synthetic test forbids network'); });
  const base = measurementPlan('openai');
  const plan = { ...base, proof: { ...base.proof, postpaid: 'unknown', overdraft: 'unknown', concurrentAccountUsage: 'unknown' } } as const;
  let stored: unknown = plan.proof;
  const rpc: FundingRpc = async () => ({ error: null, data: { enabled: true, profiles: [], proofs: [stored],
    maxCostMicros: plan.maxCostMicros, dailyLimits: plan.daily } });
  const signal = new AbortController().signal;
  const loaded = await loadFundingMeasurement(plan.subject, plan.permit.planId, plan.permit.sourceSha, signal, rpc);
  assert.ok(loaded);
  assert.equal(loaded.proof.overdraft, 'unknown');
  assert.equal(loaded.proof.concurrentAccountUsage, 'unknown');
  let claims = 0, dispatches = 0;
  const requests = new Set<string>();
  const result = await measureFirstProfile(loaded, {
    sourceSha: () => plan.permit.sourceSha, authorityCurrent: async () => true,
    configuration: (_provider, model) => ({ apiKey: 'SYNTHETIC-KEY', model: model! }),
    admission: { reserve: async r => {
      claims++; requests.add(r.requestId);
      assert.equal(r.proof.overdraft, 'unknown'); assert.equal(r.proof.concurrentAccountUsage, 'unknown');
      assert.equal(r.costMicros, quote(plan.proof)); assert.equal(r.measurementRequest?.planId, plan.permit.planId);
      return { kind: 'admitted', attemptId: r.attemptId };
    } },
    dispatch: async (_provider, config, message, options) => {
      const fixed = FIRST_PROFILE_CASES[dispatches++];
      assert.equal(message, fixed.message); assert.equal(options.prompt, fixed.prompt);
      assert.equal(options.pilotMeasurement, true); assert.equal(options.maxOutputTokens, 1024);
      return { ok: true, model: config.model, citations: [], inputTokens: 100, outputTokens: 50,
        answer: options.classifier ? JSON.stringify({ tool: fixed.language === 'ar' ? 'weather' : 'maps' })
          : JSON.stringify({ kind: 'general-travel', advice: fixed.language === 'ar'
            ? 'رتّب حقيبة السفر بأغراض خفيفة، وخذ فترات راحة في الظل مع الأطفال. هل تفضّلون نشاطًا داخليًا أم خارجيًا؟'
            : 'Pack a light bag and plan quiet rest breaks in the shade with children. Would you prefer an indoor or outdoor stop?' }) };
    },
  }, signal);
  assert.equal(result.kind, 'candidate'); assert.equal(result.qualified, false);
  assert.equal(claims, 4); assert.equal(dispatches, 4); assert.equal(requests.size, 4);
  for (const invalid of [
    { ...plan.proof, pilotEnvelope: undefined }, { ...plan.proof, pilotEnvelope: { ...marker, id: 'another-budget' } },
    { ...plan.proof, measurementPermit: {} }, { ...plan.proof, measurementPermit: undefined },
    { ...plan.proof, measurementPermit: { ...plan.permit, cases: plan.permit.cases.slice(0, 3) } },
    { ...plan.proof, measurementPermit: { ...plan.permit, sourceSha: '0'.repeat(40) } },
    { ...plan.proof, model: 'SYNTHETIC-unreviewed' }, { ...plan.proof, autoReload: 'on' },
    { ...plan.proof, overdraft: 'fabricated' }, { ...plan.proof, concurrentAccountUsage: 'fabricated' },
    { ...plan.proof, allInChargeBound: undefined }, { ...plan.proof, remainingCreditMicros: 0 },
  ]) {
    stored = invalid;
    assert.equal(await loadFundingMeasurement(plan.subject, plan.permit.planId, plan.permit.sourceSha, signal, rpc), null);
  }
  assert.equal(dispatches, 4);
});


/** Operator fixture only. No runtime issuer, real balance, credential or network. */
function savedSnapshotPlan(): ApprovedFirstProfilePlan & { proof: Extract<DialogueFundingProof, { mode: 'existing-credit' }> } {
  const plan = measurementPlan('openai');
  assert.ok(plan.proof.mode === 'existing-credit');
  const proof = { ...plan.proof, verifiedAtMs: now - 7200000, expiresAtMs: now - 6600000 };
  const bindings = fundingSnapshotBindings(proof); assert.ok(bindings);
  return { ...plan, proof: { ...proof, snapshotUse: { schema: 'task217-funding-snapshot-use-v1',
    authorizationId: randomUUID(), ...bindings, authorizedAtMs: now - 500, expiresAtMs: plan.permit.expiresAtMs } } };
}
function snapshotDependencies(plan: ApprovedFirstProfilePlan, unknown = false) {
  const claims: FundedDialogueReservation[] = [], spent = new Set<string>();
  let dispatches = 0, held = 0;
  const deps: MeasurementDependencies = {
    sourceSha: () => plan.permit.sourceSha, authorityCurrent: async () => true,
    configuration: () => ({ apiKey: 'SYNTHETIC-KEY', model: plan.proof.model }),
    admission: { reserve: async r => {
      claims.push(r); await Promise.resolve();
      if (spent.has(r.requestId)) return { kind: 'denied' };
      spent.add(r.requestId); held += r.costMicros;
      return unknown ? { kind: 'denied' } : { kind: 'admitted', attemptId: r.attemptId, pricingExpiresAtMs: plan.permit.expiresAtMs };
    } },
    dispatch: async (_provider, config, message, options) => {
      const fixed = FIRST_PROFILE_CASES.find(c => c.message === message); assert.ok(fixed);
      dispatches++; assert.equal(options.prompt, fixed.prompt);
      assert.equal(options.maxOutputTokens, 1024); assert.equal(options.pilotMeasurement, true);
      return { ok: true, model: config.model, citations: [], inputTokens: 100, outputTokens: 50,
        answer: options.classifier ? JSON.stringify({ tool: fixed.language === 'ar' ? 'weather' : 'maps' })
          : JSON.stringify({ kind: 'general-travel', advice: fixed.language === 'ar'
            ? 'رتّب حقيبة السفر بأغراض خفيفة، وخذ فترات راحة في الظل مع الأطفال. هل تفضّلون نشاطًا داخليًا أم خارجيًا؟'
            : 'Pack a light bag and plan quiet rest breaks in the shade with children. Would you prefer an indoor or outdoor stop?' }) };
    },
  };
  return { deps, claims, counts: () => ({ dispatches, held, spent: spent.size }) };
}
test('saved snapshot: expired original observation is unchanged and requires exact explicit authorization', () => {
  const p = savedSnapshotPlan(), serialized = JSON.stringify(p.proof);
  assert.equal(p.proof.verifiedAtMs, now - 7200000); assert.equal(p.proof.expiresAtMs, now - 6600000);
  assert.equal(quote(p.proof), quote(measurementPlan('openai').proof));
  assert.equal(quote({ ...p.proof, snapshotUse: undefined }), null);
  const without = { ...p.proof }; delete without.snapshotUse;
  assert.equal(quote(without), null);
  assert.equal(JSON.stringify(p.proof), serialized, 'quoting does not renew times or relabel the balance');
  assert.deepEqual(fundingAuthorizationWindow(p.proof, now), { verifiedAtMs: now - 500, expiresAtMs: p.permit.expiresAtMs });
});
test('saved snapshot: financial identity, evidence, values, source, subject and cases are bound', () => {
  const p = savedSnapshotPlan();
  for (const proof of [
    { ...p.proof, grantId: randomUUID() }, { ...p.proof, provider: 'anthropic' as const },
    { ...p.proof, accountId: 'SYNTHETIC-other' }, { ...p.proof, projectId: 'SYNTHETIC-other' },
    { ...p.proof, model: 'SYNTHETIC-other' }, { ...p.proof, credentialSha256: '9'.repeat(64) },
    { ...p.proof, evidenceSha256: '9'.repeat(64) }, { ...p.proof, verifiedAtMs: p.proof.verifiedAtMs + 1 },
    { ...p.proof, expiresAtMs: p.proof.expiresAtMs + 1 },
    { ...p.proof, remainingCreditMicros: 2000000 },
    ...[
      { sourceSha: 'a'.repeat(40) }, { caseSetSha: 'a'.repeat(64) }, { planId: randomUUID() },
      { subjectHash: 'a'.repeat(64) }, { expiresAtMs: p.permit.expiresAtMs + 1 },
      { cases: p.permit.cases.map((c,i) => i ? c : { ...c, requestId: randomUUID() }) },
      { cases: [...p.permit.cases].reverse() },
    ].map(change => ({ ...p.proof, measurementPermit: { ...p.permit, ...change } })),
  ]) assert.equal(quote(proof), null);
});
test('saved snapshot: expired, future, malformed, renewed or ordinary-path authorizations fail closed', () => {
  const p = savedSnapshotPlan(); assert.ok(p.proof.snapshotUse && typeof p.proof.snapshotUse === 'object');
  const a = p.proof.snapshotUse;
  for (const snapshotUse of [null, {}, { ...a, extra: true }, { ...a, expiresAtMs: now },
    { ...a, authorizedAtMs: now + 1 }, { ...a, authorizedAtMs: now - 3600001 },
    { ...a, financialSnapshotSha256: '0'.repeat(64) }, { ...a, measurementPermitSha256: '0'.repeat(64) },
    { ...a, authorizationId: 'not-a-uuid' }]) assert.equal(quote({ ...p.proof, snapshotUse }), null);
  assert.equal(quote({ ...p.proof, pilotEnvelope: undefined }), null);
  const freshOrdinary = { ...p.proof, verifiedAtMs: now - 1000, expiresAtMs: now + 600000 };
  delete freshOrdinary.snapshotUse; delete freshOrdinary.pilotEnvelope; delete freshOrdinary.measurementPermit;
  assert.notEqual(quote(freshOrdinary), null);
  assert.equal(quote({ ...freshOrdinary, verifiedAtMs: now - 7200000, expiresAtMs: now - 6600000 }), null);
});
test('saved snapshot: pricing, all-in fees, quotas and permit expiry remain independent blockers', async t => {
  t.mock.method(Date, 'now', () => now);
  const p = savedSnapshotPlan(), fresh = fixture('openai', 700);
  for (const proof of [
    { ...p.proof, pricingVerification: { ...fresh.pricingVerification, observedAtMs: now - 3600000 } },
    { ...p.proof, allInChargeBound: { ...fresh.allInChargeBound, observedAtMs: now - 3600000 } },
    { ...p.proof, pricingVerification: undefined }, { ...p.proof, allInChargeBound: undefined },
    { ...p.proof, quotaWindowEndMs: now }, { ...p.proof, remainingRequests: 0 },
  ]) {
    assert.equal(quote(proof), null);
    const f = snapshotDependencies({ ...p, proof });
    assert.equal((await measureFirstProfile({ ...p, proof }, f.deps)).kind, 'blocked');
    assert.equal(f.counts().dispatches, 0); assert.equal(f.claims.length, 0);
  }
  for (const expiry of [now, p.permit.expiresAtMs + 1]) {
    const permit = { ...p.permit, expiresAtMs: expiry }, proof = { ...p.proof, measurementPermit: permit };
    const bindings = fundingSnapshotBindings(proof); assert.ok(bindings);
    const changed = { ...proof, snapshotUse: { schema: 'task217-funding-snapshot-use-v1', authorizationId: randomUUID(),
      ...bindings, authorizedAtMs: now - 500, expiresAtMs: p.permit.expiresAtMs } };
    const f = snapshotDependencies({ ...p, proof: changed, permit });
    assert.equal((await measureFirstProfile({ ...p, proof: changed, permit }, f.deps)).kind, 'blocked');
    assert.equal(f.counts().dispatches, 0);
  }
});
test('saved snapshot: loader and four-case measurement use one owner without renewing financial times', async t => {
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('synthetic snapshot test forbids network'); });
  const p = savedSnapshotPlan(), original = JSON.stringify(p.proof);
  const rpc: FundingRpc = async () => ({ error: null, data: { enabled: true, profiles: [], proofs: [p.proof],
    maxCostMicros: p.maxCostMicros, dailyLimits: p.daily } });
  const signal = new AbortController().signal;
  const loaded = await loadFundingMeasurement(p.subject, p.permit.planId, p.permit.sourceSha, signal, rpc); assert.ok(loaded);
  assert.equal(await loadFundingMeasurement(p.subject, p.permit.planId, '0'.repeat(40), signal, rpc), null);
  assert.equal(await loadFundingMeasurement('SYNTHETIC-other', p.permit.planId, p.permit.sourceSha, signal, rpc), null);
  const f = snapshotDependencies(loaded), result = await measureFirstProfile(loaded, f.deps);
  assert.equal(result.kind, 'candidate'); assert.equal(result.qualified, false); assert.equal(result.observations.length, 4);
  assert.equal(f.counts().dispatches, 4); assert.equal(f.counts().held, 4 * quote(p.proof)!);
  assert.ok(f.claims[0].measurementRequest?.runId);
  assert.equal(f.claims[0].attemptId, f.claims[0].measurementRequest.runId);
  assert.equal(new Set(f.claims.map(c => c.measurementRequest?.runId)).size, 1);
  assert.equal(new Set(f.claims.map(c => c.attemptId)).size, 4);
  assert.equal(JSON.stringify(p.proof), original);
  assert.doesNotMatch(JSON.stringify(result), /snapshotUse|accountId|credentialSha256|SYNTHETIC-KEY/);
});
test('saved snapshot: concurrent processes and restarts do not issue duplicate case requests', async t => {
  t.mock.method(Date, 'now', () => now);
  const p = savedSnapshotPlan(), f = snapshotDependencies(p);
  const results = await Promise.all([measureFirstProfile(p, f.deps), measureFirstProfile(p, f.deps)]);
  assert.equal(results.filter(r => r.kind === 'candidate').length, 1);
  assert.equal(f.counts().dispatches, 4); assert.equal(f.counts().spent, 4);
  const firstClaims = f.claims.filter(c => c.measurementRequest?.caseId === 'intent-ar');
  assert.equal(firstClaims.length, 2);
  assert.notEqual(firstClaims[0].measurementRequest?.runId, firstClaims[1].measurementRequest?.runId);
  assert.equal((await measureFirstProfile(p, f.deps)).kind, 'stopped');
  assert.equal(f.counts().dispatches, 4); assert.equal(f.counts().held, 4 * quote(p.proof)!);
});
test('saved snapshot: unknown reservation, changed credential/source and expiry cannot dispatch or refund', async t => {
  t.mock.method(Date, 'now', () => now);
  const p = savedSnapshotPlan(), f = snapshotDependencies(p, true);
  assert.equal((await measureFirstProfile(p, f.deps)).kind, 'stopped');
  assert.equal(f.counts().dispatches, 0); assert.equal(f.counts().held, quote(p.proof));
  assert.equal((await measureFirstProfile(p, f.deps)).kind, 'stopped');
  assert.equal(f.counts().held, quote(p.proof));
  for (const change of [
    { sourceSha: () => '0'.repeat(40) },
    { configuration: () => ({ apiKey: 'SYNTHETIC-other', model: p.proof.model }) },
  ]) {
    const isolated = snapshotDependencies(p);
    assert.equal((await measureFirstProfile(p, { ...isolated.deps, ...change })).kind, 'blocked');
    assert.equal(isolated.claims.length, 0); assert.equal(isolated.counts().dispatches, 0);
  }
  t.mock.method(Date, 'now', () => p.permit.expiresAtMs);
  const expired = snapshotDependencies(p);
  assert.equal((await measureFirstProfile(p, expired.deps)).kind, 'blocked');
  assert.equal(expired.claims.length, 0);
});


test('saved snapshot: S1 blocks price expiry across post-admission authority await and retains the hold', async t => {
  let clock = now;
  t.mock.method(Date, 'now', () => clock);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('S1 regression forbids network'); });
  const p = savedSnapshotPlan(), original = JSON.stringify(p.proof), priceEnd = now + 100;
  const f = snapshotDependencies(p), used = new Set<string>();
  let held = 0, calls = 0, crossed = false;
  const admission = createFundingDialogueAdmission(async (_name, params) => {
    calls++; await Promise.resolve();
    const request = String(params.p_request_id);
    if (clock >= priceEnd || used.has(request)) return { error: null, data: { decision: 'denied' } };
    used.add(request); held += Number(params.p_cost_micros);
    return { error: null, data: { decision: 'admitted', attempt_id: params.p_attempt_id, pricing_expires_at_ms: priceEnd } };
  });
  const deps = { ...f.deps, admission, authorityCurrent: async () => {
    if (held) { await Promise.resolve(); clock = priceEnd + 1; crossed = true; }
    return true; // Reloading the unchanged proof is insufficient to renew the price.
  } };
  assert.equal((await measureFirstProfile(p, deps)).kind, 'stopped');
  assert.equal(f.counts().dispatches, 0); assert.equal(calls, 1);
  assert.equal(crossed, true); assert.equal(clock, priceEnd + 1);
  assert.equal(held, quote(p.proof)); assert.equal(used.size, 1);
  assert.ok(p.permit.expiresAtMs > clock && p.proof.quotaWindowEndMs > clock);
  assert.ok(fundingAuthorizationWindow(p.proof, clock));
  assert.notEqual(quoteDialogueFunding(p.proof, { provider: p.proof.provider, model: p.proof.model,
    environment: p.proof.environment, inputTokenCeiling: 4096, outputTokenCeiling: 1024 }, clock), null);
  assert.equal(JSON.stringify(p.proof), original);
  assert.equal((await measureFirstProfile(p, deps)).kind, 'stopped');
  assert.equal(held, quote(p.proof)); assert.equal(f.counts().dispatches, 0);
});
test('saved snapshot: S1 missing, malformed, mismatched or late trusted receipts fail closed without refund', async t => {
  let clock = now;
  t.mock.method(Date, 'now', () => clock);
  for (const deadline of [undefined, null, 'future', NaN, Infinity, now - 1, now, now + 0.5]) {
    clock = now;
    const p = savedSnapshotPlan(), f = snapshotDependencies(p), used = new Set<string>();
    let held = 0;
    const admission = createFundingDialogueAdmission(async (_name, params) => {
      const id = String(params.p_request_id);
      if (used.has(id)) return { error: null, data: { decision: 'denied' } };
      used.add(id); held += Number(params.p_cost_micros);
      return { error: null, data: { decision: 'admitted', attempt_id: params.p_attempt_id, pricing_expires_at_ms: deadline } };
    });
    assert.equal((await measureFirstProfile(p, { ...f.deps, admission })).kind, 'stopped');
    assert.equal(f.counts().dispatches, 0); assert.equal(held, quote(p.proof));
    assert.equal((await measureFirstProfile(p, { ...f.deps, admission })).kind, 'stopped');
    assert.equal(held, quote(p.proof)); assert.equal(used.size, 1);
  }
  for (const mismatch of [false, true]) {
    clock = now;
    const p = savedSnapshotPlan(), f = snapshotDependencies(p), priceEnd = now + 100;
    let held = 0;
    const admission = createFundingDialogueAdmission(async (_name, params) => {
      held += Number(params.p_cost_micros); await Promise.resolve();
      if (!mismatch) clock = priceEnd; // Accepted in SQL, receipt arrives too late.
      return { error: null, data: { decision: 'admitted', attempt_id: mismatch ? randomUUID() : params.p_attempt_id,
        pricing_expires_at_ms: priceEnd } };
    });
    assert.equal((await measureFirstProfile(p, { ...f.deps, admission })).kind, 'stopped');
    assert.equal(f.counts().dispatches, 0); assert.equal(held, quote(p.proof));
  }
});
test('saved snapshot: S1 measurement also refuses an admitted receipt without a valid deadline', async t => {
  t.mock.method(Date, 'now', () => now);
  for (const pricingExpiresAtMs of [undefined, NaN, now, now - 1]) {
    const p = savedSnapshotPlan(), f = snapshotDependencies(p); let held = 0;
    const admission: MeasurementDependencies['admission'] = { reserve: async r => {
      held += r.costMicros; return { kind: 'admitted', attemptId: r.attemptId, pricingExpiresAtMs };
    } };
    assert.equal((await measureFirstProfile(p, { ...f.deps, admission })).kind, 'stopped');
    assert.equal(f.counts().dispatches, 0); assert.equal(held, quote(p.proof));
  }
});
test('saved snapshot: S1 independent price deadline shortens timeout without widening fixed-case authority', async t => {
  t.mock.method(Date, 'now', () => now);
  const p = savedSnapshotPlan(), f = snapshotDependencies(p);
  const deps: MeasurementDependencies = { ...f.deps, admission: { reserve: async (r, signal) => {
    const claim = await f.deps.admission.reserve(r, signal);
    return claim.kind === 'admitted' ? { ...claim, pricingExpiresAtMs: now + 500 } : claim;
  } }, dispatch: async (provider, config, message, options) => {
    assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 500);
    return f.deps.dispatch(provider, config, message, options);
  } };
  assert.equal((await measureFirstProfile(p, deps)).kind, 'candidate');
  assert.equal(f.counts().dispatches, 4); assert.equal(f.counts().held, 4 * quote(p.proof)!);
});
