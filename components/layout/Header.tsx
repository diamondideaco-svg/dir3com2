'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { FiCloud, FiCompass, FiDollarSign, FiEye, FiGlobe, FiMenu, FiMoon, FiSearch, FiSun, FiType, FiX } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const copy = {
  ar: {
    nav: [
      { label: 'الخدمات', href: '/services' },
      { label: 'السيارات', href: '/services/drive' },
      { label: 'الفنادق', href: '/services/stay' },
      { label: 'التجارب', href: '/services/concierge' },
      { label: 'العروض', href: '/offers' },
      { label: 'تواصل', href: '/contact' },
    ],
    signIn: 'تسجيل الدخول',
    menu: 'القائمة الرئيسية',
    search: 'البحث',
    weather: 'الطقس',
    currency: 'العملات',
    maps: 'الخريطة',
    theme: 'تبديل المظهر',
    accessibility: 'إمكانية الوصول',
    textSize: 'تكبير النص',
    contrast: 'المظهر عالي التباين',
    closeAccessibility: 'إغلاق لوحة إمكانية الوصول',
  },
  en: {
    nav: [
      { label: 'Services', href: '/services' },
      { label: 'Cars', href: '/services/drive' },
      { label: 'Hotels', href: '/services/stay' },
      { label: 'Experiences', href: '/services/concierge' },
      { label: 'Offers', href: '/offers' },
      { label: 'Contact', href: '/contact' },
    ],
    signIn: 'Sign in',
    menu: 'Main navigation',
    search: 'Search',
    weather: 'Weather',
    currency: 'Currency',
    maps: 'Maps',
    theme: 'Toggle theme',
    accessibility: 'Accessibility',
    textSize: 'Larger text',
    contrast: 'Contrast theme',
    closeAccessibility: 'Close accessibility panel',
  },
} as const;

function loginTarget() {
  const destination = encodeURIComponent('/my-account');
  return `/login?redirect=${destination}&next=${destination}`;
}

export default function Header() {
  const pathname = usePathname();
  const { language, direction, toggleLanguage } = useLanguage();
  const t = copy[language];
  const isHome = pathname === '/';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [accessibilityPanelStyle, setAccessibilityPanelStyle] = useState<CSSProperties>();
  const accessibilityTriggerRef = useRef<HTMLButtonElement | null>(null);
  const accessibilityFirstControlRef = useRef<HTMLButtonElement | null>(null);
  const accessibilityPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const storedDark = window.localStorage.getItem('dir3com-theme') === 'dark';
      const storedLargeText = window.localStorage.getItem('dir3com-accessibility') === 'enhanced';
      setDark(storedDark);
      setLargeText(storedLargeText);
      document.documentElement.dataset.theme = storedDark ? 'dark' : 'light';
      document.documentElement.style.fontSize = storedLargeText ? '106%' : '';
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/public/runtime?lang=${language}&currency=SAR`, { cache: 'no-store' })
      .then((response) => response.json() as Promise<{ weather?: { temperature?: number | null } }>)
      .then((payload) => {
        if (mounted) setTemperature(typeof payload.weather?.temperature === 'number' ? payload.weather.temperature : null);
      })
      .catch(() => {
        if (mounted) setTemperature(null);
      });
    return () => {
      mounted = false;
    };
  }, [language]);

  const positionAccessibilityPanel = useCallback((trigger: HTMLButtonElement) => {
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    const top = Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - 230));
    setAccessibilityPanelStyle({ left, top, width, padding: '1rem', boxSizing: 'border-box' });
  }, []);

  useEffect(() => {
    if (!accessibilityOpen) return;

    accessibilityFirstControlRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAccessibilityOpen(false);
        accessibilityTriggerRef.current?.focus();
      }
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (accessibilityPanelRef.current?.contains(target) || accessibilityTriggerRef.current?.contains(target)) return;
      setAccessibilityOpen(false);
    }

    function repositionPanel() {
      if (accessibilityTriggerRef.current) positionAccessibilityPanel(accessibilityTriggerRef.current);
    }

    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', repositionPanel);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', repositionPanel);
    };
  }, [accessibilityOpen, positionAccessibilityPanel]);

  function toggleAccessibility(trigger: HTMLButtonElement) {
    accessibilityTriggerRef.current = trigger;
    positionAccessibilityPanel(trigger);
    setAccessibilityOpen((open) => !open);
  }

  function handleAccessibilityKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleAccessibility(event.currentTarget);
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    window.localStorage.setItem('dir3com-theme', next ? 'dark' : 'light');
  }

  function toggleTextSize() {
    const next = !largeText;
    setLargeText(next);
    document.documentElement.style.fontSize = next ? '106%' : '';
    window.localStorage.setItem('dir3com-accessibility', next ? 'enhanced' : 'standard');
  }

  function navigateToSection(path: string, id: string) {
    const target = pathname === path ? document.getElementById(id) : null;
    if (target) {
      target.scrollIntoView({ block: 'center' });
      return;
    }
    window.location.assign(`${path}#${id}`);
  }

  const utilityClass = 'inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-[#d4af37]/25 bg-white px-2 text-sm font-semibold text-[#2a2118] transition hover:border-[#d4af37] hover:text-[#a66d10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/40';

  return (
    <header dir={direction} className={`sticky top-0 z-40 border-b border-[#d4af37]/20 ${isHome ? 'border-transparent bg-transparent shadow-none backdrop-blur-none' : 'bg-[#fffdf9]/95 shadow-[0_8px_28px_rgba(76,53,18,0.07)] backdrop-blur-xl'}`}>
      <div className="mx-auto flex min-h-[88px] max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="relative block h-[68px] w-[176px] shrink-0" aria-label="dir3com">
          <Image src="/brand/runtime/dir3com-logo-approved-cropped.png" alt="dir3com — Your shield for tourism" fill priority unoptimized sizes="190px" className="object-contain" />
        </Link>

        <nav aria-label={t.menu} className="hidden min-w-0 flex-1 items-center justify-center xl:flex">
          <div className="flex items-center gap-1 rounded-full border border-[#d4af37]/20 bg-white p-1.5 shadow-[0_6px_20px_rgba(76,53,18,0.05)]">
            {t.nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${active ? 'bg-[#d4af37] text-white' : 'text-[#2a2118] hover:bg-[#d4af37]/10 hover:text-[#a66d10]'}`}>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="ms-auto hidden shrink-0 items-center gap-2 rounded-2xl border border-[#d4af37]/20 bg-white/80 p-1.5 md:flex" role="group" aria-label={language === 'ar' ? 'أدوات العرض' : 'Display controls'}>
          <button type="button" onClick={() => navigateToSection(isHome ? '/' : '/services', 'service-search')} className={utilityClass} aria-label={t.search}><FiSearch /></button>
          <button type="button" onClick={() => navigateToSection('/services', 'home-weather')} className={`${utilityClass} gap-1.5`} aria-label={t.weather}><FiCloud />{temperature !== null ? <span>{Math.round(temperature)}°C</span> : null}</button>
          <button type="button" onClick={() => navigateToSection('/services', 'home-currency')} className={utilityClass} aria-label={t.currency}><FiDollarSign /></button>
          <a href="https://www.google.com/maps/search/?api=1&query=Riyadh%2C%20Saudi%20Arabia" target="_blank" rel="noreferrer noopener" className={utilityClass} aria-label={t.maps}><FiCompass /></a>
          <button type="button" onClick={toggleLanguage} className={utilityClass} aria-label={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}><FiGlobe /><span className="ms-1">{language === 'ar' ? 'EN' : 'AR'}</span></button>
          <button type="button" onClick={(event) => toggleAccessibility(event.currentTarget)} onKeyDown={handleAccessibilityKeyDown} className={utilityClass} aria-label={t.accessibility} aria-expanded={accessibilityOpen} aria-controls="header-accessibility-panel"><FiEye /></button>
        </div>

        <Link href={loginTarget()} className="hidden min-h-11 shrink-0 items-center rounded-full bg-[#c89536] px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(200,149,54,0.24)] transition hover:bg-[#b78320] sm:inline-flex">
          {t.signIn}
        </Link>

        <button type="button" onClick={() => setMobileOpen((open) => !open)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#d4af37]/30 bg-white text-[#2a2118] xl:hidden" aria-label={t.menu} aria-expanded={mobileOpen}>
          {mobileOpen ? <FiX /> : <FiMenu />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-[#d4af37]/20 bg-[#fffdf9] px-4 py-4 xl:hidden">
          <nav className="mx-auto grid max-w-7xl gap-2" aria-label={t.menu}>
            {t.nav.map((item) => <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="rounded-xl border border-[#d4af37]/15 bg-white px-4 py-3 text-sm font-semibold text-[#2a2118]">{item.label}</Link>)}
            <div className="mt-2 flex flex-wrap gap-2 md:hidden">
              <button type="button" onClick={() => navigateToSection(isHome ? '/' : '/services', 'service-search')} className={utilityClass} aria-label={t.search}><FiSearch /></button>
              <button type="button" onClick={() => navigateToSection('/services', 'home-weather')} className={`${utilityClass} gap-1.5`} aria-label={t.weather}><FiCloud />{temperature !== null ? <span>{Math.round(temperature)}°C</span> : null}</button>
              <button type="button" onClick={() => navigateToSection('/services', 'home-currency')} className={utilityClass} aria-label={t.currency}><FiDollarSign /></button>
              <a href="https://www.google.com/maps/search/?api=1&query=Riyadh%2C%20Saudi%20Arabia" target="_blank" rel="noreferrer noopener" className={utilityClass} aria-label={t.maps}><FiCompass /></a>
              <button type="button" onClick={toggleLanguage} className={utilityClass} aria-label={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}><FiGlobe /> {language === 'ar' ? 'EN' : 'AR'}</button>
              <button type="button" onClick={(event) => toggleAccessibility(event.currentTarget)} onKeyDown={handleAccessibilityKeyDown} className={`${utilityClass} min-h-11 gap-2 px-3`} aria-label={t.accessibility} aria-expanded={accessibilityOpen} aria-controls="header-accessibility-panel"><FiEye /><span>{t.accessibility}</span></button>
            </div>
            <Link href={loginTarget()} className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full bg-[#c89536] px-5 text-sm font-bold text-white sm:hidden">{t.signIn}</Link>
          </nav>
        </div>
      ) : null}

      {accessibilityOpen ? (
        <div ref={accessibilityPanelRef} id="header-accessibility-panel" role="dialog" aria-modal="false" aria-labelledby="header-accessibility-title" style={accessibilityPanelStyle} className="fixed z-50 max-w-[calc(100vw-1rem)] rounded-2xl border border-[#d4af37]/30 bg-[#fffdf9] p-4 text-[#2a2118] shadow-[0_18px_48px_rgba(76,53,18,0.2)]">
          <div className="flex items-center justify-between gap-3">
            <h2 id="header-accessibility-title" className="text-base font-bold">{t.accessibility}</h2>
            <button type="button" onClick={() => setAccessibilityOpen(false)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#d4af37]/25 bg-white transition hover:border-[#d4af37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]" aria-label={t.closeAccessibility}><FiX /></button>
          </div>
          <div className="mt-3 grid gap-2">
            <button ref={accessibilityFirstControlRef} type="button" onClick={toggleTextSize} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#d4af37]/25 bg-white px-4 py-3 text-sm font-semibold transition hover:border-[#d4af37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]" aria-pressed={largeText}>
              <span className="inline-flex items-center gap-2"><FiType />{t.textSize}</span>
              <span aria-hidden="true">{largeText ? '✓' : '+'}</span>
            </button>
            <button type="button" onClick={toggleTheme} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#d4af37]/25 bg-white px-4 py-3 text-sm font-semibold transition hover:border-[#d4af37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]" aria-pressed={dark}>
              <span className="inline-flex items-center gap-2">{dark ? <FiSun /> : <FiMoon />}{t.contrast}</span>
              <span aria-hidden="true">{dark ? '✓' : '○'}</span>
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
