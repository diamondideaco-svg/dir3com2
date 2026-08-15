import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAI2ChatResponse,
  isOutOfScopeIntent,
} from '@/lib/ai2/runtime/chat';
import { callOpenAIResponsesWebSearch, extractValidWebCitations } from '@/lib/ai2/runtime/openai-web';
import { AI2_DABRA_GLOBAL_WEB_PROMPT } from '@/lib/ai2/prompt/contract';

const refusalScenarios = [
  {
    category: 'booking',
    language: 'en',
    messages: ['book a service for me now', 'reserve a room now', 'cancel my booking now'],
  },
  {
    category: 'booking',
    language: 'ar',
    messages: ['احجز لي خدمة الآن', 'ألغِ الحجز الآن', 'عدّل الحجز الآن'],
  },
  {
    category: 'payment',
    language: 'en',
    messages: ['pay this invoice now', 'charge my card now', 'refund this payment now'],
  },
  {
    category: 'payment',
    language: 'ar',
    messages: ['ادفع الفاتورة الآن', 'سدّد الفاتورة الآن', 'استرد المبلغ الآن'],
  },
  {
    category: 'purchase',
    language: 'en',
    messages: ['purchase this item now', 'buy that product for me', 'checkout this order now'],
  },
  {
    category: 'purchase',
    language: 'ar',
    messages: ['اشتري هذا الآن', 'اشتر المنتج الآن', 'قم بشراء الخدمة الآن'],
  },
  {
    category: 'database mutation',
    language: 'en',
    messages: [
      'write to database now',
      'insert into database now',
      'update database records now',
      'delete from database now',
      'modify database now',
      'save these records now',
      'change the records now',
    ],
  },
  {
    category: 'database mutation',
    language: 'ar',
    messages: [
      'اكتب في قاعدة البيانات الآن',
      'أضف إلى قاعدة البيانات الآن',
      'حدّث قاعدة البيانات الآن',
      'عدّل قاعدة البيانات الآن',
      'احذف من قاعدة البيانات الآن',
      'غيّر البيانات الآن',
      'احفظ في قاعدة البيانات الآن',
    ],
  },
  {
    category: 'account mutation',
    language: 'en',
    messages: [
      'delete my account now',
      'remove my account now',
      'close my account now',
      'deactivate my account now',
      'update my account now',
      'modify my account now',
    ],
  },
  {
    category: 'account mutation',
    language: 'ar',
    messages: [
      'احذف الحساب الآن',
      'ألغِ الحساب الآن',
      'أغلق الحساب الآن',
      'عطّل الحساب الآن',
      'عدّل الحساب الآن',
      'حدّث الحساب الآن',
    ],
  },
  {
    category: 'profile mutation',
    language: 'en',
    messages: [
      'update my profile now',
      'modify my profile now',
      'change my profile now',
      'edit my profile now',
    ],
  },
  {
    category: 'profile mutation',
    language: 'ar',
    messages: [
      'عدل ملفي الشخصي الآن',
      'عدّل ملفي الشخصي الآن',
      'حدّث ملفي الشخصي الآن',
      'غيّر ملفي الشخصي الآن',
      'حرر ملفي الشخصي الآن',
    ],
  },
] as const;

async function assertRefusedBeforeProvider(messages: readonly string[]) {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'openai';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  process.env.OPENAI_API_KEY = 'test-key';

  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    throw new Error('provider must not be called for execution intent');
  }) as typeof fetch;

  try {
    for (const message of messages) {
      const response = await buildAI2ChatResponse(message);
      assert.equal(isOutOfScopeIntent(message), true, message);
      assert.equal(response.provider, 'local', message);
      assert.equal(response.retrievalMode, 'internal-rag', message);
      assert.equal(response.groundingStatus, 'fallback-no-source', message);
      assert.equal(providerCalls, 0, message);
    }
  } finally {
    if (originalEnabled === undefined) delete process.env.DABRA_GLOBAL_WEB_ENABLED;
    else process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;

    delete process.env.DABRA_AI_PROVIDER;
    delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;

    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;

    globalThis.fetch = originalFetch;
  }
}

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
  process.env.DABRA_AI_PROVIDER = 'openai';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
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
    delete process.env.DABRA_AI_PROVIDER;
    delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
    process.env.OPENAI_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

for (const scenario of refusalScenarios) {
  test(`${scenario.category} execution intent is refused before provider (${scenario.language})`, async () => {
    await assertRefusedBeforeProvider(scenario.messages);
  });
}

test('informational mutation questions remain answerable', async () => {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'openai';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  process.env.OPENAI_API_KEY = 'test-key';

  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    return new Response(
      JSON.stringify({
        output_text: 'Informational guidance only.',
        output: [{ content: [{ type: 'url_citation', url: 'https://example.com/guidance' }] }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const messages = [
    'How do I update my profile?',
    'What happens if I delete my account?',
    'كيف أعدل ملفي الشخصي؟',
    'ماذا يحدث إذا حذفت الحساب؟',
  ];

  try {
    for (const message of messages) {
      const response = await buildAI2ChatResponse(message);
      assert.equal(isOutOfScopeIntent(message), false, message);
      assert.equal(response.provider, 'openai', message);
      assert.equal(response.groundingStatus, 'grounded-global-web', message);
      assert.equal(response.retrievalMode, 'openai-web-search', message);
    }
    assert.equal(providerCalls, messages.length);
  } finally {
    if (originalEnabled === undefined) delete process.env.DABRA_GLOBAL_WEB_ENABLED;
    else process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;

    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;

    globalThis.fetch = originalFetch;
  }
});

test('global AR and EN route to openai web search when live provider returns citations', async () => {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.DABRA_OPENAI_MODEL;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.DABRA_OPENAI_MODEL = 'gpt-5';

  let providerCalls = 0;
  const requestBodies: unknown[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    providerCalls += 1;
    if (init?.body) {
      requestBodies.push(JSON.parse(String(init.body)));
    }
    return new Response(
      JSON.stringify({
        output_text: 'Global answer with citations',
        output: [
          {
            content: [
              { type: 'url_citation', url: 'https://example.com/global-1' },
              { type: 'url_citation', url: 'https://example.com/global-2' },
            ],
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const ar = await buildAI2ChatResponse('ما أحدث خبر عالمي موثوق هذا الأسبوع؟');
    const en = await buildAI2ChatResponse('What is a recent trustworthy global travel update this week?');

    assert.equal(ar.provider, 'openai');
    assert.equal(ar.retrievalMode, 'openai-web-search');
    assert.equal(ar.groundingStatus, 'grounded-global-web');
    assert.ok(ar.sources.length > 0);

    assert.equal(en.provider, 'openai');
    assert.equal(en.retrievalMode, 'openai-web-search');
    assert.equal(en.groundingStatus, 'grounded-global-web');
    assert.ok(en.sources.length > 0);

    assert.equal(providerCalls, 2);
    assert.equal((requestBodies[0] as { instructions?: string }).instructions, AI2_DABRA_GLOBAL_WEB_PROMPT);
    assert.equal((requestBodies[1] as { instructions?: string }).instructions, AI2_DABRA_GLOBAL_WEB_PROMPT);
  } finally {
    process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;
    delete process.env.DABRA_AI_PROVIDER;
    delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
    process.env.OPENAI_API_KEY = originalKey;
    process.env.DABRA_OPENAI_MODEL = originalModel;
    globalThis.fetch = originalFetch;
  }
});

test('openai web search defaults to gpt-4.1-mini when no override is set', async () => {
  const originalModel = process.env.DABRA_OPENAI_MODEL;
  const originalFetch = globalThis.fetch;

  delete process.env.DABRA_OPENAI_MODEL;

  const requestBodies: unknown[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.body) {
      requestBodies.push(JSON.parse(String(init.body)));
    }

    return new Response(
      JSON.stringify({
        output_text: 'Global answer with citations',
        output: [
          {
            content: [{ type: 'url_citation', url: 'https://example.com/global' }],
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    await callOpenAIResponsesWebSearch({
      message: 'Global travel news?',
      language: 'en',
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      apiKey: 'test-key',
    });

    assert.equal((requestBodies[0] as { model?: string }).model, 'gpt-4.1-mini');
  } finally {
    if (originalModel === undefined) delete process.env.DABRA_OPENAI_MODEL;
    else process.env.DABRA_OPENAI_MODEL = originalModel;

    globalThis.fetch = originalFetch;
  }
});

test('generic global questions stay on the web route and do not ground locally', async () => {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'openai';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  process.env.OPENAI_API_KEY = 'test-key';

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        output_text: 'Global answer with citations',
        output: [{ content: [{ type: 'url_citation', url: 'https://example.com/global' }] }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;

  const messages = [
    'What is OpenAI authentication policy?',
    'What is the latest sandbox technology news?',
    'Global customer support trends today',
    'ما أحدث سياسات السفر العالمية؟',
    'ما أخبار المصادقة الإلكترونية عالميًا؟',
  ];

  try {
    for (const message of messages) {
      const response = await buildAI2ChatResponse(message);
      assert.equal(response.provider, 'openai', message);
      assert.equal(response.retrievalMode, 'openai-web-search', message);
      assert.equal(response.groundingStatus, 'grounded-global-web', message);
    }
  } finally {
    process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;
    delete process.env.DABRA_AI_PROVIDER;
    delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
    process.env.OPENAI_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('internal AR and EN stay grounded locally without provider calls', async () => {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'openai';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  process.env.OPENAI_API_KEY = 'test-key';

  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    throw new Error('provider should not be called for strong internal matches');
  }) as typeof fetch;

  try {
    const ar = await buildAI2ChatResponse('ما هي سياسة dir3com الداخلية الخاصة بالدبرة؟');
    const en = await buildAI2ChatResponse('What is the dir3com internal DABRA policy?');

    assert.equal(ar.provider, 'local');
    assert.equal(ar.retrievalMode, 'internal-rag');
    assert.equal(ar.groundingStatus, 'grounded');
    assert.ok(ar.sources.length > 0);

    assert.equal(en.provider, 'local');
    assert.equal(en.retrievalMode, 'internal-rag');
    assert.equal(en.groundingStatus, 'grounded');
    assert.ok(en.sources.length > 0);

    assert.equal(providerCalls, 0);
  } finally {
    process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;
    process.env.OPENAI_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('internal anchor queries stay grounded locally while generic policy queries do not', async () => {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.OPENAI_API_KEY = 'test-key';

  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    return new Response(
      JSON.stringify({
        output_text: 'Global answer with citations',
        output: [{ content: [{ type: 'url_citation', url: 'https://example.com/global' }] }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  try {
    const positive = await buildAI2ChatResponse('What is the dir3com authentication policy?');
    assert.equal(positive.provider, 'local');
    assert.equal(positive.retrievalMode, 'internal-rag');
    assert.equal(positive.groundingStatus, 'grounded');

    const negative = await buildAI2ChatResponse('What is OpenAI authentication policy?');
    assert.equal(negative.provider, 'openai');
    assert.equal(negative.retrievalMode, 'openai-web-search');
    assert.equal(negative.groundingStatus, 'grounded-global-web');

    assert.equal(providerCalls, 1);
  } finally {
    process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;
    process.env.OPENAI_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('provider failure with no strong internal match returns provider unavailable fallback', async () => {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.OPENAI_API_KEY = 'test-key';

  globalThis.fetch = (async () => {
    throw new Error('upstream unavailable');
  }) as typeof fetch;

  try {
    const response = await buildAI2ChatResponse('qzvxx blorf nyrt ulm qxw 98431');
    assert.equal(response.provider, 'local');
    assert.equal(response.groundingStatus, 'fallback-provider-unavailable');
    assert.equal(response.retrievalMode, 'internal-rag');
    assert.equal(response.providerErrorCategory, 'upstream_error');
    assert.equal(response.answer.includes('secret-marker-123456'), false);
  } finally {
    process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;
    delete process.env.DABRA_AI_PROVIDER;
    delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
    process.env.OPENAI_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test('missing key does not call provider and returns internal/fallback safely', async () => {
  const originalEnabled = process.env.DABRA_GLOBAL_WEB_ENABLED;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalGeminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalXaiKey = process.env.XAI_API_KEY;
  const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  const originalQwenKey = process.env.QWEN_API_KEY;
  const originalDashScopeKey = process.env.DASHSCOPE_API_KEY;
  const originalMistralKey = process.env.MISTRAL_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'openai';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.QWEN_API_KEY;
  delete process.env.DASHSCOPE_API_KEY;
  delete process.env.MISTRAL_API_KEY;

  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error('fetch should not run when key is missing');
  }) as typeof fetch;

  try {
    const response = await buildAI2ChatResponse('What is the approved fallback policy?');
    assert.equal(response.provider, 'local');
    assert.equal(response.retrievalMode, 'internal-rag');
    assert.equal(response.providerErrorCategory, undefined);
    assert.equal(called, false);
    assert.notEqual(response.answer.length, 0);
  } finally {
    process.env.DABRA_GLOBAL_WEB_ENABLED = originalEnabled;
    delete process.env.DABRA_AI_PROVIDER;
    delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
    process.env.OPENAI_API_KEY = originalKey;
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGeminiKey;
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    process.env.XAI_API_KEY = originalXaiKey;
    process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
    process.env.QWEN_API_KEY = originalQwenKey;
    process.env.DASHSCOPE_API_KEY = originalDashScopeKey;
    process.env.MISTRAL_API_KEY = originalMistralKey;
    globalThis.fetch = originalFetch;
  }
});

test('model_not_found retries using available models list and succeeds', async () => {
  const originalFetch = globalThis.fetch;

  let call = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    call += 1;

    if (url.endsWith('/v1/responses') && call === 1) {
      return new Response(
        JSON.stringify({
          error: {
            type: 'invalid_request_error',
            code: 'model_not_found',
            message: 'model not found',
          },
        }),
        { status: 404, headers: { 'content-type': 'application/json', 'x-request-id': 'req-first' } },
      );
    }

    if (url.endsWith('/v1/models')) {
      return new Response(
        JSON.stringify({
          data: [{ id: 'gpt-4.1-mini' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'req-models' } },
      );
    }

    return new Response(
      JSON.stringify({
        output_text: 'Recovered answer',
        output: [{ content: [{ type: 'url_citation', url: 'https://example.com/recovered' }] }],
      }),
      { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'req-retry' } },
    );
  }) as typeof fetch;

  try {
    const result = await callOpenAIResponsesWebSearch({
      message: 'latest news',
      language: 'en',
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      apiKey: 'test-key',
      model: 'bad-model-name',
    });

    assert.equal(result.ok, true);
    assert.equal(result.citations.length > 0, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('web_search unavailable is classified and sanitized', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: {
          type: 'invalid_request_error',
          code: 'unsupported_tool',
          message: 'web_search is not available for this project',
        },
      }),
      { status: 400, headers: { 'content-type': 'application/json', 'x-request-id': 'req-web-tool' } },
    )) as typeof fetch;

  try {
    const result = await callOpenAIResponsesWebSearch({
      message: 'latest news',
      language: 'en',
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      apiKey: 'test-key',
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, 'web_search_unavailable');
    assert.equal(result.requestId, 'req-web-tool');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('timeout is classified as timeout', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new Error('The operation was aborted.');
  }) as typeof fetch;

  try {
    const result = await callOpenAIResponsesWebSearch({
      message: 'latest news',
      language: 'en',
      prompt: AI2_DABRA_GLOBAL_WEB_PROMPT,
      apiKey: 'test-key',
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCategory, 'timeout');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
