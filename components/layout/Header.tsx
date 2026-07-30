'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FiBell, FiHeart, FiMenu, FiSearch, FiShield, FiUser, FiX } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { buttonVariants } from '@/components/ui/button';
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
  { label: 'المفضلة', href: '/my-bookings', icon: FiHeart },
  { label: 'التنبيهات', href: '/my-account', icon: FiBell },
  { label: 'المستخدم', href: '/profile', icon: FiUser },
];

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

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[color:var(--color-shell)]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 lg:hidden">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-white/75 text-[var(--color-navy)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="فتح القائمة"
            aria-expanded={mobileOpen}
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

        <nav className="hidden items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-white/60 px-3 py-2 lg:flex">
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
            {actionLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                aria-label={label}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-white/70 text-[var(--color-navy)] transition hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
              >
                <Icon size={18} />
              </Link>
            ))}
          </div>
          <Link href="/booking" className={buttonVariants({ variant: 'gold', size: 'default' })}>
            ابدأ رحلتك
          </Link>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[color:var(--color-border)] bg-[color:var(--color-shell)]/95 px-4 py-4 shadow-[0_22px_50px_rgba(13,27,42,0.15)] lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-3">
            <nav className="grid gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-2xl border border-[color:var(--color-border)] bg-white/75 px-4 py-3 text-sm font-medium text-[var(--color-navy)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {actionLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={label}
                  href={href}
                  aria-label={label}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'inline-flex h-12 items-center justify-center rounded-2xl border border-[color:var(--color-border)] bg-white/75 text-[var(--color-navy)] transition',
                    'hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40'
                  )}
                >
                  <Icon size={18} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
