'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './ProtectedOperations.module.css';
import LogoutButton from '@/components/auth/LogoutButton';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { executiveDashboardCopy } from '@/lib/i18n/executive-dashboard';

const adminNavItems = [
  { href: '/admin', key: 'dashboard', globalOnly: true },
  { href: '/admin/partners', key: 'partners', permission: 'partners:read' },
  { href: '/admin/customers', key: 'customers', permission: 'customers:read' },
  { href: '/admin/products', key: 'products', permission: 'products:read' },
  { href: '/admin/assignment', key: 'assignment', globalOnly: true },
  { href: '/admin/finance', key: 'finance', globalOnly: true },
  { href: '/admin/operations', key: 'operations', globalOnly: true },
  { href: '/admin/verification', key: 'verification', globalOnly: true },
  { href: '/admin/audit', key: 'audit', globalOnly: true },
  { href: '/admin/events', key: 'events', globalOnly: true },
  { href: '/admin/notifications', key: 'notifications', globalOnly: true },
  { href: '/admin/shield', key: 'shield', globalOnly: true },
  { href: '/admin/partners/vip-local-egypt', key: 'vipEgypt', globalOnly: true },
] as const;

type AdminPlatformShellProps = {
  children: ReactNode;
  adminRole: string;
  isCeo?: boolean;
  isGlobal?: boolean;
  permissions?: string[];
  countryScope?: string[];
  actorName?: string;
};

export default function AdminPlatformShell({
  children,
  adminRole,
  isCeo = false,
  isGlobal = true,
  permissions = [],
  countryScope = [],
  actorName = '',
}: AdminPlatformShellProps) {
  const { language, direction, toggleLanguage } = useLanguage();
  const t = executiveDashboardCopy[language].shell;
  const pathname = usePathname();
  const ar = language === 'ar';
  const roleLabel = isCeo ? (ar ? 'الرئيس التنفيذي' : 'CEO') : adminRole === 'admin' ? (ar ? 'مدير' : 'Admin') : (ar ? 'موظف' : 'Staff');
  const countryLabels: Record<string, string> = ar ? { EG: 'مصر', QA: 'قطر', SA: 'السعودية', SY: 'سوريا', LB: 'لبنان' } : { EG: 'Egypt', QA: 'Qatar', SA: 'Saudi Arabia', SY: 'Syria', LB: 'Lebanon' };
  const visibleNavItems = adminNavItems.filter((item) => {
    if (isGlobal) return true;
    if ('globalOnly' in item && item.globalOnly) return false;
    if ('permission' in item && item.permission) {
      return permissions.includes('admin:full') || permissions.includes(item.permission);
    }
    return false;
  });

  return (
    <div className={styles.shell} dir={direction} lang={language} data-protected-operations>
      <a href="#operations-content" className={styles.skip}>{ar ? 'انتقل إلى المحتوى' : 'Skip to content'}</a>
      <header className={styles.header}>
          <div className={styles.top}>
            <Link href="/admin" className={styles.brand} aria-label={t.title}><img src="/brand/runtime/dir3com-logo-transparent.png" alt="DIR3COM" width={150} height={58} /></Link>
            <div className={styles.identity}>
              <p className="font-semibold">{actorName || t.title}</p>
              <small>{roleLabel} · {isGlobal ? (ar ? 'نطاق عالمي معتمد' : 'Authorized global scope') : countryScope.map(country => countryLabels[country] || country).join(' · ')}</small>
            </div>
            <div className={styles.controls}>
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-4 text-sm font-semibold text-[#D4AF37] transition hover:bg-[#D4AF37]/20"
              aria-label={language === 'ar' ? 'Switch admin interface to English' : 'تبديل واجهة الإدارة إلى العربية'}
            >
              {language === 'ar' ? 'EN' : 'AR'}
            </button>
            <LogoutButton label={t.logout} className="inline-flex items-center gap-2 disabled:cursor-wait disabled:opacity-60" />
            </div>
          </div>

          <nav aria-label={t.navigation} className={styles.nav}>
            {visibleNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={(pathname === item.href || (item.href !== '/admin' && pathname.startsWith(`${item.href}/`))) ? 'page' : undefined}
                className="shrink-0 whitespace-nowrap rounded-full border border-[color:var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-navy)] transition hover:border-[#D4AF37]/45 hover:text-[#D4AF37]"
              >
                {t.nav[item.key]}
              </Link>
            ))}
            {isCeo ? (
              <Link
                href="/admin/team"
                aria-current={pathname === '/admin/team' ? 'page' : undefined}
                className="shrink-0 whitespace-nowrap rounded-full border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-3 py-1.5 text-sm font-semibold text-[#D4AF37] transition hover:bg-[#D4AF37]/20"
              >
                {t.nav.team}
              </Link>
            ) : null}
          </nav>
      </header>

      <div id="operations-content" className={styles.content}>{children}</div>
    </div>
  );
}
