import assert from 'node:assert/strict';
import test from 'node:test';

import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callAnthropicMessagesWeb } from '@/lib/ai2/runtime/anthropic-web';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DABRA_GLOBAL_WEB_ENABLED', 'DABRA_AI_PROVIDER', 'DABRA_PROVIDER_FALLBACK_ENABLED']) {
    delete process.env[key];
  }
});

test('anthropic missing key is handled safely', async () => {
  const result = await callAnthropicMessagesWeb({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: '',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'missing_key');
});

test('anthropic parses valid text response', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    content: [{ type: 'text', text: 'ANTHROPIC_OK' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  const result = await callAnthropicMessagesWeb({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'test-key',
    model: 'claude-3-5-haiku-latest',
  });

  assert.equal(result.ok, true);
  assert.equal(result.answer, 'ANTHROPIC_OK');
});

test('anthropic classifies billing-or-identity blockers', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: { type: 'invalid_request_error', message: 'billing identity verification required' },
  }), { status: 400, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  const result = await callAnthropicMessagesWeb({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'test-key',
    model: 'claude-3-5-haiku-latest',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'billing_or_identity');
  assert.equal(result.answer, '');
});

test('router selects anthropic and safety refusal prevents provider invocation', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.OPENAI_API_KEY = 'openai-test';
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'anthropic';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';

  let calls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls += 1;
    const url = String(input);
    if (url.includes('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-haiku-latest' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Anthropic routed response' }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const routed = await buildAI2ChatResponse('qzvxx anthropic route check 91837');
  assert.equal(routed.provider, 'anthropic');

  const beforeRefusal = calls;
  const refused = await buildAI2ChatResponse('احجز وادفع لي الآن');
  assert.equal(refused.provider, 'local');
  assert.equal(refused.groundingStatus, 'fallback-no-source');
  assert.equal(calls, beforeRefusal);
});

test('fallback reaches openai only when enabled', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.OPENAI_API_KEY = 'openai-test';
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'anthropic';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('api.anthropic.com/v1/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-haiku-latest' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.includes('api.anthropic.com/v1/messages')) {
      return new Response(JSON.stringify({
        error: { type: 'server_error', message: 'upstream down' },
      }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      output_text: 'OpenAI fallback answer',
      output: [{ content: [{ type: 'url_citation', url: 'https://example.com/openai' }] }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const response = await buildAI2ChatResponse('qzvxx anthropic fallback check 91837');
  assert.equal(response.provider, 'openai');
});
