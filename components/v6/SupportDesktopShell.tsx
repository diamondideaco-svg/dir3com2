'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { CustomerHeader, CustomerFooter } from './CustomerChrome';
import { DabraCompact } from './DabraIdentity';
import customerStyles from './v6.module.css';
import styles from './support-desktop.module.css';

const FloatingDibrah = dynamic(() => import('@/components/layout/FloatingDibrah'), { ssr: false });

/** Desktop /support chrome only. The existing page owns its unchanged main/body. */
export function SupportDesktopShell({ children }: { children: ReactNode }) {
  const { language, direction } = useLanguage();
  const ar = language === 'ar';
  const [large, setLarge] = useState(false);
  const [appearance, setAppearance] = useState(false);

  return <div className={styles.shell} lang={language} dir={direction} data-support-desktop data-large={large} data-warm={appearance}>
    <CustomerHeader large={large} appearance={appearance} onLarge={() => setLarge(!large)} onAppearance={() => setAppearance(!appearance)} />
    {children}
    <CustomerFooter surface="white" className={styles.footer} />
    <div className={`${customerStyles.customerLauncher} ${styles.launcher}`}>
      <FloatingDibrah launcherIdentity={<DabraCompact artwork="customer-service" />} desktopIdentity={{ greeting: ar ? 'مرحبًا، أنا الدبرة' : "Hi, I'm DABRA", role: ar ? 'خدمة العملاء' : 'Customer Service' }} />
    </div>
  </div>;
}
