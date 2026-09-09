'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/layout/Header';
import { CustomerFooter, CustomerLogo } from '@/components/v6/CustomerChrome';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import styles from './home-production.module.css';

const FloatingDibrah = dynamic(() => import('@/components/layout/FloatingDibrah'), { ssr: false });

/** Home-only presentation; retain the public navigation, session controls and DABRA. */
export function HomeChrome({ children }: { children: ReactNode }) {
  const { language, direction } = useLanguage();
  return <div className={styles.shell} lang={language} dir={direction}>
    <Header logo={<CustomerLogo />} onHomeSearch={() => document.querySelector<HTMLButtonElement>('[data-home-search-entry] button')?.click()} />
    {children}
    <CustomerFooter surface="white" className={styles.footer} />
    <FloatingDibrah />
  </div>;
}
