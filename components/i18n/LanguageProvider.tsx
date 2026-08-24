'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE_NAME,
  LANGUAGE_STORAGE_KEY,
  languageDirection,
  normalizeLanguage,
  type AppLanguage,
} from '@/lib/i18n/config';

type LanguageContextValue = {
  language: AppLanguage;
  direction: 'rtl' | 'ltr';
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const fallbackLanguageContext: LanguageContextValue = {
  language: DEFAULT_LANGUAGE,
  direction: languageDirection(DEFAULT_LANGUAGE),
  setLanguage: () => {
    // noop fallback when a component renders outside provider boundaries
  },
  toggleLanguage: () => {
    // noop fallback when a component renders outside provider boundaries
  },
};

function persistLanguage(language: AppLanguage) {
  const direction = languageDirection(language);
  document.documentElement.lang = language;
  document.documentElement.dir = direction;
  document.documentElement.dataset.lang = language;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; path=/; max-age=31536000; samesite=lax`;
}

export function LanguageProvider({ children, initialLanguage = DEFAULT_LANGUAGE }: { children: ReactNode; initialLanguage?: AppLanguage }) {
  const router = useRouter();
  const [language, setLanguageState] = useState<AppLanguage>(initialLanguage);
  const initializedRef = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      const storedLanguage = normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? initialLanguage);
      initializedRef.current = true;
      persistLanguage(storedLanguage);
      setLanguageState(storedLanguage);
    });
  }, [initialLanguage]);

  useEffect(() => {
    if (!initializedRef.current) return;
    persistLanguage(language);
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      direction: languageDirection(language),
      setLanguage: (nextLanguage) => {
        initializedRef.current = true;
        persistLanguage(nextLanguage);
        setLanguageState(nextLanguage);
        router.refresh();
      },
      toggleLanguage: () => {
        const nextLanguage = language === 'ar' ? 'en' : 'ar';
        initializedRef.current = true;
        persistLanguage(nextLanguage);
        setLanguageState(nextLanguage);
        router.refresh();
      },
    }),
    [language, router],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('useLanguage rendered outside LanguageProvider; falling back to default language.');
    }
    return fallbackLanguageContext;
  }
  return context;
}
