import type { AI2ChatLanguage, AI2ChatResponse } from '@/lib/ai2/runtime/chat';

export type DabraLocale = AI2ChatLanguage;

export const DABRA_LOCALE_FALLBACK: Record<DabraLocale, string> = {
  ar: 'خلني أرتبها لك بطريقة أوضح. وش تفضّل يكون الأولوية؟',
  en: 'Let me arrange that more clearly. What would you like me to prioritize?',
};

export const DABRA_LOCALE_ERROR: Record<DabraLocale, string> = {
  ar: 'ما قدرت أوصل للمساعد الآن، لكن نقدر نكمل اختياراتك من السوق مباشرة.',
  en: 'I could not reach the assistant right now, but you can continue with your marketplace options.',
};

export function parseDabraLocale(value: unknown): DabraLocale | null {
  return value === 'ar' || value === 'en' ? value : null;
}

function scriptCounts(value: string) {
  return {
    arabic: (value.match(/[\u0600-\u06ff]/gu) ?? []).length,
    latin: (value.match(/[A-Za-z]/gu) ?? []).length,
  };
}

export function answerMatchesDabraLocale(answer: string, locale: DabraLocale): boolean {
  const { arabic, latin } = scriptCounts(answer);
  if (locale === 'en') return arabic < 4 || latin >= arabic * 2;
  return arabic >= 4 && arabic >= Math.max(4, Math.floor(latin / 2));
}

export function enforceDabraResponseLocale(response: AI2ChatResponse, locale: DabraLocale): AI2ChatResponse {
  return {
    ...response,
    answer: answerMatchesDabraLocale(response.answer, locale) ? response.answer : DABRA_LOCALE_FALLBACK[locale],
    language: locale,
  };
}
