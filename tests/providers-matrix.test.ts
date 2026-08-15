import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callAnthropicMessagesWeb } from '@/lib/ai2/runtime/anthropic-web';
import { callDeepSeekWebSearch } from '@/lib/ai2/runtime/deepseek-web';
import { callMistralWebSearch } from '@/lib/ai2/runtime/mistral-web';
import { callQwenWebSearch } from '@/lib/ai2/runtime/qwen-web';
import { callXAIWebSearch } from '@/lib/ai2/runtime/xai-web';
import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';

const originalFetch = globalThis.fetch;

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.DABRA_GLOBAL_WEB_ENABLED;
  delete process.env.DABRA_AI_PROVIDER;
  delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.QWEN_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

test('xAI adapter handles missing key safely', async () => {
  const result = await callXAIWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: '',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'missing_key');
});

test('xAI adapter parses openai-compatible content', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'xAI result with source https://example.com/xai',
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  const result = await callXAIWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'xai-test-key',
    model: 'grok-4-0709',
  });

  assert.equal(result.ok, true);
  assert.equal(result.citations.includes('https://example.com/xai'), true);
});

test('deepseek adapter classifies auth errors', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          type: 'invalid_request_error',
          code: 'invalid_api_key',
          message: 'invalid key',
        },
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  const result = await callDeepSeekWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'bad',
    model: 'deepseek-chat',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'invalid_key');
});

test('qwen adapter classifies model_not_found', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          code: 'model_not_found',
          message: 'model not found',
        },
      }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  const result = await callQwenWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'bad',
    model: 'qwen-plus',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'model_not_found');
});

test('mistral adapter classifies timeout safely', async () => {
  globalThis.fetch = (async () => {
    throw new Error('The operation was aborted.');
  }) as typeof fetch;

  const result = await callMistralWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'test-key',
    model: 'mistral-small-latest',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'timeout');
});

test('anthropic adapter classifies billing-or-identity blockers', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          type: 'invalid_request_error',
          message: 'billing and identity verification required',
        },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  const result = await callAnthropicMessagesWeb({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'test-key',
    model: 'claude-3-5-haiku-latest',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'billing_or_identity');
});

test('router selects xai when requested and keeps safety refusal local', async () => {
  const oldXai = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = 'xai-test-key';
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'xai';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';

  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'xai routed answer https://example.com/xai' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const routed = await buildAI2ChatResponse('What is one global market headline?');
    assert.equal(routed.provider, 'xai');
    assert.equal(routed.retrievalMode, 'xai-chat-completions');

    const refused = await buildAI2ChatResponse('Book this trip for me now');
    assert.equal(refused.provider, 'local');
    assert.equal(calls, 1);
  } finally {
    restoreEnv('XAI_API_KEY', oldXai);
  }
});

test('router falls back from xai to openai when enabled', async () => {
  process.env.XAI_API_KEY = 'xai-test-key';
  process.env.OPENAI_API_KEY = 'openai-test-key';
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'xai';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.x.ai')) {
      return new Response(
        JSON.stringify({
          error: {
            type: 'server_error',
            code: 'temporary',
            message: 'temporary outage',
          },
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        output_text: 'OpenAI fallback answer',
        output: [{ content: [{ type: 'url_citation', url: 'https://example.com/openai' }] }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const routed = await buildAI2ChatResponse('What changed globally in travel this week?');
  assert.equal(routed.provider, 'openai');
  assert.equal(routed.retrievalMode, 'openai-web-search');
});
