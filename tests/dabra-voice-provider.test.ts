import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  consumeDabraVoiceRateLimit,
  DABRA_VOICE_AUDIO_MAX_BYTES,
  DABRA_VOICE_PROFILE,
  DABRA_VOICE_RATE_LIMIT,
  parseDabraVoiceInput,
  resetDabraVoiceRateLimitForTests,
  type VoiceProvider,
} from '@/lib/dabra/voice-provider';
import {
  createMistralVoiceProvider,
  getMistralVoiceConfig,
  MISTRAL_VOXTRAL_TTS_MODEL,
} from '@/lib/dabra/mistral-voice-provider';
import { DABRA_APPROVED_VOICE } from '@/lib/dabra/approved-voice';

const root = process.cwd();
const route = fs.readFileSync(path.join(root, 'app', 'api', 'dabra', 'voice', 'route.ts'), 'utf8');
const client = fs.readFileSync(path.join(root, 'components', 'dabra', 'DabraChatCommerce.tsx'), 'utf8');
const mistralAdapter = fs.readFileSync(path.join(root, 'lib', 'dabra', 'mistral-voice-provider.ts'), 'utf8');

const validEnv = {
  MISTRAL_API_KEY: 'server-secret-token',
  DABRA_MISTRAL_VOICE_ID: DABRA_APPROVED_VOICE.voiceId,
  DABRA_VOICE_TIMEOUT_MS: '12000',
};

test('voice input accepts only bounded Arabic or English text', () => {
  assert.deepEqual(parseDabraVoiceInput({ locale: 'ar', text: '  أهلًا\nبك  ' }), { locale: 'ar', text: 'أهلًا بك' });
  assert.deepEqual(parseDabraVoiceInput({ locale: 'en', text: 'Welcome to DABRA.' }), { locale: 'en', text: 'Welcome to DABRA.' });
  assert.equal(parseDabraVoiceInput({ locale: 'fr', text: 'bonjour' }), null);
  assert.equal(parseDabraVoiceInput({ locale: 'ar', text: 'x'.repeat(801) }), null);
  assert.equal(parseDabraVoiceInput({ locale: 'en', text: '' }), null);
});

test('Mistral configuration fails closed unless both server secret and approved voice ID exist', () => {
  assert.equal(getMistralVoiceConfig({}), null);
  assert.equal(getMistralVoiceConfig({ MISTRAL_API_KEY: validEnv.MISTRAL_API_KEY }), null);
  assert.equal(getMistralVoiceConfig({ DABRA_MISTRAL_VOICE_ID: validEnv.DABRA_MISTRAL_VOICE_ID }), null);
  assert.equal(getMistralVoiceConfig({ ...validEnv, DABRA_MISTRAL_VOICE_ID: 'wrong-speaker' }), null);
  assert.equal(getMistralVoiceConfig(validEnv)?.requestTimeoutMs, 12_000);
});

test('Mistral adapter binds the official model, server voice ID, approved fingerprint and request ID', async () => {
  const config = getMistralVoiceConfig(validEnv);
  assert.ok(config);
  let sentBody: Record<string, unknown> = {};
  let sentUrl = '';
  const provider = createMistralVoiceProvider(config, async (input, init) => {
    sentUrl = String(input);
    sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer server-secret-token');
    return new Response(JSON.stringify({ audio_data: Buffer.from([1, 2, 3]).toString('base64') }), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const synthesisInput = {
    text: 'أهلًا بك في DIR3COM.',
    locale: 'ar',
    voiceProfile: DABRA_VOICE_PROFILE,
    requestId: 'request-1',
  } as const;
  const result = await provider.synthesize(synthesisInput);
  assert.equal(sentUrl, 'https://api.mistral.ai/v1/audio/speech');
  assert.equal(result.contentType, 'audio/mpeg');
  assert.equal(result.metadata.model, MISTRAL_VOXTRAL_TTS_MODEL);
  assert.equal(sentBody.model, 'voxtral-mini-tts-2603');
  assert.equal(sentBody.voice_id, DABRA_APPROVED_VOICE.voiceId);
  assert.equal(sentBody.input, 'أهلًا بك في درعكم.');
  assert.equal(synthesisInput.text, 'أهلًا بك في DIR3COM.');
  assert.equal(sentBody.response_format, 'mp3');
  assert.equal((sentBody.metadata as Record<string, unknown>).reference_sha256, DABRA_APPROVED_VOICE.sha256);
  assert.equal((sentBody.metadata as Record<string, unknown>).request_id, 'request-1');
  assert.equal('ref_audio' in sentBody, false);
});

test('English synthesis also sends the canonical Arabic spoken brand in actual upstream JSON', async () => {
  const config = getMistralVoiceConfig(validEnv);
  assert.ok(config);
  let sentBody: Record<string, unknown> = {};
  const provider = createMistralVoiceProvider(config, async (_input, init) => {
    sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ audio_data: Buffer.from([7]).toString('base64') }));
  });
  await provider.synthesize({
    text: 'Welcome to dir3com.',
    locale: 'en',
    voiceProfile: DABRA_VOICE_PROFILE,
    requestId: 'request-en-brand',
  });
  assert.equal(sentBody.input, 'Welcome to درعكم.');
});

test('pre-aborted synthesis makes zero Mistral calls and returns the canonical cancellation', async () => {
  const config = getMistralVoiceConfig(validEnv);
  assert.ok(config);
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    createMistralVoiceProvider(config, async () => {
      calls += 1;
      return new Response('{}');
    }).synthesize({ text: 'hello', locale: 'en', voiceProfile: DABRA_VOICE_PROFILE, requestId: 'cancelled-1', signal: controller.signal }),
    /VOICE_REQUEST_CANCELLED/,
  );
  assert.equal(calls, 0);
});

test('mid-flight cancellation reaches upstream fetch once without retry or provider-failure conversion', async () => {
  const config = getMistralVoiceConfig(validEnv);
  assert.ok(config);
  const controller = new AbortController();
  let calls = 0;
  let entered!: () => void;
  const enteredFetch = new Promise<void>((resolve) => { entered = resolve; });
  const provider = createMistralVoiceProvider(config, async (_input, init) => {
    calls += 1;
    entered();
    return await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      assert.ok(signal);
      const onAbort = () => reject(new DOMException('aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  });
  const pending = provider.synthesize({ text: 'hello', locale: 'en', voiceProfile: DABRA_VOICE_PROFILE, requestId: 'cancelled-2', signal: controller.signal });
  await enteredFetch;
  controller.abort();
  await assert.rejects(pending, /VOICE_REQUEST_CANCELLED/);
  assert.equal(calls, 1);
});

test('Mistral adapter rejects malformed and oversized API responses', async () => {
  const config = getMistralVoiceConfig(validEnv);
  assert.ok(config);
  await assert.rejects(
    createMistralVoiceProvider(config, async () => new Response('{}')).synthesize({
      text: 'hello', locale: 'en', voiceProfile: DABRA_VOICE_PROFILE, requestId: 'request-2',
    }),
    /VOICE_PROVIDER_RESPONSE_INVALID/,
  );
  const oversized = Buffer.alloc(DABRA_VOICE_AUDIO_MAX_BYTES + 1).toString('base64');
  await assert.rejects(
    createMistralVoiceProvider(config, async () => new Response(JSON.stringify({ audio_data: oversized }))).synthesize({
      text: 'hello', locale: 'en', voiceProfile: DABRA_VOICE_PROFILE, requestId: 'request-3',
    }),
    /VOICE_PROVIDER_RESPONSE_INVALID/,
  );
});

test('provider abstraction supports a cancellable mock without changing DABRA callers', async () => {
  const mock: VoiceProvider = {
    id: 'mock',
    async synthesize(input) {
      if (input.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return {
        audio: Uint8Array.from([4, 5, 6]).buffer,
        contentType: 'audio/mpeg',
        metadata: { provider: 'mock', model: 'fixture', requestId: input.requestId },
      };
    },
  };
  const result = await mock.synthesize({ text: 'hello', locale: 'en', voiceProfile: DABRA_VOICE_PROFILE, requestId: 'mock-1' });
  assert.equal(result.metadata.provider, 'mock');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(mock.synthesize({ text: 'hello', locale: 'en', voiceProfile: DABRA_VOICE_PROFILE, requestId: 'mock-2', signal: controller.signal }), /aborted/);
});

test('authenticated actor rate limit is bounded per window', () => {
  resetDabraVoiceRateLimitForTests();
  for (let index = 0; index < DABRA_VOICE_RATE_LIMIT.requests; index += 1) {
    assert.equal(consumeDabraVoiceRateLimit('actor', 1_000), true);
  }
  assert.equal(consumeDabraVoiceRateLimit('actor', 1_000), false);
  assert.equal(consumeDabraVoiceRateLimit('other', 1_000), true);
  assert.equal(consumeDabraVoiceRateLimit('actor', 1_000 + DABRA_VOICE_RATE_LIMIT.windowMs), true);
});

test('route requires trusted session context and never exposes or accepts voice identity configuration', () => {
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /VOICE_AUTH_REQUIRED/);
  assert.match(route, /consumeDabraVoiceRateLimit\(user\.id\)/);
  assert.match(route, /DABRA_VOICE_REQUEST_CANCELLED/);
  assert.match(route, /status: 499/);
  const rateLimitOffset = route.indexOf('consumeDabraVoiceRateLimit(user.id)');
  assert.ok(route.lastIndexOf('if (request.signal.aborted) return cancelledResponse();', rateLimitOffset) > -1);
  assert.match(route, /DABRA_VOICE_PROFILE/);
  assert.match(route, /crypto\.randomUUID\(\)/);
  assert.match(route, /'Cache-Control': 'private, no-store, max-age=0'/);
  assert.doesNotMatch(route, /process\.env\.MISTRAL_API_KEY|speakerWav|modelPath|referencePath/);
  assert.doesNotMatch(client, /MISTRAL_API_KEY|DABRA_MISTRAL_VOICE_ID|voxtral/i);
  assert.match(mistralAdapter, /process\.env/);
});

test('client playback cancels fetch and audio across response, locale, navigation and unmount boundaries', () => {
  assert.match(client, /fetch\('\/api\/dabra\/voice'/);
  assert.match(client, /playbackAbortRef\.current\?\.abort\(\)/);
  assert.match(client, /audio\.pause\(\)/);
  assert.match(client, /URL\.revokeObjectURL/);
  assert.match(client, /window\.addEventListener\('pagehide', cancelForNavigation\)/);
  assert.match(client, /language !== languageRef\.current/);
  assert.match(client, /stopVoicePlayback\(\);[\s\S]{0,120}chatInFlightRef\.current = true/);
  assert.doesNotMatch(client, /speechSynthesis|SpeechSynthesisUtterance/);
});
