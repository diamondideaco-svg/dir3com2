'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import LogoutButton from '@/components/auth/LogoutButton';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { executiveDashboardCopy } from '@/lib/i18n/executive-dashboard';

const adminNavItems = [
  { href: '/admin', key: 'dashboard' },
  { href: '/admin/partners', key: 'partners' },
  { href: '/admin/customers', key: 'customers' },
  { href: '/admin/products', key: 'products' },
  { href: '/admin/assignment', key: 'assignment' },
  { href: '/admin/finance', key: 'finance' },
  { href: '/admin/operations', key: 'operations' },
  { href: '/admin/verification', key: 'verification' },
  { href: '/admin/audit', key: 'audit' },
  { href: '/admin/events', key: 'events' },
  { href: '/admin/notifications', key: 'notifications' },
  { href: '/admin/shield', key: 'shield' },
  { href: '/admin/partners/vip-local-egypt', key: 'vipEgypt' },
] as const;

type AdminPlatformShellProps = {
  children: ReactNode;
  adminRole: string;
};

export default function AdminPlatformShell({ children, adminRole }: AdminPlatformShellProps) {
  const { language, direction } = useLanguage();
  const t = executiveDashboardCopy[language].shell;

  return (
    <div className="min-h-screen bg-[#0A1726] text-white" dir={direction} lang={language}>
      <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[#FAF8F4]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#D4AF37]">{t.eyebrow}</p>
              <h1 className="mt-1 text-xl font-semibold text-white">{t.title}</h1>
            </div>
            <div className="inline-flex items-center rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-3 py-1 text-xs font-semibold text-[#D4AF37]">
              {t.role}: {adminRole}
            </div>
            <LogoutButton label={t.logout} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-4 text-sm font-semibold text-[#D4AF37] transition hover:bg-[#D4AF37]/20 disabled:cursor-wait disabled:opacity-60" />
          </div>

          <nav aria-label={t.navigation} className="flex flex-wrap gap-2">
            {adminNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-[color:var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-navy)] transition hover:border-[#D4AF37]/45 hover:text-[#D4AF37]"
              >
                {t.nav[item.key]}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
