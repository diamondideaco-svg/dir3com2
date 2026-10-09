import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { INTERNAL_AGENT_PROVIDERS, planInternalAgentTool } from '../lib/dabra/agent-planner';
import { callOpenAICompatibleProvider } from '../lib/ai2/runtime/openai-compatible';
import type { AgentContext } from '../lib/dabra/agent-contract';

// Execute the production POST module; only the authenticated actor boundary and
// provider transport are isolated. Not a claim of live credentials/browser auth.
function productPost(role: AgentContext['role']) {
  const require = createRequire(import.meta.url);
  const exports = {};
  const dependencies: Record<string, unknown> = {
    '@/lib/dabra/agent-context': { resolveAgentContext: async () => ({ role, readRequests: async () => { throw new Error('Unexpected account read'); } }) },
    '@/lib/dabra/agent-planner': { planInternalAgentTool },
  };
  runInNewContext(ts.transpileModule(readFileSync('app/api/ai2/chat/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (id: string) => dependencies[id] ?? require(id), process, Date }, { filename: 'chat-route.ts' });
  return (exports as typeof import('../app/api/ai2/chat/route')).POST;
}
const keys = ['OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'QWEN_API_KEY', 'DASHSCOPE_API_KEY', 'MISTRAL_API_KEY'];
const envNames = [...keys, ...INTERNAL_AGENT_PROVIDERS.map(p => `DABRA_${p.toUpperCase()}_MODEL`), 'DABRA_INTERNAL_AI_ENABLED', 'DABRA_INTERNAL_AI_MODEL', 'DABRA_AI_PROVIDER', 'DABRA_PROVIDER_FALLBACK_ENABLED'];
const initial = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const originalFetch = globalThis.fetch;
const realNow = Date.now;
let now = realNow();
test.beforeEach(() => {
  now += 3600001; Date.now = () => now;
  for (const key of keys) process.env[key] = 'isolated-test-placeholder';
  for (const provider of INTERNAL_AGENT_PROVIDERS) process.env[`DABRA_${provider.toUpperCase()}_MODEL`] = 'test-model';
  process.env.DABRA_INTERNAL_AI_MODEL = 'test-model';
  process.env.DABRA_INTERNAL_AI_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
});
test.afterEach(() => {
  globalThis.fetch = originalFetch; Date.now = realNow;
  for (const [name, value] of Object.entries(initial)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
});
function providerResponse(url: string, answer = '{"tool":"discover"}') {
  if (url.includes('googleapis.com')) return Response.json({ candidates: [{ content: { parts: [{ text: answer }] } }] });
  if (url.includes('anthropic.com')) return Response.json({ content: [{ type: 'text', text: answer }] });
  return Response.json({ choices: [{ message: { content: answer } }] });
}
for (const provider of INTERNAL_AGENT_PROVIDERS) test(`${provider}: actual DABRA POST AR/EN uses classifier but server owns facts`, async () => {
  process.env.DABRA_AI_PROVIDER = provider;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.tools, undefined);
    if (provider === 'xai') {
      assert.equal(payload.response_format.type, 'json_schema');
      assert.equal(payload.response_format.json_schema.strict, true);
      assert.equal(payload.response_format.json_schema.schema.additionalProperties, false);
      assert.deepEqual(payload.response_format.json_schema.schema.required, ['tool']);
    } else assert.equal(payload.response_format, undefined);
    assert.ok(init?.signal);
    assert.doesNotMatch(String(init?.body), /PRIVATE_ASSISTANT_HISTORY|REQ-PRIVATE/);
    return providerResponse(String(input));
  };
  const post = productPost('customer');
  for (const [locale, message] of [['en', 'Plan my trip'], ['ar', 'خطط رحلتي']] as const) {
    const response = await post(new NextRequest('http://localhost/api/ai2/chat', { method: 'POST', body: JSON.stringify({ message, locale, history: [{ role: 'assistant', content: 'PRIVATE_ASSISTANT_HISTORY REQ-PRIVATE' }] }) }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.understandingProvider, provider);
    assert.equal(body.understanding, 'ok');
    assert.equal(body.agent.mutations, 0);
    assert.equal(body.provider, 'local', 'prices/facts are still server catalogue, not provider claims');
    assert.match(body.answer, /family=dir3-drive/);
    assert.match(body.answer, /family=dir3-stay/);
    assert.doesNotMatch(body.answer, /PRIVATE_ASSISTANT_HISTORY|REQ-PRIVATE/);
  }
  assert.equal(calls, 2);
});
test('guest never invokes paid classifier, even with client provider/role fields', async () => {
  process.env.DABRA_AI_PROVIDER = 'openai';
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('Unexpected network'); };
  const response = await productPost('guest')(new NextRequest('http://localhost/api/ai2/chat', { method: 'POST', body: JSON.stringify({ message: 'plan my trip', role: 'ceo', provider: 'gemini', locale: 'en' }) }));
  assert.equal((await response.json()).understanding, 'internal-rules');
  assert.equal(calls, 0);
});
test('single transient fallback is reported through actual product path; no external free-form answer', async () => {
  process.env.DABRA_AI_PROVIDER = 'openai'; process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  let calls = 0;
  globalThis.fetch = async (url) => { calls++; return String(url).includes('api.openai.com') ? Response.json({ error: { message: 'temporary' } }, { status: 503 }) : providerResponse(String(url)); };
  const response = await productPost('customer')(new NextRequest('http://localhost/api/ai2/chat', { method: 'POST', body: JSON.stringify({ message: 'plan my trip', locale: 'en', stream: true }) }));
  assert.equal(response.headers.get('X-DABRA-Understanding-Provider'), 'gemini');
  assert.equal(calls, 2);
  assert.match(await response.text(), /family=dir3-stay/);
});
for (const status of [400, 401, 403, 429]) test(`${status} does not fan out to another provider or retry`, async () => {
  process.env.DABRA_AI_PROVIDER = 'gemini'; process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  let calls = 0; globalThis.fetch = async () => { calls++; return Response.json({ error: { message: 'refused' } }, { status }); };
  assert.equal((await planInternalAgentTool('plan my trip')).status, 'unavailable');
  assert.equal(calls, 1);
});
test('malicious model tool arguments and free-form supplier facts fail closed', async () => {
  process.env.DABRA_AI_PROVIDER = 'openai'; process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  for (const answer of ['{"tool":"executive","role":"ceo"}', 'Booked and paid $1 https://competitor.invalid', '{"tool":"delete"}']) {
    globalThis.fetch = async url => providerResponse(String(url), answer);
    const plan = await planInternalAgentTool('plan my trip');
    assert.equal(plan.tool, null); assert.equal(plan.status, 'invalid'); assert.equal(plan.attempts?.length, 1);
  }
});
test('classifier cannot promote customer to CEO even when its output is a valid tool', async () => {
  process.env.DABRA_AI_PROVIDER = 'openai';
  globalThis.fetch = async url => providerResponse(String(url), '{"tool":"executive"}');
  const response = await productPost('customer')(new NextRequest('http://localhost/api/ai2/chat', { method: 'POST', body: JSON.stringify({ message: 'summarize leadership', locale: 'en' }) }));
  const body = await response.json(); assert.equal(body.agent.state, 'forbidden'); assert.equal(body.agent.mutations, 0);
});
test('process budget is bounded and concurrent calls do not start a second provider request', async () => {
  process.env.DABRA_AI_PROVIDER = 'openai';
  let release!: () => void;
  globalThis.fetch = async url => { await new Promise<void>(resolve => { release = resolve; }); return providerResponse(String(url)); };
  const pending = planInternalAgentTool('hello');
  assert.equal((await planInternalAgentTool('hello')).status, 'unavailable');
  release(); await pending;
  let calls = 1; globalThis.fetch = async url => { calls++; return providerResponse(String(url)); };
  for (let index = 0; index < 25; index++) await planInternalAgentTool('hello');
  assert.equal(calls, 20);
});

const costSafeFailures = [
  { name: 'Qwen LimitRequests alias', status: 429, error: { code: 'LimitRequests', message: 'PRIVATE_MARKER' }, category: 'rate_limit' },
  { name: 'Qwen limit_requests alias', status: 429, error: { code: 'limit_requests', message: 'PRIVATE_MARKER' }, category: 'rate_limit' },
  { name: 'Qwen limit_burst_rate alias', status: 429, error: { code: 'limit_burst_rate', message: 'PRIVATE_MARKER' }, category: 'rate_limit' },
  { name: 'Qwen general throttle', status: 429, error: { code: 'Throttling', message: 'Requests throttling triggered.' }, category: 'rate_limit' },
  { name: 'Qwen service overloaded', status: 429, error: { code: 'Throttling.ServiceOverloaded', message: 'Too many requests.' }, category: 'rate_limit' },
  { name: 'Qwen resources saturated', status: 429, error: { code: 'Throttling.ResourceExhausted', message: 'Too many requests.' }, category: 'rate_limit' },
  { name: 'Qwen RPM throttle', status: 429, error: { code: 'Throttling.RateQuota', message: 'You have exceeded your request limit.' }, category: 'rate_limit' },
  { name: 'Qwen burst throttle', status: 429, error: { code: 'Throttling.BurstRate', message: 'Request rate increased too quickly.' }, category: 'rate_limit' },
  { name: 'Qwen TPM throttle', status: 429, error: { code: 'Throttling.AllocationQuota', message: 'Allocated quota exceeded, please increase your quota limit.' }, category: 'rate_limit' },
  { name: 'temporary throttle', status: 429, error: { code: 'rate_limit_exceeded', message: 'PRIVATE_PROVIDER_DETAIL' }, category: 'rate_limit' },
  { name: 'quota exhausted', status: 429, error: { code: 'insufficient_quota', message: 'Free allocated quota exceeded. PRIVATE_PROVIDER_DETAIL' }, category: 'insufficient_quota' },
  { name: 'unknown 429', status: 429, error: { message: 'PRIVATE_PROVIDER_DETAIL' }, category: 'unknown_429' },
  { name: 'billing 429', status: 429, error: { code: 'billing_error', message: 'PRIVATE_PROVIDER_DETAIL' }, category: 'billing_or_identity' },
  { name: 'mixed quota and throttle', status: 429, error: { code: 'rate_limit_exceeded', message: 'quota exceeded PRIVATE_PROVIDER_DETAIL' }, category: 'insufficient_quota' },
] as const;
for (const failure of costSafeFailures) test(`${failure.name}: distinguish error, one call, no fallback, safe AR/EN continuation`, async () => {
  process.env.DABRA_AI_PROVIDER = 'qwen';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ error: failure.error }, { status: failure.status }); };
  const plan = await planInternalAgentTool('plan my trip');
  assert.equal(plan.attempts?.[0].outcome, failure.category);
  assert.equal(plan.attempts?.length, 1);
  assert.equal(plan.status, 'unavailable');
  assert.equal(plan.tool, null);
  assert.equal(calls, 1);
  for (const locale of ['ar', 'en'] as const) for (const stream of [false, true]) {
    const response = await productPost('customer')(new NextRequest('http://localhost/api/ai2/chat', {
      method: 'POST', body: JSON.stringify({ message: 'plan my trip', locale, stream,
        history: [{ role: 'user', content: 'I need a hotel in Cairo' }] }),
    }));
    assert.equal(response.status, 200);
    const body = stream ? null : await response.json();
    const answer = stream ? await response.text() : body.answer;
    assert.ok(answer.startsWith(locale === 'ar'
      ? 'يمكنك المتابعة عبر خيارات المنصة أدناه، أو تحديد الخدمة التي تحتاجها.'
      : 'You can continue through the platform options below, or tell me which service you need.'));
    assert.match(answer, /family=dir3-stay/);
    assert.match(answer, /destination=cairo/);
    assert.doesNotMatch(answer, /PRIVATE_PROVIDER_DETAIL|insufficient_quota|unknown_429|billing_error|rate_limit_exceeded/);
    if (body) { assert.equal(body.provider, 'local'); assert.equal(body.agent.mutations, 0); assert.equal(body.understandingProvider, undefined); }
    else { assert.equal(response.headers.get('X-DABRA-Understanding'), 'unavailable'); assert.equal(response.headers.get('X-DABRA-Understanding-Provider'), null); }
  }
  assert.equal(calls, 5, 'each customer request has one classifier call; no retry, discovery or fallback');
});

for (const failure of [...costSafeFailures, { name: 'upstream 503', status: 503, error: { message: 'temporary' }, category: 'upstream_error' }]) {
  test(`${failure.name}: shared transport preserves retry cap and never discovers another model`, async () => {
    let calls = 0;
    globalThis.fetch = async input => {
      calls++;
      assert.match(String(input), /chat\/completions$/);
      return Response.json({ error: failure.error }, { status: failure.status });
    };
    const result = await callOpenAICompatibleProvider({ providerName: 'qwen', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      apiKey: 'isolated-test-placeholder', model: 'test-model', preferredModels: ['test-model'], prompt: 'test', message: 'test', timeoutMs: 6000, retryCount: 2 });
    assert.equal(result.errorCategory, failure.category);
    assert.equal(calls, failure.status === 503 ? 3 : 1);
    assert.equal(result.answer, '');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_PROVIDER_DETAIL/);
  });
}

test('after throttling, explicit hotel follow-up continues through platform rules with no new inference', async () => {
  process.env.DABRA_AI_PROVIDER = 'qwen';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ error: { code: 'rate_limit_exceeded' } }, { status: 429 }); };
  const post = productPost('customer');
  const first = await post(new NextRequest('http://localhost/api/ai2/chat', { method: 'POST', body: JSON.stringify({ message: 'plan my trip', locale: 'en' }) }));
  const firstBody = await first.json();
  assert.equal(calls, 1);
  for (const [locale, message] of [['en', 'I need a hotel in Cairo'], ['ar', 'أحتاج فندق في القاهرة']] as const) {
    const response = await post(new NextRequest('http://localhost/api/ai2/chat', { method: 'POST', body: JSON.stringify({ message, locale,
      history: [{ role: 'user', content: 'plan my trip' }, { role: 'assistant', content: firstBody.answer }] }) }));
    const body = await response.json();
    assert.equal(body.understanding, 'internal-rules');
    assert.match(body.answer, /family=dir3-stay/);
    assert.match(body.answer, /destination=cairo/);
    assert.equal(body.agent.mutations, 0);
  }
  assert.equal(calls, 1, 'explicit service follow-up needs no classifier retry');
});

const qwenErrorBodies: Array<{ name: string; body: unknown; category: string; provider?: string; status?: number; raw?: string }> = [
  { name: 'RPM with generic exhaustion text remains code-attributed and fail closed', body: { code: 'Throttling.RateQuota', message: 'quota exhausted PRIVATE_MARKER' }, category: 'rate_limit' },
  { name: 'TPM with free quota exhausted', body: { code: 'Throttling.AllocationQuota', message: 'Free quota exhausted.' }, category: 'insufficient_quota' },
  { name: 'RPM with credit depleted', body: { code: 'Throttling.RateQuota', message: 'credit depleted' }, category: 'billing_or_identity' },
  { name: 'malformed string body', body: 'PRIVATE_MARKER', category: 'unknown_429' },
  { name: 'malformed null error', body: { error: null }, category: 'unknown_429' },
  { name: 'malformed error type and code', body: { error: { type: [], code: 123 } }, category: 'unknown_429' },
  { name: 'general throttle with expired free quota', body: { code: 'Throttling', error: { message: 'Free quota expired.' } }, category: 'insufficient_quota' },
  { name: 'general throttle with exhausted free quota', body: { code: 'Throttling', error: { message: 'Free allocated quota exceeded.' } }, category: 'insufficient_quota' },
  { name: 'general throttle with billing code', body: { code: 'Throttling', error: { code: 'Arrearage' } }, category: 'billing_or_identity' },
  { name: 'general throttle with billing message', body: { code: 'Throttling', error: { message: 'billing error' } }, category: 'billing_or_identity' },
  { name: 'general throttle cannot cross provider scope', body: { code: 'Throttling', message: 'Requests throttling triggered.' }, provider: 'mistral', category: 'unknown_429' },
  { name: 'general throttle cannot cross status scope', body: { code: 'Throttling', message: 'Requests throttling triggered.' }, status: 400, category: 'invalid_request' },
  { name: 'unknown throttle suffix', body: { code: 'Throttling.Unknown' }, category: 'unknown_429' },
  { name: 'native TPM code with documented billing guidance', body: { code: 'Throttling.AllocationQuota', message: 'You exceeded your current quota, please check your plan and billing details.' }, category: 'rate_limit' },
  { name: 'actual arrearage HTTP400', body: { code: 'Arrearage', message: 'Access denied, please make sure your account is in good standing.' }, status: 400, category: 'billing_or_identity' },
  { name: 'invalid key overrides throttle', body: { code: 'Throttling.RateQuota' }, status: 401, category: 'invalid_key' },
  { name: 'unknown quota phrase is not exhaustion', body: { message: 'quota configuration details' }, category: 'unknown_429' },
  { name: 'malformed JSON', body: null, raw: '{', category: 'unknown_429' },
  { name: 'top-level documented RPM', body: { code: 'Throttling.RateQuota' }, category: 'rate_limit' },
  { name: 'top-level documented TPM', body: { code: 'Throttling.AllocationQuota' }, category: 'rate_limit' },
  { name: 'documented TPM alias', body: { error: { code: 'insufficient_quota', message: 'You exceeded your current quota, please check your plan and billing details.' } }, category: 'rate_limit' },
  { name: 'documented TPM alias without billing ambiguity', body: { code: 'insufficient_quota' }, category: 'rate_limit' },
  { name: 'free allocation overrides TPM code', body: { error: { code: 'Throttling.AllocationQuota', message: 'Free allocated quota exceeded.' } }, category: 'insufficient_quota' },
  { name: 'free quota expired', body: { error: { code: 'Throttling.AllocationQuota', message: 'Free quota expired.' } }, category: 'insufficient_quota' },
  { name: 'arrearage overrides throttle', body: { code: 'Throttling.RateQuota', error: { code: 'Arrearage' } }, category: 'billing_or_identity' },
  { name: 'service suspended', body: { code: 'isv.OUT_OF_SERVICE' }, category: 'billing_or_identity' },
  { name: 'billing message overrides RPM', body: { code: 'Throttling.RateQuota', error: { message: 'billing error' } }, category: 'billing_or_identity' },
  { name: 'another provider cannot inherit Qwen code meaning', body: { code: 'Throttling.RateQuota' }, category: 'unknown_429', provider: 'mistral' },
  { name: 'unknown quota-suffixed code', body: { code: 'Unknown.Quota' }, category: 'unknown_429' },
  { name: 'malformed code object', body: { code: { value: 'Throttling.RateQuota' }, error: { code: 123 } }, category: 'unknown_429' },
  { name: 'malformed array', body: [], category: 'unknown_429' },
  { name: 'malformed scalar', body: 42, category: 'unknown_429' },
  { name: 'malformed null', body: null, category: 'unknown_429' },
];
for (const fixture of qwenErrorBodies) test(`${fixture.name}: fail closed with one transport call`, async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return fixture.raw === undefined
    ? Response.json(fixture.body, { status: fixture.status ?? 429 })
    : new Response(fixture.raw, { status: fixture.status ?? 429 }); };
  const result = await callOpenAICompatibleProvider({ providerName: fixture.provider ?? 'qwen', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    apiKey: 'isolated-test-placeholder', model: 'test-model', preferredModels: ['test-model'], prompt: 'test', message: 'test', timeoutMs: 6000, retryCount: 2 });
  assert.equal(result.errorCategory, fixture.category);
  assert.equal(calls, 1);
  assert.equal(result.answer, '');
});

// Differential cost evidence: execute the immutable previous classifier using
// the same mocked transport, rather than merely asserting unchanged constants.
function previousCompatibleCall() {
  const require = createRequire(import.meta.url);
  const exports = {};
  const source = execFileSync('git', ['show', '1b4abceb63fef6110c56c509074a50859576d567:lib/ai2/runtime/openai-compatible.ts'], { encoding: 'utf8' });
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require, fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args),
    process, Date, AbortController, setTimeout, clearTimeout, URL }, { filename: 'previous-compatible.ts' });
  return (exports as typeof import('../lib/ai2/runtime/openai-compatible')).callOpenAICompatibleProvider;
}
function previousPlanner(previousCall: typeof callOpenAICompatibleProvider) {
  const require = createRequire(new URL('../lib/dabra/agent-planner.ts', import.meta.url));
  const exports = {};
  const source = execFileSync('git', ['show', '1b4abceb63fef6110c56c509074a50859576d567:lib/dabra/agent-planner.ts'], { encoding: 'utf8' });
  runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (id: string) => id === '../ai2/runtime/openai-compatible'
    ? { callOpenAICompatibleProvider: previousCall } : require(id), process, Date }, { filename: 'previous-planner.ts' });
  return (exports as typeof import('../lib/dabra/agent-planner')).planInternalAgentTool;
}
const conflictingBodies = [
  { code: 'Throttling.RateQuota', message: 'PRIVATE_MARKER' },
  { code: 'Unknown.Quota', message: 'PRIVATE_MARKER' },
  { message: 'quota unavailable PRIVATE_MARKER' },
  { code: 'Throttling.AllocationQuota', message: 'PRIVATE_MARKER' },
  { message: 'billing error PRIVATE_MARKER' },
  { code: 'insufficient_quota', message: 'PRIVATE_MARKER' },
] as const;
for (const provider of ['qwen', 'mistral'] as const) for (const status of [500, 503]) {
  for (const body of conflictingBodies) test(`${provider} ${status} ${JSON.stringify(body)} preserves parent one-call cost in transport and planner`, async () => {
    const previousCall = previousCompatibleCall();
    const params = { providerName: provider, baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      apiKey: 'isolated-test-placeholder', model: 'test-model', preferredModels: ['test-model'], prompt: 'test', message: 'test', timeoutMs: 6000, retryCount: 2 };
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json(body, { status }); };
    const oldResult = await previousCall(params);
    const oldCalls = calls;
    assert.equal(oldResult.ok, false);
    assert.equal(oldCalls, 1);
    calls = 0;
    const result = await callOpenAICompatibleProvider(params);
    assert.equal(result.ok, false);
    assert.notEqual(result.errorCategory, 'upstream_error');
    assert.equal(calls, oldCalls, 'diagnostic change cannot increase inference attempts');
    assert.equal(result.answer, '');
    process.env.DABRA_AI_PROVIDER = provider;
    process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
    calls = 0;
    globalThis.fetch = async url => { calls++; return calls === 1 ? Response.json(body, { status }) : providerResponse(String(url)); };
    const oldPlan = await previousPlanner(previousCall)('plan my trip');
    const oldPlannerCalls = calls;
    assert.equal(oldPlan.status, 'unavailable');
    assert.equal(oldPlannerCalls, 1);
    calls = 0;
    const plan = await planInternalAgentTool('plan my trip');
    assert.equal(plan.status, 'unavailable');
    assert.equal(plan.tool, null);
    assert.equal(plan.attempts?.length, 1);
    assert.equal(calls, oldPlannerCalls, 'conflicting status/body cannot unlock a paid alternate provider');
  });
}
