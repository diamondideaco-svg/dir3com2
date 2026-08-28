import type { AI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { DABRA_LOCALE_FALLBACK, type DabraLocale } from '@/lib/dabra/locale-contract';

export type DabraDetectedLanguage = DabraLocale | 'foreign' | 'undetermined';

const ENGLISH_MARKERS = new Set([
  'a', 'about', 'and', 'are', 'can', 'could', 'do', 'for', 'from', 'help', 'hotel', 'i', 'in', 'is', 'it',
  'let', 'me', 'of', 'on', 'option', 'options', 'please', 'that', 'the', 'this', 'to', 'travel', 'trip', 'we',
  'back', 'what', 'welcome', 'with', 'would', 'you', 'your',
]);
const ROMANIAN_MARKERS = new Set([
  'acest', 'aceasta', 'ajuta', 'aveți', 'care', 'că', 'cu', 'doriți', 'este', 'hotelul', 'îmi', 'în', 'pentru',
  'pot', 'să', 'și', 'un', 'vă',
]);

function words(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en').match(/\p{L}+/gu) ?? [];
}

function isTravelIdentifierOnly(value: string) {
  const tokens = words(value);
  const known = new Set(['cai', 'cairo', 'hilton', 'marriott', 'riyadh', 'ruh', 'saudia']);
  return tokens.length > 0 && tokens.length <= 4 && tokens.every((token) => known.has(token));
}

export function detectDabraResponseLanguage(value: string): DabraDetectedLanguage {
  const normalized = value.normalize('NFKC');
  const arabic = (normalized.match(/[\u0600-\u06ff]/gu) ?? []).length;
  const latin = (normalized.match(/[A-Za-z\u00c0-\u024f]/gu) ?? []).length;
  if (/\p{Script=Cyrillic}/u.test(normalized)) return 'foreign';

  const tokens = words(normalized);
  const romanianScore = tokens.filter((token) => ROMANIAN_MARKERS.has(token)).length;
  if (/[ăâîșşțţ]/iu.test(normalized) || romanianScore >= 2) return 'foreign';
  if (arabic >= 4 && arabic >= Math.max(4, Math.floor(latin / 2))) return 'ar';

  const englishScore = tokens.filter((token) => ENGLISH_MARKERS.has(token)).length;
  if (latin >= 4 && englishScore >= Math.min(2, Math.max(1, Math.floor(tokens.length / 4)))) return 'en';
  if (arabic > 0 || latin > 0) return 'foreign';
  return 'undetermined';
}

export function answerMatchesDabraLocale(answer: string, locale: DabraLocale): boolean {
  return isTravelIdentifierOnly(answer) || detectDabraResponseLanguage(answer) === locale;
}

export function enforceDabraResponseLocale(response: AI2ChatResponse, locale: DabraLocale): AI2ChatResponse {
  return {
    ...response,
    answer: answerMatchesDabraLocale(response.answer, locale) ? response.answer : DABRA_LOCALE_FALLBACK[locale],
    language: locale,
  };
}

export async function ensureDabraResponseLocale(
  response: AI2ChatResponse,
  locale: DabraLocale,
  repair: (invalidAnswer: string) => Promise<AI2ChatResponse>,
): Promise<AI2ChatResponse> {
  if (answerMatchesDabraLocale(response.answer, locale)) return { ...response, language: locale };
  try {
    const repaired = await repair(response.answer);
    return enforceDabraResponseLocale(repaired, locale);
  } catch {
    return enforceDabraResponseLocale(response, locale);
  }
}
