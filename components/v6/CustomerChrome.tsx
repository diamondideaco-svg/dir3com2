'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { FiArrowLeft, FiArrowRight, FiGlobe, FiMail, FiSun } from 'react-icons/fi';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaTiktok, FaWhatsapp, FaXTwitter, FaUniversalAccess } from 'react-icons/fa6';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { registerSocialLinks } from '@/lib/auth/register-contact';
import styles from './customer-chrome.module.css';

const socialIcons = { facebook: FaFacebookF, instagram: FaInstagram, linkedin: FaLinkedinIn, tiktok: FaTiktok, x: FaXTwitter };

export function CustomerLogo() {
  return <Link href="/" className={styles.logo} aria-label="dir3com">
    <Image src="/brand/runtime/dir3com-logo-transparent.png" alt="dir3com" width={1536} height={1024} unoptimized />
  </Link>;
}

/** Register-master visual system; callbacks retain each shell's real controls. */
export function CustomerHeader({ large, appearance, onLarge, onAppearance, menu }: {
  large: boolean; appearance: boolean; onLarge: () => void; onAppearance: () => void; menu?: ReactNode;
}) {
  const { language, setLanguage } = useLanguage();
  const ar = language === 'ar';
  return <header className={styles.header} data-customer-header="register-master">
    <CustomerLogo />
    <nav className={styles.tools} aria-label={ar ? 'أدوات العرض' : 'Display controls'}>
      {menu}
      <button type="button" aria-label={ar ? 'تكبير النص' : 'Increase text size'} aria-pressed={large} onClick={onLarge}><FaUniversalAccess aria-hidden="true" /></button>
      <button type="button" aria-label={ar ? 'تبديل المظهر' : 'Toggle appearance'} aria-pressed={appearance} onClick={onAppearance}><FiSun aria-hidden="true" /></button>
      <div className={styles.languages}>
        <button type="button" lang="ar" aria-pressed={ar} onClick={() => setLanguage('ar')}>العربية</button>
        <button type="button" lang="en" aria-pressed={!ar} onClick={() => setLanguage('en')}>EN <FiGlobe aria-hidden="true" /></button>
      </div>
      <Link href="/" className={styles.home}>{ar ? <FiArrowRight aria-hidden="true" /> : <FiArrowLeft aria-hidden="true" />}{ar ? 'العودة إلى الرئيسية' : 'Back to home'}</Link>
    </nav>
  </header>;
}

export function CustomerFooter({ className = '' }: { className?: string }) {
  const { language } = useLanguage(); const ar = language === 'ar';
  return <footer className={`${styles.footer} ${className}`} data-customer-footer="register-master" data-dabra-avoid>
    <div className={styles.brand}><CustomerLogo /></div>
    <div className={styles.columns}>
      <section><h2>{ar ? 'عن الشركة' : 'Company'}</h2><Link href="/about">{ar ? 'من نحن' : 'About us'}</Link><Link href="/terms">{ar ? 'الشروط والأحكام' : 'Terms and conditions'}</Link><Link href="/privacy">{ar ? 'سياسة الخصوصية' : 'Privacy policy'}</Link><Link href="/support">{ar ? 'مركز المساعدة' : 'Help center'}</Link></section>
      <section><h2>{ar ? 'خدماتنا' : 'Services'}</h2>{['Drive', 'Stay', 'Concierge', 'VIP', 'Fly'].map(family => <Link key={family} href={`/services/${family.toLowerCase()}`}>dir3 {family}</Link>)}</section>
      <section><h2>{ar ? 'تواصل معنا' : 'Contact us'}</h2><a href="https://wa.me/966532867009"><FaWhatsapp aria-hidden="true" />{ar ? 'السعودية: ' : 'Saudi Arabia: '}<bdi>+966 53 286 7009</bdi></a><a href="https://wa.me/201011676418"><FaWhatsapp aria-hidden="true" />{ar ? 'مصر: ' : 'Egypt: '}<bdi>+20 101 167 6418</bdi></a><a href="mailto:info@dir3com.com"><FiMail aria-hidden="true" />info@dir3com.com</a><a href="https://www.dir3com.com"><FiGlobe aria-hidden="true" />www.dir3com.com</a><a href="https://www.dir3com.net"><FiGlobe aria-hidden="true" />www.dir3com.net</a>
        <div className={styles.socials}>{registerSocialLinks.map(s => { const Icon = socialIcons[s.channel]; return <a key={s.channel} href={s.href} aria-label={s.label} rel="noopener noreferrer" target="_blank"><Icon aria-hidden="true" /></a>; })}</div>
      </section>
    </div>
    <p className={styles.copyright}>{ar ? 'جميع الحقوق محفوظة © 2026 dir3com' : '© 2026 dir3com. All rights reserved.'}</p>
  </footer>;
}
