import { francAll } from 'franc-min';
import type { AI2ChatResponse } from '@/lib/ai2/runtime/chat';
import { DABRA_LOCALE_FALLBACK, type DabraLocale } from '@/lib/dabra/locale-contract';

export type DabraDetectedLanguage = DabraLocale | 'foreign' | 'undetermined';
export type DabraLanguageIdentification = {
  language: DabraDetectedLanguage;
  confidence: number;
  travelIdentifierOnly: boolean;
};

const MIN_CONFIDENCE_MARGIN = 0.05;
const TRAVEL_IDENTIFIERS = new Set(['cai', 'cairo', 'hilton', 'marriott', 'riyadh', 'ruh', 'saudia']);

function words(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en').match(/\p{L}+/gu) ?? [];
}

function isTravelIdentifierOnly(value: string) {
  const tokens = words(value);
  return tokens.length > 0 && tokens.length <= 4 && tokens.every((token) => TRAVEL_IDENTIFIERS.has(token));
}

function isSafeShortEnglishTravelCommand(value: string) {
  const tokens = words(value);
  return tokens.length >= 2 && tokens.length <= 4
    && tokens[0] === 'show'
    && tokens.slice(1).every((token) => TRAVEL_IDENTIFIERS.has(token));
}

function withoutTravelIdentifiers(value: string) {
  return value.replace(/\p{L}+/gu, (token) => TRAVEL_IDENTIFIERS.has(token.toLocaleLowerCase('en')) ? ' ' : token);
}

export function identifyDabraResponseLanguage(value: string): DabraLanguageIdentification {
  const normalized = value.normalize('NFKC').trim();
  if (isTravelIdentifierOnly(normalized)) return { language: 'undetermined', confidence: 1, travelIdentifierOnly: true };

  const detectionInput = /\p{Script=Arabic}/u.test(normalized) ? withoutTravelIdentifiers(normalized) : normalized;
  const ranked = francAll(detectionInput, { minLength: 3 });
  const [topCode, topScore] = ranked[0] ?? ['und', 0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const confidence = Math.max(0, topScore - secondScore);
  const language: DabraDetectedLanguage = topCode === 'eng' ? 'en' : topCode === 'arb' ? 'ar' : topCode === 'und' ? 'undetermined' : 'foreign';
  return { language, confidence, travelIdentifierOnly: false };
}

export function detectDabraResponseLanguage(value: string): DabraDetectedLanguage {
  return identifyDabraResponseLanguage(value).language;
}

export function answerMatchesDabraLocale(answer: string, locale: DabraLocale): boolean {
  if (locale === 'en' && isSafeShortEnglishTravelCommand(answer)) return true;
  const identification = identifyDabraResponseLanguage(answer);
  return identification.travelIdentifierOnly
    || (identification.language === locale && identification.confidence >= MIN_CONFIDENCE_MARGIN);
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
