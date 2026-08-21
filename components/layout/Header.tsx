'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FiCloud, FiDollarSign, FiGlobe, FiGrid, FiLogOut, FiMapPin, FiMenu, FiMoon, FiSearch, FiSun, FiType, FiX } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { supabase } from '@/lib/supabase/client';

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
    theme: 'تبديل المظهر',
    accessibility: 'تكبير النص',
    map: 'الخريطة',
    adminDashboard: 'لوحة التحكم',
    partnerDashboard: 'لوحة الشريك',
    providerDashboard: 'لوحة مقدم الخدمة',
    logout: 'تسجيل الخروج',
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
    theme: 'Toggle theme',
    accessibility: 'Increase text size',
    map: 'Map',
    adminDashboard: 'Dashboard',
    partnerDashboard: 'Partner Dashboard',
    providerDashboard: 'Provider Dashboard',
    logout: 'Logout',
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [dashboard, setDashboard] = useState<{ href: string; kind: 'admin' | 'partner' | 'provider' } | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const storedDark = window.localStorage.getItem('dir3com-theme') === 'dark';
      setDark(storedDark);
      document.documentElement.dataset.theme = storedDark ? 'dark' : 'light';
      document.body.dataset.theme = storedDark ? 'dark' : 'light';
      setLargeText(window.localStorage.getItem('dir3com-accessibility') === 'enhanced');
    });
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session-identity', { cache: 'no-store' })
      .then((response) => response.json())
      .then((identity: { authenticated?: boolean; role?: string | null; roleRaw?: string | null }) => {
        if (!active) return;
        setAuthenticated(Boolean(identity.authenticated));
        setDashboard(null);
        if (!identity.authenticated) return;
        const raw = identity.roleRaw?.trim().toLowerCase();
        if (identity.role === 'admin') setDashboard({ href: '/admin', kind: 'admin' });
        else if (identity.role === 'partner') setDashboard({ href: '/partner-portal', kind: 'partner' });
        else if (raw === 'provider' || raw === 'service_provider' || raw === 'supplier') setDashboard({ href: '/provider-portal', kind: 'provider' });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);

    setAuthenticated(false);
    setDashboard(null);
    setMobileOpen(false);

    await fetch('/api/auth/logout', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
    }).catch(() => null);
    await supabase.auth.signOut({ scope: 'local' });

    const identityResponse = await fetch('/api/auth/session-identity', {
      cache: 'no-store',
      credentials: 'same-origin',
    }).catch(() => null);
    const identity = identityResponse?.ok
      ? await identityResponse.json() as { authenticated?: boolean }
      : null;

    if (identity?.authenticated) {
      window.location.reload();
      return;
    }

    window.location.replace('/login');
  }

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    document.body.dataset.theme = next ? 'dark' : 'light';
    window.localStorage.setItem('dir3com-theme', next ? 'dark' : 'light');
  }

  function toggleTextSize() {
    const next = !largeText;
    setLargeText(next);
    document.documentElement.style.fontSize = next ? '106%' : '';
    window.localStorage.setItem('dir3com-accessibility', next ? 'enhanced' : 'standard');
  }

  const utilityClass = 'inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-[#d4af37]/25 bg-white px-2 text-sm font-semibold text-[#2a2118] transition hover:border-[#d4af37] hover:text-[#a66d10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/40';
  const dashboardLabel = dashboard?.kind === 'admin' ? t.adminDashboard : dashboard?.kind === 'partner' ? t.partnerDashboard : t.providerDashboard;

  return (
    <header dir={direction} className="site-header sticky top-0 z-40 border-b border-[#d4af37]/20 bg-[#fffdf9]/95 shadow-[0_8px_28px_rgba(76,53,18,0.07)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-[92px] max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="relative block h-[72px] w-[180px] shrink-0" aria-label="dir3com">
          <Image src="/brand/runtime/dir3com-logo-approved-cropped.png" alt="dir3com — Your shield for tourism" fill preload unoptimized sizes="180px" className="object-contain" />
        </Link>

        <nav aria-label={t.menu} className="hidden min-w-0 flex-1 items-center justify-center xl:flex">
          <div className="flex items-center justify-center gap-5 xl:gap-7">
            {t.nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={`whitespace-nowrap border-b-2 px-0.5 py-2 text-sm font-semibold transition ${active ? 'border-[#c89536] text-[#a66d10]' : 'border-transparent text-[#2a2118] hover:border-[#d4af37]/45 hover:text-[#a66d10]'}`}>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="ms-auto hidden shrink-0 items-center gap-1.5 md:flex" role="group" aria-label={language === 'ar' ? 'أدوات العرض' : 'Display controls'}>
          <Link href="/services#service-search" className={utilityClass} aria-label={t.search}><FiSearch /></Link>
          <Link href="/services#home-weather" className={utilityClass} aria-label={t.weather}><FiCloud /></Link>
          <Link href="/services#home-map" className={utilityClass} aria-label={t.map}><FiMapPin /></Link>
          <Link href="/services#home-currency" className={utilityClass} aria-label={t.currency}><FiDollarSign /></Link>
          <button type="button" onClick={toggleLanguage} className={utilityClass} aria-label={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}><FiGlobe /><span className="ms-1">{language === 'ar' ? 'EN' : 'AR'}</span></button>
          <button type="button" onClick={toggleTheme} className={utilityClass} aria-label={t.theme} aria-pressed={dark}>{dark ? <FiSun /> : <FiMoon />}</button>
          <button type="button" onClick={toggleTextSize} className={utilityClass} aria-label={t.accessibility} aria-pressed={largeText}><FiType /></button>
        </div>

        {dashboard ? <Link href={dashboard.href} className="hidden min-h-10 shrink-0 items-center gap-2 rounded-full border border-[#d4af37]/35 px-3 text-sm font-semibold text-[#2a2118] lg:inline-flex"><FiGrid />{dashboardLabel}</Link> : null}

        {authenticated ? (
          <button type="button" onClick={handleLogout} disabled={loggingOut} className="hidden min-h-11 shrink-0 items-center gap-2 rounded-full bg-[#c89536] px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(200,149,54,0.24)] transition hover:bg-[#b78320] disabled:cursor-wait disabled:opacity-60 sm:inline-flex"><FiLogOut />{t.logout}</button>
        ) : (
          <Link href={loginTarget()} className="hidden min-h-11 shrink-0 items-center rounded-full bg-[#c89536] px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(200,149,54,0.24)] transition hover:bg-[#b78320] sm:inline-flex">{t.signIn}</Link>
        )}

        <button type="button" onClick={() => setMobileOpen((open) => !open)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d4af37]/30 bg-white text-[#2a2118] xl:hidden" aria-label={t.menu} aria-expanded={mobileOpen}>
          {mobileOpen ? <FiX /> : <FiMenu />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-[#d4af37]/20 bg-[#fffdf9] px-4 py-4 xl:hidden">
          <nav className="mx-auto grid max-w-7xl gap-2" aria-label={t.menu}>
            {t.nav.map((item) => <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="rounded-xl border border-[#d4af37]/15 bg-white px-4 py-3 text-sm font-semibold text-[#2a2118]">{item.label}</Link>)}
            <div className="mt-2 flex flex-wrap gap-2 md:hidden">
              <Link href="/services#service-search" className={utilityClass} aria-label={t.search}><FiSearch /></Link>
              <Link href="/services#home-weather" className={utilityClass} aria-label={t.weather}><FiCloud /></Link>
              <Link href="/services#home-map" className={utilityClass} aria-label={t.map}><FiMapPin /></Link>
              <Link href="/services#home-currency" className={utilityClass} aria-label={t.currency}><FiDollarSign /></Link>
              <button type="button" onClick={toggleLanguage} className={utilityClass}><FiGlobe /> {language === 'ar' ? 'EN' : 'AR'}</button>
              <button type="button" onClick={toggleTheme} className={utilityClass}>{dark ? <FiSun /> : <FiMoon />}</button>
              <button type="button" onClick={toggleTextSize} className={utilityClass}><FiType /></button>
            </div>
            {dashboard ? <Link href={dashboard.href} onClick={() => setMobileOpen(false)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#d4af37]/25 bg-white px-4 text-sm font-semibold text-[#2a2118]"><FiGrid />{dashboardLabel}</Link> : null}
            {authenticated ? (
              <button type="button" onClick={handleLogout} disabled={loggingOut} className="mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#c89536] px-5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60 sm:hidden"><FiLogOut />{t.logout}</button>
            ) : (
              <Link href={loginTarget()} className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full bg-[#c89536] px-5 text-sm font-bold text-white sm:hidden">{t.signIn}</Link>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
