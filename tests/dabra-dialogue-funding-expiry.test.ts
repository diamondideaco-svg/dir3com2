import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { AgentContext } from '../lib/dabra/agent-contract';
import type { AgentDialoguePolicy } from '../lib/dabra/agent-dialogue';

// Actual funding/dialogue/handoff/planner source runs in a clock-controlled VM.
// Only the Core reply, transport, authority and admission are synthetic seams.
// No real pricing approval, qualification, credential, database or provider is installed.
const start = Date.parse('2026-10-31T12:00:00Z'), expires = start + 50;
type Timing = 'during-await' | 'after-predicate' | 'after-prepare';
type Boundary = 'pricing' | 'proof' | 'quota' | 'deadline' | 'cancel';
const messages = {
  ar: 'أبغى سيارة لعائلة من خمسة أشخاص في القاهرة لمدة ثلاثة أيام. اسألني عن المعلومات الناقصة قبل ما تقترح سيارة.',
  en: 'I need a car for a family of five in Cairo for three days. Ask me for missing information before suggesting a car.',
};
function fixture(locale: 'ar' | 'en', at: number, check: number, timing: Timing = 'during-await', boundary: Boundary = 'pricing', unknownClaim = false) {
  let clock = start, authorityChecks = 0, dispatches = 0, reservations = 0, heldMicros = 0, telemetry = 0;
  const external = new AbortController();
  const credential = 'SYNTHETIC-NOT-A-CREDENTIAL', model = 'SYNTHETIC-EXPIRY-MODEL';
  const fields = {
    schema: 'reviewed-standard-pricing-v1', provider: 'openai', model, serviceTier: 'standard', currency: 'USD',
    inputMicrosPerMillion: 1000000, outputMicrosPerMillion: 2000000, observedAtMs: start - 2000,
    validFromMs: start - 1, expiresAtMs: boundary === 'pricing' ? expires : start + 600000,
    sourceUrl: 'https://developers.openai.com/api/docs/pricing',
  };
  const pricingEvidenceSha256 = createHash('sha256').update(JSON.stringify([
    fields.schema, fields.provider, fields.model, fields.serviceTier, fields.currency,
    fields.inputMicrosPerMillion, fields.outputMicrosPerMillion, fields.observedAtMs,
    fields.validFromMs, fields.expiresAtMs, fields.sourceUrl,
  ])).digest('hex');
  const approval = Object.freeze({ ...fields, sha256: pricingEvidenceSha256 });
  const cache = new Map<string, unknown>();
  class Clock extends Date { static now() { return clock; } }
  const transport = {
    internalAgentConfiguration: (provider: string) => provider === 'openai' ? { apiKey: credential, model } : null,
    callInternalAgentProvider: async (_provider: unknown, _config: unknown, message: string, options: { classifier?: boolean }) => {
      dispatches++;
      const answer = options.classifier ? JSON.stringify({ tool: 'discover' })
        : JSON.stringify({ opening: 'none', paragraphs: JSON.parse(message).units.map((_: string, i: number) => [i]) });
      return { ok: true, model, answer, citations: [], inputTokens: 16, outputTokens: 16 };
    },
  };
  function load(name: string): unknown {
    if (cache.has(name)) return cache.get(name);
    const url = new URL('../lib/dabra/' + name + '.ts', import.meta.url), require = createRequire(url);
    const fixtureModule = { exports: {} };
    cache.set(name, fixtureModule.exports);
    runInNewContext(ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, {
      module: fixtureModule, exports: fixtureModule.exports,
      require: (id: string) => {
        if (id === 'server-only') return {};
        if (id === './dialogue-pricing-approvals') return { APPROVED_DIALOGUE_STANDARD_PRICING: Object.freeze([approval]) };
        if (id === './dialogue-funding') return load('dialogue-funding');
        if (id === './agent-dialogue') return load('agent-dialogue');
        if (id === '../ai2/runtime/agent-provider-dispatch') return transport;
        if (id === '../ai2/observability/provider-attempts') return { createDabraProviderRequestId: randomUUID, mapProviderErrorCategory: (value: unknown) => value };
        if (id === './agent') return { runInternalAgent: async () => ({
          answer: 'SYNTHETIC Core question', language: locale, provider: 'local', sources: [],
          groundingStatus: 'answered-general', retrievalMode: 'local', agent: { tool: 'discover', role: 'customer', mutations: 0, state: 'needs_info' },
        }) };
        if (['node:crypto', './agent-capabilities', './agent-contract', './agent-general-travel', './conversation-renderer'].includes(id)) return require(id);
        throw new Error('Unexpected expiry-fixture dependency: ' + id);
      },
      Date: Clock, URL, Buffer, AbortController, AbortSignal, setTimeout, clearTimeout, queueMicrotask, console,
      process: { env: { DABRA_INTERNAL_AI_ENABLED: 'true', DABRA_AI_PROVIDER: 'openai', DABRA_PROVIDER_FALLBACK_ENABLED: 'false' } },
    }, { filename: url.pathname });
    return fixtureModule.exports;
  }
  const dialogue = load('agent-dialogue') as typeof import('../lib/dabra/agent-dialogue');
  const handoff = load('agent-handoff') as typeof import('../lib/dabra/agent-handoff');
  const planner = load('agent-planner') as typeof import('../lib/dabra/agent-planner');
  const context: AgentContext = {
    role: 'customer', taskAuthority: { kind: 'customer', actorId: 'SYNTHETIC-customer', ownerId: 'SYNTHETIC-customer' },
    readRequests: async () => ({ kind: 'forbidden' }),
    isTaskAuthorityCurrent: async () => {
      authorityChecks++;
      if (authorityChecks === check) {
        const advance = () => { if (boundary === 'cancel') external.abort(); else clock = at; };
        if (timing === 'during-await') { await Promise.resolve(); advance(); }
        else if (timing === 'after-predicate') queueMicrotask(() => queueMicrotask(advance));
        else queueMicrotask(() => queueMicrotask(() => queueMicrotask(advance)));
      }
      return true;
    },
  };
  const policy: AgentDialoguePolicy = {
    trial: true, environment: 'synthetic', freeProofs: [],
    profiles: (['discover', 'intent.classify'] as const).map(capability => ({ provider: 'openai', measurement: {
      capability, language: locale, model, environment: 'synthetic', caseSetSha: 'a'.repeat(64), sourceSha: 'b'.repeat(40),
      cases: 1, passed: 1, measuredAtMs: start - 1, expiresAtMs: start + 600000, latencyMs: 1,
      inputTokenCeiling: 4096, outputTokenCeiling: 256, costCeilingUsd: 0.004608,
    } })),
    limits: { maxAttempts: 1, maxElapsedMs: 12000, maxInputTokens: 4096, maxOutputTokens: 1024, maxCostUsd: 0.004608 },
    daily: dialogue.PUBLIC_DIALOGUE_DAILY_LIMITS,
    funding: { kind: 'existing-credit-v2', requestId: randomUUID(), proofs: [{
      grantId: '11111111-1111-4111-8111-111111111111', provider: 'openai', model, environment: 'synthetic',
      accountId: 'SYNTHETIC-account', projectId: 'SYNTHETIC-project', evidenceSha256: 'c'.repeat(64),
      credentialSha256: createHash('sha256').update(credential).digest('hex'),
      verifiedAtMs: start - 1, expiresAtMs: boundary === 'proof' ? expires : start + 600000,
      quotaWindowStartMs: start - 3600000, quotaWindowEndMs: boundary === 'quota' ? expires : start + 3600000,
      remainingRequests: 1000, remainingInputTokens: 1000000, remainingOutputTokens: 1000000,
      autoReload: 'off', postpaid: 'blocked', overdraft: 'blocked', concurrentAccountUsage: 'bounded',
      mode: 'existing-credit', currency: 'USD', authorizedCreditMicros: 30000, remainingCreditMicros: 30000,
      pricing: 'standard-2026-10-28', pricingEvidenceSha256, serviceTier: 'standard',
    }], admission: { reserve: async (request, signal) => {
      assert.equal(signal.aborted, false);
      reservations++; heldMicros += request.costMicros;
      return unknownClaim ? { kind: 'denied' } : { kind: 'admitted', attemptId: request.attemptId };
    } } },
  };
  return {
    get counts() { return { clock, authorityChecks, dispatches, reservations, heldMicros, telemetry }; },
    prepare: () => dialogue.prepareAgentProviderAttempt(context, locale, policy, {
      capability: 'discover', message: '{}', prompt: 'SYNTHETIC prompt', inputDigestValue: {},
    }, boundary === 'deadline' ? expires : start + 12000, external.signal),
    run: () => handoff.runInternalAgentTask({ message: messages[locale], locale, history: [], context }, { dialogue: policy, signal: external.signal }),
    classify: () => planner.planInternalAgentTool(messages[locale], { language: locale, scheduleAttempt: () => { telemetry++; } }, { policy, context, signal: external.signal }),
  };
}

for (const locale of ['ar', 'en'] as const) {
  for (const [label, at] of [['expires during identity', expires + 1], ['exact expiry boundary', expires]] as const) {
    test('expiry handoff ' + locale + ': pricing ' + label + ' blocks dispatch and retains its hold', async () => {
      const f = fixture(locale, at, 3);
      const result = await f.run();
      assert.equal(result.kind, 'response'); // Core remains available; response/HTTP success alone is not the assertion.
      assert.equal(f.counts.authorityChecks, 4);
      assert.equal(f.counts.dispatches, 0);
      assert.equal(f.counts.reservations, 1); assert.equal(f.counts.heldMicros, 4608);
    });
  }
  test('expiry handoff ' + locale + ': pricing expiration after predicate resolution still blocks at dispatch boundary', async () => {
    const f = fixture(locale, expires, 3, 'after-predicate');
    await f.run();
    assert.equal(f.counts.dispatches, 0);
    assert.equal(f.counts.reservations, 1); assert.equal(f.counts.heldMicros, 4608);
  });
  test('expiry handoff ' + locale + ': valid one millisecond before expiry dispatches once', async () => {
    const f = fixture(locale, expires - 1, 3);
    const result = await f.run();
    assert.equal(f.counts.dispatches, 1);
    assert.equal(result.kind === 'response' && result.response.provider, 'openai');
    assert.equal(f.counts.reservations, 1); assert.equal(f.counts.heldMicros, 4608);
  });
  test('expiry classifier ' + locale + ': expiration during final identity check blocks dispatch', async () => {
    const f = fixture(locale, expires, 2);
    const result = await f.classify();
    assert.equal(result.status, 'unavailable'); assert.equal(f.counts.dispatches, 0);
    assert.equal(f.counts.reservations, 1); assert.equal(f.counts.heldMicros, 4608);
  });
  test('expiry classifier ' + locale + ': expiration after predicate resolution blocks at dispatch boundary', async () => {
    const f = fixture(locale, expires, 2, 'after-predicate');
    const result = await f.classify();
    assert.equal(result.status, 'unavailable'); assert.equal(f.counts.dispatches, 0);
    assert.equal(f.counts.reservations, 1); assert.equal(f.counts.heldMicros, 4608);
  });
  test('expiry classifier ' + locale + ': expiration after permit return is blocked by the final synchronous guard', async () => {
    const f = fixture(locale, expires, 2, 'after-prepare');
    const result = await f.classify();
    assert.equal(result.status, 'unavailable'); assert.equal(f.counts.dispatches, 0);
    assert.equal(f.counts.reservations, 1); assert.equal(f.counts.heldMicros, 4608);
  });
  test('expiry classifier ' + locale + ': valid before expiry dispatches once', async () => {
    const f = fixture(locale, expires - 1, 2);
    const result = await f.classify();
    assert.equal(result.status, 'ok'); assert.equal(f.counts.dispatches, 1);
    assert.equal(f.counts.reservations, 1); assert.equal(f.counts.heldMicros, 4608);
  });
}
for (const boundary of ['pricing', 'proof', 'quota', 'deadline', 'cancel'] as const) {
  test('expiry permit: ' + boundary + ' during first identity wait cannot reserve', async () => {
    const f = fixture('en', expires, 1, 'during-await', boundary);
    assert.equal(await f.prepare(), null); assert.equal(f.counts.reservations, 0); assert.equal(f.counts.dispatches, 0);
  });
}
test('expiry permit: expiration after first predicate resolution cannot reserve', async () => {
  const f = fixture('en', expires, 1, 'after-predicate');
  assert.equal(await f.prepare(), null); assert.equal(f.counts.reservations, 0);
});
test('expiry permit: expiry during post-claim identity wait keeps the claim and returns no permit', async () => {
  const f = fixture('en', expires, 2);
  assert.equal(await f.prepare(), null); assert.equal(f.counts.reservations, 1); assert.equal(f.counts.heldMicros, 4608);
});
test('expiry permit: the reported isCurrent race now returns false without a transport call', async () => {
  const f = fixture('en', expires + 1, 3), permit = await f.prepare();
  assert.ok(permit); assert.equal(permit.signal.aborted, false);
  assert.equal(await permit.isCurrent(), false);
  assert.equal(f.counts.dispatches, 0); assert.equal(f.counts.reservations, 1); assert.equal(f.counts.heldMicros, 4608);
});
test('expiry unknown claim: no retry, refund or dispatch is introduced', async () => {
  const f = fixture('en', expires, 3, 'during-await', 'pricing', true);
  await f.run();
  assert.equal(f.counts.dispatches, 0); assert.equal(f.counts.reservations, 1); assert.equal(f.counts.heldMicros, 4608);
});
