import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { AGENT_PROVIDER_IDS, type AgentProviderId } from '../lib/dabra/agent-capabilities';

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

function fixture(language: 'ar' | 'en' = 'en', provider: AgentProviderId = 'openai') {
  let clock = instant, actorCurrent = true, dispatches = 0, reservations = 0;
  let fault: 'none' | 'lost-claim' | 'late-claim' | 'expired-price-receipt' | 'provider-unknown' | 'revoked-during-dispatch' | 'credential-change' | 'grant-revoked' | 'profile-revoked' | 'source-change' | 'consent-revoked' = 'none';
  let configuredKey = credential;
  const requests = new Set<string>(), payloads: string[] = [], statuses: number[] = [];
  let held = 61719;
  const subject = 'SYNTHETIC-customer', model = 'SYNTHETIC-limited';
  const limits = { uniqueUsers: 10, requestsPerUser: 6, requestsTotal: 60,
    inputTokensPerUser: 24576, outputTokensPerUser: 6144, inputTokensTotal: 245760, outputTokensTotal: 61440 };
  const rate = { schema: 'reviewed-standard-pricing-v1', provider, model,
    serviceTier: 'standard', currency: 'USD', inputMicrosPerMillion: 1000000, outputMicrosPerMillion: 2000000,
    observedAtMs: instant - 1000, validFromMs: instant - 1, expiresAtMs: instant + 600000,
    sourceUrl: 'https://' + ({ openai: 'developers.openai.com', anthropic: 'platform.claude.com', gemini: 'ai.google.dev', xai: 'docs.x.ai', deepseek: 'api-docs.deepseek.com', qwen: 'www.alibabacloud.com', mistral: 'docs.mistral.ai' })[provider] + '/SYNTHETIC-limited' };
  const rateSha = createHash('sha256').update(JSON.stringify(Object.values(rate))).digest('hex');
  const proof = {
    grantId: '11111111-1111-4111-8111-111111111111', provider, model, environment: 'provider-benchmark',
    accountId: 'SYNTHETIC-account', projectId: 'SYNTHETIC-project',
    evidenceSha256: 'a'.repeat(64), credentialSha256: createHash('sha256').update(credential).digest('hex'),
    verifiedAtMs: instant - 1, expiresAtMs: instant + 600000, quotaWindowStartMs: instant - 1000, quotaWindowEndMs: instant + 600000,
    remainingRequests: 20, remainingInputTokens: 81920, remainingOutputTokens: 20480,
    autoReload: 'off', postpaid: 'blocked', overdraft: 'unknown', concurrentAccountUsage: 'bounded',
    mode: 'existing-credit', currency: 'USD', serviceTier: 'standard',
    pricing: 'standard-2026-10-28', pricingEvidenceSha256: rateSha, authorizedCreditMicros: 1000000, remainingCreditMicros: 1000000,
    allInChargeBound: { schema: 'all-in-charge-bound-v1', currency: 'USD', coverage: 'all-applicable-api-charges',
      maxAdditionalMicros: 100, observedAtMs: instant - 1000, evidenceSha256: 'd'.repeat(64) },
    limitedOperation: { schema: 'task217-limited-operation-v1', authorizationId: '22222222-2222-4222-8222-222222222222',
      taskId: 'task217-text-pilot-2026-11-01', maxCostMicros: 1000000, maxAttempts: 28,
      dataScope: 'redacted-travel-or-server-units', providerRisk: 'overdraft-unknown',
      authorizedAtMs: instant - 1, expiresAtMs: instant + 600000 },
  };
  const profiles = (['discover', 'intent.classify'] as const).map(capability => ({ provider, measurement: {
    capability, language, model, environment: 'provider-benchmark', cases: 1, passed: 1,
    caseSetSha: 'b'.repeat(64), sourceSha: 'c'.repeat(40), measuredAtMs: instant - 1, expiresAtMs: instant + 600000,
    latencyMs: 1, inputTokenCeiling: 4096, outputTokenCeiling: 256, costCeilingUsd: 0.004708,
  } }));
  let enabled = true;
  const context = { role: 'customer', taskAuthority: { kind: 'customer', actorId: subject, ownerId: subject },
    isTaskAuthorityCurrent: async () => actorCurrent, readRequests: async () => ({ kind: 'forbidden' }) };
  const data = { enabled, profiles, proofs: [proof], maxCostMicros: 4708, dailyLimits: limits };
  const rpc = async (name: string, p: Record<string, unknown>, signal: AbortSignal) => {
    if (signal.aborted) return { data: null, error: 'aborted' };
    if (name === 'get_dabra_dialogue_funding_policy') return { data: { ...data, enabled }, error: null };
    assert.equal(name, 'reserve_dabra_dialogue_attempt');
    reservations++;
    const key = String(p.p_request_id) + ':' + String(p.p_stage);
    if (requests.has(key) || held + Number(p.p_cost_micros) > 1000000) return { data: { decision: 'denied' }, error: null };
    requests.add(key); held += Number(p.p_cost_micros);
    if (fault === 'lost-claim') return { data: null, error: 'synthetic lost receipt after commit' };
    if (fault === 'late-claim') clock = instant + 600001;
    if (fault === 'credential-change') configuredKey = 'SYNTHETIC-DIFFERENT-CREDENTIAL';
    if (fault === 'grant-revoked') data.proofs = [];
    if (fault === 'profile-revoked') data.profiles = [];
    if (fault === 'source-change') data.profiles = data.profiles.map(p => ({ ...p, measurement: { ...p.measurement, sourceSha: 'f'.repeat(40) } }));
    if (fault === 'consent-revoked') enabled = false;
    return { data: { decision: 'admitted', attempt_id: p.p_attempt_id,
      pricing_expires_at_ms: fault === 'expired-price-receipt' ? instant - 1 : instant + 600000 }, error: null };
  };
  const transport = {
    internalAgentConfiguration: (candidate: string) => candidate === provider ? { apiKey: configuredKey, model } : null,
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
      return { ok: true, model, answer, citations: [], inputTokens: 16, outputTokens: 16 };
    },
  };
  const modules = new Map<string, Record<string, unknown>>();
  class Clock extends Date { static now() { return clock; } }
  const env = { DABRA_INTERNAL_AI_ENABLED: 'true', DABRA_AI_PROVIDER: 'openai',
    DABRA_PROVIDER_FALLBACK_ENABLED: 'false', DABRA_DIALOGUE_FUNDING_POLICY: 'task217-existing-credit-v2' };
  const names = new Set(['agent-dialogue', 'dialogue-funding', 'dialogue-funding-store', 'agent-planner', 'agent-handoff', 'agent-measurement']);
  function load(name: string): Record<string, unknown> {
    const cached = modules.get(name); if (cached) return cached;
    const file = new URL('../lib/dabra/' + name + '.ts', import.meta.url), require = createRequire(file);
    const output: Record<string, unknown> = {}; modules.set(name, output);
    runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText, { exports: output, module: { exports: output }, require: (id: string) => {
      if (id === 'server-only') return {};
      if (id === '../ai2/observability/provider-attempts') return { createDabraProviderRequestId: randomUUID, mapProviderErrorCategory: (value: unknown) => value };
      if (id === '../supabase/server') return { supabaseAdmin: { rpc: (name: string, params: Record<string, unknown>) => ({
        abortSignal: (signal: AbortSignal) => rpc(name, params, signal),
      }) } };
      if (id === './dialogue-pricing-approvals') return { APPROVED_DIALOGUE_STANDARD_PRICING: [{ ...rate, sha256: rateSha }] };
      if (id === '../ai2/runtime/agent-provider-dispatch') return transport;
      if (id.startsWith('./') && names.has(id.slice(2))) return load(id.slice(2));
      return require(id);
    }, Date: Clock, process: { env }, Buffer, URL, AbortController, AbortSignal, setTimeout, clearTimeout, queueMicrotask, console }, { filename: file.pathname });
    return output;
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
  return { proof, data, context, payloads, env, statuses,
    fail: (value: typeof fault) => { fault = value; },
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
