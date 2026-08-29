import type { DabraPersistedMessage } from '@/lib/dabra/travel-commerce-state';

export type DabraWelcomeLanguage = 'ar' | 'en';

export const DABRA_WELCOME_COPY: Record<DabraWelcomeLanguage, string> = {
  ar: 'هلا بك. أنا الدبرة، أساعدك ترتب الرحلة بهدوء ووضوح. وش أهم شيء عندك اليوم؟',
  en: 'Welcome. I’m DABRA, here to arrange your trip calmly and clearly. What matters most to you today?',
};

export function createDabraWelcomeMessage(language: DabraWelcomeLanguage): DabraPersistedMessage {
  return { id: 'welcome', role: 'assistant', text: DABRA_WELCOME_COPY[language] };
}

export function localizePersistedDabraWelcome(
  messages: DabraPersistedMessage[],
  language: DabraWelcomeLanguage,
): DabraPersistedMessage[] {
  if (!messages.length) return [createDabraWelcomeMessage(language)];
  if (messages[0].id !== 'welcome') return messages;
  return [createDabraWelcomeMessage(language), ...messages.slice(1)];
}
