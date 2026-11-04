import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { AGENT_PROVIDER_IDS, APPROVED_AGENT_CAPABILITY_PROFILES, type AgentProviderId } from '../lib/dabra/agent-capabilities';
import { prepareAgentProviderAttempt, PUBLIC_DIALOGUE_DAILY_LIMITS } from '../lib/dabra/agent-dialogue';
import { callInternalAgentProvider } from '../lib/ai2/runtime/agent-provider-dispatch';
import { firstProfileMeasurementMain, platformUnitsQualificationMain, main, measurementSourceSha } from '../scripts/dabra-provider-certification';
import type { ApprovedFirstProfilePlan, MeasurementDependencies } from '../lib/dabra/agent-measurement';
import type { FundingRpc } from '../lib/dabra/dialogue-funding-store';

const start = Date.parse('2026-11-01T10:00:00Z');
const credential = 'SYNTHETIC-NOT-A-CREDENTIAL', model = 'test-model', subject = 'SYNTHETIC-measurement';
const sourceSha = 'b'.repeat(40);
const advice = {
  ar: 'رتّب حقيبة السفر بأغراض خفيفة، وخذ فترات راحة في الظل مع الأطفال. هل تفضّلون نشاطًا داخليًا أم خارجيًا؟',
  en: 'Pack a light bag and plan quiet rest breaks in the shade with children. Would you prefer an indoor or outdoor stop?',
};
function fixture(provider: AgentProviderId = 'anthropic', pricingWindowMs = 600000) {
  let clock = start, dispatches = 0, reservations = 0, held = 0, checks = 0;
  let configuredModel = model, configuredKey = credential, activeSource = sourceSha;
  const cache = new Map<string, unknown>();
  const approval = {
    schema: 'reviewed-standard-pricing-v1', provider, model, serviceTier: 'standard', currency: 'USD',
    inputMicrosPerMillion: 1000000, outputMicrosPerMillion: 2000000, observedAtMs: start - 1000,
    validFromMs: start - 500, expiresAtMs: start + pricingWindowMs,
    sourceUrl: provider === 'openai' ? 'https://developers.openai.com/api/docs/models/test-model' : 'https://platform.claude.com/docs/test-model',
  };
  const rateSha = createHash('sha256').update(JSON.stringify(Object.values(approval))).digest('hex');
  class Clock extends Date { static now() { return clock; } }
  function load(name: string): unknown {
    if (cache.has(name)) return cache.get(name);
    const url = new URL('../lib/dabra/' + name + '.ts', import.meta.url), require = createRequire(url);
    const fixtureModule = { exports: {} }; cache.set(name, fixtureModule.exports);
    runInNewContext(ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, { module: fixtureModule, exports: fixtureModule.exports, require: (id: string) => {
      if (id === 'server-only') return {};
      if (id === '../supabase/server') return { supabaseAdmin: null };
      if (id === './dialogue-pricing-approvals') return { APPROVED_DIALOGUE_STANDARD_PRICING: [{ ...approval, sha256: rateSha }] };
      if (['./dialogue-funding','./dialogue-funding-store','./agent-measurement'].includes(id)) return load(id.slice(2));
      return require(id);
    }, Date: Clock, Buffer, URL, AbortController, AbortSignal, setTimeout, clearTimeout, console }, { filename: url.pathname });
    return fixtureModule.exports;
  }
  const measurement = load('agent-measurement') as typeof import('../lib/dabra/agent-measurement');
  const funding = load('dialogue-funding') as typeof import('../lib/dabra/dialogue-funding');
  const store = load('dialogue-funding-store') as typeof import('../lib/dabra/dialogue-funding-store');
  const permit = measurement.parseFirstProfilePermit({
    schema: 'task217-first-profile-v1', planId: randomUUID(), sourceSha, caseSetSha: measurement.FIRST_PROFILE_CASE_SET_SHA,
    subjectHash: funding.fundingSubject(subject), expiresAtMs: start + 600000, inputTokenCeiling: 4096, outputTokenCeiling: 512,
    cases: measurement.FIRST_PROFILE_CASES.map(c => ({ caseId: c.caseId, requestId: randomUUID(), stage: c.stage, language: c.language })),
  });
  assert.ok(permit);
  const base = {
    grantId: randomUUID(), provider, model, environment: 'provider-benchmark' as const,
    accountId: 'SYNTHETIC-account', projectId: 'SYNTHETIC-project', evidenceSha256: 'c'.repeat(64),
    credentialSha256: createHash('sha256').update(credential).digest('hex'),
    verifiedAtMs: start - 1000, expiresAtMs: start + 600000, quotaWindowStartMs: start - 3600000, quotaWindowEndMs: start + 3600000,
    remainingRequests: 60, remainingInputTokens: 245760, remainingOutputTokens: 61440,
    autoReload: 'off' as const, postpaid: 'blocked' as const, overdraft: 'blocked' as const, concurrentAccountUsage: 'bounded' as const,
    measurementPermit: permit,
  };
  const proof: ApprovedFirstProfilePlan['proof'] = provider === 'openai' || provider === 'anthropic'
    ? { ...base, provider, mode: 'existing-credit', currency: 'USD', authorizedCreditMicros: 30000, remainingCreditMicros: 30000,
      pricing: 'standard-2026-10-28', serviceTier: 'standard', pricingEvidenceSha256: rateSha }
    : { ...base, provider, mode: 'no-new-charge', enforcement: 'provider-hard-no-new-charge' };
  const plan: ApprovedFirstProfilePlan = { subject, proof, permit, maxCostMicros: 5120, daily: PUBLIC_DIALOGUE_DAILY_LIMITS };
  // TEST-ONLY serial fake. Atomicity/durable dedup is verified separately against a real isolated PostgreSQL engine.
  const claims = new Set<string>();
  const deps: MeasurementDependencies = {
    sourceSha: () => activeSource,
    configuration: () => ({ apiKey: configuredKey, model: configuredModel }),
    authorityCurrent: async () => { checks++; return true; },
    admission: { reserve: async r => {
      reservations++;
      assert.equal(r.measurementRequest?.planId, permit.planId);
      if (claims.has(r.requestId)) return { kind: 'denied' };
      claims.add(r.requestId); held += r.costMicros;
      return { kind: 'admitted', attemptId: r.attemptId };
    } },
    dispatch: async (_provider, _config, _message, options) => {
      dispatches++;
      return { ok: true, model, citations: [], inputTokens: 16, outputTokens: 16,
        answer: options.classifier ? JSON.stringify({ tool: options.language === 'ar' ? 'weather' : 'maps' })
          : JSON.stringify({ kind: 'general-travel', advice: advice[options.language] }) };
    },
  };
  return {
    plan, deps, measurement, funding, store, advice, credential, rateSha,
    counts: () => ({ dispatches, reservations, held, checks }),
    advance: (at = start + 600000) => { clock = at; },
    configuration: (key = configuredKey, nextModel = configuredModel) => { configuredKey = key; configuredModel = nextModel; },
    changeSource: () => { activeSource = 'd'.repeat(40); },
  };
}

test('four fixed public AR/EN cases produce observations only, never approved profiles', async () => {
  const f = fixture(), result = await f.measurement.measureFirstProfile(f.plan, f.deps);
  assert.equal(result.kind, 'candidate'); assert.equal(result.qualified, false); assert.equal(result.semanticReview, 'required');
  assert.equal(result.observations.length, 4); assert.equal(f.counts().dispatches, 4);
  assert.equal(f.counts().reservations, 4); assert.equal(f.counts().held, 20480);
  assert.ok(result.observations.every(o => o.schemaValid && o.inputTokens === 16 && o.outputTokens === 16));
  assert.equal(APPROVED_AGENT_CAPABILITY_PROFILES.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC-account|credentialSha256|authorizedCreditMicros|SYNTHETIC-NOT-A-CREDENTIAL/);
});
test('the same plan cannot spend again after its four durable case reservations', async () => {
  const f = fixture(); await f.measurement.measureFirstProfile(f.plan, f.deps);
  const replay = await f.measurement.measureFirstProfile(f.plan, f.deps);
  assert.equal(replay.kind, 'stopped'); assert.equal(f.counts().dispatches, 4); assert.equal(f.counts().held, 20480);
});
test('malformed permits, fifth case, duplicate request, modified case set and extra fields are rejected', () => {
  const f = fixture(), p = f.plan.permit;
  for (const bad of [
    { ...p, cases: [...p.cases, p.cases[0]] },
    { ...p, cases: p.cases.map((c, i) => i === 1 ? { ...c, requestId: p.cases[0].requestId } : c) },
    { ...p, cases: p.cases.map((c, i) => i === 0 ? { ...c, stage: 'discover' } : c) },
    { ...p, caseSetSha: 'd'.repeat(64) }, { ...p, arbitraryApproval: true },
  ]) assert.equal(f.measurement.parseFirstProfilePermit(bad), null);
});
for (const bad of ['subject','source','credential','model','budget'] as const) {
  test('measurement rejects changed ' + bad + ' before a reservation or dispatch', async () => {
    const f = fixture();
    let plan = f.plan;
    if (bad === 'subject') plan = { ...plan, subject: 'another-subject' };
    if (bad === 'source') f.changeSource();
    if (bad === 'credential') f.configuration('another-synthetic-key');
    if (bad === 'model') f.configuration(undefined, 'other-model');
    if (bad === 'budget') plan = { ...plan, maxCostMicros: 5119 };
    const result = await f.measurement.measureFirstProfile(plan, f.deps);
    assert.equal(result.kind, 'blocked'); assert.equal(f.counts().dispatches, 0); assert.equal(f.counts().reservations, 0);
  });
}
for (const boundary of ['proof','permit','pricing','quota','deadline','day','cancel','binding'] as const) {
  test('expiration/binding at the final awaited authority boundary retains hold: ' + boundary, async () => {
    const f = fixture(); let checks = 0;
    const abort = new AbortController();
    const proof = { ...f.plan.proof };
    let plan = f.plan;
    if (boundary === 'proof') {
      const permit = { ...plan.permit, expiresAtMs: start + 1000 };
      proof.expiresAtMs = start + 1000; plan = { ...plan, permit, proof: { ...proof, measurementPermit: permit } };
    }
    if (boundary === 'quota') { proof.quotaWindowEndMs = start + 1000; plan = { ...plan, proof }; }
    if (boundary === 'permit') {
      const permit = { ...plan.permit, expiresAtMs: start + 1000 };
      plan = { ...plan, permit, proof: { ...proof, measurementPermit: permit } };
    }
    const deps = { ...f.deps, authorityCurrent: async () => {
      if (++checks === 2) {
        await Promise.resolve();
        if (boundary === 'cancel') abort.abort();
        else if (boundary === 'binding') f.configuration('rotated-synthetic-key');
        else f.advance(boundary === 'deadline' ? start + 12000 : boundary === 'day' ? start + 86400000
          : ['proof','permit','quota'].includes(boundary) ? start + 1000 : start + 600000);
      }
      return true;
    } };
    await f.measurement.measureFirstProfile(plan, deps, abort.signal);
    assert.equal(f.counts().held, 5120); assert.equal(f.counts().reservations, 1); assert.equal(f.counts().dispatches, 0);
  });
}
test('unknown reserve and unknown dispatch stop without retry or refund', async () => {
  for (const phase of ['reserve','dispatch'] as const) {
    const f = fixture(); let calls = 0;
    const reserve = f.deps.admission.reserve;
    const deps = phase === 'reserve' ? { ...f.deps, admission: { reserve: async (...args: Parameters<typeof reserve>) => {
      await reserve(...args); throw new Error('synthetic_lost_claim_reply');
    } } } : { ...f.deps, dispatch: async () => { calls++; throw new Error('synthetic_lost_provider_reply'); } };
    const result = await f.measurement.measureFirstProfile(f.plan, deps);
    assert.equal(result.kind, 'stopped'); assert.equal(result.observations.length, 0);
    assert.equal(f.counts().reservations, 1); assert.equal(f.counts().held, 5120); assert.equal(calls, phase === 'dispatch' ? 1 : 0);
  }
});
test('returned schema is not semantic truth, and missing actual usage never becomes a fabricated metric', async () => {
  const f = fixture();
  const result = await f.measurement.measureFirstProfile(f.plan, { ...f.deps,
    dispatch: async () => ({ ok: true, model, citations: [], answer: '{"tool":"support"}' }) });
  assert.equal(result.kind, 'stopped'); assert.equal(result.qualified, false); assert.equal(result.observations[0].schemaValid, true);
  assert.equal(result.observations[0].inputTokens, null); assert.equal(result.observations[0].outputTokens, null);
});
test('the funding RPC wraps only measurement requests and preserves ordinary proof equality', async () => {
  const f = fixture(), seen: Record<string, unknown>[] = [];
  const rpc: FundingRpc = async (_name, params) => { seen.push(params); return { data: { decision: 'admitted', attempt_id: params.p_attempt_id }, error: null }; };
  const reserve = f.store.createFundingDialogueAdmission(rpc);
  const base = { policyId: 'task217-existing-credit-v2' as const, attemptId: randomUUID(), requestId: randomUUID(),
    stage: 'discover' as const, subject, nowMs: start, dayStartMs: start - 1000, dayEndMs: start + 1000,
    proof: f.plan.proof, inputTokens: 4096, outputTokens: 512, costMicros: 5120, limits: f.plan.daily };
  await reserve.reserve(base, new AbortController().signal);
  await reserve.reserve({ ...base, measurementRequest: { planId: f.plan.permit.planId, caseId: 'discover-en' } }, new AbortController().signal);
  assert.equal(seen[0].p_proof, f.plan.proof);
  assert.deepEqual(JSON.parse(JSON.stringify(seen[1].p_proof)), JSON.parse(JSON.stringify({ ...f.plan.proof, measurementRequest: { planId: f.plan.permit.planId, caseId: 'discover-en' } })));
});
test('only a matching enabled server grant loads a measurement; profile-shaped CLI data cannot approve it', async () => {
  const f = fixture(), signal = new AbortController().signal;
  // This loader now requires the fixed pilot; all other accepted fixture/dispatch cases are unchanged.
  const storedProof = { ...f.plan.proof,
    pilotEnvelope: { schema: 'task217-seven-provider-pilot-v1', id: 'task217-text-pilot-2026-11-01', maxCostMicros: 1000000, maxAttempts: 28 },
    allInChargeBound: { schema: 'all-in-charge-bound-v1', currency: 'USD', coverage: 'all-applicable-api-charges',
      maxAdditionalMicros: 0, observedAtMs: start - 1000, evidenceSha256: 'e'.repeat(64) },
  };
  const server = { enabled: true, profiles: [], proofs: [storedProof], maxCostMicros: 5120, dailyLimits: f.plan.daily };
  let data: unknown = server;
  const rpc: FundingRpc = async () => ({ data, error: null });
  assert.ok(await f.store.loadFundingMeasurement(subject, f.plan.permit.planId, sourceSha, signal, rpc));
  for (const bad of [
    { ...server, enabled: false }, { ...server, proofs: [] }, { ...server, proofs: [storedProof, storedProof] },
    { ...server, profiles: [{ ...f.plan.permit }], proofs: [] },
  ]) { data = bad; assert.equal(await f.store.loadFundingMeasurement(subject, f.plan.permit.planId, sourceSha, signal, rpc), null); }
  data = server;
  assert.equal(await f.store.loadFundingMeasurement('different-subject', f.plan.permit.planId, sourceSha, signal, rpc), null);
  assert.equal(await f.store.loadFundingMeasurement(subject, f.plan.permit.planId, 'd'.repeat(40), signal, rpc), null);
});
test('permit and financial quote do not bypass the ordinary qualified-profile guard', async () => {
  const f = fixture(), now = Date.now();
  const context = { role: 'customer' as const, taskAuthority: { kind: 'customer' as const, actorId: subject, ownerId: subject },
    readRequests: async () => ({ kind: 'forbidden' as const }), isTaskAuthorityCurrent: async () => true };
  const result = await prepareAgentProviderAttempt(context, 'en', {
    trial: true, environment: 'provider-benchmark', profiles: [], freeProofs: [], daily: f.plan.daily,
    limits: { maxAttempts: 1, maxElapsedMs: 12000, maxInputTokens: 4096, maxOutputTokens: 1024, maxCostUsd: 1 },
    funding: { kind: 'existing-credit-v2', requestId: randomUUID(), proofs: [f.plan.proof], admission: f.deps.admission },
  }, { capability: 'discover', message: '{}', prompt: 'public', inputDigestValue: {} }, now + 12000);
  assert.equal(result, null); assert.equal(f.counts().reservations, 0);
});
test('reserved measurement namespace never falls into the legacy live matrix on error', async () => {
  for (const argv of [
    ['--measure-first-profile','--live'], ['--measure-first-profile=malformed','--live'], ['--measurement','--provider=all'],
    ['--measure-platform-units','--live'], ['--measure-platform-units','--measure-first-profile'],
    ['--measure-platform-units','--measure-platform-units'], ['--measure-platform-units=malformed','--live'],
    ['--measure-platform-units','--provider=all'], ['--measure-platform-unit','--live'],
  ]) {
    await assert.rejects(() => main(argv), /unsupported_measurement_argument/);
  }
  const previous = process.env.DABRA_DIALOGUE_FUNDING_POLICY;
  delete process.env.DABRA_DIALOGUE_FUNDING_POLICY;
  try { await assert.rejects(() => firstProfileMeasurementMain(['--measure-first-profile']), /measurement_not_authorized/); }
  finally { if (previous === undefined) delete process.env.DABRA_DIALOGUE_FUNDING_POLICY; else process.env.DABRA_DIALOGUE_FUNDING_POLICY = previous; }
});
test('platform-units CLI requires existing policy and stored subject/plan before any transport', async () => {
  const names = ['DABRA_DIALOGUE_FUNDING_POLICY','DABRA_MEASUREMENT_SUBJECT','DABRA_MEASUREMENT_PLAN_ID'] as const;
  const previous = names.map(name => process.env[name]);
  const originalFetch = globalThis.fetch;
  let transportReads = 0;
  globalThis.fetch = async () => { transportReads++; throw Error('UNEXPECTED_TRANSPORT'); };
  try {
    const configurations: ReadonlyArray<readonly (string | undefined)[]> = [
      [undefined, 'SYNTHETIC-subject', '11111111-1111-4111-8111-111111111111'],
      ['unsupported-policy', 'SYNTHETIC-subject', '11111111-1111-4111-8111-111111111111'],
      ['task217-existing-credit-v2', undefined, '11111111-1111-4111-8111-111111111111'],
      ['task217-existing-credit-v2', 'SYNTHETIC-subject', undefined],
    ];
    for (const values of configurations) {
      names.forEach((name, index) => {
        if (values[index] === undefined) delete process.env[name]; else process.env[name] = values[index];
      });
      await assert.rejects(() => main(['--measure-platform-units']), /measurement_not_authorized/);
      await assert.rejects(() => platformUnitsQualificationMain(['--measure-platform-units']), /measurement_not_authorized/);
    }
    assert.equal(transportReads, 0);
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index];
    });
  }
});

test('existing seven single-attempt transports stay bound to exact model, output and no-search controls', async () => {
  const original = globalThis.fetch;
  try {
    for (const provider of AGENT_PROVIDER_IDS) {
      const f = fixture(provider); let httpCalls = 0;
      globalThis.fetch = async (_input, options) => {
        httpCalls++;
        const payload = JSON.parse(String(options?.body));
        assert.equal(payload.tools, undefined); assert.equal(payload.web_search_options, undefined);
        if (provider === 'anthropic') { assert.equal(payload.service_tier, 'standard_only'); assert.equal(payload.max_tokens, 512); }
        const answer = httpCalls <= 2 ? JSON.stringify({ tool: httpCalls === 1 ? 'weather' : 'maps' })
          : JSON.stringify({ kind: 'general-travel', advice: advice[httpCalls === 3 ? 'ar' : 'en'] });
        return new Response(JSON.stringify({ model, choices: [{ message: { content: answer }, finish_reason: 'stop' }],
          content: [{ type: 'text', text: answer }], candidates: [{ content: { parts: [{ text: answer }] }, finishReason: 'STOP' }],
          usage: { prompt_tokens: 16, completion_tokens: 16, input_tokens: 16, output_tokens: 16 },
          usageMetadata: { promptTokenCount: 16, candidatesTokenCount: 16 } }), { status: 200, headers: { 'content-type': 'application/json' } });
      };
      const result = await f.measurement.measureFirstProfile(f.plan, { ...f.deps, dispatch: callInternalAgentProvider });
      assert.equal(result.kind, 'candidate', provider); assert.equal(httpCalls, 4, provider); assert.equal(f.counts().reservations, 4);
    }
  } finally { globalThis.fetch = original; }
});

test('unknown or misspelled CLI arguments cannot silently authorize the old live matrix', async () => {
  for (const argv of [
    ['--mesure-first-profile=yes','--live'],
    ['--Measurement=yes','--live'],
    ['--provider=all','--provider=anthropic','--live'],
  ]) await assert.rejects(() => main(argv), /unsupported_argument/);
});
test('invalid provider bodies are never printed as candidate evidence', async () => {
  const f = fixture();
  const result = await f.measurement.measureFirstProfile(f.plan, { ...f.deps,
    dispatch: async () => ({ ok: true, model: 'SYNTHETIC-untrusted-model', citations: [], inputTokens: 16, outputTokens: 16,
      answer: 'SYNTHETIC_UNTRUSTED_BODY_WITH_UNEXPECTED_FIELDS' }) });
  assert.equal(result.kind, 'stopped');
  assert.equal(result.observations[0].answer, ''); assert.equal(result.observations[0].model, null);
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC_UNTRUSTED_BODY|SYNTHETIC-untrusted-model/);
});

test('CLI source guard rejects worktree/index/untracked source and changing HEAD at every check', () => {
  const seen: string[][] = [];
  const clean = (args: readonly string[]) => { seen.push([...args]); return args[0] === 'status' ? '' : sourceSha; };
  assert.equal(measurementSourceSha(clean), sourceSha);
  assert.deepEqual(seen, [['rev-parse','HEAD'],['status','--porcelain=v1','--untracked-files=all'],['rev-parse','HEAD']]);
  for (const dirty of [' M tracked.ts','M  indexed.ts','?? untracked-source.ts']) {
    assert.throws(() => measurementSourceSha(args => args[0] === 'status' ? dirty : sourceSha), /measurement_source_dirty/);
  }
  let count = 0;
  assert.throws(() => measurementSourceSha(args => args[0] === 'status' ? '' : ++count === 1 ? sourceSha : 'd'.repeat(40)), /measurement_source_changed/);
  assert.throws(() => measurementSourceSha(() => 'invalid-source'), /measurement_source_invalid/);
  // A second boundary must read Git again instead of caching a prior CLEAN observation.
  assert.equal(measurementSourceSha(clean), sourceSha);
  assert.throws(() => measurementSourceSha(args => args[0] === 'status' ? ' M changed-after-await.ts' : sourceSha), /measurement_source_dirty/);
});

test('pricing alone expires during the final await while permit, proof, quota and deadline remain valid', async () => {
  const f = fixture('anthropic', 1000); let checks = 0;
  const result = await f.measurement.measureFirstProfile(f.plan, { ...f.deps, authorityCurrent: async () => {
    if (++checks === 2) { await Promise.resolve(); f.advance(start + 1000); }
    return true;
  } });
  assert.equal(result.kind, 'stopped');
  assert.equal(f.plan.permit.expiresAtMs > start + 1000, true);
  assert.equal(f.plan.proof.expiresAtMs > start + 1000, true);
  assert.equal(f.counts().reservations, 1); assert.equal(f.counts().held, 5120); assert.equal(f.counts().dispatches, 0);
});

test('ordinary financial binding cannot be overwritten by an extra nested measurement provider', () => {
  const f = fixture();
  const measurement = {
    provider: 'anthropic', capability: 'discover' as const, language: 'en' as const, model,
    environment: 'provider-benchmark' as const, sourceSha, caseSetSha: f.plan.permit.caseSetSha,
    cases: 1, passed: 1, measuredAtMs: start - 1, expiresAtMs: start + 1000, latencyMs: 1,
    inputTokenCeiling: 4096, outputTokenCeiling: 512, costCeilingUsd: 1,
  };
  const profile = { provider: 'openai' as const, measurement };
  assert.equal(f.funding.fundingProofCurrent(f.plan.proof, profile, start), false);
  assert.equal(f.funding.dialogueCostCeilingMicros(f.plan.proof, profile, start), null);
});

test('blocking source verification cannot carry a stale financial timestamp into dispatch', async () => {
  // Sweep expiry positions around bounded synchronous Git/config checks. This must hold
  // regardless of which check becomes the last one before the actual transport call.
  for (let steps = 1; steps <= 12; steps++) {
    const f = fixture('anthropic', steps * 250);
    let clock = start, lateDispatches = 0;
    await f.measurement.measureFirstProfile(f.plan, { ...f.deps,
      sourceSha: () => { clock += 250; f.advance(clock); return sourceSha; },
      dispatch: async (...args) => {
        if (clock >= start + steps * 250) lateDispatches++;
        return f.deps.dispatch(...args);
      },
    });
    assert.equal(lateDispatches, 0, 'dispatch after expiry position ' + steps);
  }
});

test('loaded module checkout is checked even when caller cwd is another clean checkout at the same SHA', () => {
  const moduleUrl = new URL('../scripts/dabra-provider-certification.ts', import.meta.url);
  const moduleRoot = resolve(dirname(fileURLToPath(moduleUrl)), '..');
  const callerRoot = resolve(moduleRoot, '..', 'SYNTHETIC-other-clean-checkout');
  const text = readFileSync(moduleUrl, 'utf8');
  const sourceFile = ts.createSourceFile(moduleUrl.pathname, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = sourceFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'measurementSourceSha');
  assert.ok(declaration);
  // Execute the actual guard body. Only the module URL and child Git process are
  // controlled; two checkout states exist in memory, never as copied repositories.
  const body = declaration.getText(sourceFile).replaceAll('import.meta.url', JSON.stringify(moduleUrl.href));
  const fixtureModule = { exports: {} };
  let moduleDirty = true, callerDirty = false;
  const reads: { cwd: string; args: readonly string[] }[] = [];
  runInNewContext(ts.transpileModule(body, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    module: fixtureModule, exports: fixtureModule.exports, resolve, dirname, fileURLToPath,
    process: { cwd: () => callerRoot },
    execFileSync: (command: string, args: readonly string[], options?: { cwd?: string }) => {
      assert.equal(command, 'git');
      const cwd = options?.cwd ?? callerRoot;
      reads.push({ cwd, args: [...args] });
      assert.ok(cwd === moduleRoot || cwd === callerRoot);
      return args.includes('status') ? ((cwd === moduleRoot ? moduleDirty : callerDirty) ? ' M scripts/dabra-provider-certification.ts\n' : '') : sourceSha + '\n';
    },
  });
  const guard = fixtureModule.exports as Pick<typeof import('../scripts/dabra-provider-certification'), 'measurementSourceSha'>;
  assert.throws(() => guard.measurementSourceSha(), /measurement_source_dirty/);
  assert.ok(reads.length >= 2 && reads.every(read => read.cwd === moduleRoot));
  moduleDirty = false; callerDirty = true; reads.length = 0;
  assert.equal(guard.measurementSourceSha(), sourceSha);
  assert.equal(reads.length, 3);
  assert.ok(reads.every(read => read.cwd === moduleRoot));
});

for (const boundary of ['credential', 'source', 'authority', 'admission', 'provider', 'output', 'deadline'] as const) {
  test('measurement stop diagnostic names only the failed boundary: ' + boundary, async () => {
    const f = fixture();
    if (boundary === 'credential') f.configuration('SYNTHETIC-ROTATED-SECRET');
    if (boundary === 'source') f.changeSource();
    let checks = 0;
    const deps: MeasurementDependencies = { ...f.deps,
      authorityCurrent: boundary === 'authority' ? async () => false : async (signal) => {
        if (boundary === 'deadline' && ++checks === 2) f.advance(start + 12000);
        return f.deps.authorityCurrent(signal);
      },
      admission: boundary === 'admission' ? { reserve: async (...args) => {
        await f.deps.admission.reserve(...args);
        throw Error('SYNTHETIC-PRIVATE-ADMISSION-DETAIL');
      } } : f.deps.admission,
      dispatch: boundary === 'provider' ? async () => { throw Error('SYNTHETIC-PRIVATE-PROVIDER-DETAIL'); }
        : boundary === 'output' ? async () => ({ ok: true, model, citations: [], answer: 'SYNTHETIC-INVALID-BODY' })
        : f.deps.dispatch,
    };
    const result = await f.measurement.measureFirstProfile(f.plan, deps);
    assert.notEqual(result.kind, 'candidate');
    if (result.kind === 'candidate') throw Error('unexpected_candidate');
    const expected = boundary === 'admission' ? 'admission-unknown' : boundary === 'provider' ? 'provider-unknown'
      : boundary === 'output' ? 'provider-output' : boundary;
    assert.deepEqual(Object.keys(result.diagnostic).sort(), ['caseId', 'reason', 'stage']);
    assert.equal(result.diagnostic.reason, expected);
    assert.equal(result.diagnostic.caseId, 'intent-ar');
    assert.equal(result.diagnostic.stage, 'intent.classify');
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC-PRIVATE|SYNTHETIC-ROTATED|SYNTHETIC-INVALID|credentialSha|evidenceSha/);
    assert.equal(f.counts().reservations, ['credential', 'source', 'authority'].includes(boundary) ? 0 : 1);
    if (f.counts().reservations) assert.equal(f.counts().held, 5120, 'diagnostics do not release an unknown hold');
  });
}
test('measurement permit diagnostics have no case or private proof and never qualify a profile', async () => {
  const f = fixture();
  const result = await f.measurement.measureFirstProfile({ ...f.plan, subject: 'invalid subject' }, f.deps);
  assert.equal(result.kind, 'blocked');
  assert.equal(result.diagnostic.reason, 'permit'); assert.equal(result.diagnostic.caseId, null);
  assert.equal(result.diagnostic.stage, null); assert.equal(result.qualified, false);
  assert.equal(f.counts().reservations, 0);
});
