'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FaFacebookF, FaInstagram, FaTiktok, FaWhatsapp, FaXTwitter } from 'react-icons/fa6';
import { FiCloud, FiGlobe, FiMoon, FiPhoneCall, FiSun } from 'react-icons/fi';
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

export default function UtilityBar() {
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

  return (
    <div className="border-b border-[color:var(--color-border)] bg-[var(--color-navy)] text-[var(--color-light)]">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 text-xs sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium text-white/85">
              <FiCloud className="ml-2 inline-block" /> الرياض 36°
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium text-white/85">
              1 USD = 3.75 SAR
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-2 font-medium text-white/85">
              <FiGlobe className="ml-2" /> AR / EN
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-right text-[13px] font-medium text-[var(--color-light)]/90">
            <span className="rounded-full border border-[var(--color-gold)]/35 bg-[var(--color-gold)]/12 px-3 py-2 text-[var(--color-light)]">
              رحلتكم محمية بضمان الدرع.
            </span>
            <a href="tel:0532867009" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 transition hover:border-[var(--color-gold)]/40 hover:text-[var(--color-gold)]">
              <FiPhoneCall /> 0532867009
            </a>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="border border-white/10 bg-white/5 text-[var(--color-light)] hover:bg-white/10 hover:text-[var(--color-gold)]"
              aria-label={theme === 'light' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'}
              aria-pressed={theme === 'dark'}
            >
              {theme === 'light' ? <FiMoon /> : <FiSun />}
              {theme === 'light' ? 'داكن' : 'فاتح'}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-[var(--color-light)]/75">
            <span>الطقس والعملات واللغة قابلة للربط بمصادر مباشرة لاحقاً.</span>
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
                  'hover:-translate-y-0.5 hover:border-[var(--color-gold)]/50 hover:text-[var(--color-gold)]'
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