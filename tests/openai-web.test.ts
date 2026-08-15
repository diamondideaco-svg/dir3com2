import assert from 'node:assert/strict';
import test from 'node:test';

import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';
import { callOpenAIResponsesWebSearch } from '@/lib/ai2/runtime/openai-web';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('openai returns missing_key safely', async () => {
  const result = await callOpenAIResponsesWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: '',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'missing_key');
});

test('openai parses answer and safe citations', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    output_text: 'OPENAI_OK',
    output: [
      {
        content: [
          { type: 'url_citation', url: 'https://example.com/a' },
          { type: 'url_citation', url: 'javascript:alert(1)' },
          { type: 'url_citation', url: 'https://example.com/a' },
        ],
      },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  const result = await callOpenAIResponsesWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'test-key',
  });

  assert.equal(result.ok, true);
  assert.equal(result.answer, 'OPENAI_OK');
  assert.deepEqual(result.citations, ['https://example.com/a']);
});

test('openai sanitizes auth and timeout failures', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    error: { type: 'authentication_error', message: 'secret upstream detail' },
  }), { status: 401, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  const auth = await callOpenAIResponsesWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'test-key',
  });

  assert.equal(auth.ok, false);
  assert.equal(auth.errorCategory, 'invalid_key');
  assert.equal(auth.answer.includes('secret'), false);

  globalThis.fetch = (async () => {
    throw new Error('aborted');
  }) as typeof fetch;

  const timeout = await callOpenAIResponsesWebSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'test-key',
    timeoutMs: 1,
  });

  assert.equal(timeout.ok, false);
  assert.equal(timeout.errorCategory, 'timeout');
});
