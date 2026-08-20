import assert from 'node:assert/strict';
import test from 'node:test';

import { AI2_DABRA_CHARACTER_BIBLE, AI2_DABRA_PROMPT_VERSION } from '@/lib/ai2/prompt/contract';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';

const originalFetch = globalThis.fetch;

function resetEnv(): void {
  delete process.env.DABRA_GLOBAL_WEB_ENABLED;
  delete process.env.DABRA_AI_PROVIDER;
  delete process.env.DABRA_PROVIDER_FALLBACK_ENABLED;
  delete process.env.DABRA_AI_GLOBAL_DEADLINE_MS;
  delete process.env.DABRA_AI_MAX_FALLBACK_HOPS;
  delete process.env.OPENAI_API_KEY;
}

function enableOpenAiOnly(): void {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  process.env.DABRA_AI_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-openai-key';
}

function mockOpenAiAnswer(answerText: string, promptCapture?: string[]): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (promptCapture && init?.body) {
      const body = JSON.parse(String(init.body)) as { instructions?: string };
      if (typeof body.instructions === 'string') promptCapture.push(body.instructions);
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

test('Arabic greeting: real provider path, promptVersion, no raw markdown, bounded length', async () => {
  enableOpenAiOnly();
  mockOpenAiAnswer('## أهلاً بك\n\n**أنا** هنا لمساعدتك.\n- نقطة أولى\n- نقطة ثانية\n\nسطر إضافي.\nسطر آخر.\nوسطر سابع زائد.');

  const response = await buildAI2ChatResponse('مرحبا');
  assert.equal(response.promptVersion, AI2_DABRA_PROMPT_VERSION);
  assert.equal(response.provider, 'openai');
  assert.doesNotMatch(response.answer, /\*\*/);
  assert.doesNotMatch(response.answer, /^#{1,6}\s/m);
  assert.ok(response.answer.split('\n').filter(Boolean).length <= 6, 'default answer must stay within the concise line cap');
});

test('English greeting: real provider path, promptVersion, no raw markdown', async () => {
  enableOpenAiOnly();
  mockOpenAiAnswer('### Hello!\n\n**I am** DABRA, dir3com travel guardian.\n\nHow can I help today?');

  const response = await buildAI2ChatResponse('Hello, how are you?');
  assert.equal(response.promptVersion, AI2_DABRA_PROMPT_VERSION);
  assert.equal(response.provider, 'openai');
  assert.doesNotMatch(response.answer, /\*\*/);
  assert.doesNotMatch(response.answer, /^#{1,6}\s/m);
});

test('"من أنت؟": canonical identity instruction is sent to the provider, not a generic researcher framing', async () => {
  enableOpenAiOnly();
  const prompts: string[] = [];
  mockOpenAiAnswer('أنا الدَّبْرَة، مساعد السفر الذكي والحارس السياحي في dir3com.', prompts);

  const response = await buildAI2ChatResponse('من أنت؟');
  assert.equal(response.promptVersion, AI2_DABRA_PROMPT_VERSION);
  assert.ok(prompts.some((p) => p.includes(AI2_DABRA_CHARACTER_BIBLE.identity.positioning)));
  assert.doesNotMatch(response.answer, /generic web researcher/i);
});

test('"هل تتذكر محادثاتي؟": memory question is answered, not stripped', async () => {
  enableOpenAiOnly();
  mockOpenAiAnswer('لا، لا أملك ذاكرة للمحادثات السابقة، وكل محادثة جديدة تبدأ بشكل مستقل.');

  const response = await buildAI2ChatResponse('هل تتذكر محادثاتي السابقة؟');
  assert.match(response.answer, /ذاكرة/);
});

test('unrelated question does not volunteer an unsolicited memory/account disclaimer', async () => {
  enableOpenAiOnly();
  mockOpenAiAnswer('يمكنك زيارة القاهرة لمدة يومين والاستمتاع بالأهرامات. أنا لا أملك ذاكرة للمحادثات السابقة. أتمنى لك رحلة سعيدة.');

  const response = await buildAI2ChatResponse('اقترح لي رحلة قصيرة');
  assert.doesNotMatch(response.answer, /لا أملك ذاكرة/);
});

test('"ما خدمات dir3com؟": real runtime path preserved, promptVersion correct', async () => {
  enableOpenAiOnly();
  mockOpenAiAnswer('dir3com يقدم خدمات السيارات والفنادق والكونسيرج والفعاليات ونقل المطار.');

  const response = await buildAI2ChatResponse('ما خدمات dir3com؟');
  assert.equal(response.promptVersion, AI2_DABRA_PROMPT_VERSION);
  assert.equal(response.provider, 'openai');
});

test('simple trip suggestion gets a concise, non-detailed default answer', async () => {
  enableOpenAiOnly();
  mockOpenAiAnswer('اليوم الأول: زيارة الأهرامات.\nاليوم الثاني: جولة في القاهرة القديمة.\nاليوم الثالث: نهر النيل.\nاليوم الرابع: التسوق.\nاليوم الخامس: المتحف.\nاليوم السادس: مغادرة.\nاليوم السابع: إضافي.');

  const response = await buildAI2ChatResponse('اقترح لي رحلة إلى القاهرة');
  assert.ok(response.answer.split('\n').filter(Boolean).length <= 6);
});

test('current/fresh travel question is classified as fresh-web intent and still returns a real provider answer', async () => {
  enableOpenAiOnly();
  mockOpenAiAnswer('الطقس اليوم في القاهرة معتدل نهارًا.');

  const response = await buildAI2ChatResponse('ما الطقس في القاهرة الآن؟');
  assert.equal(response.promptVersion, AI2_DABRA_PROMPT_VERSION);
  assert.equal(response.provider, 'openai');
});

test('account-access question is answered truthfully without claiming access that does not exist', async () => {
  enableOpenAiOnly();
  mockOpenAiAnswer('لا يمكنني الوصول إلى حسابك أو حجوزاتك من هنا، لكن يمكنك مراجعتها من صفحة حجوزاتي.');

  const response = await buildAI2ChatResponse('هل يمكنك الوصول إلى حجوزاتي؟');
  assert.match(response.answer, /لا يمكنني الوصول/);
});

test('deliberately detailed request bypasses the concise default cap', async () => {
  enableOpenAiOnly();
  const longAnswer = Array.from({ length: 10 }, (_, i) => `سطر تفصيلي رقم ${i + 1}.`).join('\n');
  mockOpenAiAnswer(longAnswer);

  const response = await buildAI2ChatResponse('اشرح لي بالتفصيل خطة رحلة كاملة إلى القاهرة');
  assert.ok(response.answer.split('\n').filter(Boolean).length > 6, 'explicit detail requests must not be truncated');
});
