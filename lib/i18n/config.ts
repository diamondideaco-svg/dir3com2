export type AppLanguage = 'ar' | 'en';

export const DEFAULT_LANGUAGE: AppLanguage = 'ar';
export const LANGUAGE_COOKIE_NAME = 'dir3com-lang';
export const LANGUAGE_STORAGE_KEY = 'dir3com-lang';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'ar' || value === 'en';
}

export function normalizeLanguage(value: unknown): AppLanguage {
  return isAppLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function languageDirection(language: AppLanguage) {
  return language === 'ar' ? 'rtl' : 'ltr';
}
