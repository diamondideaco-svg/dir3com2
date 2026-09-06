'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiArrowLeft, FiCalendar, FiFileText, FiHeart, FiHome, FiHelpCircle, FiLogOut, FiMenu, FiSettings, FiShield, FiSun, FiX, FiCreditCard } from 'react-icons/fi';
import { FaUniversalAccess } from 'react-icons/fa6';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { getCustomerRoleLabel } from '@/lib/i18n/customer-hub';
import type { SessionRole } from '@/lib/auth/identity-contract';
import { supabase } from '@/lib/supabase/client';
import styles from './v6.module.css';

export type Viewer = { id: string; name: string; role: SessionRole | null; roleRaw: string | null; avatar: string | null; joined: string | null };
export function Logo() { return <Link href="/" aria-label="dir3com"><Image src="/brand/runtime/dir3com-logo-approved-cropped.png" alt="dir3com" width={180} height={71} unoptimized /></Link>; }

export function Chrome({ children, viewer, variant = 'light' }: { children: ReactNode; viewer?: Viewer; variant?: 'light' | 'navy' }) {
  const { language, direction, setLanguage } = useLanguage();
  const ar = language === 'ar';
  const path = usePathname();
  const [large, setLarge] = useState(false);
  const [warm, setWarm] = useState(false);
  const [menu, setMenu] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const links = [
    ['/my-account', 'لوحة الحساب', 'My account', FiHome], ['/my-bookings', 'حجوزاتي', 'My bookings', FiCalendar],
    ['/my-wallet', 'محفظة السفر', 'Travel wallet', FiCreditCard], ['/my-documents', 'مستنداتي', 'My documents', FiFileText],
    ['/favorites', 'المفضلة', 'Favorites', FiHeart], ['/my-profile', 'إعدادات الحساب', 'Account settings', FiSettings],
    ['/support', 'المساعدة والدعم', 'Help and support', FiHelpCircle],
  ] as const;
  async function logout() {
    setLogoutError(false);
    const { error } = await supabase.auth.signOut();
    if (error) { setLogoutError(true); return; }
    window.location.assign('/login');
  }
  return <div className={styles.root} data-theme={variant} data-large={large} data-warm={warm} lang={language} dir={direction}>
    <a href="#v6-content" className={styles.skip}>{ar ? 'انتقل إلى المحتوى' : 'Skip to content'}</a>
    <header className={styles.header}>
      <Logo />
      <nav className={styles.tools} aria-label={ar ? 'أدوات الصفحة' : 'Page controls'}>
        {viewer && <button type="button" className={styles.menuButton} aria-expanded={menu} aria-controls="account-navigation" aria-label={ar ? 'قائمة الحساب' : 'Account menu'} onClick={() => setMenu(!menu)}>{menu ? <FiX /> : <FiMenu />}</button>}
        <button type="button" onClick={() => setLarge(!large)} aria-pressed={large} aria-label={ar ? 'تكبير النص' : 'Increase text size'}><FaUniversalAccess /></button>
        <button type="button" onClick={() => setWarm(!warm)} aria-pressed={warm} aria-label={ar ? 'تبديل المظهر' : 'Toggle appearance'}><FiSun /></button>
        <button type="button" lang="ar" aria-pressed={ar} onClick={() => setLanguage('ar')}>العربية</button>
        <button type="button" lang="en" aria-pressed={!ar} onClick={() => setLanguage('en')}>EN</button>
        <Link href="/" className={styles.homeLink}><FiArrowLeft />{ar ? 'العودة إلى الرئيسية' : 'Back to home'}</Link>
      </nav>
    </header>
    <div className={viewer ? styles.portal : undefined}>
      {viewer && <aside id="account-navigation" className={styles.sidebar} data-open={menu}>
        <div className={styles.identity}>
          {viewer.avatar && /^https:\/\//.test(viewer.avatar) ? <Image src={viewer.avatar} alt="" width={64} height={64} unoptimized referrerPolicy="no-referrer" /> : <span className={styles.initials} aria-hidden="true">{viewer.name.slice(0, 2)}</span>}
          <strong>{viewer.name}</strong>
          <span>{getCustomerRoleLabel(viewer.role, viewer.roleRaw, language)}</span>
        </div>
        <nav aria-label={ar ? 'التنقل في الحساب' : 'Account navigation'}>{links.map(([href, arabic, english, Icon]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} onClick={() => setMenu(false)}><Icon />{ar ? arabic : english}</Link>)}
          <button type="button" onClick={logout}><FiLogOut />{ar ? 'تسجيل الخروج' : 'Log out'}</button>
        </nav>
        {logoutError && <p role="alert">{ar ? 'تعذّر تسجيل الخروج. حاول مرة أخرى.' : 'Could not sign out. Try again.'}</p>}
        <section className={styles.assistant}><strong>DABRA · الدبرة</strong><p>{ar ? 'كيف أقدر أساعدك اليوم؟' : 'How can I help you today?'}</p><Link href="/dabra">{ar ? 'اسأل الدبرة' : 'Ask DABRA'} →</Link></section>
      </aside>}
      <main id="v6-content" className={viewer ? styles.content : undefined}>{children}</main>
    </div>
    {!viewer ? <footer className={styles.authFooter}>
      <Logo />
      <section><h2>{ar ? 'عن الشركة' : 'About'}</h2><Link href="/about">{ar ? 'من نحن' : 'About us'}</Link><Link href="/terms">{ar ? 'الشروط والأحكام' : 'Terms'}</Link><Link href="/privacy">{ar ? 'سياسة الخصوصية' : 'Privacy'}</Link></section>
      <section><h2>{ar ? 'خدماتنا' : 'Services'}</h2>{['Drive','Stay','Concierge','VIP','Fly'].map(family=><Link key={family} href={'/services/'+family.toLowerCase()}>dir3 {family}</Link>)}</section>
      <section><h2>{ar ? 'مساعدة ودعم' : 'Help and support'}</h2><Link href="/support">{ar ? 'مركز المساعدة' : 'Help center'}</Link><Link href="/contact">{ar ? 'تواصل معنا' : 'Contact us'}</Link></section>
      <section><h2>{ar ? 'تواصل معنا' : 'Contact'}</h2><a href="tel:+966532867009"><bdi>+966 53 286 7009</bdi></a><a href="tel:+201011676418"><bdi>+20 101 167 6418</bdi></a><a href="mailto:info@dir3com.com">info@dir3com.com</a><small>© 2026 dir3com</small></section>
    </footer> : <footer className={styles.footer}><Logo /><nav aria-label={ar ? 'روابط المساعدة والسياسات' : 'Help and policy links'}><Link href="/privacy"><FiShield />{ar ? 'الخصوصية' : 'Privacy'}</Link><Link href="/terms">{ar ? 'الشروط والأحكام' : 'Terms'}</Link><Link href="/support">{ar ? 'المساعدة والدعم' : 'Help and support'}</Link><a href="mailto:info@dir3com.com">info@dir3com.com</a></nav><small>© 2026 dir3com</small></footer>}
  </div>;
}

export function PageHeading({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  return <div className={styles.pageHeading}><div><h1>{icon}{title}</h1>{subtitle && <p>{subtitle}</p>}</div></div>;
}

export function LoadError() {
  const { language } = useLanguage();
  return <div className={styles.empty} role="alert"><p>{language === 'ar' ? 'تعذّر تحميل البيانات. حاول مرة أخرى.' : 'Could not load your data. Please try again.'}</p><button type="button" className={styles.secondary} onClick={() => window.location.reload()}>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button></div>;
}
