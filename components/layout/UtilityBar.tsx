'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FaFacebookF, FaInstagram, FaTiktok, FaWhatsapp, FaXTwitter } from 'react-icons/fa6';
import { FiCloud, FiGlobe, FiMoon, FiPhoneCall, FiSun } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ThemeMode = 'light' | 'dark';

const socialLinks = [
  { href: 'https://wa.me/966532867009', label: 'WhatsApp', icon: FaWhatsapp },
  { href: 'https://instagram.com', label: 'Instagram', icon: FaInstagram },
  { href: 'https://tiktok.com', label: 'TikTok', icon: FaTiktok },
  { href: 'https://x.com', label: 'X', icon: FaXTwitter },
  { href: 'https://facebook.com', label: 'Facebook', icon: FaFacebookF },
];

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

const copy = {
  ar: {
    weather: 'الرياض 36°',
    fx: '1 USD = 3.75 SAR',
    languageButton: 'AR / EN',
    languageLabel: 'تبديل اللغة إلى الإنجليزية',
    shield: 'درعك الحامي للسياحة.',
    utilityNote: 'هوية dir3com الجديدة توحّد الواجهة العامة عبر الحجز والخدمات والتواصل.',
    darkMode: 'تفعيل الوضع الداكن',
    lightMode: 'تفعيل الوضع الفاتح',
    dark: 'داكن',
    light: 'فاتح',
  },
  en: {
    weather: 'Riyadh 36°',
    fx: '1 USD = 3.75 SAR',
    languageButton: 'EN / AR',
    languageLabel: 'Switch language to Arabic',
    shield: 'Your protective shield for tourism.',
    utilityNote: 'The new dir3com identity unifies the public journey across booking, services, and contact.',
    darkMode: 'Enable dark mode',
    lightMode: 'Enable light mode',
    dark: 'Dark',
    light: 'Light',
  },
} as const;

export default function UtilityBar() {
  const { language, direction, toggleLanguage } = useLanguage();
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    const savedTheme = window.localStorage.getItem('dir3com-theme') as ThemeMode | null;

    return savedTheme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem('dir3com-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
  };

  const t = copy[language];

  return (
    <div className="border-b border-[color:var(--color-border)] bg-[linear-gradient(90deg,rgba(16,32,51,1)_0%,rgba(25,46,67,1)_52%,rgba(157,92,77,0.96)_100%)] text-[var(--color-light)]" dir={direction}>
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 text-xs sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 font-medium text-white/92 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
              <FiCloud /> {t.weather}
            </span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-2 font-medium text-white/92 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
              {t.fx}
            </span>
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={t.languageLabel}
              className="inline-flex items-center rounded-full border border-white/12 bg-white/8 px-3 py-2 font-medium text-white/92 transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45"
            >
              <FiGlobe className="me-1" /> {t.languageButton}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-right text-[13px] font-medium text-[var(--color-light)]/90">
            <span className="rounded-full border border-[var(--color-gold)]/35 bg-[linear-gradient(135deg,rgba(200,168,107,0.2)_0%,rgba(255,255,255,0.08)_100%)] px-3 py-2 text-[var(--color-light)] shadow-[0_14px_30px_rgba(0,0,0,0.16)]">
              {t.shield}
            </span>
            <a href="tel:0532867009" className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-2 transition hover:border-[var(--color-gold)]/40 hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
              <FiPhoneCall /> 0532867009
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="border border-white/12 bg-white/8 text-[var(--color-light)] hover:bg-white/12 hover:text-[var(--color-gold)]"
              aria-label={theme === 'light' ? t.darkMode : t.lightMode}
              aria-pressed={theme === 'dark'}
            >
              {theme === 'light' ? <FiMoon /> : <FiSun />}
              {theme === 'light' ? t.dark : t.light}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-[var(--color-light)]/75">
            <span>{t.utilityNote}</span>
          </div>
          <div className="flex items-center gap-2">
            {socialLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className={cn(
                  'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition',
                  'hover:-translate-y-0.5 hover:border-[var(--color-gold)]/50 hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45'
                )}
              >
                <Icon size={14} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}