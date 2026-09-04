import { DABRA_APPROVED_VOICE } from '@/lib/dabra/approved-voice';

export type DabraVoiceLocale = 'ar' | 'en';

export type DabraVoiceProfile = Readonly<{
  design: typeof DABRA_APPROVED_VOICE.design;
  referenceSha256: typeof DABRA_APPROVED_VOICE.sha256;
}>;

export type DabraVoiceSynthesisInput = Readonly<{
  text: string;
  locale: DabraVoiceLocale;
  voiceProfile: DabraVoiceProfile;
  requestId: string;
  signal?: AbortSignal;
}>;

export type DabraVoiceResult = Readonly<{
  audio: ArrayBuffer;
  contentType: 'audio/mpeg' | 'audio/wav';
  metadata: Readonly<{
    provider: string;
    model: string;
    requestId: string;
  }>;
}>;

export interface VoiceProvider {
  readonly id: string;
  synthesize(input: DabraVoiceSynthesisInput): Promise<DabraVoiceResult>;
}

export const DABRA_VOICE_PROFILE: DabraVoiceProfile = Object.freeze({
  design: DABRA_APPROVED_VOICE.design,
  referenceSha256: DABRA_APPROVED_VOICE.sha256,
});

export const DABRA_VOICE_TEXT_MAX_LENGTH = 800;
export const DABRA_VOICE_AUDIO_MAX_BYTES = 8 * 1024 * 1024;
export const DABRA_VOICE_RATE_LIMIT = Object.freeze({ requests: 6, windowMs: 60_000 });
export const DABRA_VOICE_REQUEST_CANCELLED = 'VOICE_REQUEST_CANCELLED' as const;

export class DabraVoiceProviderError extends Error {
  constructor(
    public readonly code: 'VOICE_REQUEST_CANCELLED' | 'VOICE_REQUEST_INVALID' | 'VOICE_PROVIDER_UNAVAILABLE' | 'VOICE_PROVIDER_FAILED' | 'VOICE_PROVIDER_RESPONSE_INVALID',
  ) {
    super(code);
    this.name = 'DabraVoiceProviderError';
  }
}

export function throwIfDabraVoiceCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DabraVoiceProviderError(DABRA_VOICE_REQUEST_CANCELLED);
}

export function parseDabraVoiceInput(value: unknown): { locale: DabraVoiceLocale; text: string } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.locale !== 'ar' && record.locale !== 'en') return null;
  if (typeof record.text !== 'string') return null;
  const text = record.text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || text.length > DABRA_VOICE_TEXT_MAX_LENGTH) return null;
  return { locale: record.locale, text };
}

type RateBucket = { startedAt: number; count: number };
const rateBuckets = new Map<string, RateBucket>();

export function consumeDabraVoiceRateLimit(key: string, now = Date.now()) {
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= DABRA_VOICE_RATE_LIMIT.windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= DABRA_VOICE_RATE_LIMIT.requests) return false;
  current.count += 1;
  return true;
}

export function resetDabraVoiceRateLimitForTests() {
  rateBuckets.clear();
}
