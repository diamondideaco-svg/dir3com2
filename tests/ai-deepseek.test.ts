import assert from 'node:assert/strict';
import test from 'node:test';

import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callDeepSeekWebSearch } from '@/lib/ai2/runtime/deepseek-web';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'DABRA_GLOBAL_WEB_ENABLED', 'DABRA_AI_PROVIDER', 'DABRA_PROVIDER_FALLBACK_ENABLED']) {
    delete process.env[key];
  }
});

test('missing key is classified safely', async () => {
  const result = await callDeepSeekWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: '',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'missing_key');
});

for (const [status, category] of [[401, 'invalid_key'], [429, 'insufficient_quota'], [503, 'upstream_error']] as const) {
  test(`${status} is sanitized and classified`, async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      error: { message: 'secret upstream detail' },
    }), { status })) as typeof fetch;

    const result = await callDeepSeekWebSearch({
      message: 'test',
      language: 'en',
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      apiKey: 'test-key',
      model: 'deepseek-chat',
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, category);
    assert.equal(result.answer.includes('secret'), false);
  });
}

test('timeout is classified', async () => {
  globalThis.fetch = (async () => {
    throw new Error('aborted');
  }) as typeof fetch;

  const result = await callDeepSeekWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'test-key',
    model: 'deepseek-chat',
    timeoutMs: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'timeout');
});

test('AR and EN content parse', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'إجابة answer' } }],
  }), { status: 200 })) as typeof fetch;

  for (const language of ['ar', 'en'] as const) {
    const result = await callDeepSeekWebSearch({
      message: 'test',
      language,
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      apiKey: 'test-key',
      model: 'deepseek-chat',
    });

    assert.equal(result.ok, true);
  }
});

test('router selects deepseek and refusal prevents invocation', async () => {
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'deepseek';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';

  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'DeepSeek answer' } }],
    }), { status: 200 });
  }) as typeof fetch;

  const routed = await buildAI2ChatResponse('qzvxx deepseek route check 91837');
  assert.equal(routed.provider, 'deepseek');

  const before = calls;
  for (const prompt of ['book a room for me now', 'pay this invoice now', 'delete my profile now', 'update database records now']) {
    const refused = await buildAI2ChatResponse(prompt);
    assert.equal(refused.provider, 'local');
  }
  assert.equal(calls, before);
});

test('fallback reaches OpenAI only when enabled', async () => {
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.OPENAI_API_KEY = 'openai-test';
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'deepseek';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';

  globalThis.fetch = (async (input) => String(input).includes('api.deepseek.com')
    ? new Response('{}', { status: 503 })
    : new Response(JSON.stringify({
      output_text: 'fallback',
      output: [{ content: [{ type: 'url_citation', url: 'https://example.com' }] }],
    }), { status: 200 })) as typeof fetch;

  const response = await buildAI2ChatResponse('qzvxx deepseek fallback check 91837');
  assert.equal(response.provider, 'openai');
});
