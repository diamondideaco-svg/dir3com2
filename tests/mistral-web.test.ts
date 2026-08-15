import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callMistralWebSearch } from '@/lib/ai2/runtime/mistral-web';
import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.DABRA_GLOBAL_WEB_ENABLED;
  delete process.env.DABRA_AI_PROVIDER;
  delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

test('mistral returns missing_key when key is absent', async () => {
  const result = await callMistralWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: '',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'missing_key');
});

test('mistral parses successful text response and extracts safe citations', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: 'Mistral answer source https://example.com/mistral',
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  const result = await callMistralWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'mistral-test-key',
    model: 'mistral-small-latest',
  });

  assert.equal(result.ok, true);
  assert.equal(result.citations.includes('https://example.com/mistral'), true);
});

test('mistral classifies 401 as invalid_key without leaking upstream text', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          type: 'authentication_error',
          code: 'invalid_api_key',
          message: 'upstream secret detail should not be surfaced',
        },
      }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  const result = await callMistralWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'bad-key',
    model: 'mistral-small-latest',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'invalid_key');
  assert.equal(JSON.stringify(result).includes('upstream secret detail'), false);
});

test('mistral classifies 429 as insufficient_quota', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
          message: 'quota exceeded',
        },
      }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  const result = await callMistralWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'mistral-test-key',
    model: 'mistral-small-latest',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'insufficient_quota');
});

test('mistral classifies 5xx as upstream_error', async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          type: 'server_error',
          code: 'service_unavailable',
          message: 'temporary issue',
        },
      }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  const result = await callMistralWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'mistral-test-key',
    model: 'mistral-small-latest',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'upstream_error');
});

test('mistral classifies timeout safely', async () => {
  globalThis.fetch = (async () => {
    throw new Error('The operation was aborted.');
  }) as typeof fetch;

  const result = await callMistralWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'mistral-test-key',
    model: 'mistral-small-latest',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'timeout');
});

test('router uses mistral when selected and fallback disabled', async () => {
  process.env.MISTRAL_API_KEY = 'mistral-test-key';
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'mistral';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/models')) {
      return new Response(
        JSON.stringify({ data: [{ id: 'mistral-small-latest' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Mistral routed answer https://example.com/mistral' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const response = await buildAI2ChatResponse('qzvxx random global provider route 918');
  assert.equal(response.provider, 'mistral');
  assert.equal(response.retrievalMode, 'mistral-chat-completions');
});

test('safety refusal blocks provider invocation for sensitive actions', async () => {
  process.env.MISTRAL_API_KEY = 'mistral-test-key';
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'mistral';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';

  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error('provider must not be called for refusal intent');
  }) as typeof fetch;

  const response = await buildAI2ChatResponse('book a service for me now');
  assert.equal(response.provider, 'local');
  assert.equal(response.groundingStatus, 'fallback-no-source');
  assert.equal(calls, 0);
});

test('fallback from mistral to openai works when enabled', async () => {
  process.env.MISTRAL_API_KEY = 'mistral-test-key';
  process.env.OPENAI_API_KEY = 'openai-test-key';
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'mistral';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.mistral.ai')) {
      if (url.endsWith('/models')) {
        return new Response(
          JSON.stringify({ data: [{ id: 'mistral-small-latest' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          error: {
            type: 'server_error',
            code: 'temporary_outage',
            message: 'temporary upstream outage',
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

  const response = await buildAI2ChatResponse('What changed globally in travel this week?');
  assert.equal(response.provider, 'openai');
  assert.equal(response.retrievalMode, 'openai-web-search');
});
