import assert from 'node:assert/strict';
import test from 'node:test';

import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { callGeminiGoogleSearch } from '@/lib/ai2/runtime/gemini-web';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ['GOOGLE_GENERATIVE_AI_API_KEY', 'DABRA_GLOBAL_WEB_ENABLED', 'DABRA_AI_PROVIDER', 'DABRA_PROVIDER_FALLBACK_ENABLED']) {
    delete process.env[key];
  }
});

test('gemini returns missing_key safely', async () => {
  const result = await callGeminiGoogleSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: '',
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCategory, 'missing_key');
});

test('gemini parses grounded text and safe citations', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({
    candidates: [
      {
        content: { parts: [{ text: 'GEMINI_OK' }] },
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://example.com/g1' } },
            { web: { uri: 'javascript:alert(1)' } },
            { web: { uri: 'https://example.com/g1' } },
          ],
        },
      },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  const result = await callGeminiGoogleSearch({
    message: 'test',
    language: 'en',
    prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
    apiKey: 'test-key',
    model: 'gemini-3.6-flash',
  });

  assert.equal(result.ok, true);
  assert.equal(result.answer, 'GEMINI_OK');
  assert.deepEqual(result.citations, ['https://example.com/g1']);
});

test('router selects gemini when configured and fallback disabled', async () => {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'gemini';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';

  globalThis.fetch = (async () => new Response(JSON.stringify({
    candidates: [
      {
        content: { parts: [{ text: 'Gemini routed response' }] },
        groundingMetadata: {
          groundingChunks: [{ web: { uri: 'https://example.com/g2' } }],
        },
      },
    ],
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;

  const routed = await buildAI2ChatResponse('What is a recent global public headline?');
  assert.equal(routed.provider, 'gemini');
  assert.equal(routed.groundingStatus, 'grounded-global-web');
});
