import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';

const originalFetch = globalThis.fetch;

function resetEnv(): void {
  delete process.env.DABRA_GLOBAL_WEB_ENABLED;
  delete process.env.DABRA_AI_PROVIDER;
  delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
  delete process.env.OPENAI_API_KEY;
}

function enableOpenAiOnly(): void {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  process.env.DABRA_AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-openai-key';
}

function mockOpenAiAndCaptureInput(answerText: string, capture: { input?: string }): void {
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.body) {
      const body = JSON.parse(String(init.body)) as { input?: string };
      capture.input = body.input;
    }
    return new Response(
      JSON.stringify({
        output_text: answerText,
        output: [{ content: [{ type: 'url_citation', url: 'https://example.com/openai' }] }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  resetEnv();
});

test('V3: session-only conversation context carries prior turns into the outgoing message', async () => {
  enableOpenAiOnly();
  const capture: { input?: string } = {};
  mockOpenAiAndCaptureInput('حسنًا، سأعدلها إلى ثلاثة أيام في القاهرة.', capture);

  const history = [
    { role: 'user' as const, content: 'أبغى القاهرة يومين' },
    { role: 'assistant' as const, content: 'تمام، رحلة يومين إلى القاهرة.' },
  ];
  const response = await buildAI2ChatResponse('خليها 3 أيام', history);
  assert.equal(response.provider, 'openai');
  assert.ok(capture.input?.includes('القاهرة'), 'prior turn destination must be present in the outgoing context');
  assert.ok(capture.input?.includes('خليها 3 أيام'));
});

test('V4: canonical service note is present and mentions the matching service family', async () => {
  enableOpenAiOnly();
  const capture: { input?: string } = {};
  mockOpenAiAndCaptureInput('يمكنك حجز سيارة عبر خدمة Drive.', capture);

  await buildAI2ChatResponse('أحتاج سيارة في المطار');
  assert.ok(capture.input?.includes('Drive'));
  assert.ok(capture.input?.includes('Stay'));
  assert.ok(capture.input?.includes('VIP'));
});

test('V5: marketplace grounding note appears for service-related questions and reflects no verified inventory in test env', async () => {
  enableOpenAiOnly();
  const capture: { input?: string } = {};
  mockOpenAiAndCaptureInput('لا تتوفر بيانات فندق مؤكدة حاليًا.', capture);

  await buildAI2ChatResponse('أريد فندق في جدة');
  assert.ok(capture.input?.toLowerCase().includes('verified') || capture.input?.includes('موثقة'));
});

test('V6: trip-planner structuring note appears for trip-planning requests', async () => {
  enableOpenAiOnly();
  const capture: { input?: string } = {};
  mockOpenAiAndCaptureInput('اليوم الأول: زيارة الأهرامات.', capture);

  await buildAI2ChatResponse('اقترح لي رحلة إلى القاهرة');
  assert.ok(capture.input?.includes('برنامج') || capture.input?.toLowerCase().includes('itinerary'));
});

test('V7: authenticated display name is passed as safe context, never claiming account data access', async () => {
  enableOpenAiOnly();
  const capture: { input?: string } = {};
  mockOpenAiAndCaptureInput('أهلاً بك مجددًا!', capture);

  await buildAI2ChatResponse('مرحبا', [], { displayName: 'سارة' });
  assert.ok(capture.input?.includes('سارة'));
  assert.ok(capture.input?.includes('لا تدّعِ الوصول') || capture.input?.toLowerCase().includes('do not claim access'));
});

test('V7: logged-out (no account context) adds no account note', async () => {
  enableOpenAiOnly();
  const capture: { input?: string } = {};
  mockOpenAiAndCaptureInput('أهلاً بك!', capture);

  await buildAI2ChatResponse('مرحبا');
  assert.ok(!capture.input?.includes('مسجّل الدخول'));
});

test('V8: travel wallet is presented as not-yet-integrated (contract only), never fabricated document state', async () => {
  enableOpenAiOnly();
  const capture: { input?: string } = {};
  mockOpenAiAndCaptureInput('لا تتوفر هذه الميزة بعد.', capture);

  await buildAI2ChatResponse('متى تنتهي صلاحية جواز سفري في محفظة السفر؟');
  assert.ok(capture.input?.includes('محفظة السفر') || capture.input?.toLowerCase().includes('travel wallet'));
  assert.ok(capture.input?.includes('غير متصلة') || capture.input?.toLowerCase().includes('not yet integrated'));
});
