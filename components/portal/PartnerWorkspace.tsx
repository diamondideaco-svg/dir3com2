'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import LogoutButton from '@/components/auth/LogoutButton';
import styles from './partner-workspace.module.css';
const FloatingDibrah = dynamic(() => import('@/components/layout/FloatingDibrah'), { ssr: false });

export default function PartnerWorkspace({ children, fullName, email }: { children: ReactNode; fullName: string; email: string }) {
  const { language, direction, toggleLanguage } = useLanguage();
  const pathname = usePathname();
  const ar = language === 'ar';
  return <div className={styles.workspace} lang={language} dir={direction}>
    <a className={styles.skip} href="#partner-content">{ar ? 'انتقل إلى المحتوى' : 'Skip to content'}</a>
    <header className={styles.header}>
      <Link href="/partner-portal" aria-label={ar ? 'بوابة الشريك — dir3com' : 'dir3com — Partner portal'}>
        <Image src="/brand/runtime/dir3com-logo-transparent.png" width={1536} height={1024} unoptimized alt="dir3com" className={styles.logo} />
      </Link>
      <div className={styles.identity}><strong>{ar ? 'مساحة الشريك' : 'Partner workspace'}</strong><span>{fullName}</span><span dir="ltr">{email}</span></div>
      <div className={styles.controls}>
        <button type="button" onClick={toggleLanguage} aria-label={ar ? 'Switch to English' : 'التبديل إلى العربية'}>{ar ? 'English' : 'العربية'}</button>
        <LogoutButton label={ar ? 'تسجيل الخروج' : 'Sign out'} />
      </div>
    </header>
    <nav className={styles.navigation} aria-label={ar ? 'عمليات الشريك' : 'Partner operations'}>
      <Link href="/partner-portal" aria-current={pathname === '/partner-portal' ? 'page' : undefined}>{ar ? 'بوابة الشريك' : 'Partner portal'}</Link>
      <Link href="/partner-portal/requests" aria-current={pathname === '/partner-portal/requests' ? 'page' : undefined}>{ar ? 'الطلبات' : 'Requests'}</Link>
    </nav>
    <div id="partner-content" tabIndex={-1} className={styles.content}>{children}</div>
    <footer className={styles.footer}>dir3com · {ar ? 'مساحة تشغيل الشريك' : 'Partner operations'}</footer>
    <FloatingDibrah />
  </div>;
}
