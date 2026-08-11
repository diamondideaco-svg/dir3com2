import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAI2ChatResponse,
  isOutOfScopeIntent,
} from '@/lib/ai2/runtime/chat';
import { extractValidWebCitations } from '@/lib/ai2/runtime/openai-web';

test('extractValidWebCitations removes duplicates and rejects unsafe schemes', () => {
  const payload = {
    output: [
      {
        content: [
          {
            type: 'url_citation',
            url: 'https://example.com/source-a',
          },
          {
            type: 'url_citation',
            url: 'http://example.com/source-b',
          },
          {
            type: 'url_citation',
            url: 'javascript:alert(1)',
          },
          {
            type: 'url_citation',
            url: 'https://example.com/source-a',
          },
        ],
      },
    ],
  };

  const citations = extractValidWebCitations(payload);
  assert.deepEqual(citations, ['https://example.com/source-a', 'http://example.com/source-b']);
});

test('out-of-scope booking/payment intent is refused before provider', async () => {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.OPENAI_API_KEY = 'test-key';

  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error('fetch should not be called for unsafe intent');
  }) as typeof fetch;

  try {
    const response = await buildAI2ChatResponse('احجز وادفع لي الآن');
    assert.equal(response.provider, 'local');
    assert.equal(response.retrievalMode, 'internal-rag');
    assert.equal(response.groundingStatus, 'fallback-no-source');
    assert.equal(called, false);
    assert.equal(isOutOfScopeIntent('احجز وادفع لي الآن'), true);
  } finally {
    process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;
    process.env.OPENAI_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('missing key does not call provider and returns internal/fallback safely', async () => {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  delete process.env.OPENAI_API_KEY;

  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error('fetch should not run when key is missing');
  }) as typeof fetch;

  try {
    const response = await buildAI2ChatResponse('What is the approved fallback policy?');
    assert.equal(response.provider, 'local');
    assert.equal(response.retrievalMode, 'internal-rag');
    assert.equal(called, false);
    assert.notEqual(response.answer.length, 0);
  } finally {
    process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;
    process.env.OPENAI_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('openai web mode returns grounded-global-web with citations and safe provider label', async () => {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.DABRA_OPENAI_MODEL;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.DABRA_OPENAI_MODEL = 'gpt-5';

  let capturedBody = '';

  globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');

    return new Response(
      JSON.stringify({
        output_text: 'Global answer with citations',
        output: [
          {
            content: [
              {
                type: 'url_citation',
                url: 'https://example.com/world-news',
              },
              {
                type: 'url_citation',
                url: 'https://example.com/world-news',
              },
            ],
          },
        ],
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }) as typeof fetch;

  try {
    const response = await buildAI2ChatResponse('What happened in travel news today?');
    assert.equal(response.provider, 'openai');
    assert.equal(response.retrievalMode, 'openai-web-search');
    assert.equal(response.groundingStatus, 'grounded-global-web');
    assert.equal(response.sources.length, 1);
    assert.equal(response.sources[0]?.url, 'https://example.com/world-news');
    assert.match(capturedBody, /"web_search"/);
    assert.match(capturedBody, /"tool_choice":"required"/);
    assert.match(capturedBody, /"include":\["web_search_call.action.sources"\]/);
    assert.match(capturedBody, /"model":"gpt-5"/);
  } finally {
    process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;
    process.env.OPENAI_API_KEY = originalKey;
    process.env.DABRA_OPENAI_MODEL = originalModel;
    globalThis.fetch = originalFetch;
  }
});

test('provider failure returns safe fallback without leaking secret markers', async () => {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.OPENAI_API_KEY = 'sk-test-123456';

  globalThis.fetch = (async () => {
    throw new Error('upstream unavailable');
  }) as typeof fetch;

  try {
    const response = await buildAI2ChatResponse('qzvxx blorf nyrt ulm qxw 98431');
    assert.equal(response.provider, 'local');
    assert.equal(response.groundingStatus, 'fallback-provider-unavailable');
    assert.equal(response.retrievalMode, 'internal-rag');
    assert.equal(response.answer.includes('sk-test-123456'), false);
  } finally {
    process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;
    process.env.OPENAI_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});
