import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI2_DABRA_ARABIC_BEHAVIOR_ACCEPTANCE,
  AI2_DABRA_CHARACTER_BIBLE,
  AI2_DABRA_GLOBAL_WEB_PROMPT,
  AI2_DABRA_INTERNAL_SYSTEM_PROMPT,
  AI2_DABRA_LOCAL_RESPONSES,
  AI2_DABRA_PROMPT_VERSION,
} from '@/lib/ai2/prompt/contract';
import { buildAI2ChatResponse } from '@/lib/ai2/runtime/chat';

const originalFetch = globalThis.fetch;
const envKeys = [
  'DABRA_GLOBAL_WEB_ENABLED',
  'DABRA_AI_PROVIDER',
  'DABRA_PROVIDER_FALLBACK_ENABLED',
  'OPENAI_API_KEY',
] as const;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) delete process.env[key];
});

test('Character & Conversation V1 has one explicit prompt version', () => {
  assert.equal(AI2_DABRA_PROMPT_VERSION, 'dabra-character-conversation-v1');
});

test('central contract defines Saudi-light voice and approved phrase family', () => {
  const voice = AI2_DABRA_CHARACTER_BIBLE.arabicVoice.join(' ');
  assert.match(voice, /natural Saudi Arabic with a light dialect only/i);
  assert.match(voice, /not in every sentence/i);

  for (const phrase of ['سم', 'آمر طال عمرك', 'تدلّل', 'ما طلبت شيء', 'ثواني أدور لك', 'الأمور سهالات', 'حنا معك طال عمرك', 'إذا ودّك', 'أبشر']) {
    assert.ok(AI2_DABRA_CHARACTER_BIBLE.preferredPhraseFamily.includes(phrase));
    assert.ok(AI2_DABRA_INTERNAL_SYSTEM_PROMPT.includes(phrase));
    assert.ok(AI2_DABRA_GLOBAL_WEB_PROMPT.includes(phrase));
  }
});

test('central contract prevents phrase overuse, caricature, and persona-based safety drift', () => {
  const guardrails = AI2_DABRA_CHARACTER_BIBLE.dialectGuardrails.join(' ');
  assert.match(guardrails, /at most one light Saudi phrase/i);
  assert.match(guardrails, /Do not repeat "طال عمرك" constantly/i);
  assert.match(guardrails, /parody, caricature/i);
  assert.match(guardrails, /never change factual, safety, authorization, provider, or execution behavior/i);
});

test('internal and global missions share the exact same central persona rules', () => {
  for (const requiredSection of ['Identity:', 'Arabic Voice:', 'Preferred Saudi Phrase Family:', 'Saudi Dialect Guardrails:', 'Truthfulness:', 'Safety Boundaries:']) {
    assert.ok(AI2_DABRA_INTERNAL_SYSTEM_PROMPT.includes(requiredSection));
    assert.ok(AI2_DABRA_GLOBAL_WEB_PROMPT.includes(requiredSection));
  }
  assert.match(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /Internal Knowledge Mission:/);
  assert.doesNotMatch(AI2_DABRA_INTERNAL_SYSTEM_PROMPT, /Global Web Mission:/);
  assert.match(AI2_DABRA_GLOBAL_WEB_PROMPT, /Global Web Mission:/);
  assert.doesNotMatch(AI2_DABRA_GLOBAL_WEB_PROMPT, /Internal Knowledge Mission:/);
});

test('truthfulness, account wording, and execution safety remain intact', () => {
  const truthfulness = AI2_DABRA_CHARACTER_BIBLE.truthfulness.join(' ');
  const account = AI2_DABRA_CHARACTER_BIBLE.memoryAndAccountWording.join(' ');
  const safety = AI2_DABRA_CHARACTER_BIBLE.safetyBoundaries.join(' ');
  assert.match(truthfulness, /Never invent prices, availability, booking confirmation/i);
  assert.match(truthfulness, /payment status, refund status, provider responses/i);
  assert.match(account, /Never claim access to conversation history, account data, or bookings/i);
  assert.match(safety, /Do not execute booking writes, payment execution, refund execution/i);
  assert.match(safety, /Never expose secrets, credentials, or private internal data/i);
});

test('behavioral acceptance matrix covers all required Arabic situations', () => {
  assert.deepEqual(
    AI2_DABRA_ARABIC_BEHAVIOR_ACCEPTANCE.map((entry) => entry.id),
    ['greeting', 'travel-search', 'anxious-traveler', 'missing-information', 'provider-error', 'success-confirmation', 'unsafe-execution', 'long-detail'],
  );
  for (const entry of AI2_DABRA_ARABIC_BEHAVIOR_ACCEPTANCE) {
    assert.match(entry.input, /[\u0600-\u06ff]/);
    assert.ok(entry.behavior.length > 20);
  }
});

test('missing evidence returns a concise truthful Saudi-light response', async () => {
  const response = await buildAI2ChatResponse('وش وضع طلب qzvxx غير المعروف؟');
  assert.equal(response.provider, 'local');
  assert.equal(response.answer, AI2_DABRA_LOCAL_RESPONSES.noSource.ar);
  assert.match(response.answer, /ما ودي أفتي عليك/);
});

test('unsafe execution remains local and offers safe guidance', async () => {
  let providerCalls = 0;
  globalThis.fetch = (async () => {
    providerCalls += 1;
    throw new Error('must not be called');
  }) as typeof fetch;

  const response = await buildAI2ChatResponse('احجز لي الرحلة وادفع عني الآن');
  assert.equal(response.provider, 'local');
  assert.equal(response.answer, AI2_DABRA_LOCAL_RESPONSES.unsafeExecution.ar);
  assert.equal(providerCalls, 0);
});

test('provider failure returns a sanitized Saudi-light remedy', async () => {
  process.env.DABRA_GLOBAL_WEB_ENABLED = 'true';
  process.env.DABRA_AI_PROVIDER = 'openai';
  process.env.DABRA_PROVIDER_FALLBACK_ENABLED = 'false';
  process.env.OPENAI_API_KEY = 'test-only-key';
  globalThis.fetch = (async () => {
    throw new Error('raw-provider-secret-marker');
  }) as typeof fetch;

  const response = await buildAI2ChatResponse('وش آخر وضع qzvxx اليوم؟');
  assert.equal(response.provider, 'local');
  assert.equal(response.answer, AI2_DABRA_LOCAL_RESPONSES.providerUnavailable.ar);
  assert.doesNotMatch(response.answer, /raw-provider-secret-marker/);
});
