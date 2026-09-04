import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildDabraProviderAttempt,
  mapProviderErrorCategory,
  setDabraProviderAttemptWriterForTests,
  type DabraProviderAttemptRecord,
} from '@/lib/ai2/observability/provider-attempts';
import { estimateProviderCostUsd, getOfficialProviderPricing } from '@/lib/ai2/observability/provider-pricing';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';

const originalFetch = globalThis.fetch;
const providerEnv = [
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'ANTHROPIC_API_KEY',
  'XAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'MISTRAL_API_KEY',
] as const;
const modelEnv = [
  'DABRA_OPENAI_MODEL',
  'DABRA_GEMINI_MODEL',
  'DABRA_ANTHROPIC_MODEL',
  'DABRA_XAI_MODEL',
  'DABRA_DEEPSEEK_MODEL',
  'DABRA_QWEN_MODEL',
  'DABRA_MISTRAL_MODEL',
] as const;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  setDabraProviderAttemptWriterForTests(null);
  for (const key of [...providerEnv, ...modelEnv]) delete process.env[key];
  delete process.env.DABRA_GLOBAL_WEB_ENABLED;
  delete process.env.DABRA_AI_PROVIDER;
  delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
  delete process.env.DABRA_AI_MAX_FALLBACK_HOPS;
});

function configureProvider(provider: string, key: (typeof providerEnv)[number], modelKey: (typeof modelEnv)[number]) {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  process.env.DABRA_AI_PROVIDER = provider;
  process.env[key] = 'test-key-not-a-secret';
  process.env[modelKey] = `${provider}-test-model`;
}

function providerResponse(provider: string, status = 200): Response {
  if (status !== 200) return new Response(JSON.stringify({ error: { message: 'upstream unavailable' } }), { status });
  if (provider === 'openai') {
    return new Response(JSON.stringify({ output_text: 'Observed answer', usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
  }
  if (provider === 'gemini') {
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Observed answer' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    }), { status: 200 });
  }
  if (provider === 'anthropic') {
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Observed answer' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }), { status: 200 });
  }
  return new Response(JSON.stringify({
    choices: [{ message: { content: 'Observed answer' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200 });
}

for (const [provider, key, modelKey] of [
  ['openai', 'OPENAI_API_KEY', 'DABRA_OPENAI_MODEL'],
  ['gemini', 'GOOGLE_GENERATIVE_AI_API_KEY', 'DABRA_GEMINI_MODEL'],
  ['anthropic', 'ANTHROPIC_API_KEY', 'DABRA_ANTHROPIC_MODEL'],
  ['xai', 'XAI_API_KEY', 'DABRA_XAI_MODEL'],
  ['deepseek', 'DEEPSEEK_API_KEY', 'DABRA_DEEPSEEK_MODEL'],
  ['qwen', 'DASHSCOPE_API_KEY', 'DABRA_QWEN_MODEL'],
  ['mistral', 'MISTRAL_API_KEY', 'DABRA_MISTRAL_MODEL'],
] as const) {
  test(`${provider} success emits one content-free attempt with token usage`, async () => {
    configureProvider(provider, key, modelKey);
    const attempts: DabraProviderAttemptRecord[] = [];
    setDabraProviderAttemptWriterForTests(async (record) => { attempts.push(record); });
    globalThis.fetch = (async () => providerResponse(provider)) as typeof fetch;

    const response = await buildAI2ChatResponse(`external observability topic ${provider}`);
    assert.equal(response.provider, provider);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]?.provider, provider);
    assert.equal(attempts[0]?.success, true);
    assert.equal(attempts[0]?.input_tokens, 10);
    assert.equal(attempts[0]?.output_tokens, 5);
    assert.equal(attempts[0]?.fallback_hop, 0);
    assert.match(attempts[0]?.request_id ?? '', /^[0-9a-f-]{36}$/);
  });

  test(`${provider} authentication failure is classified without content`, async () => {
    configureProvider(provider, key, modelKey);
    const attempts: DabraProviderAttemptRecord[] = [];
    setDabraProviderAttemptWriterForTests(async (record) => { attempts.push(record); });
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 })) as typeof fetch;

    await buildAI2ChatResponse(`external observability failure ${provider}`);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]?.success, false);
    assert.equal(attempts[0]?.error_category, 'authentication');
    assert.deepEqual(attempts[0]?.input_tokens, null);
    assert.deepEqual(attempts[0]?.output_tokens, null);
  });
}

test('Gemini timeout and 503 receive distinct canonical categories', () => {
  assert.equal(mapProviderErrorCategory('timeout'), 'timeout');
  assert.equal(mapProviderErrorCategory('upstream_error', 503), 'upstream_503');
});

test('Gemini runtime timeout emits one timeout-classified logical provider attempt', async () => {
  configureProvider('gemini', 'GOOGLE_GENERATIVE_AI_API_KEY', 'DABRA_GEMINI_MODEL');
  const attempts: DabraProviderAttemptRecord[] = [];
  setDabraProviderAttemptWriterForTests(async (record) => { attempts.push(record); });
  globalThis.fetch = (async () => { throw new Error('The operation was aborted.'); }) as typeof fetch;

  const response = await buildAI2ChatResponse('external Gemini timeout observability topic');
  assert.equal(response.provider, 'local');
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.provider, 'gemini');
  assert.equal(attempts[0]?.success, false);
  assert.equal(attempts[0]?.error_category, 'timeout');
});

test('fallback attempts share correlation and preserve the prior failure reason', async () => {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  process.env.DABRA_AI_MAX_FALLBACK_HOPS = '1';
  process.env.DABRA_AI_PROVIDER = 'gemini';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.DABRA_GEMINI_MODEL = 'gemini-3.6-flash';
  process.env.DABRA_OPENAI_MODEL = 'gpt-4.1-mini';
  const attempts: DabraProviderAttemptRecord[] = [];
  setDabraProviderAttemptWriterForTests(async (record) => { attempts.push(record); });
  globalThis.fetch = (async (input) => String(input).includes('generativelanguage')
    ? providerResponse('gemini', 503)
    : providerResponse('openai')) as typeof fetch;

  const response = await buildAI2ChatResponse('external fallback observability topic');
  assert.equal(response.provider, 'openai');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0]?.error_category, 'upstream_503');
  assert.equal(attempts[1]?.request_id, attempts[0]?.request_id);
  assert.equal(attempts[1]?.fallback_from, 'gemini');
  assert.equal(attempts[1]?.fallback_reason, 'upstream_503');
  assert.equal(attempts[1]?.fallback_hop, 1);
});

test('attempt allow-list rejects prompt, answer, PII, secret and provider body fields', () => {
  const record = buildDabraProviderAttempt({
    requestId: '11111111-1111-4111-8111-111111111111',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    intentClass: 'general',
    language: 'en',
    route: 'fast-chat',
    startedAtMs: 1_000,
    completedAtMs: 1_125,
    success: true,
    fallbackHop: 0,
    inputTokens: 100,
    outputTokens: 50,
    groundingStatus: 'answered-general',
    prompt: 'PRIVATE PROMPT',
    answer: 'PRIVATE ANSWER',
    email: 'person@example.invalid',
    authorization: 'Bearer secret',
    providerBody: { secret: true },
  } as never);
  const serialized = JSON.stringify(record);
  for (const forbidden of ['PRIVATE PROMPT', 'PRIVATE ANSWER', 'person@example.invalid', 'Bearer secret', 'providerBody']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('cost is estimated only for exact officially priced models with complete token usage', () => {
  const priced = estimateProviderCostUsd({ provider: 'openai', model: 'gpt-4.1-mini', inputTokens: 1_000_000, outputTokens: 1_000_000 });
  assert.equal(priced.estimatedCostUsd, 2);
  assert.match(priced.pricingVersion ?? '', /^2026-09-04:/);
  assert.deepEqual(
    estimateProviderCostUsd({ provider: 'mistral', model: 'mistral-small-latest', inputTokens: 10, outputTokens: 5 }),
    { estimatedCostUsd: null, pricingVersion: null },
  );
  assert.deepEqual(
    estimateProviderCostUsd({ provider: 'gemini', model: 'gemini-3.6-flash', inputTokens: null, outputTokens: 5 }),
    { estimatedCostUsd: null, pricingVersion: null },
  );
  assert.ok(getOfficialProviderPricing().every((entry) => entry.source.startsWith('https://')));
});

test('migration is append-only, least privilege and exposes only aggregate service-role metrics', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260904130954_dabra_provider_observability.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.dabra_provider_attempts FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.dabra_provider_attempts TO service_role/i);
  assert.doesNotMatch(migration, /GRANT (?:UPDATE|DELETE)/i);
  assert.match(migration, /SECURITY INVOKER/i);
  assert.match(migration, /p50_latency_ms/i);
  assert.match(migration, /p95_latency_ms/i);
  assert.match(migration, /p99_latency_ms/i);
  assert.match(migration, /failure_count bigint/i);
  assert.match(migration, /timeout_count bigint/i);
  assert.match(migration, /last_used timestamptz/i);
  assert.match(migration, /last_success timestamptz/i);
  assert.match(migration, /error_categories jsonb/i);
  assert.doesNotMatch(migration, /\b(?:prompt|answer|email|phone|authorization|headers?|response_body)\b\s+(?:text|jsonb)/i);
});
