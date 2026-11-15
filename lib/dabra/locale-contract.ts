import type { AI2ChatLanguage } from '@/lib/ai2/runtime/chat';

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

/** Explicit current-turn reply instructions override UI/preferences without persisting them. */
export function explicitDabraReplyLocale(value: unknown): DabraLocale | null {
  if (typeof value !== 'string') return null;
  const text = value.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ');
  const pattern = /(?:\b(?:reply|answer|respond|write|speak)\b\s*(?:to me\s*)?(?:in\s+)?(english|arabic)\b|(?<!\p{L})(?:رد|جاوب(?:ني)?|اجب(?:ني)?|اكتب|تكلم|تحدث)\s*(?:(?:علي|لي)\s*)?(?:باللغه\s*)?(?:بال|ال)?(انجليزيه|انجليزي|انكليزيه|انكليزي|عربيه|عربي))/gu;
  let language: string | undefined;
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 32), match.index);
    if (!/(?:\bnot|\bdon't|\bdo not|لا|ليس|مش|مو)\s*$/.test(before)) language = match[1] ?? match[2];
  }
  const standalone = text.match(/^(?:باللغه\s*)?(?:بال|ال)?(انجليزيه|انجليزي|انكليزيه|انكليزي|عربيه|عربي|english|arabic)(?:\s+please)?[.!?؟]*$/u)?.[1];
  language ??= standalone;
  return language ? /^(?:english|انجليزيه?|انكليزيه?)$/.test(language) ? 'en' : 'ar' : null;
}
