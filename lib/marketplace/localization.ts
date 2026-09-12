import type { AppLanguage } from '@/lib/i18n/config';

export function liteApiProofHrefLanguage(href: string, language: AppLanguage) {
  if (!href.startsWith('/marketplace/provider-proof/liteapi/')) return href;
  const url = new URL(href, 'https://dir3com.invalid');
  url.searchParams.set('language', language);
  return `${url.pathname}${url.search}${url.hash}`;
}

const marketplaceBadgeCopy = {
  ar: {
    featured: 'مميز',
    popular: 'شائع',
    recommended: 'موصى به',
  },
  en: {
    featured: 'Featured',
    popular: 'Popular',
    recommended: 'Recommended',
  },
} as const;

export function marketplaceBadgeLabels(
  language: AppLanguage,
  flags: { featured?: boolean; popular?: boolean; recommended?: boolean },
) {
  const copy = marketplaceBadgeCopy[language];
  return [
    flags.featured ? copy.featured : null,
    flags.popular ? copy.popular : null,
    flags.recommended ? copy.recommended : null,
  ].filter((label): label is NonNullable<typeof label> => label !== null);
}

export function marketplaceOptionCountLabel(count: number, language: AppLanguage) {
  if (language === 'en') return `${count} ${count === 1 ? 'option' : 'options'}`;
  return `${count} ${count === 1 ? 'خيار' : 'خيارات'}`;
}
