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
