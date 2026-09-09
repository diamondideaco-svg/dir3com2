'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/layout/Header';
import { CustomerFooter, CustomerLogo } from '@/components/v6/CustomerChrome';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import publicStyles from '@/components/home/home-production.module.css';
import styles from './services-overview.module.css';

const FloatingDibrah = dynamic(() => import('@/components/layout/FloatingDibrah'), { ssr: false });

/** Secondary Services landing; existing public chrome without obsolete fragment links. */
export function ServicesChrome({ children }: { children: ReactNode }) {
  const { language, direction } = useLanguage();
  return <div className={`${publicStyles.shell} ${styles.shell}`} lang={language} dir={direction}>
    <Header logo={<CustomerLogo />} />
    <main>{children}</main>
    <CustomerFooter surface="white" className={publicStyles.footer} servicesOverviewAccess />
    <FloatingDibrah />
  </div>;
}
