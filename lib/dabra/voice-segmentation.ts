import { DABRA_VOICE_TEXT_MAX_LENGTH } from '@/lib/dabra/voice-provider';

export const DABRA_VOICE_MAX_SEGMENTS = 4;
export const DABRA_VOICE_MAX_PLANNED_UNITS = DABRA_VOICE_TEXT_MAX_LENGTH * DABRA_VOICE_MAX_SEGMENTS;

export type DabraVoicePlaybackPlan = Readonly<{
  segments: readonly string[];
  hasRemainder: boolean;
}>;

function normalizeForSpeech(text: string) {
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/gu, ' ').trim();
}

function isSentenceEnd(character: string) {
  return /[.!?؟。！？]/u.test(character);
}

function findBoundary(text: string, start: number, maximumEnd: number) {
  for (let index = maximumEnd; index > start; index -= 1) {
    if (isSentenceEnd(text[index - 1]) && (index === text.length || /\s/u.test(text[index]))) return index;
  }
  for (let index = maximumEnd; index > start; index -= 1) {
    if (/\s/u.test(text[index - 1])) return index - 1;
  }
  return null;
}

/** Plans a bounded spoken prefix without changing the complete visible answer. */
export function planDabraVoicePlayback(value: string): DabraVoicePlaybackPlan {
  const text = normalizeForSpeech(value);
  const segments: string[] = [];
  let cursor = 0;

  while (cursor < text.length && segments.length < DABRA_VOICE_MAX_SEGMENTS) {
    while (cursor < text.length && /\s/u.test(text[cursor])) cursor += 1;
    if (cursor >= text.length) break;

    const remaining = text.length - cursor;
    if (remaining <= DABRA_VOICE_TEXT_MAX_LENGTH) {
      segments.push(text.slice(cursor));
      cursor = text.length;
      break;
    }

    let maximumEnd = cursor + DABRA_VOICE_TEXT_MAX_LENGTH;
    const high = text.charCodeAt(maximumEnd - 1);
    const low = text.charCodeAt(maximumEnd);
    if (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF) maximumEnd -= 1;
    const boundary = findBoundary(text, cursor, maximumEnd);
    if (boundary === null || boundary <= cursor) break;
    segments.push(text.slice(cursor, boundary).trimEnd());
    cursor = boundary;
  }

  while (cursor < text.length && /\s/u.test(text[cursor])) cursor += 1;
  return Object.freeze({ segments: Object.freeze(segments), hasRemainder: cursor < text.length });
}

export async function runDabraVoicePlayback<T>(
  segments: readonly string[],
  signal: AbortSignal,
  synthesize: (segment: string, signal: AbortSignal) => Promise<T>,
  play: (audio: T, signal: AbortSignal) => Promise<void>,
) {
  for (const segment of segments) {
    signal.throwIfAborted();
    const audio = await synthesize(segment, signal);
    signal.throwIfAborted();
    await play(audio, signal);
  }
}
