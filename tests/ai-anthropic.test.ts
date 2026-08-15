import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callAnthropicMessagesWeb } from '@/lib/ai2/runtime/anthropic-web';

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

test('anthropic configured path succeeds and parses response', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;

  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        content: [{ type: 'text', text: 'ANTHROPIC_OK' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  try {
    const result = await callAnthropicMessagesWeb({
      message: 'hello',
      language: 'en',
      prompt: 'system prompt',
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    assert.equal(result.ok, true);
    assert.equal(result.answer, 'ANTHROPIC_OK');
    assert.equal(result.providerModel?.length ? true : false, true);
  } finally {
    restoreEnv('ANTHROPIC_API_KEY', originalKey);
    globalThis.fetch = originalFetch;
  }
});

test('anthropic missing key is handled safely', async () => {
  const result = await callAnthropicMessagesWeb({
    message: 'hello',
    language: 'en',
    prompt: 'system prompt',
    apiKey: '',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'missing_key');
});

test('anthropic malformed response is classified', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        content: [{ type: 'image', source: 'n/a' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  try {
    const result = await callAnthropicMessagesWeb({
      message: 'hello',
      language: 'en',
      prompt: 'system prompt',
      apiKey: 'test-anthropic-key',
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, 'malformed_response');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('anthropic http error is sanitized and classified', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          type: 'invalid_request_error',
          message: 'invalid input payload',
        },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  try {
    const result = await callAnthropicMessagesWeb({
      message: 'hello',
      language: 'en',
      prompt: 'system prompt',
      apiKey: 'test-anthropic-key',
      maxRetries: 0,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, 'invalid_request');
    assert.equal(result.answer, '');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('anthropic timeout is classified and retryable', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    })) as typeof fetch;

  try {
    const result = await callAnthropicMessagesWeb({
      message: 'hello',
      language: 'en',
      prompt: 'system prompt',
      apiKey: 'test-anthropic-key',
      timeoutMs: 5,
      maxRetries: 0,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, 'timeout');
    assert.equal(result.retryable, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider routing honors anthropic primary', async () => {
  const originalFetch = globalThis.fetch;
  const oldPrimary = process.env.DABRA_AI_PRIMARY_PROVIDER;
  const oldFallback = process.env.DABRA_AI_FALLBACK_PROVIDER;
  const oldEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const oldAKey = process.env.ANTHROPIC_API_KEY;
  const oldOKey = process.env.OPENAI_API_KEY;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PRIMARY_PROVIDER = 'anthropic';
  process.env.DABRA_AI_FALLBACK_PROVIDER = 'openai';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';

  let openaiCalls = 0;
  let anthropicCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.anthropic.com')) {
      anthropicCalls += 1;
      return new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'Anthropic primary answer' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    openaiCalls += 1;
    return new Response(
      JSON.stringify({
        output_text: 'OpenAI fallback answer',
        output: [{ content: [{ type: 'url_citation', url: 'https://example.com/openai' }] }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const response = await buildAI2ChatResponse('What is a recent global travel update?');

    assert.equal(response.provider, 'anthropic');
    assert.equal(response.retrievalMode, 'anthropic-messages');
    assert.equal(anthropicCalls > 0, true);
    assert.equal(openaiCalls, 0);
  } finally {
    restoreEnv('DABRA_AI_PRIMARY_PROVIDER', oldPrimary);
    restoreEnv('DABRA_AI_FALLBACK_PROVIDER', oldFallback);
    restoreEnv('DABRA_GLOBAL_WEB_ENABLED', oldEnabled);
    restoreEnv('ANTHROPIC_API_KEY', oldAKey);
    restoreEnv('OPENAI_API_KEY', oldOKey);
    globalThis.fetch = originalFetch;
  }
});

test('fallback to openai when anthropic fails', async () => {
  const originalFetch = globalThis.fetch;
  const oldPrimary = process.env.DABRA_AI_PRIMARY_PROVIDER;
  const oldFallback = process.env.DABRA_AI_FALLBACK_PROVIDER;
  const oldEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const oldAKey = process.env.ANTHROPIC_API_KEY;
  const oldOKey = process.env.OPENAI_API_KEY;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PRIMARY_PROVIDER = 'anthropic';
  process.env.DABRA_AI_FALLBACK_PROVIDER = 'openai';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.anthropic.com')) {
      return new Response(
        JSON.stringify({ error: { type: 'server_error', message: 'upstream down' } }),
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

  try {
    const response = await buildAI2ChatResponse('What is a recent global travel update?');

    assert.equal(response.provider, 'openai');
    assert.equal(response.retrievalMode, 'openai-web-search');
    assert.equal(response.groundingStatus, 'grounded-global-web');
  } finally {
    restoreEnv('DABRA_AI_PRIMARY_PROVIDER', oldPrimary);
    restoreEnv('DABRA_AI_FALLBACK_PROVIDER', oldFallback);
    restoreEnv('DABRA_GLOBAL_WEB_ENABLED', oldEnabled);
    restoreEnv('ANTHROPIC_API_KEY', oldAKey);
    restoreEnv('OPENAI_API_KEY', oldOKey);
    globalThis.fetch = originalFetch;
  }
});

test('security refusal happens before provider invocation (AR/EN)', async () => {
  const originalFetch = globalThis.fetch;
  const oldPrimary = process.env.DABRA_AI_PRIMARY_PROVIDER;
  const oldFallback = process.env.DABRA_AI_FALLBACK_PROVIDER;
  const oldEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const oldAKey = process.env.ANTHROPIC_API_KEY;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PRIMARY_PROVIDER = 'anthropic';
  process.env.DABRA_AI_FALLBACK_PROVIDER = 'openai';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error('provider must not be called for refusal intents');
  }) as typeof fetch;

  try {
    const ar = await buildAI2ChatResponse('احجز وادفع لي الآن');
    const en = await buildAI2ChatResponse('book a service for me now');

    assert.equal(ar.provider, 'local');
    assert.equal(ar.retrievalMode, 'internal-rag');
    assert.equal(ar.groundingStatus, 'fallback-no-source');

    assert.equal(en.provider, 'local');
    assert.equal(en.retrievalMode, 'internal-rag');
    assert.equal(en.groundingStatus, 'fallback-no-source');

    assert.equal(calls, 0);
  } finally {
    restoreEnv('DABRA_AI_PRIMARY_PROVIDER', oldPrimary);
    restoreEnv('DABRA_AI_FALLBACK_PROVIDER', oldFallback);
    restoreEnv('DABRA_GLOBAL_WEB_ENABLED', oldEnabled);
    restoreEnv('ANTHROPIC_API_KEY', oldAKey);
    globalThis.fetch = originalFetch;
  }
});

test('provider failure path never leaks secrets in response text', async () => {
  const originalFetch = globalThis.fetch;
  const oldPrimary = process.env.DABRA_AI_PRIMARY_PROVIDER;
  const oldEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const oldAKey = process.env.ANTHROPIC_API_KEY;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PRIMARY_PROVIDER = 'anthropic';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

  globalThis.fetch = (async () => {
    throw new Error('network failed, key=secret-marker-not-allowed');
  }) as typeof fetch;

  try {
    const response = await buildAI2ChatResponse('xqv random unknown question 19283');
    assert.equal(response.provider, 'local');
    assert.equal(response.groundingStatus, 'fallback-provider-unavailable');
    assert.equal(response.answer.includes('secret-marker-not-allowed'), false);
    assert.equal(response.answer.includes('test-anthropic-key'), false);
  } finally {
    restoreEnv('DABRA_AI_PRIMARY_PROVIDER', oldPrimary);
    restoreEnv('DABRA_GLOBAL_WEB_ENABLED', oldEnabled);
    restoreEnv('ANTHROPIC_API_KEY', oldAKey);
    globalThis.fetch = originalFetch;
  }
});
