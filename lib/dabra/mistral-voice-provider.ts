import { Buffer } from 'node:buffer';
import {
  DABRA_VOICE_AUDIO_MAX_BYTES,
  DabraVoiceProviderError,
  parseDabraVoiceInput,
  throwIfDabraVoiceCancelled,
  type DabraVoiceSynthesisInput,
  type VoiceProvider,
} from '@/lib/dabra/voice-provider';
import { DABRA_APPROVED_VOICE } from '@/lib/dabra/approved-voice';
import { normalizeDabraTtsText } from '@/lib/dabra/speech-pronunciation';

export const MISTRAL_VOXTRAL_TTS_MODEL = 'voxtral-mini-tts-2603';
const MISTRAL_SPEECH_ENDPOINT = 'https://api.mistral.ai/v1/audio/speech';
const MAX_JSON_RESPONSE_BYTES = Math.ceil(DABRA_VOICE_AUDIO_MAX_BYTES * 4 / 3) + 16_384;

type MistralVoiceEnv = Readonly<Record<string, string | undefined>>;

export type MistralVoiceConfig = Readonly<{
  apiKey: string;
  voiceId: string;
  requestTimeoutMs: number;
}>;

export function getMistralVoiceConfig(env: MistralVoiceEnv = process.env): MistralVoiceConfig | null {
  const apiKey = env.MISTRAL_API_KEY?.trim() ?? '';
  const voiceId = env.DABRA_MISTRAL_VOICE_ID?.trim() ?? '';
  const configuredTimeout = Number(env.DABRA_VOICE_TIMEOUT_MS ?? '20000');
  const requestTimeoutMs = Number.isFinite(configuredTimeout) ? Math.min(30_000, Math.max(3_000, configuredTimeout)) : 20_000;
  if (apiKey.length < 16 || voiceId !== DABRA_APPROVED_VOICE.voiceId) return null;
  return Object.freeze({ apiKey, voiceId, requestTimeoutMs });
}

export function isMistralVoiceConfigured(env: MistralVoiceEnv = process.env) {
  return getMistralVoiceConfig(env) !== null;
}

function decodeMistralAudioResponse(raw: ArrayBuffer) {
  if (!raw.byteLength || raw.byteLength > MAX_JSON_RESPONSE_BYTES) {
    throw new DabraVoiceProviderError('VOICE_PROVIDER_RESPONSE_INVALID');
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new DabraVoiceProviderError('VOICE_PROVIDER_RESPONSE_INVALID');
  }
  const audioData = (payload as { audio_data?: unknown })?.audio_data;
  if (typeof audioData !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioData)) {
    throw new DabraVoiceProviderError('VOICE_PROVIDER_RESPONSE_INVALID');
  }
  const audio = Buffer.from(audioData, 'base64');
  if (!audio.byteLength || audio.byteLength > DABRA_VOICE_AUDIO_MAX_BYTES) {
    throw new DabraVoiceProviderError('VOICE_PROVIDER_RESPONSE_INVALID');
  }
  return audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
}

export function createMistralVoiceProvider(
  config: MistralVoiceConfig,
  fetchImpl: typeof fetch = fetch,
): VoiceProvider {
  return {
    id: 'mistral-voxtral-tts',
    async synthesize(input: DabraVoiceSynthesisInput) {
      throwIfDabraVoiceCancelled(input.signal);
      const normalized = parseDabraVoiceInput({
        locale: input.locale,
        text: normalizeDabraTtsText(input.text),
      });
      if (!normalized) throw new DabraVoiceProviderError('VOICE_REQUEST_INVALID');
      throwIfDabraVoiceCancelled(input.signal);
      const timeoutController = new AbortController();
      const timeout = setTimeout(() => timeoutController.abort(), config.requestTimeoutMs);
      const relayAbort = () => timeoutController.abort();
      input.signal?.addEventListener('abort', relayAbort, { once: true });
      try {
        throwIfDabraVoiceCancelled(input.signal);
        const response = await fetchImpl(MISTRAL_SPEECH_ENDPOINT, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MISTRAL_VOXTRAL_TTS_MODEL,
            input: normalized.text,
            voice_id: config.voiceId,
            response_format: 'mp3',
            stream: false,
            metadata: {
              locale: input.locale,
              request_id: input.requestId,
              reference_sha256: input.voiceProfile.referenceSha256,
            },
          }),
          cache: 'no-store',
          signal: timeoutController.signal,
        });
        throwIfDabraVoiceCancelled(input.signal);
        if (!response.ok) throw new DabraVoiceProviderError('VOICE_PROVIDER_FAILED');
        const declaredLength = Number(response.headers.get('content-length') ?? '0');
        if (declaredLength > MAX_JSON_RESPONSE_BYTES) {
          throw new DabraVoiceProviderError('VOICE_PROVIDER_RESPONSE_INVALID');
        }
        const rawAudio = await response.arrayBuffer();
        throwIfDabraVoiceCancelled(input.signal);
        const audio = decodeMistralAudioResponse(rawAudio);
        return {
          audio,
          contentType: 'audio/mpeg',
          metadata: { provider: 'mistral', model: MISTRAL_VOXTRAL_TTS_MODEL, requestId: input.requestId },
        };
      } catch (error) {
        if (input.signal?.aborted) throw new DabraVoiceProviderError('VOICE_REQUEST_CANCELLED');
        if (error instanceof DabraVoiceProviderError) throw error;
        throw new DabraVoiceProviderError('VOICE_PROVIDER_UNAVAILABLE');
      } finally {
        clearTimeout(timeout);
        input.signal?.removeEventListener('abort', relayAbort);
      }
    },
  };
}
