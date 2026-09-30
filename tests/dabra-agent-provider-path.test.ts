import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest } from 'next/server';
import { INTERNAL_AGENT_PROVIDERS, planInternalAgentTool } from '../lib/dabra/agent-planner';
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
