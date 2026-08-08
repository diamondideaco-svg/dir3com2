'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { FiBell, FiHeart, FiLogOut, FiMenu, FiSearch, FiShield, FiUser, FiX } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { buttonVariants } from '@/components/ui/button';
import { useSessionIdentity } from '@/hooks/useSessionIdentity';
import { getRoleLabel } from '@/lib/auth/identity-contract';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type AccountSection = 'account' | 'profile' | 'bookings' | 'wallet' | 'documents';

type HeaderActionLink = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  requiresAuth?: boolean;
  accountSection?: AccountSection;
};

const copy = {
  ar: {
    navItems: [
      { label: 'الرئيسية', href: '/#home' },
      { label: 'خدماتنا', href: '/services' },
      { label: 'السيارات', href: '/cars' },
      { label: 'الفنادق', href: '/hotels' },
      { label: 'التجارب', href: '/experiences' },
      { label: 'الكونسيرج', href: '/concierge' },
      { label: 'العروض', href: '/offers' },
      { label: 'من نحن', href: '/about' },
      { label: 'تواصل', href: '/contact' },
    ],
    actionLinks: [
      { label: 'البحث', href: '/services', icon: FiSearch },
      { label: 'الدبرة', href: '/#dibrah-section', icon: HiSparkles },
      { label: 'المفضلة', href: '/my-bookings', icon: FiHeart, requiresAuth: true, accountSection: 'bookings' as const },
      { label: 'التنبيهات', href: '/my-account', icon: FiBell, requiresAuth: true, accountSection: 'account' as const },
    ],
    guest: 'ضيف',
    tagline: 'درعك الحامي للسياحة.',
    badge: 'الهوية التنفيذية الجديدة',
    openMenu: 'فتح القائمة',
    mainNav: 'التنقل الرئيسي',
    login: 'تسجيل الدخول',
    accountPrefix: 'الحساب',
    profile: 'الملف الشخصي',
    startJourney: 'ابدأ رحلتك',
    mobileNav: 'قائمة الجوال',
    myAccount: 'حسابي',
    actionsLabel: 'اختصارات الخدمة',
    checking: 'جاري التحقق...',
    dashboard: 'لوحة التحكم',
    logout: 'تسجيل الخروج',
    signingOut: 'جاري تسجيل الخروج...',
  },
  en: {
    navItems: [
      { label: 'Home', href: '/#home' },
      { label: 'Services', href: '/services' },
      { label: 'Cars', href: '/cars' },
      { label: 'Hotels', href: '/hotels' },
      { label: 'Experiences', href: '/experiences' },
      { label: 'Concierge', href: '/concierge' },
      { label: 'Offers', href: '/offers' },
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
    actionLinks: [
      { label: 'Search', href: '/services', icon: FiSearch },
      { label: 'DABRA', href: '/#dibrah-section', icon: HiSparkles },
      { label: 'Favorites', href: '/my-bookings', icon: FiHeart, requiresAuth: true, accountSection: 'bookings' as const },
      { label: 'Alerts', href: '/my-account', icon: FiBell, requiresAuth: true, accountSection: 'account' as const },
    ],
    guest: 'Guest',
    tagline: 'Your protective shield for tourism.',
    badge: 'New executive identity',
    openMenu: 'Open menu',
    mainNav: 'Main navigation',
    login: 'Sign in',
    accountPrefix: 'Account',
    profile: 'Profile',
    startJourney: 'Start your journey',
    mobileNav: 'Mobile navigation',
    myAccount: 'My account',
    actionsLabel: 'Service shortcuts',
    checking: 'Checking...',
    dashboard: 'Dashboard',
    logout: 'Sign out',
    signingOut: 'Signing out...',
  },
} as const;

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

function normalizePathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function getAccountSection(pathname: string): AccountSection | null {
  const normalizedPath = normalizePathname(pathname);

  if (normalizedPath === '/my-account') return 'account';
  if (normalizedPath === '/my-profile' || normalizedPath === '/profile') return 'profile';
  if (normalizedPath.startsWith('/my-bookings')) return 'bookings';
  if (normalizedPath === '/my-wallet') return 'wallet';
  if (normalizedPath === '/my-documents') return 'documents';

  return null;
}

function isActiveAccountLink(target: AccountSection | null, current: AccountSection | null) {
  return Boolean(target && current && target === current);
}

function pickUserDisplayName(displayName: string | null, email: string | null) {
  if (displayName?.trim()) {
    return displayName.trim();
  }

  if (!email?.trim()) {
    return null;
  }

  return email.split('@')[0] || null;
}

function isActiveNavItem(pathname: string, href: string) {
  const normalizedPath = normalizePathname(pathname);

  if (href.startsWith('/#')) {
    return normalizedPath === '/';
  }

  return normalizedPath === href || normalizedPath.startsWith(`${href}/`);
}

function Logo({ tagline, direction }: { tagline: string; direction: 'rtl' | 'ltr' }) {
  return (
    <Link href="/#home" className="flex items-center gap-3" aria-label="dir3com">
      <span className="flex h-12 w-12 items-center justify-center rounded-[1.35rem] bg-[var(--brand-gradient)] text-[var(--color-light)] shadow-[0_18px_36px_rgba(16,32,51,0.22)]">
        <FiShield size={22} />
      </span>
      <span className={`flex flex-col ${direction === 'rtl' ? 'text-right' : 'text-left'}`}>
        <span className="font-[var(--font-display)] text-2xl font-semibold leading-none text-[var(--color-navy)]">dir3com</span>
        <span className="mt-1 text-[11px] font-semibold tracking-[0.14em] text-[var(--color-muted)]">{tagline}</span>
      </span>
    </Link>
  );
}

export default function Header() {
  const { language, direction } = useLanguage();
  const t = copy[language];
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { identity, isLoading, refresh } = useSessionIdentity();

  const isAuthenticated = identity.authenticated;
  const isAdmin = identity.isAdmin;
  const navItems = t.navItems;
  const publicActionLinks = t.actionLinks.slice(0, 2) as readonly HeaderActionLink[];
  const privateActionLinks = t.actionLinks.slice(2) as readonly HeaderActionLink[];
  const userDisplayName = pickUserDisplayName(identity.displayName, identity.email);

  const accountHref = isAuthenticated ? '/my-account' : buildLoginTarget('/my-account');
  const profileHref = isAuthenticated ? '/my-profile' : buildLoginTarget('/my-profile');
  const currentAccountSection = isAuthenticated ? getAccountSection(pathname) : null;
  const accountAreaActive = Boolean(currentAccountSection);
  const roleLabel = getRoleLabel(identity.role, identity.roleRaw);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    try {
      setIsSigningOut(true);
      await supabase.auth.signOut();
      await refresh();
      setMobileOpen(false);
      router.push('/login?redirect=%2Fmy-account&next=%2Fmy-account');
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[color:var(--color-shell)]/86 backdrop-blur-2xl" dir={direction}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 lg:hidden">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[var(--color-card-strong)]/85 text-[var(--color-navy)] shadow-[0_10px_24px_rgba(16,32,51,0.08)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={t.openMenu}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
          >
            {mobileOpen ? <FiX size={18} /> : <FiMenu size={18} />}
          </button>
          <div className="hidden sm:block">
            <Logo tagline={t.tagline} direction={direction} />
          </div>
        </div>

        <div className="hidden lg:block">
          <Logo tagline={t.tagline} direction={direction} />
        </div>

        <nav aria-label={t.mainNav} className="hidden items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[var(--color-card-strong)]/84 p-1.5 shadow-[0_14px_34px_rgba(16,32,51,0.07)] lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                isActiveNavItem(pathname, item.href)
                  ? 'bg-[var(--brand-gradient)] text-[var(--color-light)] shadow-[0_12px_26px_rgba(16,32,51,0.18)]'
                  : 'text-[var(--color-navy)] hover:bg-[var(--color-surface)] hover:text-[var(--color-gold)]'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="sm:hidden">
            <Logo tagline={t.tagline} direction={direction} />
          </div>

          <div className="hidden items-center gap-2 md:flex" aria-label={t.actionsLabel}>
            {publicActionLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                aria-label={label}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-[var(--color-card-strong)]/84 text-[var(--color-navy)] shadow-[0_10px_24px_rgba(16,32,51,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
              >
                <Icon size={18} />
              </Link>
            ))}

            {!isLoading && isAuthenticated &&
              privateActionLinks.map(({ href, label, icon: Icon, accountSection }) => (
                <Link
                  key={label}
                  href={href}
                  aria-label={label}
                  className={cn(
                    'inline-flex h-11 w-11 items-center justify-center rounded-full border bg-[var(--color-card-strong)]/84 text-[var(--color-navy)] shadow-[0_10px_24px_rgba(16,32,51,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                    isActiveAccountLink(accountSection ?? null, currentAccountSection)
                      ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                      : 'border-[color:var(--color-border)]'
                  )}
                >
                  <Icon size={18} />
                </Link>
              ))}

            {!isLoading && isAuthenticated && (
              <Link
                href={profileHref}
                aria-label={t.profile}
                className={cn(
                  'inline-flex h-11 w-11 items-center justify-center rounded-full border bg-[var(--color-card-strong)]/84 text-[var(--color-navy)] shadow-[0_10px_24px_rgba(16,32,51,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                  isActiveAccountLink('profile', currentAccountSection)
                    ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                    : 'border-[color:var(--color-border)]'
                )}
              >
                <FiUser size={18} />
              </Link>
            )}

            {!isLoading && isAuthenticated && isAdmin && (
              <Link
                href="/dashboard"
                className="rounded-full border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-gold)]"
              >
                {t.dashboard}
              </Link>
            )}
          </div>

          <div className="hidden xl:flex xl:flex-col xl:items-end xl:gap-1 xl:pe-2">
            <span className="rounded-full border border-[var(--color-gold)]/18 bg-[var(--color-gold)]/10 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-[var(--color-gold)]">
              {t.badge}
            </span>
            <span className="text-[11px] font-medium text-[var(--color-muted)]">dir3com</span>
          </div>

          <div className="hidden md:flex">
            {isLoading ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[var(--color-card-strong)]/84 px-3 text-sm font-medium text-[var(--color-muted)] shadow-[0_10px_24px_rgba(16,32,51,0.08)]">
                {t.checking}
              </span>
            ) : isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link
                  href={accountHref}
                  className={cn(
                    'inline-flex h-11 items-center gap-2 rounded-full border bg-[var(--color-card-strong)]/84 px-3 text-[var(--color-navy)] shadow-[0_10px_24px_rgba(16,32,51,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                    accountAreaActive ? 'border-[var(--color-gold)] text-[var(--color-gold)]' : 'border-[color:var(--color-border)]'
                  )}
                  aria-label={`${t.accountPrefix}: ${userDisplayName ?? identity.email ?? t.myAccount}`}
                >
                  <FiUser size={16} />
                  <span className="max-w-28 truncate text-sm font-medium">{userDisplayName ?? identity.email ?? t.myAccount}</span>
                  <span className="rounded-full border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-gold)]">
                    {roleLabel}
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    void handleSignOut();
                  }}
                  disabled={isSigningOut}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[var(--color-card-strong)]/84 px-3 text-sm font-medium text-[var(--color-navy)] shadow-[0_10px_24px_rgba(16,32,51,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <FiLogOut size={16} />
                  <span>{isSigningOut ? t.signingOut : t.logout}</span>
                </button>
              </div>
            ) : (
              <Link href={buildLoginTarget('/my-account')} className={buttonVariants({ variant: 'outline', size: 'default' })}>
                {t.login}
              </Link>
            )}
          </div>

          <div className="hidden sm:block">
            <Link href="/booking" className={buttonVariants({ variant: 'gold', size: 'default' })}>
              {t.startJourney}
            </Link>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div id="mobile-nav-panel" className="border-t border-[color:var(--color-border)] bg-[color:var(--color-shell)]/95 px-4 py-4 shadow-[0_22px_50px_rgba(16,32,51,0.15)] lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-3">
            <div className="rounded-[28px] border border-[color:var(--color-border)] bg-[var(--color-card-strong)]/84 p-4 shadow-[0_16px_34px_rgba(16,32,51,0.08)]">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-[var(--color-gold)]">{t.badge}</p>
              <p className="mt-2 font-[var(--font-display)] text-2xl font-semibold text-[var(--color-navy)]">dir3com</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">{t.tagline}</p>
            </div>

            <nav aria-label={t.mobileNav} className="grid gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-card-strong)]/84 px-4 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                    isActiveNavItem(pathname, item.href)
                      ? 'border-[var(--color-gold)] bg-[var(--color-surface)] text-[var(--color-gold)]'
                      : 'text-[var(--color-navy)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {publicActionLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={label}
                  href={href}
                  aria-label={label}
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-card-strong)]/84 text-[var(--color-navy)] transition-all duration-200 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
                >
                  <Icon size={18} />
                </Link>
              ))}

              {!isLoading && isAuthenticated &&
                privateActionLinks.map(({ href, label, icon: Icon, accountSection }) => (
                  <Link
                    key={label}
                    href={href}
                    aria-label={label}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'inline-flex h-12 items-center justify-center rounded-2xl border bg-[var(--color-card-strong)]/84 text-[var(--color-navy)] transition-all duration-200 active:scale-[0.97] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                      isActiveAccountLink(accountSection ?? null, currentAccountSection)
                        ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                        : 'border-[color:var(--color-border)]'
                    )}
                  >
                    <Icon size={18} />
                  </Link>
                ))}

              {!isLoading && isAuthenticated && (
                <Link
                  href={profileHref}
                  aria-label={t.profile}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'inline-flex h-12 items-center justify-center rounded-2xl border bg-[var(--color-card-strong)]/84 text-[var(--color-navy)] transition-all duration-200 active:scale-[0.97] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                    isActiveAccountLink('profile', currentAccountSection)
                      ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                      : 'border-[color:var(--color-border)]'
                  )}
                >
                  <FiUser size={18} />
                </Link>
              )}
            </div>

            {!isLoading && isAuthenticated && isAdmin && (
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="rounded-2xl border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 px-4 py-3 text-center text-sm font-semibold text-[var(--color-gold)]"
              >
                {t.dashboard}
              </Link>
            )}

            {isLoading ? (
              <span className="rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-card-strong)]/84 px-4 py-3 text-sm font-medium text-[var(--color-muted)]">
                {t.checking}
              </span>
            ) : isAuthenticated ? (
              <div className="grid gap-2">
                <Link
                  href={accountHref}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'rounded-2xl border bg-[var(--color-card-strong)]/84 px-4 py-3 text-sm font-medium text-[var(--color-navy)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                    accountAreaActive ? 'border-[var(--color-gold)] text-[var(--color-gold)]' : 'border-[color:var(--color-border)]'
                  )}
                >
                  {`${t.myAccount}: ${userDisplayName ?? identity.email ?? t.guest}`}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void handleSignOut();
                  }}
                  disabled={isSigningOut}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--color-border)] bg-[var(--color-card-strong)]/84 px-4 py-3 text-sm font-medium text-[var(--color-navy)] transition hover:border-rose-300 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <FiLogOut size={16} />
                  <span>{isSigningOut ? t.signingOut : t.logout}</span>
                </button>
              </div>
            ) : (
              <Link
                href={buildLoginTarget('/my-account')}
                onClick={() => setMobileOpen(false)}
                className={buttonVariants({ variant: 'outline', size: 'default' })}
              >
                {t.login}
              </Link>
            )}

            <Link href="/booking" onClick={() => setMobileOpen(false)} className={buttonVariants({ variant: 'gold', size: 'default' })}>
              {t.startJourney}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
