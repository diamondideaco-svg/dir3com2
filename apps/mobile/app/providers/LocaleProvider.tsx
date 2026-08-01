import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

type LocaleCode = 'ar' | 'en';
type Direction = 'rtl' | 'ltr';

type LocaleContextValue = {
  locale: LocaleCode;
  direction: Direction;
  isRTL: boolean;
  setLocale: (next: LocaleCode) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<LocaleCode>('ar');

  const value = useMemo<LocaleContextValue>(() => {
    const direction: Direction = locale === 'ar' ? 'rtl' : 'ltr';

    return {
      locale,
      direction,
      isRTL: direction === 'rtl',
      setLocale,
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used inside LocaleProvider.');
  }

  return context;
}
