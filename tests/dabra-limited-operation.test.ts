import { syntheticContractMeasurement, syntheticOutputAcceptances } from './fixtures/task217-output-qualification-synthetic';
import * as outputContract from '../lib/dabra/agent-output-contract';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { channel as diagnosticChannel } from 'node:diagnostics_channel';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import type { DurableAccountChargeProof } from '../lib/dabra/dialogue-durable-authority';
import { SYNTHETIC_PUBLIC_PRICING_BODIES } from './fixtures/task217-public-pricing-synthetic';
import { AGENT_PROVIDER_IDS, type AgentProviderId, type CapabilityMeasurement } from '../lib/dabra/agent-capabilities';
type MutableFixtureMeasurement = { -readonly [K in keyof CapabilityMeasurement]: CapabilityMeasurement[K] };
import { APPROVED_DIALOGUE_STANDARD_PRICING } from '../lib/dabra/dialogue-pricing-approvals';

// Actual POST, policy loader, funding, planner and handoff. Only authenticated
// identity, database I/O and provider dispatch are synthetic external boundaries.
// No ENV file, real credential, provider or Supabase backend is used.
const instant = Date.parse('2026-11-03T00:00:00Z');
const credential = 'SYNTHETIC-NOT-A-CREDENTIAL';
const realFetch = globalThis.fetch;
let unexpectedNetwork = 0;
test.before(() => { globalThis.fetch = async () => { unexpectedNetwork++; throw Error('UNEXPECTED_TEST_NETWORK'); }; });
test.afterEach(() => { assert.equal(unexpectedNetwork, 0, 'test boundaries must not attempt any network'); });
test.after(() => { globalThis.fetch = realFetch; });

function fixture(language: 'ar' | 'en' = 'en', provider: AgentProviderId = 'openai', options: { realTransport?: boolean; continuous?: boolean; unqualifiedOutput?: boolean; configuration?: 'missing' | 'key-digest-mismatch' | 'model-mismatch' } = {}) {
  const realTransport = options.realTransport ? realTaskTransport(provider) : null;
  let clock = instant, actorCurrent = true, dispatches = 0, reservations = 0;
  let postReservePolicyReads = 0, revokeOnPolicyRead = 1, revocations = 0;
  let fault: 'none' | 'authority-during-policy-read' | 'credential-during-policy-read' | 'authority-throws-after-admission' | 'lost-claim' | 'late-claim' | 'expired-price-receipt' | 'provider-unknown' | 'revoked-during-dispatch' | 'credential-change' | 'grant-revoked' | 'profile-revoked' | 'source-change' | 'consent-revoked' | 'pricing-expired-during-claim' | 'pricing-unavailable' | 'authority-during-public-pricing' = 'none';
  let configuredKey = options.configuration === 'missing' ? '' : options.configuration === 'key-digest-mismatch' ? 'SYNTHETIC-DIFFERENT-CREDENTIAL' : credential;
  const requests = new Set<string>(), payloads: string[] = [], statuses: number[] = [];
  let held = 61719, admittedAttempts = 6, publicFetches = 0;
  let continuousProof: DurableAccountChargeProof | null = null;
  const serializedClaims: Record<string, unknown>[] = [];
  const subject = 'SYNTHETIC-customer', model = options.realTransport ? SEVEN_BOUNDED_MODELS[provider] : 'SYNTHETIC-limited';
  const limits = { uniqueUsers: 10, requestsPerUser: 6, requestsTotal: 60,
    inputTokensPerUser: 24576, outputTokensPerUser: 6144, inputTokensTotal: 245760, outputTokensTotal: 61440 };
  const legacyRate = { schema: 'reviewed-standard-pricing-v1', provider, model,
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 1000000, outputMicrosPerMillion: 2000000,
    observedAtMs: instant - 1000, validFromMs: instant - 1, expiresAtMs: instant + 600000,
    sourceUrl: 'https://' + ({ openai: 'developers.openai.com', anthropic: 'platform.claude.com', gemini: 'ai.google.dev', xai: 'docs.x.ai', deepseek: 'api-docs.deepseek.com', qwen: 'www.alibabacloud.com', mistral: 'docs.mistral.ai' })[provider] + '/SYNTHETIC-limited' };
  const approvedRate = options.realTransport
    ? APPROVED_DIALOGUE_STANDARD_PRICING.find(r => r.provider === provider && r.model === model) : undefined;
  if (options.realTransport && !approvedRate) throw Error('APPROVED_MODEL_TARIFF_MISSING');
  const rate = approvedRate ?? legacyRate;
  const rateSha = approvedRate?.sha256 ?? createHash('sha256').update(JSON.stringify(Object.values(rate))).digest('hex');
  const outputCeiling = options.realTransport ? 1024 : 256;
  const costMicros = Math.ceil((4096 * rate.inputMicrosPerMillion + outputCeiling * rate.outputMicrosPerMillion) / 1000000) + 100;
  const proof = {
    grantId: '11111111-1111-4111-8111-111111111111', provider, model, environment: 'provider-benchmark',
    accountId: 'SYNTHETIC-account', projectId: 'SYNTHETIC-project',
    evidenceSha256: 'a'.repeat(64), credentialSha256: createHash('sha256').update(credential).digest('hex'),
    verifiedAtMs: instant - 1, expiresAtMs: instant + 600000, quotaWindowStartMs: instant - 1000, quotaWindowEndMs: instant + 600000,
    remainingRequests: 20, remainingInputTokens: 81920, remainingOutputTokens: 20480,
    autoReload: 'off', postpaid: 'blocked', overdraft: 'unknown', concurrentAccountUsage: 'bounded',
    mode: 'existing-credit', currency: 'USD', serviceTier: 'standard',
    pricing: 'standard-2026-10-28', pricingEvidenceSha256: rateSha, authorizedCreditMicros: 1000000, remainingCreditMicros: 1000000,
    ...(options.realTransport ? { pricingVerification: { schema: 'standard-pricing-verification-v1',
      snapshotSha256: rateSha, sourceUrl: rate.sourceUrl, inputMicrosPerMillion: rate.inputMicrosPerMillion,
      outputMicrosPerMillion: rate.outputMicrosPerMillion, observedAtMs: instant - 1, evidenceSha256: 'e'.repeat(64) } } : {}),
    allInChargeBound: { schema: 'all-in-charge-bound-v1', currency: 'USD', coverage: 'all-applicable-api-charges',
      maxAdditionalMicros: 100, observedAtMs: instant - 1000, evidenceSha256: 'd'.repeat(64) },
    limitedOperation: { schema: 'task217-limited-operation-v1', authorizationId: '22222222-2222-4222-8222-222222222222',
      taskId: 'task217-text-pilot-2026-11-01', maxCostMicros: 1000000, maxAttempts: 28,
      dataScope: 'redacted-travel-or-server-units', providerRisk: 'overdraft-unknown',
      authorizedAtMs: instant - 1, expiresAtMs: instant + 600000 },
  };
  const profiles: Array<{ provider: AgentProviderId; measurement: MutableFixtureMeasurement }> = (['discover', 'intent.classify'] as const).map(capability => ({ provider, measurement: {
    capability, language, model, environment: 'provider-benchmark' as const, ...syntheticContractMeasurement(capability,language), sourceSha: 'c'.repeat(40), measuredAtMs: instant - 1, expiresAtMs: instant + 600000,
    latencyMs: 1, inputTokenCeiling: 4096, outputTokenCeiling: outputCeiling, costCeilingUsd: costMicros / 1000000,
  } }));
  let enabled = true;
  const context = { role: 'customer', taskAuthority: { kind: 'customer', actorId: subject, ownerId: subject },
    // Both authenticated context and funding RPC belong to this fixture's synthetic database project.
    isDialogueFundingProjectCurrent: () => true,
    isTaskAuthorityCurrent: async () => { if (fault === 'authority-throws-after-admission' && reservations > 0) throw Error('SYNTHETIC_PRIVATE_DIAGNOSTIC'); return actorCurrent; }, readRequests: async () => ({ kind: 'forbidden' }) };
  const proofRows: unknown[] = [proof];
  const data = { enabled, profiles, proofs: proofRows, maxCostMicros: costMicros, dailyLimits: limits };
  const rpc = async (name: string, p: Record<string, unknown>, signal: AbortSignal) => {
    if (signal.aborted) return { data: null, error: 'aborted' };
    if (name === 'get_dabra_dialogue_funding_policy') {
      if (reservations > 0) postReservePolicyReads++;
      if (fault === 'authority-during-policy-read' && postReservePolicyReads === revokeOnPolicyRead) {
        await Promise.resolve(); actorCurrent = false; revocations++;
      }
      if (fault === 'credential-during-policy-read' && postReservePolicyReads === revokeOnPolicyRead) {
        await Promise.resolve(); configuredKey = 'SYNTHETIC-DIFFERENT-CREDENTIAL';
      }
      return { data: { ...data, enabled, outputAcceptances: options.unqualifiedOutput ? [] : syntheticOutputAcceptances(profiles,instant) }, error: null };
    }
    assert.equal(name, 'reserve_dabra_dialogue_attempt');
    reservations++;
    const key = String(p.p_request_id) + ':' + String(p.p_stage);
    serializedClaims.push(p);
    if (requests.has(key) || held + Number(p.p_cost_micros) > 1000000 || (options.continuous && admittedAttempts >= 28)) return { data: { decision: 'denied' }, error: null };
    requests.add(key); held += Number(p.p_cost_micros); admittedAttempts++;
    if (fault === 'lost-claim') return { data: null, error: 'synthetic lost receipt after commit' };
    if (fault === 'late-claim') clock = instant + 600001;
    if (fault === 'credential-change') {
      configuredKey = 'SYNTHETIC-DIFFERENT-CREDENTIAL';
      const key = { openai:'OPENAI_API_KEY',gemini:'GOOGLE_GENERATIVE_AI_API_KEY',anthropic:'ANTHROPIC_API_KEY',xai:'XAI_API_KEY',deepseek:'DEEPSEEK_API_KEY',qwen:'QWEN_API_KEY',mistral:'MISTRAL_API_KEY' }[provider];
      if (options.continuous && realTransport) realTransport.env[key] = configuredKey;
    }
    if (fault === 'pricing-expired-during-claim') clock += 900001;
    if (fault === 'grant-revoked') data.proofs = [];
    if (fault === 'profile-revoked') data.profiles = [];
    if (fault === 'source-change') data.profiles = data.profiles.map(p => ({ ...p, measurement: { ...p.measurement, sourceSha: 'f'.repeat(40) } }));
    if (fault === 'consent-revoked') enabled = false;
    const serialized = p.p_proof, execution = isFixtureRecord(serialized) ? serialized.executionPricing : null;
    const observation = isFixtureRecord(execution) ? execution.observation : null;
    const receiptExpiry = isFixtureRecord(observation) && typeof observation.expiresAtMs === 'number' ? observation.expiresAtMs : instant + 600000;
    return { data: { decision: 'admitted', attempt_id: p.p_attempt_id,
      pricing_expires_at_ms: fault === 'expired-price-receipt' ? instant - 1 : receiptExpiry }, error: null };
  };
  const transport = {
    internalAgentConfiguration: (candidate: string) => realTransport ? realTransport.configurationFor(candidate) : candidate === provider && configuredKey ? { apiKey: configuredKey, model: options.configuration === 'model-mismatch' ? 'SYNTHETIC-DIFFERENT-MODEL' : model } : null,
    callInternalAgentProvider: async (_provider: string, _config: unknown, message: string, options: { classifier?: boolean }) => {
      dispatches++; payloads.push(message);
      if (fault === 'provider-unknown') return { ok: false, model, answer: '', citations: [], errorCategory: 'timeout' };
      if (fault === 'revoked-during-dispatch') actorCurrent = false;
      const input = options.classifier ? null : JSON.parse(message);
      const answer = options.classifier ? '{"tool":"discover"}' : JSON.stringify(input.general
        ? { kind: 'general-travel', advice: language === 'ar'
          ? 'خذ حقيبة خفيفة وماءً للأطفال، ورتب استراحات في الظل. هل تفضلون مكانًا داخليًا أم خارجيًا؟'
          : 'Pack a light bag and water for the children, and plan shaded rest breaks. Would you prefer indoors or outdoors?' }
        : { opening: 'none', paragraphs: input.units.map((_: string, index: number) => [index]) });
      if (realTransport) { realTransport.respond(answer); return realTransport.dispatch(_provider, _config, message, options); }
      return { ok: true, model, answer, citations: [], inputTokens: 16, outputTokens: 16 };
    },
  };
  const modules = new Map<string, Record<string, unknown>>();
  class Clock extends Date { static now() { return clock; } }
  const env = { DABRA_INTERNAL_AI_ENABLED: 'true', DABRA_AI_PROVIDER: 'openai',
    DABRA_PROVIDER_FALLBACK_ENABLED: 'false', DABRA_DIALOGUE_FUNDING_POLICY: 'task217-existing-credit-v2' };
  const names = new Set(['agent-dialogue', 'dialogue-funding', 'dialogue-funding-store', 'agent-planner', 'agent-handoff', 'agent-measurement', 'dialogue-durable-authority', 'dialogue-pricing-refresh']);
  function load(name: string): Record<string, unknown> {
    const cached = modules.get(name); if (cached) return cached;
    const file = new URL('../lib/dabra/' + name + '.ts', import.meta.url), require = createRequire(file);
    const output: Record<string, unknown> = {}; modules.set(name, output);
    runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText + (options.continuous && name === 'dialogue-pricing-refresh' ? '\nexports.testSource=sources;exports.testFragment=fragment;' : ''), { exports: output, module: { exports: output }, require: (id: string) => {
      if (id === 'server-only') return {};
      if (id === './agent-output-contract') return { ...outputContract, get APPROVED_PROFILE_OUTPUT_ACCEPTANCES() { return syntheticOutputAcceptances(profiles,instant); } };
      if (id === '../ai2/observability/provider-attempts') return { createDabraProviderRequestId: randomUUID, mapProviderErrorCategory: (value: unknown) => value };
      if (id === '../supabase/server') return { supabaseAdmin: { rpc: (name: string, params: Record<string, unknown>) => ({
        abortSignal: (signal: AbortSignal) => rpc(name, params, signal),
      }) } };
      if (id === './dialogue-pricing-approvals') return { APPROVED_DIALOGUE_STANDARD_PRICING: [{ ...rate, sha256: rateSha }] };
      if (id === '../ai2/runtime/agent-provider-dispatch') return transport;
      if (id.startsWith('./') && names.has(id.slice(2))) return load(id.slice(2));
      return require(id);
    }, Date: Clock, process: { env }, Buffer, URL, Response, TextDecoder, fetch: async (url: string, init: RequestInit) => {
      publicFetches++; assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
      if (fault === 'authority-during-public-pricing') { await Promise.resolve(); actorCurrent = false; revocations++; }
      assert.equal(new Headers(init.headers).has('Authorization'), false);
      const response = new Response(fault === 'pricing-unavailable' ? '' : SYNTHETIC_PUBLIC_PRICING_BODIES[provider], {
        status: fault === 'pricing-unavailable' ? 503 : 200, headers: { 'Content-Type': provider === 'openai' || provider === 'anthropic' ? 'text/markdown' : provider === 'gemini' ? 'text/plain' : 'text/html' },
      });
      return Object.defineProperty(response, 'url', { value: url });
    }, AbortController, AbortSignal, setTimeout, clearTimeout, queueMicrotask, console }, { filename: file.pathname });
    return output;
  }
  if (options.continuous) {
    if (!realTransport || !approvedRate) throw Error('CONTINUOUS_ACTUAL_TRANSPORT_REQUIRED');
    env.DABRA_AI_PROVIDER = provider;
    const pricing = load('dialogue-pricing-refresh'), authority = load('dialogue-durable-authority');
    const call = (module: Record<string, unknown>, name: string, ...args: unknown[]) => {
      const fn = module[name]; if (typeof fn !== 'function') throw Error('FIXTURE_EXPORT_MISSING');
      return Reflect.apply(fn, undefined, args);
    };
    const source = pricing.testSource;
    if (!isFixtureRecord(source)) throw Error('SYNTHETIC_SOURCE_REQUIRED');
    const selected = source[provider]; if (!isFixtureRecord(selected)) throw Error('SYNTHETIC_PROVIDER_REQUIRED');
    const extracted = call(pricing, 'testFragment', provider, SYNTHETIC_PUBLIC_PRICING_BODIES[provider]);
    if (typeof extracted !== 'string') throw Error('SYNTHETIC_FRAGMENT_REQUIRED');
    selected.fragment = createHash('sha256').update(extracted).digest('hex');
    const contract = call(pricing, 'approvedPublicPricingContract', provider, model, rateSha);
    if (!isFixtureRecord(contract) || typeof contract.digest !== 'string') throw Error('APPROVED_CONTRACT_REQUIRED');
    for (const p of profiles) { p.measurement.measuredAtMs = instant - 3600000; p.measurement.expiresAtMs = instant - 1; }
    const hashes = profiles.map(p => call(authority, 'durableProfileSha256', p));
    if (!hashes.every((v): v is string => typeof v === 'string')) throw Error('ACCEPTED_PROFILE_DIGEST_REQUIRED');
    const unbound: DurableAccountChargeProof = {
      mode: 'bounded-account-charge', grantId: proof.grantId, provider, model, environment: 'provider-benchmark',
      accountId: proof.accountId, projectId: proof.projectId, credentialSha256: proof.credentialSha256, evidenceSha256: proof.evidenceSha256,
      currency: 'USD', serviceTier: 'standard', pricingEvidenceSha256: rateSha,
      accountTerms: { schema: 'task217-account-charge-terms-v1', observedAtMs: instant - 1000, evidenceSha256: 'd'.repeat(64),
        validity: 'until-contract-change', risks: { autoReload: 'unknown', postpaid: 'allowed', overdraft: 'unknown', concurrentAccountUsage: 'unknown' },
        fundingChargeProtection: { kind: 'documented-manual-funding-only', evidenceSha256: 'e'.repeat(64) },
        allInChargeBound: { schema: 'all-in-account-charge-bound-v1', currency: 'USD',
          coverage: 'all-applicable-api-tax-fx-and-funding-charges', maxAdditionalMicros: 100, evidenceSha256: 'f'.repeat(64) } },
      limitedOperation: { schema: 'task217-limited-operation-v2', authorizationId: proof.limitedOperation.authorizationId,
        taskId: 'task217-text-pilot-2026-11-01', dataScope: 'redacted-travel-or-server-units', maxCostMicros: 1000000, maxAttempts: 28,
        authorizedAtMs: instant - 1, duration: 'until-revoked-or-binding-change', providerRisk: 'bounded-account-liability-with-observed-risks',
        acceptedProfileSha256s: hashes.sort(), contractSha256: contract.digest, bindingSha256: '0'.repeat(64) },
    };
    const binding = call(authority, 'durableAuthorityBindingSha256', unbound);
    if (typeof binding !== 'string') throw Error('SYNTHETIC_AUTHORITY_BINDING_REQUIRED');
    continuousProof = { ...unbound, limitedOperation: { ...unbound.limitedOperation, bindingSha256: binding } };
    data.proofs = [continuousProof];
  }
  const file = new URL('../app/api/ai2/chat/route.ts', import.meta.url), require = createRequire(file);
  const exported: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports: exported, require: (id: string) => {
    if (id === 'next/server') return { NextRequest, NextResponse, after: () => {} };
    if (id === '@/lib/ai2/observability/provider-attempts') return { createDabraProviderAttemptAfterResponseScheduler: () => () => {} };
    if (id === '@/lib/dabra/agent-context') return { resolveAgentContext: async () => context };
    if (id.startsWith('@/lib/dabra/') && names.has(id.slice('@/lib/dabra/'.length))) return load(id.slice('@/lib/dabra/'.length));
    return require(id);
  }, Date: Clock, process: { env }, Buffer, URL, File, crypto: globalThis.crypto, AbortController, AbortSignal, console }, { filename: file.pathname });
  const handler = exported.POST; if (typeof handler !== 'function') throw Error('actual_POST_missing');
  return { proof, data, context, payloads, env, statuses, realTransport, continuousProof, serializedClaims,
    publicFetches: () => publicFetches, ledgerState: () => ({ held, admittedAttempts }),
    seedHistorical: (cost: number, attempts: number) => { held = cost; admittedAttempts = attempts; },
    fail: (value: typeof fault, policyRead = 1) => { fault = value; revokeOnPolicyRead = policyRead; },
    revocations: () => revocations,
    setClock: (value: number) => { clock = value; }, setAuthority: (value: boolean) => { actorCurrent = value; },
    disable: () => { enabled = false; },
    counts: () => ({ dispatches, reservations, held }),
    async postAttachment() {
      const form = new FormData();
      form.set('locale', language); form.set('message', 'Make my family day quieter');
      form.set('attachment', new File(['%PDF-1.7\n% SYNTHETIC_PRIVATE_ATTACHMENT_ONLY\n%%EOF\n'], 'synthetic.pdf', { type: 'application/pdf' }));
      const result = await Reflect.apply(handler, undefined, [new NextRequest('http://localhost/api/ai2/chat', {
        method: 'POST', body: form, headers: { 'X-DABRA-Request-Id': randomUUID() },
      })]);
      if (!(result instanceof Response)) throw Error('actual_POST_response_missing');
      statuses.push(result.status); return result.json();
    },
    async post(message = language === 'ar'
      ? 'أبغى سيارة لعائلة من خمسة أشخاص في القاهرة لمدة ثلاثة أيام. اسألني عن المعلومات الناقصة.'
      : 'I need a car for a family of five in Cairo for three days. Ask for missing information first.',
      requestId: string | null = randomUUID(), via: 'body' | 'header' = 'body') {
      const result = await Reflect.apply(handler, undefined, [new NextRequest('http://localhost/api/ai2/chat', {
        method: 'POST', body: JSON.stringify({ locale: language, message, ...(requestId && via === 'body' ? { requestId } : {}) }),
        ...(requestId && via === 'header' ? { headers: { 'X-DABRA-Request-Id': requestId } } : {}),
      })]);
      if (!(result instanceof Response)) throw Error('actual_POST_response_missing');
      statuses.push(result.status); return result.json();
    },
  };
}

for (const language of ['ar', 'en'] as const) test('limited operation actual POST ' + language + ': explicit risk acceptance retains unknown and reserves before dispatch', async () => {
  const f = fixture(language), body = await f.post();
  assert.equal(body.provider, 'openai');
  assert.equal(f.proof.overdraft, 'unknown');
  assert.equal(f.counts().dispatches, 1);
  assert.equal(f.counts().reservations, 1);
  assert.equal(f.counts().held, 61719 + 4708);
  assert.match(body.answer, language === 'ar' ? /تاريخ/ : /dates/i);
  assert.equal(body.agent.mutations, 0);
});

test('limited operation missing explicit data scope is local fallback, never legacy classifier', async () => {
  const f = fixture(); f.proof.limitedOperation.dataScope = 'not-approved';
  const body = await f.post('Make my family day quieter');
  assert.equal(body.provider, 'local'); assert.equal(f.counts().dispatches, 0); assert.equal(f.counts().reservations, 0);
});

test('limited operation chooses the eligible context provider rather than an unrelated legacy default', async () => {
  const f = fixture('en', 'anthropic');
  const body = await f.post('Make my family day quieter');
  assert.equal(body.understandingProvider, 'anthropic');
  assert.equal(body.provider, 'anthropic');
  assert.equal(f.counts().dispatches, 2);
});

test('limited operation unknown classifier outcome stops further provider stages without retry or fallback', async () => {
  const f = fixture(); f.fail('provider-unknown'); f.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  const body = await f.post('Make my family day quieter');
  assert.equal(body.provider, 'local');
  assert.equal(f.counts().dispatches, 1);
  assert.equal(f.counts().held, 61719 + 4708);
});

for (const which of ['providerRisk', 'taskId', 'expired', 'postpaid', 'overdraft', 'concurrentAccountUsage', 'no-proof', 'disabled', 'guest', 'owner-mismatch', 'profile-language', 'profile-model', 'profile-environment', 'profile-failed', 'profile-expired'] as const) {
 test('limited operation actual POST rejects ' + which + ' before dispatch', async () => {
  const f = fixture();
  if (which === 'providerRisk') f.proof.limitedOperation.providerRisk = 'not-approved';
  if (which === 'taskId') f.proof.limitedOperation.taskId = 'not-the-authorized-task';
  if (which === 'expired') f.proof.limitedOperation.expiresAtMs = instant - 1;
  if (which === 'postpaid') f.proof.postpaid = 'unknown';
  if (which === 'overdraft') f.proof.overdraft = 'allowed';
  if (which === 'concurrentAccountUsage') f.proof.concurrentAccountUsage = 'unknown';
  if (which === 'no-proof') f.data.proofs = [];
  if (which === 'disabled') f.disable();
  if (which === 'guest') { f.context.role = 'guest'; f.context.taskAuthority.kind = 'guest'; }
  if (which === 'owner-mismatch') f.context.taskAuthority.ownerId = 'SYNTHETIC-other';
  if (which === 'profile-language') for (const p of f.data.profiles) p.measurement.language = 'ar';
  if (which === 'profile-model') for (const p of f.data.profiles) p.measurement.model = 'SYNTHETIC-other-model';
  if (which === 'profile-environment') for (const p of f.data.profiles) p.measurement.environment = 'synthetic';
  if (which === 'profile-failed') for (const p of f.data.profiles) p.measurement.passed = 0;
  if (which === 'profile-expired') for (const p of f.data.profiles) p.measurement.expiresAtMs = instant - 1;
  const body = await f.post(); assert.equal(body.provider, 'local');
  assert.equal(f.counts().dispatches, 0); assert.equal(f.counts().reservations, 0);
 });
}
test('limited operation requires an explicit stable request identity', async () => {
 const f = fixture(); const body = await f.post(undefined, null);
 assert.equal(body.provider, 'local'); assert.equal(f.counts().dispatches, 0);
});
test('actual repeated POST identity cannot reserve or dispatch the same stage twice', async () => {
 const f = fixture(), id = randomUUID(); await f.post(undefined, id); await f.post(undefined, id);
 assert.equal(f.counts().dispatches, 1); assert.equal(f.counts().held, 61719 + 4708);
});
for (const fault of ['lost-claim', 'late-claim', 'expired-price-receipt', 'credential-change', 'grant-revoked', 'profile-revoked', 'source-change', 'consent-revoked'] as const) test('actual POST retains the admission but does not dispatch on ' + fault, async () => {
 const f = fixture(); f.fail(fault); const body = await f.post();
 assert.equal(body.provider, 'local'); assert.equal(f.counts().dispatches, 0);
 assert.equal(f.counts().reservations, 1); assert.equal(f.counts().held, 61719 + 4708);
});
test('revoked actor cannot consume a late provider reply', async () => {
 const f = fixture(); f.fail('revoked-during-dispatch'); const body = await f.post();
 assert.equal(f.statuses.at(-1), 409); assert.equal(body.answer, undefined); assert.equal(typeof body.error, 'string');
 assert.equal(f.counts().dispatches, 1); assert.equal(f.counts().held, 61719 + 4708);
});
test('only a redacted question and derived preference flags leave the real handler', async () => {
 const f = fixture(); await f.post('Pack a light bag for children. Email synthetic@example.invalid password=SYNTHETIC-PRIVATE');
 assert.ok(f.payloads.length > 0);
 assert.doesNotMatch(f.payloads.join('\n'), /synthetic@example|SYNTHETIC-PRIVATE|SYNTHETIC-customer/);
});

test('actual historical financial observation is not refreshed by a new limited authorization or fresh price/quota', async () => {
 const f = fixture();
 // Only the historical timestamps are reused. Account, credit, evidence and
 // all I/O remain synthetic. This is NOT a renewed live balance observation.
 f.proof.verifiedAtMs = Date.parse('2026-11-02T12:42:16Z');
 f.proof.expiresAtMs = Date.parse('2026-11-02T13:42:16Z');
 const body = await f.post();
 assert.equal(body.provider, 'local');
 assert.equal(f.counts().dispatches, 0); assert.equal(f.counts().reservations, 0);
 assert.equal(f.counts().held, 61719);
 assert.equal(f.proof.verifiedAtMs, Date.parse('2026-11-02T12:42:16Z'));
});

test('funded Luna uses the same bounded Standard transport recipe as its approved measurement', async () => {
 const file = new URL('../lib/ai2/runtime/agent-provider-dispatch.ts', import.meta.url), require = createRequire(file);
 const output: Record<string, unknown> = {}; let captured: Record<string, unknown> | undefined;
 runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: output, require: (id: string) => {
   if (id === 'server-only') return {};
   if (id === './openai-compatible') return { callOpenAICompatibleProvider: async (value: Record<string, unknown>) => { captured = value; return { ok: true }; } };
   if (id === './anthropic-web' || id === './gemini-web') return {};
   return require(id);
  },
 });
 const fn = output.callInternalAgentProvider; assert.equal(typeof fn, 'function');
 if (typeof fn !== 'function') throw Error('existing dispatch missing');
 await Reflect.apply(fn, undefined, ['openai', { apiKey: 'SYNTHETIC-NOT-A-CREDENTIAL', model: 'gpt-6-luna' }, 'SYNTHETIC text',
  { prompt: 'SYNTHETIC prompt', language: 'en', timeoutMs: 1000, maxOutputTokens: 1024, standardBilling: true }]);
 assert.ok(captured); assert.equal(captured.chatProfile, 'gpt-6-luna-pilot');
 assert.equal(captured.retryCount, 0); assert.equal(captured.maxOutputTokens, 1024);
 assert.ok(Array.isArray(captured.preferredModels)); assert.equal(captured.preferredModels.length, 1);
 assert.equal(captured.preferredModels[0], 'gpt-6-luna');
});

test('valid private attachment remains local and cannot enter funded dialogue despite a stable request nonce', async () => {
  const f = fixture(), result = await f.postAttachment();
  assert.equal(f.statuses[0], 200, 'a valid attachment is accepted, not hidden behind request validation failure');
  assert.equal(result.provider, 'local'); assert.equal(f.counts().reservations, 0); assert.equal(f.counts().dispatches, 0);
  assert.equal(f.payloads.length, 0); assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_PRIVATE_ATTACHMENT_ONLY/);
});

function savedFinancial(f: ReturnType<typeof fixture>) {
  f.proof.verifiedAtMs = Date.parse('2026-11-02T12:42:16Z');
  f.proof.expiresAtMs = Date.parse('2026-11-02T13:42:16Z');
  const p = f.proof, sourceGrantId = '33333333-3333-4333-8333-333333333333';
  const financialSnapshotSha256 = createHash('sha256').update(JSON.stringify([
    sourceGrantId, p.provider, p.model, p.environment, p.accountId, p.projectId, p.mode, p.currency, p.serviceTier,
    p.authorizedCreditMicros, p.remainingCreditMicros, p.evidenceSha256, p.credentialSha256, p.verifiedAtMs, p.expiresAtMs,
    p.autoReload, p.postpaid, p.overdraft, p.concurrentAccountUsage,
  ])).digest('hex');
  return Object.assign(p.limitedOperation, { sourceGrantId, financialSnapshotSha256 });
}
for (const language of ['ar', 'en'] as const) test('saved financial observation keeps its true timestamps under the exact private opt-in ' + language, async () => {
  const f = fixture(language); savedFinancial(f);
  const before = { verified: f.proof.verifiedAtMs, expires: f.proof.expiresAtMs, credit: f.proof.remainingCreditMicros };
  const result = await f.post();
  assert.equal(result.provider, 'openai'); assert.equal(f.counts().dispatches, 1); assert.equal(f.counts().reservations, 1);
  assert.deepEqual({ verified: f.proof.verifiedAtMs, expires: f.proof.expiresAtMs, credit: f.proof.remainingCreditMicros }, before);
});
for (const fault of ['missing-hash', 'mismatch', 'tamper', 'expired-authority', 'expired-fees', 'expired-quota', 'expired-price', 'source-id', 'wrong-source'] as const) {
 test('saved financial authority cannot bypass its independent binding or deadline: ' + fault, async () => {
  const f = fixture(), a = savedFinancial(f);
  if (fault === 'missing-hash') Reflect.deleteProperty(a, 'financialSnapshotSha256');
  if (fault === 'mismatch') a.financialSnapshotSha256 = 'f'.repeat(64);
  if (fault === 'tamper') f.proof.remainingCreditMicros--;
  if (fault === 'expired-authority') a.expiresAtMs = instant - 1;
  if (fault === 'expired-fees') f.proof.allInChargeBound.observedAtMs = instant - 3600001;
  if (fault === 'expired-quota') f.proof.quotaWindowEndMs = instant - 1;
  if (fault === 'expired-price') {
    a.expiresAtMs = instant + 1200000; f.proof.quotaWindowEndMs = instant + 1200000;
    f.data.profiles.forEach(p => { p.measurement.expiresAtMs = instant + 1200000; });
    f.setClock(instant + 600001);
  }
  if (fault === 'source-id') a.sourceGrantId = f.proof.grantId;
  if (fault === 'wrong-source') a.sourceGrantId = '44444444-4444-4444-8444-444444444444';
  const result = await f.post();
  assert.equal(result.provider, 'local'); assert.equal(f.counts().reservations, 0); assert.equal(f.counts().dispatches, 0);
 });
}
test('saved-financial request replay retains the same hold and makes no second dispatch', async () => {
 const f = fixture(), requestId = randomUUID(); savedFinancial(f);
 await f.post(undefined, requestId); await f.post(undefined, requestId);
 assert.equal(f.counts().dispatches, 1); assert.equal(f.counts().held, 61719 + 4708);
});

for (const provider of AGENT_PROVIDER_IDS) test('existing-credit is conditional on the exact limited authority and evidence: ' + provider, async () => {
 const f = fixture('en', provider), result = await f.post();
 assert.equal(result.provider, provider); assert.equal(f.counts().reservations, 1); assert.equal(f.counts().dispatches, 1);
});
for (const provider of AGENT_PROVIDER_IDS.filter(p => !['openai', 'anthropic'].includes(p))) test('ordinary existing-credit remains blocked outside the new limited opt-in: ' + provider, async () => {
 const f = fixture('en', provider); Reflect.deleteProperty(f.proof, 'limitedOperation');
 const result = await f.post(); assert.equal(result.provider, 'local'); assert.equal(f.counts().reservations, 0); assert.equal(f.counts().dispatches, 0);
});
test('limited authority cannot accept an unknown provider or missing financial evidence', async () => {
 for (const bad of ['provider', 'postpaid', 'pricingEvidenceSha256'] as const) {
  const f = fixture('en', 'gemini');
  if (bad === 'provider') Object.assign(f.proof, { provider: 'SYNTHETIC-UNKNOWN' }); else Reflect.deleteProperty(f.proof, bad);
  const result = await f.post(); assert.equal(result.provider, 'local'); assert.equal(f.counts().reservations, 0); assert.equal(f.counts().dispatches, 0);
 }
});

test('the real client header normalizes the same request identity and prevents a second funded dispatch', async () => {
 const f = fixture(), id = randomUUID();
 await f.post(undefined, id.toUpperCase(), 'header'); await f.post(undefined, id, 'header');
 assert.equal(f.counts().dispatches, 1); assert.equal(f.counts().held, 61719 + 4708);
});

for (const path of ['classifier', 'answer'] as const) test('authority revoked during the final funding-policy await cannot dispatch: ' + path, async () => {
 const f = fixture(); f.fail('authority-during-policy-read', path === 'classifier' ? 1 : 2);
 const result = await f.post(path === 'classifier' ? 'Make my family day quieter' : undefined);
 assert.equal(f.revocations(), 1, 'the role is revoked inside the final awaited funding-policy read');
 assert.equal(f.counts().reservations, 1); assert.equal(f.counts().held, 61719 + 4708);
 assert.equal(f.counts().dispatches, 0, 'revocation during funding RPC must be rechecked before provider egress');
 if (path === 'answer') { assert.equal(f.statuses[0], 409); assert.equal(result.answer, undefined); }
 else { assert.equal(f.statuses[0], 200); assert.equal(result.provider, 'local'); }
});

const SEVEN_BOUNDED_MODELS: Record<AgentProviderId, string> = {
 openai: 'gpt-6-luna', gemini: 'gemini-3.8-flash', anthropic: 'claude-sonnet-5-5',
 xai: 'grok-4.20-0309-non-reasoning', deepseek: 'deepseek-flash', qwen: 'qwen3.8-flash', mistral: 'mistral-small-2603',
};
function isFixtureRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function realTaskTransport(provider: AgentProviderId, failureStatus?: number) {
 const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
 const models = SEVEN_BOUNDED_MODELS;
 const env: Record<string, string> = { OPENAI_API_KEY: credential, GOOGLE_GENERATIVE_AI_API_KEY: credential,
  GEMINI_API_KEY: 'SYNTHETIC-SECONDARY-IGNORED', ANTHROPIC_API_KEY: credential, XAI_API_KEY: credential,
  DEEPSEEK_API_KEY: credential, QWEN_API_KEY: credential, DASHSCOPE_API_KEY: 'SYNTHETIC-SECONDARY-IGNORED',
  MISTRAL_API_KEY: credential, DABRA_INTERNAL_AI_MODEL: models.openai,
  ...Object.fromEntries(AGENT_PROVIDER_IDS.map(p => ['DABRA_' + p.toUpperCase() + '_MODEL', models[p]])) };
 const cache = new Map<string, Record<string, unknown>>();
 let responseAnswer = '{"tool":"discover"}', refusal = failureStatus;
 const fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input), body: unknown = JSON.parse(String(init?.body));
  assert.ok(isFixtureRecord(body));
  calls.push({ url, body, headers: new Headers(init?.headers) });
  if (refusal) return Response.json({ error: { message: 'SYNTHETIC-refusal' } }, { status: refusal });
  const answer = responseAnswer, model = models[provider];
  if (provider === 'gemini') return Response.json({ modelVersion: model, candidates: [{ content: { parts: [{ text: answer }] } }],
   usageMetadata: { promptTokenCount: 16, candidatesTokenCount: 5, thoughtsTokenCount: 3, totalTokenCount: 24 } });
  if (provider === 'anthropic') return Response.json({ model, content: [{ type: 'text', text: answer }], usage: { input_tokens: 16, output_tokens: 8 } });
  return Response.json({ model, choices: [{ message: { content: answer } }], usage: {
   prompt_tokens: 16, completion_tokens: 8, completion_tokens_details: { reasoning_tokens: 3 } } });
 };
 function load(name: string): Record<string, unknown> {
  const old = cache.get(name); if (old) return old;
  const file = new URL('../lib/ai2/runtime/' + name + '.ts', import.meta.url), require = createRequire(file);
  const output: Record<string, unknown> = {}; cache.set(name, output);
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
   module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports: output, module: { exports: output }, require: (id: string) => {
   if (id === 'server-only') return {};
   if (id === '@/lib/ai2/runtime/openai-compatible') return load('openai-compatible');
   if (['./openai-compatible','./anthropic-web','./gemini-web'].includes(id)) return load(id.slice(2));
   return require(id);
  }, fetch, process: { env }, Date, Buffer, URL, Response, Request, Headers, AbortSignal, AbortController, setTimeout, clearTimeout }, { filename: file.pathname });
  return output;
 }
 const dispatch = load('agent-provider-dispatch'), configuration = dispatch.internalAgentConfiguration, run = dispatch.callInternalAgentProvider;
 if (typeof configuration !== 'function' || typeof run !== 'function') throw Error('ACTUAL_DISPATCH_MISSING');
 return { calls, env, respond: (answer: string) => { responseAnswer = answer; }, refuse: (status: number) => { refusal = status; },
  configurationFor: (candidate: string) => Reflect.apply(configuration, undefined, [candidate]),
  dispatch: (...args: unknown[]) => Reflect.apply(run, undefined, args),
  configuration: () => Reflect.apply(configuration, undefined, [provider]),
  run: async (outputCeiling = 1024) => Reflect.apply(run, undefined, [provider, Reflect.apply(configuration, undefined, [provider]), 'SYNTHETIC safe request',
   { prompt: 'SYNTHETIC prompt', language: 'en', timeoutMs: 1000, maxOutputTokens: outputCeiling, standardBilling: true, classifier: true }]) };
}
for (const provider of AGENT_PROVIDER_IDS) test('all-seven bounded transport ' + provider + ': actual model, alias, payload and total output ceiling', async () => {
 const f = realTaskTransport(provider), config: unknown = f.configuration();
 assert.ok(config && typeof config === 'object' && 'model' in config && 'apiKey' in config);
 assert.equal(config.model, SEVEN_BOUNDED_MODELS[provider]); assert.equal(config.apiKey, credential);
 const result: unknown = await f.run();
 assert.ok(result && typeof result === 'object' && 'ok' in result && 'outputTokens' in result);
 assert.equal(result.ok, true); assert.equal(result.outputTokens, 8);
 assert.equal(f.calls.length, 1);
 const call = f.calls[0], body = call.body;
 const endpoints = { openai: 'https://api.openai.com/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
  anthropic: 'https://api.anthropic.com/v1/messages', xai: 'https://api.x.ai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions', qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions' };
 assert.equal(call.url, endpoints[provider]);
 assert.equal(body.tools, undefined); assert.equal(body.web_search, undefined);
 if (provider === 'gemini') {
  assert.deepEqual(JSON.parse(JSON.stringify(body.generationConfig)), { maxOutputTokens: 1024 });
  assert.equal(call.headers.get('x-goog-api-key'), credential);
 } else {
  assert.equal(body.model, SEVEN_BOUNDED_MODELS[provider]);
  if (provider === 'openai') {
   assert.equal(body.max_completion_tokens, 1024); assert.equal(body.max_tokens, undefined);
   assert.equal(body.reasoning_effort, 'none'); assert.equal(body.service_tier, 'default');
  } else if (provider === 'qwen') {
   // The vendor documents up to10 tokens of drift; keep it inside the task ceiling.
   assert.equal(body.max_completion_tokens, 1014); assert.equal(body.max_tokens, undefined);
  } else assert.equal(body.max_tokens, 1024);
 }
});
for (const provider of AGENT_PROVIDER_IDS) test('all-seven bounded transport ' + provider + ': safe failure does not retry, discover models or fall back', async () => {
 const f = realTaskTransport(provider, 503), result: unknown = await f.run();
 assert.ok(result && typeof result === 'object' && 'ok' in result);
 assert.equal(result.ok, false); assert.equal(f.calls.length, 1);
});
test('all-seven bounded transport qwen: an output ceiling below vendor drift fails before any request', async () => {
 const f = realTaskTransport('qwen'), result: unknown = await f.run(10);
 assert.ok(result && typeof result === 'object' && 'ok' in result);
 assert.equal(result.ok, false); assert.equal(f.calls.length, 0);
});

for (const provider of AGENT_PROVIDER_IDS) for (const language of ['ar','en'] as const)
 test('all-seven actual funded POST ' + provider + '/' + language + ': stored policy selects real model/alias/registry and bounded payload', async () => {
  const f = fixture(language, provider, { realTransport: true }), result = await f.post();
  assert.ok(f.realTransport);
  assert.equal(result.provider, provider); assert.equal(result.agent.mutations, 0);
  assert.match(result.answer, language === 'ar' ? /تاريخ/ : /dates/i);
  assert.equal(f.realTransport.calls.length, 1); assert.equal(f.counts().reservations, 1);
  assert.equal(f.counts().held, 61719 + f.data.maxCostMicros);
  const call = f.realTransport.calls[0];
  assert.equal(f.proof.model, SEVEN_BOUNDED_MODELS[provider]);
  assert.doesNotMatch(JSON.stringify(call.body), /SYNTHETIC-customer|SYNTHETIC-account|SYNTHETIC-project/);
  if (provider === 'gemini') {
   assert.match(call.url, /gemini-3\.8-flash:generateContent$/);
   assert.deepEqual(JSON.parse(JSON.stringify(call.body.generationConfig)), { maxOutputTokens: 1024 });
  } else {
   assert.equal(call.body.model, SEVEN_BOUNDED_MODELS[provider]);
   assert.equal(call.body.max_completion_tokens ?? call.body.max_tokens, provider === 'qwen' ? 1014 : 1024);
  }
 });
for (const provider of AGENT_PROVIDER_IDS)
 test('all-seven actual funded POST ' + provider + ':499 retains hold and stops all retry/fallback stages', async () => {
  const f = fixture('en', provider, { realTransport: true });
  assert.ok(f.realTransport); f.realTransport.refuse(499); f.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  const result = await f.post('Make my family day quieter');
  assert.equal(result.provider, 'local'); assert.equal(f.realTransport.calls.length, 1);
  assert.equal(f.counts().reservations, 1); assert.equal(f.counts().held, 61719 + f.data.maxCostMicros);
 });

/** Durable v2 authority tests are synthetic. They neither activate a grant nor
 * replace the separately required fresh, all-in execution quote. */
const durableModule: Record<string, unknown> = {};
const durableRequire = createRequire(new URL('../lib/dabra/dialogue-durable-authority.ts', import.meta.url));
runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/dabra/dialogue-durable-authority.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: durableModule, module: { exports: durableModule }, require: (id: string) => id === 'server-only' ? {} : durableRequire(id),
}, { filename: 'dialogue-durable-authority.ts' });
function durableCall(name: string, ...args: unknown[]): unknown {
  const fn = durableModule[name]; if (typeof fn !== 'function') throw Error('DURABLE_EXPORT_MISSING');
  return Reflect.apply(fn, undefined, args);
}
function durableFixture() {
  const profiles = (['discover','intent.classify'] as const).map(capability => ({
    provider: 'openai' as const, measurement: { capability, language: 'en' as const, model: 'gpt-6-luna',
      environment: 'provider-benchmark' as const, caseSetSha: 'b'.repeat(64), sourceSha: 'c'.repeat(40),
      cases: 1, passed: 1, measuredAtMs: instant - 3600000, expiresAtMs: instant - 1,
      latencyMs: 1, inputTokenCeiling: 4096, outputTokenCeiling: 1024, costCeilingUsd: .01 },
  }));
  const accepted = profiles.map(p => durableCall('durableProfileSha256', p));
  if (!accepted.every((p): p is string => typeof p === 'string')) throw Error('PROFILE_BINDING_MISSING');
  const proof = {
    mode: 'bounded-account-charge', grantId: '11111111-1111-4111-8111-111111111111', provider: 'openai',
    model: 'gpt-6-luna', environment: 'provider-benchmark', accountId: 'SYNTHETIC-account', projectId: 'SYNTHETIC-project',
    credentialSha256: 'a'.repeat(64), evidenceSha256: 'b'.repeat(64), currency: 'USD', serviceTier: 'standard',
    pricingEvidenceSha256: 'c'.repeat(64),
    accountTerms: { schema: 'task217-account-charge-terms-v1', observedAtMs: instant - 1000, evidenceSha256: 'd'.repeat(64),
      validity: 'until-contract-change', risks: { autoReload: 'unknown', postpaid: 'allowed', overdraft: 'unknown', concurrentAccountUsage: 'unknown' },
      fundingChargeProtection: { kind: 'documented-manual-funding-only', evidenceSha256: 'e'.repeat(64) },
      allInChargeBound: { schema: 'all-in-account-charge-bound-v1', currency: 'USD',
        coverage: 'all-applicable-api-tax-fx-and-funding-charges', maxAdditionalMicros: 100, evidenceSha256: 'f'.repeat(64) } },
    limitedOperation: { schema: 'task217-limited-operation-v2', authorizationId: '22222222-2222-4222-8222-222222222222',
      taskId: 'task217-text-pilot-2026-11-01', dataScope: 'redacted-travel-or-server-units', maxCostMicros: 1000000, maxAttempts: 28,
      authorizedAtMs: instant - 1, duration: 'until-revoked-or-binding-change', providerRisk: 'bounded-account-liability-with-observed-risks',
      acceptedProfileSha256s: accepted.sort(), contractSha256: 'a'.repeat(64), bindingSha256: '0'.repeat(64) },
  };
  const binding = durableCall('durableAuthorityBindingSha256', proof);
  if (typeof binding !== 'string') throw Error('AUTHORITY_BINDING_MISSING');
  proof.limitedOperation.bindingSha256 = binding;
  return { proof, profiles };
}

test('durable v2 authority remains the same after an hour, a day and a year, without a fabricated credit or redated evidence', () => {
  const f = durableFixture(), original = JSON.stringify(f.proof);
  for (const elapsed of [0,3600001,86400001,365 * 86400000]) {
    assert.equal(durableCall('validDurableAccountChargeProof', f.proof, instant + elapsed), true);
    for (const p of f.profiles) assert.equal(durableCall('durableAuthorityAcceptsProfile', f.proof, p, instant + elapsed), true);
  }
  assert.equal(JSON.stringify(f.proof), original);
  assert.equal('expiresAtMs' in f.proof.limitedOperation, false);
  assert.equal('authorizedCreditMicros' in f.proof, false);
  assert.equal('remainingCreditMicros' in f.proof, false);
});

for (const field of ['credentialSha256','model','accountId','projectId','pricingEvidenceSha256'] as const)
test('durable v2 rejects changed binding without inheriting old authority: ' + field, () => {
  const f = durableFixture();
  assert.equal(durableCall('validDurableAccountChargeProof', { ...f.proof,
    [field]: field.includes('Sha256') ? '9'.repeat(64) : 'SYNTHETIC-changed' }, instant), false);
});

test('durable v2 requires separate evidence for no automatic funding even when autoReload is unknown', () => {
  const f = durableFixture();
  assert.equal(durableCall('validDurableAccountChargeProof', { ...f.proof,
    accountTerms: { ...f.proof.accountTerms, fundingChargeProtection: undefined } }, instant), false);
  assert.equal(durableCall('validDurableAccountChargeProof', { ...f.proof,
    accountTerms: { ...f.proof.accountTerms, fundingChargeProtection: { kind: 'inference-only-key', evidenceSha256: 'e'.repeat(64) } } }, instant), false);
});

for (const change of [
  { maxCostMicros: 1250000 }, { maxAttempts: 29 }, { expiresAtMs: Number.MAX_SAFE_INTEGER },
  { authorizedAtMs: instant + 1 }, { schema: 'task217-limited-operation-v1' }, { providerRisk: 'assume-safe' },
] as const) test('durable v2 rejects expanded, expiring or inherited authority: ' + Object.keys(change)[0], () => {
  const f = durableFixture();
  assert.equal(durableCall('validDurableAccountChargeProof', { ...f.proof,
    limitedOperation: { ...f.proof.limitedOperation, ...change } }, instant), false);
});

test('durable v2 preserves measurement provenance and rejects changed contract, outcomes or dates', () => {
  const f = durableFixture();
  for (const change of [{ sourceSha: 'a'.repeat(40) }, { passed: 0 }, { expiresAtMs: instant + 100000 }, { measuredAtMs: instant }]) {
    const p = f.profiles[0];
    assert.equal(durableCall('durableAuthorityAcceptsProfile', f.proof, { ...p, measurement: { ...p.measurement, ...change } }, instant), false);
  }
  assert.equal(durableCall('validDurableAccountChargeProof', { ...f.proof,
    limitedOperation: { ...f.proof.limitedOperation, contractSha256: '9'.repeat(64) } }, instant), false);
});

for (const provider of AGENT_PROVIDER_IDS) for (const language of ['ar','en'] as const)
test('continuous v2 actual POST ' + provider + ' ' + language + ': original measurement and standing authority, private quote before one bounded dispatch', async () => {
  const f=fixture(language,provider,{realTransport:true,continuous:true}), before=JSON.stringify(f.data.profiles);
  const body=await f.post();
  assert.equal(body.provider,provider); assert.equal(body.agent.mutations,0);
  assert.match(body.answer,language==='ar'?/تاريخ/:/dates/i);
  assert.equal(f.realTransport?.calls.length,1); assert.equal(f.counts().reservations,1); assert.equal(f.publicFetches(),1);
  assert.equal(f.ledgerState().admittedAttempts,7); assert.equal(f.counts().held,61719+f.data.maxCostMicros);
  assert.equal(JSON.stringify(f.data.profiles),before);
  assert.ok(f.continuousProof); assert.equal('expiresAtMs' in f.continuousProof.limitedOperation,false);
  const raw=f.serializedClaims[0].p_proof; assert.ok(isFixtureRecord(raw));
  assert.equal(raw.mode,'bounded-account-charge'); assert.equal('remainingCreditMicros' in raw,false);
  const execution=raw.executionPricing; assert.ok(isFixtureRecord(execution));
  assert.equal(execution.attemptId,f.serializedClaims[0].p_attempt_id);
  assert.equal(execution.requestId,f.serializedClaims[0].p_request_id);
  assert.equal(execution.subjectHash,f.serializedClaims[0].p_subject_hash);
  assert.equal(execution.authorityBindingSha256,f.continuousProof.limitedOperation.bindingSha256);
  const serialized=JSON.stringify(body);
  for(const privateValue of [credential,'SYNTHETIC-account','SYNTHETIC-project','executionPricing',f.continuousProof.limitedOperation.bindingSha256])
    assert.equal(serialized.includes(privateValue),false);
});

for (const provider of AGENT_PROVIDER_IDS)
test('continuous v2 actual POST ' + provider + ': HTTP499 retains liability and stops classifier chain without fallback or retry', async () => {
  const f=fixture('en',provider,{realTransport:true,continuous:true});
  f.realTransport?.refuse(499); f.env.DABRA_PROVIDER_FALLBACK_ENABLED='true';
  const body=await f.post('Make my family day quieter');
  assert.equal(body.provider,'local'); assert.equal(f.realTransport?.calls.length,1);
  assert.equal(f.counts().reservations,1); assert.equal(f.counts().held,61719+f.data.maxCostMicros);
  assert.equal(f.ledgerState().admittedAttempts,7);
});

test('continuous v2 actual POST continues after hour and day by renewing public facts, without renewing grant, measurement or lifetime envelope', async () => {
  const f=fixture('en','openai',{realTransport:true,continuous:true}), authority=JSON.stringify(f.continuousProof), measurements=JSON.stringify(f.data.profiles);
  for(const at of [instant,instant+3600001,instant+86400001]) { f.setClock(at); assert.equal((await f.post()).provider,'openai'); }
  assert.equal(f.publicFetches(),3); assert.equal(f.counts().reservations,3);
  assert.equal(f.counts().held,61719+3*f.data.maxCostMicros);
  assert.equal(f.ledgerState().admittedAttempts,9); assert.equal(JSON.stringify(f.continuousProof),authority);
  assert.equal(JSON.stringify(f.data.profiles),measurements);
});

test('continuous v2 actual POST shares a freshly observed quote between classifier and dialogue but reserves both stages', async () => {
  const f=fixture('en','openai',{realTransport:true,continuous:true}), body=await f.post('Make my family day quieter');
  assert.equal(body.provider,'openai'); assert.equal(body.understandingProvider,'openai');
  assert.equal(f.realTransport?.calls.length,2); assert.equal(f.counts().reservations,2);
  assert.equal(f.publicFetches(),1); assert.equal(f.counts().held,61719+2*f.data.maxCostMicros);
});

for(const selected of ['unknown','openai','default','auto'] as const)
test('continuous v2 actual POST honors explicit provider selection and default despite seven configured keys: '+selected, async () => {
  const f=fixture('en','anthropic',{realTransport:true,continuous:true});
  if(selected==='default') Reflect.deleteProperty(f.env,'DABRA_AI_PROVIDER'); else f.env.DABRA_AI_PROVIDER=selected;
  const body=await f.post(), allowed=selected==='auto';
  assert.equal(body.provider,allowed?'anthropic':'local');
  assert.equal(f.realTransport?.calls.length,allowed?1:0); assert.equal(f.publicFetches(),allowed?1:0);
});

for(const fault of ['lost-claim','expired-price-receipt','pricing-expired-during-claim','credential-change','grant-revoked','profile-revoked','source-change','consent-revoked','authority-during-policy-read'] as const)
test('continuous v2 actual POST preserves hold and rejects changed authority/quote at awaited boundary: '+fault, async () => {
  const f=fixture('en','openai',{realTransport:true,continuous:true}); f.fail(fault);
  const body=await f.post();
  assert.equal(body.provider,'local'); assert.equal(f.realTransport?.calls.length,0);
  assert.equal(f.counts().reservations,1); assert.equal(f.counts().held,61719+f.data.maxCostMicros);
});

test('continuous v2 actual POST stale source failure leaves authority configured and blocks only spending, without stale fallback', async () => {
  const f=fixture('en','openai',{realTransport:true,continuous:true});
  assert.equal((await f.post()).provider,'openai'); const authority=JSON.stringify(f.continuousProof), held=f.counts().held;
  f.setClock(instant+900001); f.fail('pricing-unavailable');
  assert.equal((await f.post()).provider,'local'); assert.equal(f.publicFetches(),2);
  assert.equal(f.counts().reservations,1); assert.equal(f.counts().held,held);
  assert.equal(JSON.stringify(f.continuousProof),authority); assert.equal(f.data.proofs.length,1);
});

test('continuous v2 actual POST stable request ID never retries a previously held attempt', async () => {
  const f=fixture('en','openai',{realTransport:true,continuous:true}), id=randomUUID();
  assert.equal((await f.post(undefined,id)).provider,'openai'); const held=f.counts().held;
  assert.equal((await f.post(undefined,id)).provider,'local'); assert.equal(f.realTransport?.calls.length,1);
  assert.equal(f.counts().held,held); assert.equal(f.ledgerState().admittedAttempts,7);
});

for(const exhausted of ['money','attempts','new-day'] as const)
test('continuous v2 actual POST cannot reset the shared historical and unknown envelope: '+exhausted, async () => {
  const f=fixture('en','openai',{realTransport:true,continuous:true});
  if(exhausted==='money') f.seedHistorical(1000000-f.data.maxCostMicros+1,6);
  else f.seedHistorical(61719,exhausted==='new-day'?27:28);
  if(exhausted==='new-day') { assert.equal((await f.post()).provider,'openai'); f.setClock(instant+86400001); }
  const held=f.counts().held, attempts=f.ledgerState().admittedAttempts, calls=f.realTransport?.calls.length??0;
  assert.equal((await f.post()).provider,'local'); assert.equal(f.realTransport?.calls.length,calls);
  assert.equal(f.counts().held,held); assert.equal(f.ledgerState().admittedAttempts,attempts);
});

for(const field of ['autoReload','postpaid','overdraft','concurrentAccountUsage','funding-kind'] as const)
test('durable v2 rejects JSON arrays masquerading as risk/funding strings: '+field,()=>{
  const f=durableFixture(), terms={...f.proof.accountTerms,risks:{...f.proof.accountTerms.risks},fundingChargeProtection:{...f.proof.accountTerms.fundingChargeProtection}};
  if(field==='funding-kind') Reflect.set(terms.fundingChargeProtection,'kind',[terms.fundingChargeProtection.kind]);
  else Reflect.set(terms.risks,field,[terms.risks[field]]);
  const malformed={...f.proof,accountTerms:terms,limitedOperation:{...f.proof.limitedOperation}};
  const binding=durableCall('durableAuthorityBindingSha256',malformed);assert.equal(typeof binding,'string');
  if(typeof binding!=='string')throw Error('SYNTHETIC_BINDING_REQUIRED');
  malformed.limitedOperation.bindingSha256=binding;
  assert.equal(durableCall('validDurableAccountChargeProof',malformed,instant),false);
});

for(const field of ['autoReload','postpaid','overdraft','concurrentAccountUsage','funding-kind'] as const)
test('continuous v2 actual POST rejects non-string JSON funding properties before public fetch or reservation: '+field,async()=>{
  const f=fixture('en','openai',{realTransport:true,continuous:true});assert.ok(f.continuousProof);
  const terms={...f.continuousProof.accountTerms,risks:{...f.continuousProof.accountTerms.risks},
    fundingChargeProtection:{...f.continuousProof.accountTerms.fundingChargeProtection}};
  if(field==='funding-kind')Reflect.set(terms.fundingChargeProtection,'kind',[terms.fundingChargeProtection.kind]);
  else Reflect.set(terms.risks,field,[terms.risks[field]]);
  const malformed={...f.continuousProof,accountTerms:terms,limitedOperation:{...f.continuousProof.limitedOperation}};
  const binding=durableCall('durableAuthorityBindingSha256',malformed);
  if(typeof binding!=='string')throw Error('SYNTHETIC_BINDING_REQUIRED');malformed.limitedOperation.bindingSha256=binding;
  f.data.proofs=[malformed];
  assert.equal((await f.post()).provider,'local');assert.equal(f.publicFetches(),0);
  assert.equal(f.counts().reservations,0);assert.equal(f.realTransport?.calls.length,0);
});

function mixedFundingFixture(selection:'default'|'explicit'|'auto'|'unknown'|'expired-v1'|'provider-failure'='default') {
  const f=fixture('en','openai',{realTransport:true}), other=fixture('en','deepseek',{realTransport:true,continuous:true});
  assert.ok(other.continuousProof);
  const original=other.continuousProof, foreign={...original,grantId:randomUUID(),
    limitedOperation:{...original.limitedOperation,authorizationId:randomUUID(),bindingSha256:'0'.repeat(64)}};
  const digest=durableCall('durableAuthorityBindingSha256',foreign);if(typeof digest!=='string')throw Error('SYNTHETIC_BINDING_REQUIRED');
  foreign.limitedOperation.bindingSha256=digest;
  f.data.proofs=[f.proof,foreign];f.data.profiles=[...f.data.profiles,...other.data.profiles];
  f.data.maxCostMicros=Math.max(f.data.maxCostMicros,other.data.maxCostMicros);
  if(selection==='default')Reflect.deleteProperty(f.env,'DABRA_AI_PROVIDER');
  else f.env.DABRA_AI_PROVIDER=selection==='auto'?'auto':selection==='unknown'?'unknown':'openai';
  if(selection==='expired-v1')f.proof.expiresAtMs=instant-1;
  if(selection==='provider-failure'){f.realTransport?.refuse(499);f.env.DABRA_PROVIDER_FALLBACK_ENABLED='true';}
  return {f,other};
}
for(const selected of ['default','explicit','auto','unknown','expired-v1','provider-failure'] as const)
test('T217-CONT-F1 mixed OpenAI/v1 and DeepSeek/v2 respects selected proof: '+selected,async()=>{
  const {f,other}=mixedFundingFixture(selected),body=await f.post();
  const admitted=!['unknown','expired-v1'].includes(selected),answered=admitted&&selected!=='provider-failure';
  assert.equal(body.provider,answered?'openai':'local');
  assert.equal(f.counts().reservations,admitted?1:0);assert.equal(f.realTransport?.calls.length,admitted?1:0);
  assert.equal(f.publicFetches(),0,'a different provider durable grant must not force a public-price fetch for v1');
  assert.equal(other.counts().dispatches,0);assert.equal(other.publicFetches(),0);
  if(admitted){const serialized=f.serializedClaims[0].p_proof;assert.ok(isFixtureRecord(serialized));
    assert.equal(serialized.mode,'existing-credit');assert.equal('executionPricing' in serialized,false);}
});

test('T217-CONT-F1 same-provider expired profile uses its matching durable authority, never borrows v1 freshness',async()=>{
  const f=fixture('en','openai',{realTransport:true,continuous:true}),legacy=fixture('en','openai',{realTransport:true});
  assert.ok(f.continuousProof);legacy.proof.grantId=randomUUID();legacy.proof.limitedOperation.authorizationId=randomUUID();
  f.data.proofs=[legacy.proof,f.continuousProof];
  assert.equal((await f.post()).provider,'openai');assert.equal(f.publicFetches(),1);
  const raw=f.serializedClaims[0].p_proof;assert.ok(isFixtureRecord(raw));assert.equal(raw.mode,'bounded-account-charge');
});


test('unknown output acceptance blocks actual durable POST before pricing, reservation and provider transport',async()=>{
 const f=fixture('en','openai',{realTransport:true,continuous:true,unqualifiedOutput:true});
 const result=await f.post();assert.equal(result.provider,'local');assert.equal(f.counts().reservations,0);
 assert.equal(f.counts().dispatches,0);assert.equal(f.publicFetches(),0);assert.ok(f.realTransport);assert.equal(f.realTransport.calls.length,0);
});

// The real POST selects only the named capability, so a claim from the other
// route cannot conceal a known configuration rejection.
for (const language of ['ar', 'en'] as const) for (const path of ['limited-planner', 'handoff'] as const) {
  for (const configuration of ['missing', 'key-digest-mismatch', 'model-mismatch'] as const) {
    test('configuration preflight actual POST ' + language + ' ' + path + ': ' + configuration + ' cannot reserve or dispatch', async () => {
      const f = fixture(language, 'openai', { configuration });
      const capability = path === 'limited-planner' ? 'intent.classify' : 'discover';
      f.data.profiles = f.data.profiles.filter(p => p.measurement.capability === capability);
      await f.post(path === 'limited-planner' ? 'Make my family day quieter' : undefined);
      assert.ok(f.serializedClaims.every(claim => claim.p_stage === capability), 'only the intended actual path may claim');
      assert.equal(f.counts().dispatches, 0);
      assert.equal(f.counts().reservations, 0, 'known invalid configuration must fail before admission');
      assert.deepEqual(f.ledgerState(), { held: 61719, admittedAttempts: 6 });
    });
  }
  test('configuration preflight actual POST ' + language + ' ' + path + ': matching configuration claims and dispatches once', async () => {
    const f = fixture(language);
    const capability = path === 'limited-planner' ? 'intent.classify' : 'discover';
    f.data.profiles = f.data.profiles.filter(p => p.measurement.capability === capability);
    await f.post(path === 'limited-planner' ? 'Make my family day quieter' : undefined);
    assert.equal(f.counts().reservations, 1);
    assert.equal(f.counts().dispatches, 1);
    assert.equal(f.serializedClaims[0]?.p_stage, capability);
    assert.ok(f.ledgerState().held > 61719);
    assert.equal(f.ledgerState().admittedAttempts, 7);
  });
}

for (const language of ['ar', 'en'] as const) test('configuration final recheck actual POST ' + language + ': a binding change during the handoff await preserves one hold and cannot dispatch', async () => {
  const f = fixture(language);
  f.data.profiles = f.data.profiles.filter(p => p.measurement.capability === 'discover');
  f.fail('credential-during-policy-read', 2);
  await f.post();
  assert.equal(f.counts().reservations, 1);
  assert.equal(f.counts().dispatches, 0);
  assert.ok(f.ledgerState().held > 61719);
  assert.equal(f.ledgerState().admittedAttempts, 7);
});

for (const fault of ['configuration-missing', 'authority-throws-after-admission', 'lost-claim'] as const) {
  test('preparation diagnostic actual POST: ' + fault + ' emits only a closed private outcome', async () => {
    const f = fixture('en', 'openai', fault === 'configuration-missing' ? { configuration: 'missing' } : {});
    f.data.profiles = f.data.profiles.filter(p => p.measurement.capability === 'discover');
    if (fault !== 'configuration-missing') f.fail(fault);
    const diagnostics: unknown[] = [];
    const observe = (value: unknown) => { diagnostics.push(value); };
    const privateChannel = diagnosticChannel('dir3com.dabra.agent-preparation');
    privateChannel.subscribe(observe);
    let body: unknown;
    try { body = await f.post(); } finally { privateChannel.unsubscribe(observe); }
    assert.equal(f.counts().dispatches, 0);
    assert.equal(f.counts().reservations, fault === 'configuration-missing' ? 0 : 1);
    assert.equal(diagnostics.length, 1);
    const event = diagnostics[0];
    assert.ok(isFixtureRecord(event));
    assert.deepEqual(Object.keys(event).sort(), ['capability', 'reason', 'reservation', 'stage']);
    assert.equal(event.capability, 'discover');
    assert.equal(event.reservation, fault === 'configuration-missing' ? 'not_attempted' : fault === 'lost-claim' ? 'unknown' : 'accepted');
    assert.equal(event.stage, fault === 'configuration-missing' ? 'preflight' : fault === 'lost-claim' ? 'admission' : 'post_admission');
    assert.equal(event.reason, fault === 'configuration-missing' ? 'configuration_missing' : fault === 'lost-claim' ? 'admission_unavailable' : 'preparation_exception');
    for (const value of [JSON.stringify(body), JSON.stringify(event)]) {
      assert.doesNotMatch(value, /SYNTHETIC_PRIVATE_DIAGNOSTIC|SYNTHETIC-NOT-A-CREDENTIAL|SYNTHETIC-account|credentialSha256|stack|proof/);
    }
    if (fault !== 'configuration-missing') { assert.ok(f.ledgerState().held > 61719); assert.equal(f.ledgerState().admittedAttempts, 7); }
  });
}

test('pricing success followed by authority loss is not mislabeled as pricing failure',async()=>{
 const f=fixture('en','openai',{realTransport:true,continuous:true});
 f.data.profiles=f.data.profiles.filter(p=>p.measurement.capability==='discover');
 f.fail('authority-during-public-pricing');
 const events:unknown[]=[];const observe=(value:unknown)=>{events.push(value);};
 const privateChannel=diagnosticChannel('dir3com.dabra.agent-preparation');
 privateChannel.subscribe(observe);
 try{const body=await f.post();assert.equal(body.provider,'local');}finally{privateChannel.unsubscribe(observe);}
 assert.equal(f.publicFetches(),1);assert.equal(f.revocations(),1);
 assert.equal(f.counts().reservations,0);assert.equal(f.counts().dispatches,0);
 assert.equal(f.realTransport?.calls.length,0);
 assert.deepEqual(f.ledgerState(),{held:61719,admittedAttempts:6});
 assert.equal(events.length,1);const event=events[0];assert.ok(isFixtureRecord(event));
 assert.equal(event.reason,'authority_or_policy_unavailable');assert.equal(event.reservation,'not_attempted');assert.equal(event.stage,'preflight');
});
