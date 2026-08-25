import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI2_DABRA_CHARACTER_BIBLE,
  AI2_DABRA_GLOBAL_WEB_PROMPT,
  AI2_DABRA_INTERNAL_SYSTEM_PROMPT,
  AI2_DABRA_PROMPT_VERSION,
} from '@/lib/ai2/prompt/contract';
import { buildAI2ChatResponse, isOutOfScopeIntent } from '@/lib/ai2/runtime/chat';

type RemoteProvider = 'openai' | 'gemini' | 'anthropic' | 'xai' | 'deepseek' | 'qwen' | 'mistral';

const originalFetch = globalThis.fetch;
const providerKeys = [
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'ANTHROPIC_API_KEY',
  'XAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'QWEN_API_KEY',
  'MISTRAL_API_KEY',
  'DASHSCOPE_API_KEY',
] as const;

function resetEnv(): void {
  delete process.env.DABRA_GLOBAL_WEB_ENABLED;
  delete process.env.DABRA_AI_PROVIDER;
  delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
  delete process.env.DABRA_AI_GLOBAL_DEADLINE_MS;
  delete process.env.DABRA_AI_MAX_FALLBACK_HOPS;
  for (const key of providerKeys) {
    delete process.env[key];
  }
}

function promptFromRequest(host: string, body: unknown): string | null {
  const payload = body as Record<string, unknown>;
  if (host === 'api.openai.com') {
    return typeof payload.instructions === 'string' ? payload.instructions : null;
  }

  if (host === 'generativelanguage.googleapis.com') {
    const systemInstruction = payload.systemInstruction as Record<string, unknown> | undefined;
    const parts = Array.isArray(systemInstruction?.parts) ? systemInstruction.parts : [];
    const first = (parts[0] ?? null) as Record<string, unknown> | null;
    return first && typeof first.text === 'string' ? first.text : null;
  }

  if (host === 'api.anthropic.com') {
    return typeof payload.system === 'string' ? payload.system : null;
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const system = (messages[0] ?? null) as Record<string, unknown> | null;
  return system && typeof system.content === 'string' ? system.content : null;
}

function successResponseForProvider(provider: RemoteProvider): Response {
  if (provider === 'openai') {
    return new Response(
      JSON.stringify({
        output_text: 'OpenAI answer',
        output: [{ content: [{ type: 'url_citation', url: 'https://example.com/openai' }] }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  if (provider === 'gemini') {
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: 'Gemini answer' }] },
            groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/gemini' } }] },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  if (provider === 'anthropic') {
    return new Response(
      JSON.stringify({
        content: [{ text: 'Anthropic answer with source https://example.com/anthropic' }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({
      choices: [{ message: { content: `${provider} answer with source https://example.com/${provider}` } }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function enableGlobal(provider: RemoteProvider): void {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  process.env.DABRA_AI_PROVIDER = provider;
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-gemini-key';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.XAI_API_KEY = 'test-xai-key';
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
  process.env.QWEN_API_KEY = 'test-qwen-key';
  process.env.MISTRAL_API_KEY = 'test-mistral-key';
  process.env.DASHSCOPE_API_KEY = 'test-dashscope-key';
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  resetEnv();
});

test('central character contract contains required identity, voice, truthfulness, and prompts', () => {
  assert.equal(AI2_DABRA_PROMPT_VERSION, 'dabra-character-conversation-v1');

  assert.equal(AI2_DABRA_CHARACTER_BIBLE.identity.name, 'الدَّبْرَة');
  assert.equal(AI2_DABRA_CHARACTER_BIBLE.identity.brandName, 'dir3com');
  assert.equal(AI2_DABRA_CHARACTER_BIBLE.identity.brandNameArabic, 'درعكم');

  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /Arabic Voice:/);
  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /English Voice:/);
  assert.match(AI2_DABRA_GLOBAL_WEB_PROMPT, /Global Web Mission:/);
  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /Internal Knowledge Mission:/);

  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /do not guess/i);
  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /Never invent prices/i);
  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /booking status/i);
  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /payment status/i);
  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /permissions/i);

  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /dir3com/);
  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /درعكم/);
  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /الدَّبْرَة/);
});

test('runtime returns Character & Conversation V1 promptVersion', async () => {
  const response = await buildAI2ChatResponse('ما هي سياسة dir3com الداخلية الخاصة بالدبرة؟');
  assert.equal(response.promptVersion, 'dabra-character-conversation-v1');
});

test('all seven providers use the same central global prompt with zero persona drift', async () => {
  const providers: RemoteProvider[] = ['openai', 'gemini', 'anthropic', 'xai', 'deepseek', 'qwen', 'mistral'];

  for (const provider of providers) {
    enableGlobal(provider);

    const prompts: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const host = new URL(String(input)).host;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const prompt = promptFromRequest(host, body);
      if (prompt) {
        prompts.push(prompt);
      }
      return successResponseForProvider(provider);
    }) as typeof fetch;

    const response = await buildAI2ChatResponse(`qzvxx external topic for ${provider} 91837`);
    assert.equal(response.provider, provider);
    assert.equal(response.promptVersion, 'dabra-character-conversation-v1');
    assert.equal(prompts.some((entry) => entry === AI2_DABRA_GLOBAL_WEB_PROMPT), true);
  }
});

test('execution-intent refusals remain enforced for booking, payment, database, and account mutations', async () => {
  enableGlobal('openai');

  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    throw new Error('provider must not be called for execution intents');
  }) as typeof fetch;

  const blockedMessages = [
    'book this trip for me now',
    'pay this invoice now',
    'write to database now',
    'delete my account now',
  ];

  for (const message of blockedMessages) {
    const response = await buildAI2ChatResponse(message);
    assert.equal(isOutOfScopeIntent(message), true);
    assert.equal(response.provider, 'local');
    assert.equal(response.groundingStatus, 'fallback-no-source');
  }

  assert.equal(providerCalls, 0);
});

test('transient fallback and deadline protections remain unchanged', async () => {
  enableGlobal('xai');
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  process.env.DABRA_AI_MAX_FALLBACK_HOPS = '2';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('api.x.ai')) {
      return new Response(JSON.stringify({ error: { message: 'temporary outage' } }), { status: 503 });
    }

    return new Response(
      JSON.stringify({
        output_text: 'OpenAI fallback answer',
        output: [{ content: [{ type: 'url_citation', url: 'https://example.com/openai' }] }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const fallbackResponse = await buildAI2ChatResponse('qzvxx transient fallback scenario');
  assert.equal(fallbackResponse.provider, 'openai');
  assert.equal(fallbackResponse.primaryProvider, 'xai');
  assert.equal(fallbackResponse.primaryProviderErrorCategory, 'upstream_error');

  const realNow = Date.now;
  let reads = 0;
  Date.now = () => {
    reads += 1;
    return reads === 1 ? 1_000 : 5_900;
  };

  let deadlineProviderCalls = 0;
  globalThis.fetch = (async () => {
    deadlineProviderCalls += 1;
    return new Response('{}', { status: 503 });
  }) as typeof fetch;

  process.env.DABRA_AI_GLOBAL_DEADLINE_MS = '5000';

  try {
    const deadlineResponse = await buildAI2ChatResponse('qzvxx deadline scenario');
    assert.equal(deadlineResponse.provider, 'local');
    assert.equal(deadlineResponse.finalProviderErrorCategory, 'deadline_exceeded');
    assert.equal(deadlineProviderCalls, 0);
  } finally {
    Date.now = realNow;
  }
});

test('provider errors are sanitized and do not leak raw upstream markers', async () => {
  enableGlobal('openai');

  globalThis.fetch = (async () => {
    throw new Error('upstream unavailable secret-marker-123456');
  }) as typeof fetch;

  const response = await buildAI2ChatResponse('qzvxx sanitization scenario');
  assert.equal(response.provider, 'local');
  assert.equal(response.groundingStatus, 'fallback-provider-unavailable');
  assert.equal(response.providerErrorCategory, 'upstream_error');
  assert.equal(response.answer.includes('secret-marker-123456'), false);
});
