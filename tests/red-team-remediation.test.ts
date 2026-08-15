import assert from 'node:assert/strict';
import test from 'node:test';

import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';
import {
  MODEL_DISCOVERY_CACHE_MAX_ENTRIES,
  clearOpenAICompatibleModelCacheForTests,
  discoverOpenAICompatibleModel,
  getOpenAICompatibleModelCacheKeysForTests,
  getOpenAICompatibleModelCacheSizeForTests,
  sanitizeCitationUrl,
} from '@/lib/ai2/runtime/openai-compatible';
import {
  ANTHROPIC_DISCOVERY_CACHE_MAX_ENTRIES,
  clearAnthropicModelCacheForTests,
  discoverAnthropicModel,
  getAnthropicModelCacheSizeForTests,
} from '@/lib/ai2/runtime/anthropic-web';
import {
  GEMINI_DISCOVERY_CACHE_MAX_ENTRIES,
  clearGeminiModelCacheForTests,
  discoverGeminiModel,
  getGeminiModelCacheSizeForTests,
} from '@/lib/ai2/runtime/gemini-web';
import { discoverOpenAIModel } from '@/lib/ai2/runtime/openai-web';
import { callDeepSeekWebSearch } from '@/lib/ai2/runtime/deepseek-web';
import { callMistralWebSearch } from '@/lib/ai2/runtime/mistral-web';
import { callQwenWebSearch } from '@/lib/ai2/runtime/qwen-web';
import { callXAIWebSearch } from '@/lib/ai2/runtime/xai-web';
import {
  deriveAuthCell,
  mapRuntimeResultToCell,
  resolveFinalStatus,
  type ProviderMatrixRow,
} from '@/scripts/provider-matrix-live';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  clearOpenAICompatibleModelCacheForTests();
  clearGeminiModelCacheForTests();
  clearAnthropicModelCacheForTests();
  for (const key of [
    'DABRA_XAI_MODEL',
    'DABRA_DEEPSEEK_MODEL',
    'DABRA_QWEN_MODEL',
    'DABRA_MISTRAL_MODEL',
  ]) {
    delete process.env[key];
  }
});

test('citation URL sanitizer rejects private and unsafe URLs and accepts safe https/http', () => {
  const blocked = [
    'javascript:alert(1)',
    'https://localhost/admin',
    'https://127.0.0.1:8080/private',
    'https://0.0.0.0/private',
    'https://100.64.0.1/private',
    'https://169.254.2.3/local',
    'https://192.168.1.11/dashboard',
    'https://[::1]/root',
    'https://service.internal/private',
    'https://user:pass@example.com/secret',
  ];

  for (const url of blocked) {
    assert.equal(sanitizeCitationUrl(url), null);
  }

  assert.equal(sanitizeCitationUrl('https://example.com/path?q=1'), 'https://example.com/path?q=1');
  assert.equal(sanitizeCitationUrl('http://example.org/path.'), 'http://example.org/path');
});

test('openai-compatible discovery cache remains bounded', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [{ id: 'model-a' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

  for (let i = 0; i < MODEL_DISCOVERY_CACHE_MAX_ENTRIES + 25; i += 1) {
    await discoverOpenAICompatibleModel(`key-${i}`, 'https://provider.example/v1', ['model-a']);
  }

  assert.equal(getOpenAICompatibleModelCacheSizeForTests(), MODEL_DISCOVERY_CACHE_MAX_ENTRIES);
});

test('openai-compatible cache isolates hashed credentials and prunes expired entries', async () => {
  const realNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ id: 'model-a' }] }), { status: 200 })) as typeof fetch;
  try {
    await discoverOpenAICompatibleModel('raw-secret-a', 'https://provider.example/v1', ['model-a']);
    await discoverOpenAICompatibleModel('raw-secret-b', 'https://provider.example/v1', ['model-a']);
    const keys = getOpenAICompatibleModelCacheKeysForTests();
    assert.equal(keys.length, 2);
    assert.equal(keys.some((key) => key.includes('raw-secret-a') || key.includes('raw-secret-b')), false);
    now += 5 * 60_000 + 1;
    await discoverOpenAICompatibleModel('raw-secret-c', 'https://provider.example/v1', ['model-a']);
    assert.equal(getOpenAICompatibleModelCacheSizeForTests(), 1);
  } finally {
    Date.now = realNow;
  }
});

test('OpenAI discovery rejects a successful models response with no usable GPT model', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ id: 'text-embedding-3-small' }] }), { status: 200 })) as typeof fetch;
  assert.equal(await discoverOpenAIModel('openai-test-key', 1_000), null);
});

test('gemini discovery cache remains bounded', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({
      models: [{ name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

  for (let i = 0; i < GEMINI_DISCOVERY_CACHE_MAX_ENTRIES + 25; i += 1) {
    await discoverGeminiModel(`key-${i}`);
  }

  assert.equal(getGeminiModelCacheSizeForTests(), GEMINI_DISCOVERY_CACHE_MAX_ENTRIES);
});

test('anthropic discovery cache remains bounded', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [{ id: 'claude-3-5-haiku-latest' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

  for (let i = 0; i < ANTHROPIC_DISCOVERY_CACHE_MAX_ENTRIES + 25; i += 1) {
    await discoverAnthropicModel(`key-${i}`);
  }

  assert.equal(getAnthropicModelCacheSizeForTests(), ANTHROPIC_DISCOVERY_CACHE_MAX_ENTRIES);
});

type CompatibleResult = {
  ok: boolean;
  answer: string;
  citations: string[];
  errorCategory?: string;
  model?: string;
};

type AdapterCaller = () => Promise<CompatibleResult>;

async function assertModelRecoveryWithoutExplicitModel(hostFragment: string, recoveredModel: string, callAdapter: AdapterCaller) {
  let discoveryCalls = 0;
  let chatCalls = 0;

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (!url.includes(hostFragment)) {
      return new Response(JSON.stringify({ error: { message: 'unexpected host' } }), { status: 500 });
    }

    if (url.endsWith('/models') || url.includes('/models?')) {
      discoveryCalls += 1;
      if (discoveryCalls === 1) {
        return new Response(JSON.stringify({ error: { message: 'discovery temporary fail' } }), { status: 503 });
      }

      return new Response(JSON.stringify({ data: [{ id: recoveredModel }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.endsWith('/chat/completions')) {
      chatCalls += 1;
      if (chatCalls === 1) {
        return new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 });
      }

      const payload = JSON.parse(String(init?.body ?? '{}')) as { model?: string };
      if (payload.model !== recoveredModel) {
        return new Response(JSON.stringify({ error: { message: 'wrong recovery model' } }), { status: 500 });
      }

      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Recovered provider answer https://example.com/recovered' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: { message: 'unexpected endpoint' } }), { status: 500 });
  }) as typeof fetch;

  const result = await callAdapter();
  assert.equal(result.ok, true);
  assert.equal(result.model, recoveredModel);
  assert.equal(result.citations.includes('https://example.com/recovered'), true);
}

test('xai recovers model after model_not_found when model is implicit', async () => {
  await assertModelRecoveryWithoutExplicitModel('api.x.ai', 'grok-3', () => callXAIWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'xai-test-key',
  }));
});

test('deepseek recovers model after model_not_found when model is implicit', async () => {
  await assertModelRecoveryWithoutExplicitModel('api.deepseek.com', 'deepseek-reasoner', () => callDeepSeekWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'deepseek-test-key',
  }));
});

test('qwen recovers model after model_not_found when model is implicit', async () => {
  await assertModelRecoveryWithoutExplicitModel('dashscope', 'qwen-turbo', () => callQwenWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'qwen-test-key',
  }));
});

test('mistral recovers model after model_not_found when model is implicit', async () => {
  await assertModelRecoveryWithoutExplicitModel('api.mistral.ai', 'mistral-medium-latest', () => callMistralWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'mistral-test-key',
  }));
});

function makeRow(): ProviderMatrixRow {
  return {
    Provider: 'xAI',
    Adapter: 'PASS',
    Router: 'PASS',
    Auth: 'PASS',
    'Model Discovery': 'PASS',
    'EN Live': 'PASS',
    'AR Live': 'PASS',
    'DABRA Routing': 'PASS',
    'Safety Regression': 'PASS',
    Fallback: 'PASS',
    'Targeted Tests': 'PASS',
    'Final Status': 'PASS',
    Blocker: '',
  };
}

test('matrix auth truthfulness requires positive evidence', () => {
  assert.equal(deriveAuthCell({ ok: false, errorCategory: 'upstream_error' }, { ok: false, errorCategory: 'upstream_error' }), 'FAIL');
  assert.equal(deriveAuthCell({ ok: false, errorCategory: 'invalid_key' }, { ok: false, errorCategory: 'upstream_error' }), 'WAIT_AUTH');
  assert.equal(deriveAuthCell({ ok: true }, { ok: false, errorCategory: 'invalid_key' }), 'PASS');
  assert.equal(mapRuntimeResultToCell({ ok: false, errorCategory: 'billing_or_identity' }), 'EXTERNAL_BLOCKER');
  for (const category of ['invalid_request', 'model_not_found', 'upstream_error', 'malformed_response']) {
    assert.equal(mapRuntimeResultToCell({ ok: false, errorCategory: category }), 'FAIL');
  }
});

test('matrix final status treats attempted routing and missing discovery as failures', () => {
  const attempted = makeRow();
  attempted['DABRA Routing'] = 'ATTEMPTED_FAIL';
  assert.equal(resolveFinalStatus(attempted)['Final Status'], 'FAIL_CODE');

  const missingDiscovery = makeRow();
  missingDiscovery['Model Discovery'] = 'NOT_RUN';
  assert.equal(resolveFinalStatus(missingDiscovery)['Final Status'], 'FAIL_CODE');

  const waitAuth = makeRow();
  waitAuth.Auth = 'WAIT_AUTH';
  const resolvedWait = resolveFinalStatus(waitAuth);
  assert.equal(resolvedWait['Final Status'], 'WAIT_AUTH');
  assert.equal(resolvedWait.Blocker.startsWith('KEY_INVALID_OR_MISSING:'), true);
});
