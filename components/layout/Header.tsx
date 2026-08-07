'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { FiBell, FiHeart, FiLogOut, FiMenu, FiSearch, FiUser, FiX } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import Dir3LogoLockup from '@/components/branding/Dir3LogoLockup';
import { buttonVariants } from '@/components/ui/button';
import { useSessionIdentity } from '@/hooks/useSessionIdentity';
import { getRoleLabel } from '@/lib/auth/identity-contract';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'الرئيسية', href: '/#home' },
  { label: 'خدماتنا', href: '/services' },
  { label: 'السيارات', href: '/cars' },
  { label: 'الفنادق', href: '/hotels' },
  { label: 'التجارب', href: '/experiences' },
  { label: 'الكونسيرج', href: '/concierge' },
  { label: 'العروض', href: '/offers' },
  { label: 'من نحن', href: '/about' },
  { label: 'تواصل', href: '/contact' },
];

const publicActionLinks = [
  { label: 'البحث', href: '/services', icon: FiSearch },
  { label: 'الدبرة', href: '/#dibrah-section', icon: HiSparkles },
];

const privateActionLinks = [
  { label: 'المفضلة', href: '/my-bookings', icon: FiHeart, accountSection: 'bookings' as const },
  { label: 'التنبيهات', href: '/my-account', icon: FiBell, accountSection: 'account' as const },
];

type AccountSection = 'account' | 'profile' | 'bookings' | 'wallet' | 'documents';

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

function Logo() {
  return <Dir3LogoLockup reveal />;
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { identity, isLoading, refresh } = useSessionIdentity();

  const isAuthenticated = identity.authenticated;
  const isAdmin = identity.isAdmin;
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
    <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[color:var(--color-shell)]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 lg:hidden">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-white/75 text-[var(--color-navy)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="فتح القائمة"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
          >
            {mobileOpen ? <FiX size={18} /> : <FiMenu size={18} />}
          </button>
          <div className="hidden sm:block">
            <Logo />
          </div>
        </div>

        <div className="hidden lg:block">
          <Logo />
        </div>

        <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-white/60 px-3 py-2 lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-[var(--color-navy)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="sm:hidden">
            <Logo />
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {publicActionLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                aria-label={label}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-white/70 text-[var(--color-navy)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
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
                    'inline-flex h-11 w-11 items-center justify-center rounded-full border bg-white/70 text-[var(--color-navy)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                    isActiveAccountLink(accountSection, currentAccountSection)
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
                aria-label="الملف الشخصي"
                className={cn(
                  'inline-flex h-11 w-11 items-center justify-center rounded-full border bg-white/70 text-[var(--color-navy)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
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
                Dashboard
              </Link>
            )}
          </div>

          <div className="hidden md:flex">
            {isLoading ? (
              <span className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-white/70 px-3 text-sm font-medium text-[var(--color-muted)]">
                جاري التحقق...
              </span>
            ) : isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link
                  href={accountHref}
                  className={cn(
                    'inline-flex h-11 items-center gap-2 rounded-full border bg-white/70 px-3 text-[var(--color-navy)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                    accountAreaActive ? 'border-[var(--color-gold)] text-[var(--color-gold)]' : 'border-[color:var(--color-border)]'
                  )}
                  aria-label={`الحساب: ${userDisplayName ?? identity.email ?? 'حسابي'}`}
                >
                  <FiUser size={16} />
                  <span className="max-w-28 truncate text-sm font-medium">{userDisplayName ?? identity.email ?? 'حسابي'}</span>
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
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-white/70 px-3 text-sm font-medium text-[var(--color-navy)] transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-300 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <FiLogOut size={16} />
                  <span>{isSigningOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}</span>
                </button>
              </div>
            ) : (
              <Link href={buildLoginTarget('/my-account')} className={buttonVariants({ variant: 'outline', size: 'default' })}>
                تسجيل الدخول
              </Link>
            )}
          </div>

          <Link href="/booking" className={buttonVariants({ variant: 'gold', size: 'default' })}>
            ابدأ رحلتك
          </Link>
        </div>
      </div>

      {mobileOpen && (
        <div id="mobile-nav-panel" className="border-t border-[color:var(--color-border)] bg-[color:var(--color-shell)]/95 px-4 py-4 shadow-[0_22px_50px_rgba(13,27,42,0.15)] lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-3">
            <nav aria-label="قائمة الجوال" className="grid gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-2xl border border-[color:var(--color-border)] bg-white/75 px-4 py-3 text-sm font-medium text-[var(--color-navy)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
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
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[color:var(--color-border)] bg-white/75 text-[var(--color-navy)] transition-all duration-200 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
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
                      'inline-flex h-12 items-center justify-center rounded-2xl border bg-white/75 text-[var(--color-navy)] transition-all duration-200 active:scale-[0.97] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                      isActiveAccountLink(accountSection, currentAccountSection)
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
                  aria-label="الملف الشخصي"
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'inline-flex h-12 items-center justify-center rounded-2xl border bg-white/75 text-[var(--color-navy)] transition-all duration-200 active:scale-[0.97] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
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
                Dashboard
              </Link>
            )}

            {isLoading ? (
              <span className="rounded-2xl border border-[color:var(--color-border)] bg-white/75 px-4 py-3 text-sm font-medium text-[var(--color-muted)]">
                جاري التحقق...
              </span>
            ) : isAuthenticated ? (
              <div className="grid gap-2">
                <Link
                  href={accountHref}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'rounded-2xl border bg-white/75 px-4 py-3 text-sm font-medium text-[var(--color-navy)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                    accountAreaActive ? 'border-[var(--color-gold)] text-[var(--color-gold)]' : 'border-[color:var(--color-border)]'
                  )}
                >
                  {`حسابي: ${userDisplayName ?? identity.email ?? 'مستخدم'}`}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void handleSignOut();
                  }}
                  disabled={isSigningOut}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--color-border)] bg-white/75 px-4 py-3 text-sm font-medium text-[var(--color-navy)] transition hover:border-rose-300 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <FiLogOut size={16} />
                  <span>{isSigningOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}</span>
                </button>
              </div>
            ) : (
              <Link
                href={buildLoginTarget('/my-account')}
                onClick={() => setMobileOpen(false)}
                className={buttonVariants({ variant: 'outline', size: 'default' })}
              >
                تسجيل الدخول
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
