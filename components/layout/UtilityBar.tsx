'use client';

import { type ComponentType, useEffect, useState } from 'react';
import Link from 'next/link';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaTiktok, FaWhatsapp, FaXTwitter } from 'react-icons/fa6';
import { FiCloud, FiGlobe, FiMoon, FiPhoneCall, FiSun } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { Button } from '@/components/ui/button';
import { getOfficialSocialLinks } from '@/lib/config/social';
import { cn } from '@/lib/utils';

type ThemeMode = 'light' | 'dark';

const socialIconByLabel: Record<string, ComponentType<{ size?: number }>> = {
  WhatsApp: FaWhatsapp,
  Instagram: FaInstagram,
  TikTok: FaTiktok,
  X: FaXTwitter,
  Facebook: FaFacebookF,
  LinkedIn: FaLinkedinIn,
  واتساب: FaWhatsapp,
};

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
}

const copy = {
  ar: {
    weatherUnavailable: 'الطقس غير متاح حاليا',
    fxUnavailable: 'سعر الصرف غير متاح حاليا',
    languageButton: 'AR / EN',
    languageLabel: 'تبديل اللغة إلى الإنجليزية',
    shield: 'درعك الحامي للسياحة.',
    utilityNote: 'dir3com تجمع حجوزات السفر والخدمات والعروض في تجربة واضحة وسهلة التنقل.',
    darkMode: 'تفعيل الوضع الداكن',
    lightMode: 'تفعيل الوضع الفاتح',
    dark: 'داكن',
    light: 'فاتح',
  },
  en: {
    weatherUnavailable: 'Weather unavailable',
    fxUnavailable: 'FX rate unavailable',
    languageButton: 'EN / AR',
    languageLabel: 'Switch language to Arabic',
    shield: 'Your protective shield for tourism.',
    utilityNote: 'dir3com brings travel booking, services, and offers into one clear and easy-to-navigate journey.',
    darkMode: 'Enable dark mode',
    lightMode: 'Enable light mode',
    dark: 'Dark',
    light: 'Light',
  },
} as const;

export default function UtilityBar() {
  const { language, direction, toggleLanguage } = useLanguage();
  const socialLinks = getOfficialSocialLinks(language);
  const [weatherText, setWeatherText] = useState('');
  const [fxText, setFxText] = useState('');

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

  useEffect(() => {
    let mounted = true;

    const loadRuntimeContext = async () => {
      try {
        const response = await fetch(`/api/public/runtime?lang=${language}&currency=SAR`, { method: 'GET', cache: 'no-store' });
        const payload = (await response.json().catch(() => null)) as {
          weather?: { cityLabel?: string; temperature?: number | null; condition?: string; unit?: 'c' | 'f' };
          fx?: { available?: boolean; quote?: { source?: string; target?: string; rate?: number }; message?: string | null };
        } | null;

        if (!mounted || !payload) {
          return;
        }

        if (payload.weather?.temperature == null || !payload.weather.cityLabel) {
          setWeatherText(copy[language].weatherUnavailable);
        } else {
          const unitSymbol = payload.weather.unit === 'f' ? '°F' : '°C';
          const condition = payload.weather.condition ? ` - ${payload.weather.condition}` : '';
          setWeatherText(`${payload.weather.cityLabel} ${payload.weather.temperature}${unitSymbol}${condition}`);
        }

        if (!payload.fx?.available || !payload.fx.quote?.rate || !payload.fx.quote.source || !payload.fx.quote.target) {
          setFxText(payload.fx?.message || copy[language].fxUnavailable);
        } else {
          setFxText(`1 ${payload.fx.quote.source} = ${payload.fx.quote.rate.toFixed(2)} ${payload.fx.quote.target}`);
        }
      } catch {
        if (!mounted) {
          return;
        }
        setWeatherText(copy[language].weatherUnavailable);
        setFxText(copy[language].fxUnavailable);
      }
    };

    void loadRuntimeContext();

    return () => {
      mounted = false;
    };
  }, [language]);

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
              <FiCloud /> {weatherText || t.weatherUnavailable}
            </span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-2 font-medium text-white/92 shadow-[0_10px_24px_rgba(0,0,0,0.12)]">
              {fxText || t.fxUnavailable}
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
            {socialLinks.map(({ href, label }) => {
              const Icon = socialIconByLabel[label] ?? FaWhatsapp;
              return (
                <Link
                  key={`${label}:${href}`}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={label}
                  className={cn(
                    'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition',
                    'hover:-translate-y-0.5 hover:border-[var(--color-gold)]/50 hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45'
                  )}
                >
                  <Icon size={14} />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}