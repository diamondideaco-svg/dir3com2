import assert from 'node:assert/strict';
import test from 'node:test';

import { getAISearchConfig } from '@/lib/ai/config';
import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callDeepSeekChat } from '@/lib/ai2/runtime/deepseek-web';

const originalFetch = globalThis.fetch;
const envKeys = ['AI_SEARCH_ENABLED', 'AI_SEARCH_DEEPSEEK_ENABLED', 'DABRA_GLOBAL_WEB_ENABLED', 'DABRA_AI_PRIMARY_PROVIDER', 'DABRA_DEEPSEEK_ENABLED', 'DABRA_DEEPSEEK_MODEL', 'DABRA_DEEPSEEK_MAX_RETRIES', 'DABRA_PROVIDER_FALLBACK_ENABLED', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY'] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('configuration recognizes DeepSeek without changing the selected default', () => {
  process.env.AI_SEARCH_ENABLED = 'true';
  process.env.DEEPSEEK_API_KEY = 'test-key';
  const config = getAISearchConfig();
  assert.equal(config.provider, 'local');
  assert.equal(config.providers.deepseek.enabled, true);
});

test('client constructs deterministic AR and EN requests and parses responses', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ model: 'deepseek-v4-flash', choices: [{ message: { content: 'DEEPSEEK_PASS' } }] }), { status: 200 });
  }) as typeof fetch;

  for (const [language, message] of [['en', 'Reply in English'], ['ar', 'أجب بالعربية']] as const) {
    const result = await callDeepSeekChat({ message, language, prompt: 'Safe informational answers only.', apiKey: 'test-key', maxRetries: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.answer, 'DEEPSEEK_PASS');
    assert.equal(result.providerModel, 'deepseek-v4-flash');
  }
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].model, 'deepseek-v4-flash');
  assert.equal(bodies[0].temperature, 0);
  assert.match(JSON.stringify(bodies[1]), /أجب بالعربية/);
});

test('missing key, timeout, auth, rate limit, and provider errors are classified and sanitized', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; throw new Error('must not run'); }) as typeof fetch;
  const missing = await callDeepSeekChat({ message: 'x', language: 'en', prompt: 'x', apiKey: '' });
  assert.equal(missing.errorCategory, 'missing_key');
  assert.equal(calls, 0);

  for (const [status, expected, message] of [[401, 'auth_failure', 'secret-value-must-not-leak'], [402, 'billing_blocker', 'insufficient balance'], [429, 'rate_limit', 'secret-value-must-not-leak'], [503, 'provider_error', 'secret-value-must-not-leak']] as const) {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message } }), { status })) as typeof fetch;
    const result = await callDeepSeekChat({ message: 'x', language: 'en', prompt: 'x', apiKey: 'test-secret', maxRetries: 0 });
    assert.equal(result.errorCategory, expected);
    assert.equal(JSON.stringify(result).includes('secret-value-must-not-leak'), false);
    assert.equal(JSON.stringify(result).includes('test-secret'), false);
  }

  globalThis.fetch = (async () => { throw new DOMException('aborted', 'AbortError'); }) as typeof fetch;
  const timeout = await callDeepSeekChat({ message: 'x', language: 'en', prompt: 'x', apiKey: 'test-key', maxRetries: 0 });
  assert.equal(timeout.errorCategory, 'timeout');
});

test('retry is limited to configured attempts', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return new Response(JSON.stringify({ error: { message: 'busy' } }), { status: 503 }); }) as typeof fetch;
  const result = await callDeepSeekChat({ message: 'x', language: 'en', prompt: 'x', apiKey: 'test-key', maxRetries: 1 });
  assert.equal(result.ok, false);
  assert.equal(calls, 2);
});

test('router selects DeepSeek explicitly for AR and EN', async () => {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PRIMARY_PROVIDER = 'deepseek';
  process.env.DABRA_DEEPSEEK_ENABLED = 'true';
  process.env.DEEPSEEK_API_KEY = 'test-key';
  globalThis.fetch = (async () => new Response(JSON.stringify({ model: 'deepseek-v4-flash', choices: [{ message: { content: 'Informational answer' } }] }), { status: 200 })) as typeof fetch;
  const en = await buildAI2ChatResponse('What changed in global aviation today?');
  const ar = await buildAI2ChatResponse('ما أحدث أخبار الطيران العالمية اليوم؟');
  assert.equal(en.provider, 'deepseek');
  assert.equal(ar.provider, 'deepseek');
  assert.equal(en.retrievalMode, 'deepseek-chat-completions');
  assert.equal(ar.groundingStatus, 'grounded-external');
});

test('security refusals happen before DeepSeek invocation in AR and EN', async () => {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PRIMARY_PROVIDER = 'deepseek';
  process.env.DEEPSEEK_API_KEY = 'test-key';
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; throw new Error('provider must not be invoked'); }) as typeof fetch;
  const prohibited = ['book a room for me now', 'pay this invoice now', 'delete my account now', 'update database records now', 'احجز لي خدمة الآن', 'ادفع الفاتورة الآن', 'احذف حسابي الآن'];
  for (const message of prohibited) {
    const result = await buildAI2ChatResponse(message);
    assert.equal(result.provider, 'local', message);
    assert.equal(result.groundingStatus, 'fallback-no-source', message);
  }
  assert.equal(calls, 0);
});

test('fallback enabled reaches OpenAI while fallback disabled fails closed locally', async () => {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PRIMARY_PROVIDER = 'deepseek';
  process.env.DABRA_DEEPSEEK_MAX_RETRIES = '0';
  process.env.DEEPSEEK_API_KEY = 'deepseek-test-key';
  process.env.OPENAI_API_KEY = 'openai-test-key';
  globalThis.fetch = (async (input) => {
    if (String(input).includes('deepseek.com')) return new Response(JSON.stringify({ error: { message: 'upstream secret' } }), { status: 503 });
    return new Response(JSON.stringify({ output_text: 'OpenAI fallback', output: [{ content: [{ type: 'url_citation', url: 'https://example.com/source' }] }] }), { status: 200 });
  }) as typeof fetch;
  const fallback = await buildAI2ChatResponse('Current global aviation status?');
  assert.equal(fallback.provider, 'openai');

  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  const closed = await buildAI2ChatResponse('Current global aviation status?');
  assert.equal(closed.provider, 'local');
  assert.equal(closed.groundingStatus, 'fallback-provider-unavailable');
  assert.equal(closed.providerErrorCategory, 'provider_error');
  assert.equal(closed.answer.includes('upstream secret'), false);
});

test('DeepSeek request remains bound to the DABRA prompt', async () => {
  let systemPrompt = '';
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
    systemPrompt = body.messages.find((message) => message.role === 'system')?.content ?? '';
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  }) as typeof fetch;
  await callDeepSeekChat({ message: 'hello', language: 'en', prompt: AI2_DABRA_GLOBAL_WEB_PROMPT, apiKey: 'test-key', maxRetries: 0 });
  assert.equal(systemPrompt, AI2_DABRA_GLOBAL_WEB_PROMPT);
});
