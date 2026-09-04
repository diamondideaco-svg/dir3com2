import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildDabraProviderAttempt,
  createDabraProviderAttemptAfterResponseScheduler,
  mapProviderErrorCategory,
  setDabraProviderAttemptWriterForTests,
  type DabraProviderAttemptRecord,
} from '@/lib/ai2/observability/provider-attempts';
import { estimateProviderCostUsd, getOfficialProviderPricing } from '@/lib/ai2/observability/provider-pricing';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';

const originalFetch = globalThis.fetch;
const providerEnv = [
  'OPENAI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'ANTHROPIC_API_KEY',
  'XAI_API_KEY',
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'MISTRAL_API_KEY',
] as const;
const modelEnv = [
  'DABRA_OPENAI_MODEL',
  'DABRA_GEMINI_MODEL',
  'DABRA_ANTHROPIC_MODEL',
  'DABRA_XAI_MODEL',
  'DABRA_DEEPSEEK_MODEL',
  'DABRA_QWEN_MODEL',
  'DABRA_MISTRAL_MODEL',
] as const;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  setDabraProviderAttemptWriterForTests(null);
  for (const key of [...providerEnv, ...modelEnv]) delete process.env[key];
  delete process.env.DABRA_GLOBAL_WEB_ENABLED;
  delete process.env.DABRA_AI_PROVIDER;
  delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
  delete process.env.DABRA_AI_MAX_FALLBACK_HOPS;
});

function configureProvider(provider: string, key: (typeof providerEnv)[number], modelKey: (typeof modelEnv)[number]) {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  process.env.DABRA_AI_PROVIDER = provider;
  process.env[key] = 'test-key-not-a-secret';
  process.env[modelKey] = `${provider}-test-model`;
}

function createTestAfterQueue(persistenceTimeoutMs?: number) {
  const tasks: Array<() => void | Promise<void>> = [];
  return {
    pending: tasks,
    scheduler: createDabraProviderAttemptAfterResponseScheduler(
      (task) => { tasks.push(task); },
      persistenceTimeoutMs,
    ),
    async flush() {
      while (tasks.length > 0) await tasks.shift()?.();
    },
  };
}

function buildObservedResponse(message: string, scheduler: ReturnType<typeof createTestAfterQueue>['scheduler']) {
  return buildAI2ChatResponse(message, [], undefined, undefined, scheduler);
}

function providerResponse(provider: string, status = 200): Response {
  if (status !== 200) return new Response(JSON.stringify({ error: { message: 'upstream unavailable' } }), { status });
  if (provider === 'openai') {
    return new Response(JSON.stringify({ output_text: 'Observed answer', usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
  }
  if (provider === 'gemini') {
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Observed answer' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    }), { status: 200 });
  }
  if (provider === 'anthropic') {
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Observed answer' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }), { status: 200 });
  }
  return new Response(JSON.stringify({
    choices: [{ message: { content: 'Observed answer' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }), { status: 200 });
}

for (const [provider, key, modelKey] of [
  ['openai', 'OPENAI_API_KEY', 'DABRA_OPENAI_MODEL'],
  ['gemini', 'GOOGLE_GENERATIVE_AI_API_KEY', 'DABRA_GEMINI_MODEL'],
  ['anthropic', 'ANTHROPIC_API_KEY', 'DABRA_ANTHROPIC_MODEL'],
  ['xai', 'XAI_API_KEY', 'DABRA_XAI_MODEL'],
  ['deepseek', 'DEEPSEEK_API_KEY', 'DABRA_DEEPSEEK_MODEL'],
  ['qwen', 'DASHSCOPE_API_KEY', 'DABRA_QWEN_MODEL'],
  ['mistral', 'MISTRAL_API_KEY', 'DABRA_MISTRAL_MODEL'],
] as const) {
  test(`${provider} success emits one content-free attempt with token usage`, async () => {
    configureProvider(provider, key, modelKey);
    const attempts: DabraProviderAttemptRecord[] = [];
    const afterQueue = createTestAfterQueue();
    setDabraProviderAttemptWriterForTests(async (record) => { attempts.push(record); });
    globalThis.fetch = (async () => providerResponse(provider)) as typeof fetch;

    const response = await buildObservedResponse(`external observability topic ${provider}`, afterQueue.scheduler);
    await afterQueue.flush();
    assert.equal(response.provider, provider);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]?.provider, provider);
    assert.equal(attempts[0]?.success, true);
    assert.equal(attempts[0]?.input_tokens, 10);
    assert.equal(attempts[0]?.output_tokens, 5);
    assert.equal(attempts[0]?.fallback_hop, 0);
    assert.match(attempts[0]?.request_id ?? '', /^[0-9a-f-]{36}$/);
  });

  test(`${provider} authentication failure is classified without content`, async () => {
    configureProvider(provider, key, modelKey);
    const attempts: DabraProviderAttemptRecord[] = [];
    const afterQueue = createTestAfterQueue();
    setDabraProviderAttemptWriterForTests(async (record) => { attempts.push(record); });
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 })) as typeof fetch;

    await buildObservedResponse(`external observability failure ${provider}`, afterQueue.scheduler);
    await afterQueue.flush();
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]?.success, false);
    assert.equal(attempts[0]?.error_category, 'authentication');
    assert.deepEqual(attempts[0]?.input_tokens, null);
    assert.deepEqual(attempts[0]?.output_tokens, null);
  });
}

test('Gemini timeout and 503 receive distinct canonical categories', () => {
  assert.equal(mapProviderErrorCategory('timeout'), 'timeout');
  assert.equal(mapProviderErrorCategory('upstream_error', 503), 'upstream_503');
});

test('Gemini runtime timeout emits one timeout-classified logical provider attempt', async () => {
  configureProvider('gemini', 'GOOGLE_GENERATIVE_AI_API_KEY', 'DABRA_GEMINI_MODEL');
  const attempts: DabraProviderAttemptRecord[] = [];
  const afterQueue = createTestAfterQueue();
  setDabraProviderAttemptWriterForTests(async (record) => { attempts.push(record); });
  globalThis.fetch = (async () => { throw new Error('The operation was aborted.'); }) as typeof fetch;

  const response = await buildObservedResponse('external Gemini timeout observability topic', afterQueue.scheduler);
  await afterQueue.flush();
  assert.equal(response.provider, 'local');
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0]?.provider, 'gemini');
  assert.equal(attempts[0]?.success, false);
  assert.equal(attempts[0]?.error_category, 'timeout');
});

test('fallback attempts share correlation and preserve the prior failure reason', async () => {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  process.env.DABRA_AI_MAX_FALLBACK_HOPS = '1';
  process.env.DABRA_AI_PROVIDER = 'gemini';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.DABRA_GEMINI_MODEL = 'gemini-3.6-flash';
  process.env.DABRA_OPENAI_MODEL = 'gpt-4.1-mini';
  const attempts: DabraProviderAttemptRecord[] = [];
  const afterQueue = createTestAfterQueue();
  setDabraProviderAttemptWriterForTests(async (record) => { attempts.push(record); });
  globalThis.fetch = (async (input) => String(input).includes('generativelanguage')
    ? providerResponse('gemini', 503)
    : providerResponse('openai')) as typeof fetch;

  const response = await buildObservedResponse('external fallback observability topic', afterQueue.scheduler);
  await afterQueue.flush();
  assert.equal(response.provider, 'openai');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0]?.error_category, 'upstream_503');
  assert.equal(attempts[1]?.request_id, attempts[0]?.request_id);
  assert.equal(attempts[1]?.fallback_from, 'gemini');
  assert.equal(attempts[1]?.fallback_reason, 'upstream_503');
  assert.equal(attempts[1]?.fallback_hop, 1);
});

test('a slow telemetry insert within the timeout persists once without a failure event', async () => {
  configureProvider('openai', 'OPENAI_API_KEY', 'DABRA_OPENAI_MODEL');
  const attempts: DabraProviderAttemptRecord[] = [];
  const errors: string[] = [];
  const originalError = console.error;
  const afterQueue = createTestAfterQueue(100);
  setDabraProviderAttemptWriterForTests(async (record) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    attempts.push(record);
  });
  globalThis.fetch = (async () => providerResponse('openai')) as typeof fetch;
  console.error = (...values: unknown[]) => { errors.push(values.map(String).join(' ')); };
  try {
    const response = await buildObservedResponse('external answer with slow telemetry', afterQueue.scheduler);
    assert.equal(response.provider, 'openai');
    assert.equal(attempts.length, 0);
    await afterQueue.flush();
    assert.equal(attempts.length, 1);
    assert.equal(errors.some((entry) => entry.includes('telemetry_persist_failed')), false);
  } finally {
    console.error = originalError;
  }
});

test('never-settling telemetry times out once, aborts persistence and leaves routing non-blocking', async () => {
  configureProvider('openai', 'OPENAI_API_KEY', 'DABRA_OPENAI_MODEL');
  const errors: string[] = [];
  const originalError = console.error;
  const afterQueue = createTestAfterQueue(25);
  let writerCalls = 0;
  let aborts = 0;
  setDabraProviderAttemptWriterForTests((_record, signal) => {
    writerCalls += 1;
    return new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborts += 1;
        reject(new Error('aborted test telemetry insert'));
      }, { once: true });
    });
  });
  globalThis.fetch = (async () => providerResponse('openai')) as typeof fetch;
  console.error = (...values: unknown[]) => { errors.push(values.map(String).join(' ')); };
  try {
    const response = await Promise.race([
      buildObservedResponse('external answer with hung telemetry', afterQueue.scheduler),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('customer response waited for telemetry')), 250)),
    ]);
    assert.equal(response.provider, 'openai');
    assert.equal(writerCalls, 0);
    assert.equal(afterQueue.pending.length, 1);
    await afterQueue.flush();
    const persistenceFailures = errors.filter((entry) => entry.includes('DABRA_TELEMETRY_PERSIST_FAILED'));
    assert.equal(writerCalls, 1);
    assert.equal(aborts, 1);
    assert.equal(persistenceFailures.length, 1);
    assert.match(persistenceFailures[0] ?? '', /"classification":"telemetry_persist_failed"/);
    assert.match(persistenceFailures[0] ?? '', /"failureCategory":"timeout"/);
    assert.match(persistenceFailures[0] ?? '', /"error":"telemetry_persist_timeout"/);
  } finally {
    console.error = originalError;
  }
});

test('telemetry timeout cannot consume fallback or customer-response budget', async () => {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  process.env.DABRA_AI_MAX_FALLBACK_HOPS = '1';
  process.env.DABRA_AI_PROVIDER = 'gemini';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.DABRA_GEMINI_MODEL = 'gemini-3.6-flash';
  process.env.DABRA_OPENAI_MODEL = 'gpt-4.1-mini';
  let providerCalls = 0;
  const afterQueue = createTestAfterQueue(25);
  const originalError = console.error;
  let writerCalls = 0;
  setDabraProviderAttemptWriterForTests((_record, signal) => {
    writerCalls += 1;
    return new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted test telemetry insert')), { once: true });
    });
  });
  globalThis.fetch = (async (input) => {
    providerCalls += 1;
    return String(input).includes('generativelanguage')
      ? providerResponse('gemini', 503)
      : providerResponse('openai');
  }) as typeof fetch;

  console.error = () => undefined;
  try {
    const response = await Promise.race([
      buildObservedResponse('external fallback with hung telemetry', afterQueue.scheduler),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('customer response waited for telemetry')), 250)),
    ]);
    assert.equal(response.provider, 'openai');
    assert.equal(providerCalls, 3);
    assert.equal(writerCalls, 0);
    assert.equal(afterQueue.pending.length, 2);
    await afterQueue.flush();
    assert.equal(writerCalls, 2);
  } finally {
    console.error = originalError;
  }
});

test('telemetry insert failure is observable and cannot alter provider success or duplicate execution', async () => {
  configureProvider('openai', 'OPENAI_API_KEY', 'DABRA_OPENAI_MODEL');
  process.env.DABRA_OPENAI_MODEL = 'gpt-4.1-mini';
  const afterQueue = createTestAfterQueue();
  const errors: string[] = [];
  const originalError = console.error;
  let providerCalls = 0;
  setDabraProviderAttemptWriterForTests(async () => { throw new Error('simulated telemetry insert failure'); });
  globalThis.fetch = (async () => {
    providerCalls += 1;
    return providerResponse('openai');
  }) as typeof fetch;
  console.error = (...values: unknown[]) => { errors.push(values.map(String).join(' ')); };
  try {
    const response = await buildObservedResponse('external successful answer with failed telemetry', afterQueue.scheduler);
    assert.equal(response.provider, 'openai');
    assert.equal(providerCalls, 1);
    await afterQueue.flush();
    assert.equal(providerCalls, 1);
    const persistenceFailures = errors.filter((entry) => entry.includes('DABRA_TELEMETRY_PERSIST_FAILED'));
    assert.equal(persistenceFailures.length, 1);
    assert.match(persistenceFailures[0] ?? '', /"classification":"telemetry_persist_failed"/);
    assert.match(persistenceFailures[0] ?? '', /"failureCategory":"insert_failure"/);
  } finally {
    console.error = originalError;
  }
});

test('telemetry insert failure cannot suppress a provider fallback', async () => {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'true';
  process.env.DABRA_AI_MAX_FALLBACK_HOPS = '1';
  process.env.DABRA_AI_PROVIDER = 'gemini';
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.DABRA_GEMINI_MODEL = 'gemini-3.6-flash';
  process.env.DABRA_OPENAI_MODEL = 'gpt-4.1-mini';
  const afterQueue = createTestAfterQueue();
  const originalError = console.error;
  setDabraProviderAttemptWriterForTests(async () => { throw new Error('simulated telemetry insert failure'); });
  globalThis.fetch = (async (input) => String(input).includes('generativelanguage')
    ? providerResponse('gemini', 503)
    : providerResponse('openai')) as typeof fetch;
  console.error = () => undefined;
  try {
    const response = await buildObservedResponse('external fallback despite telemetry failure', afterQueue.scheduler);
    assert.equal(response.provider, 'openai');
    assert.equal(afterQueue.pending.length, 2);
    await afterQueue.flush();
  } finally {
    console.error = originalError;
  }
});

test('production route registers telemetry through the supported Next after-response primitive', () => {
  const route = readFileSync(new URL('../app/api/ai2/chat/route.ts', import.meta.url), 'utf8');
  assert.match(route, /import \{ after, NextRequest, NextResponse \} from 'next\/server'/);
  assert.match(route, /createDabraProviderAttemptAfterResponseScheduler\(after\)/);
  assert.doesNotMatch(route, /void\s+recordDabraProviderAttempt|\.then\([\s\S]*recordDabraProviderAttempt/);
});

test('attempt allow-list rejects prompt, answer, PII, secret and provider body fields', () => {
  const record = buildDabraProviderAttempt({
    requestId: '11111111-1111-4111-8111-111111111111',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    intentClass: 'general',
    language: 'en',
    route: 'fast-chat',
    startedAtMs: 1_000,
    completedAtMs: 1_125,
    success: true,
    fallbackHop: 0,
    inputTokens: 100,
    outputTokens: 50,
    groundingStatus: 'answered-general',
    prompt: 'PRIVATE PROMPT',
    answer: 'PRIVATE ANSWER',
    email: 'person@example.invalid',
    authorization: 'Bearer secret',
    providerBody: { secret: true },
  } as never);
  const serialized = JSON.stringify(record);
  for (const forbidden of ['PRIVATE PROMPT', 'PRIVATE ANSWER', 'person@example.invalid', 'Bearer secret', 'providerBody']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('cost is estimated only for an exact model and a current pricing snapshot', () => {
  const current = Date.parse('2026-09-04T12:00:00.000Z');
  const price = (overrides: Partial<Parameters<typeof estimateProviderCostUsd>[0]> = {}) => estimateProviderCostUsd({
    provider: 'openai',
    model: 'gpt-4.1-mini',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    attemptedAtMs: current,
    pricingCheckedAtMs: current,
    ...overrides,
  });
  const priced = price();
  assert.equal(priced.estimatedCostUsd, 2);
  assert.match(priced.pricingVersion ?? '', /^2026-09-04:/);
  const unknown = { estimatedCostUsd: null, pricingVersion: null };
  assert.deepEqual(price({ provider: 'mistral', model: 'mistral-small-latest' }), unknown);
  assert.deepEqual(price({ inputTokens: null }), unknown);
  assert.deepEqual(price({ outputTokens: null }), unknown);
  assert.deepEqual(price({ attemptedAtMs: Date.parse('2025-04-13T23:59:59.999Z') }), unknown);
  assert.deepEqual(price({ attemptedAtMs: Date.parse('2026-10-04T00:00:00.000Z') }), unknown);
  assert.deepEqual(price({ pricingCheckedAtMs: Date.parse('2026-10-04T00:00:00.000Z') }), unknown);
  assert.equal(price({ attemptedAtMs: Date.parse('2025-04-14T00:00:00.000Z') }).estimatedCostUsd, 2);
  assert.ok(getOfficialProviderPricing().every((entry) =>
    entry.source.startsWith('https://')
    && Date.parse(entry.effectiveFrom) < Date.parse(entry.effectiveTo)
    && Date.parse(entry.verifiedAt) < Date.parse(entry.expiresAt),
  ));
});

test('migration is append-only, least privilege and exposes only aggregate service-role metrics', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260904130954_dabra_provider_observability.sql', import.meta.url),
    'utf8',
  );
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.dabra_provider_attempts FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.dabra_provider_attempts TO service_role/i);
  assert.doesNotMatch(migration, /GRANT (?:UPDATE|DELETE)/i);
  assert.match(migration, /SECURITY INVOKER/i);
  assert.match(migration, /p50_latency_ms/i);
  assert.match(migration, /p95_latency_ms/i);
  assert.match(migration, /p99_latency_ms/i);
  assert.match(migration, /failure_count bigint/i);
  assert.match(migration, /timeout_count bigint/i);
  assert.match(migration, /last_used timestamptz/i);
  assert.match(migration, /last_success timestamptz/i);
  assert.match(migration, /input_tokens_known_sum bigint/i);
  assert.match(migration, /input_tokens_unknown_count bigint/i);
  assert.match(migration, /token_coverage_complete boolean/i);
  assert.match(migration, /estimated_cost_known_sum numeric/i);
  assert.match(migration, /estimated_cost_unknown_count bigint/i);
  assert.match(migration, /cost_coverage_complete boolean/i);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS dabra_provider_attempts_request_hop_unique_idx/i);
  assert.match(migration, /error_categories jsonb/i);
  assert.doesNotMatch(migration, /\b(?:prompt|answer|email|phone|authorization|headers?|response_body)\b\s+(?:text|jsonb)/i);
});
