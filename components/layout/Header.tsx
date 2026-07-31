'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { FiBell, FiHeart, FiMenu, FiSearch, FiShield, FiUser, FiX } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { buttonVariants } from '@/components/ui/button';
import { useSupabase } from '@/app/providers';
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

const actionLinks = [
  { label: 'البحث', href: '/services', icon: FiSearch },
  { label: 'الدبرة', href: '/#dibrah-section', icon: HiSparkles },
  { label: 'المفضلة', href: '/my-bookings', icon: FiHeart, requiresAuth: true, accountSection: 'bookings' },
  { label: 'التنبيهات', href: '/my-account', icon: FiBell, requiresAuth: true, accountSection: 'account' },
];

type AccountSection = 'account' | 'profile' | 'bookings' | 'wallet' | 'documents';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

function resolveActionHref(href: string, requiresAuth: boolean | undefined, hasUser: boolean) {
  if (requiresAuth && !hasUser) {
    return buildLoginTarget(href);
  }

  return href;
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

function getUserDisplayName(rawName: string | null | undefined, email: string | null | undefined) {
  const trimmedName = rawName?.trim();
  if (trimmedName) {
    return trimmedName;
  }

  const trimmedEmail = email?.trim();
  if (!trimmedEmail) {
    return 'ضيف';
  }

  return trimmedEmail.split('@')[0] || 'ضيف';
}

function Logo() {
  return (
    <Link href="/#home" className="flex items-center gap-3" aria-label="dir3com">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-navy)] text-[var(--color-gold)] shadow-[0_16px_32px_rgba(13,27,42,0.18)]">
        <FiShield size={22} />
      </span>
      <span className="flex flex-col text-right">
        <span className="font-[var(--font-display)] text-2xl font-semibold leading-none text-[var(--color-navy)]">dir3com</span>
        <span className="mt-1 text-xs font-medium tracking-[0.18em] text-[var(--color-muted)]">درعكم للسياحة</span>
      </span>
    </Link>
  );
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { user, isLoading } = useSupabase();

  const userDisplayName = getUserDisplayName(
    (user?.user_metadata?.full_name_ar as string | undefined) ??
    (user?.user_metadata?.full_name as string | undefined) ??
      (user?.user_metadata?.name as string | undefined) ??
      (user?.user_metadata?.preferred_username as string | undefined),
    user?.email
  );

  const accountHref = user ? '/my-account' : buildLoginTarget('/my-account');
  const profileHref = user ? '/my-profile' : buildLoginTarget('/my-profile');
  const currentAccountSection = user ? getAccountSection(pathname) : null;
  const accountAreaActive = Boolean(currentAccountSection);

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
          <div className="hidden md:flex">
            <Link
              href={accountHref}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-full border bg-white/70 px-3 text-[var(--color-navy)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                accountAreaActive ? 'border-[var(--color-gold)] text-[var(--color-gold)]' : 'border-[color:var(--color-border)]'
              )}
              aria-label={user ? `الحساب: ${userDisplayName}` : 'تسجيل الدخول'}
            >
              <FiUser size={16} />
              <span className="max-w-28 truncate text-sm font-medium">{isLoading ? '...' : user ? userDisplayName : 'تسجيل الدخول'}</span>
            </Link>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {actionLinks.map(({ href, label, icon: Icon, requiresAuth, accountSection }) => (
              <Link
                key={label}
                href={resolveActionHref(href, requiresAuth, Boolean(user))}
                aria-label={label}
                className={cn(
                  'inline-flex h-11 w-11 items-center justify-center rounded-full border bg-white/70 text-[var(--color-navy)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                  isActiveAccountLink(accountSection as AccountSection | undefined ?? null, currentAccountSection)
                    ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                    : 'border-[color:var(--color-border)]'
                )}
              >
                <Icon size={18} />
              </Link>
            ))}
            <Link
              href={profileHref}
              aria-label={user ? 'الملف الشخصي' : 'تسجيل الدخول'}
              className={cn(
                'inline-flex h-11 w-11 items-center justify-center rounded-full border bg-white/70 text-[var(--color-navy)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                isActiveAccountLink('profile', currentAccountSection)
                  ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                  : 'border-[color:var(--color-border)]'
              )}
            >
              <FiUser size={18} />
            </Link>
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
              {actionLinks.map(({ href, label, icon: Icon, requiresAuth, accountSection }) => (
                <Link
                  key={label}
                  href={resolveActionHref(href, requiresAuth, Boolean(user))}
                  aria-label={label}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'inline-flex h-12 items-center justify-center rounded-2xl border bg-white/75 text-[var(--color-navy)] transition-all duration-200 active:scale-[0.97]',
                    isActiveAccountLink(accountSection as AccountSection | undefined ?? null, currentAccountSection)
                      ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                      : 'border-[color:var(--color-border)]',
                    'hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40'
                  )}
                >
                  <Icon size={18} />
                </Link>
              ))}
              <Link
                href={profileHref}
                aria-label={user ? 'الملف الشخصي' : 'تسجيل الدخول'}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'inline-flex h-12 items-center justify-center rounded-2xl border bg-white/75 text-[var(--color-navy)] transition-all duration-200 active:scale-[0.97]',
                  isActiveAccountLink('profile', currentAccountSection)
                    ? 'border-[var(--color-gold)] text-[var(--color-gold)]'
                    : 'border-[color:var(--color-border)]',
                  'hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40'
                )}
              >
                <FiUser size={18} />
              </Link>
            </div>
            <Link
              href={accountHref}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'rounded-2xl border bg-white/75 px-4 py-3 text-sm font-medium text-[var(--color-navy)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40',
                accountAreaActive ? 'border-[var(--color-gold)] text-[var(--color-gold)]' : 'border-[color:var(--color-border)]'
              )}
            >
              {isLoading ? 'تحميل الحساب...' : user ? `حسابي: ${userDisplayName}` : 'تسجيل الدخول'}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
