import type { ReactNode } from 'react';
import Link from 'next/link';
import { FiActivity, FiBookOpen, FiBox, FiClipboard, FiDollarSign, FiGrid, FiShield, FiUsers } from 'react-icons/fi';
import AdminThemeToggle from '@/components/admin/AdminThemeToggle';

const adminNavItems = [
  { href: '/admin', label: 'نظرة عامة', icon: FiGrid },
  { href: '/admin/customers', label: 'المستخدمون', icon: FiUsers },
  { href: '/admin/partners', label: 'الشركاء', icon: FiUsers },
  { href: '/admin/products', label: 'المنتجات والخدمات', icon: FiBox },
  { href: '/admin/bookings', label: 'الحجوزات', icon: FiBookOpen },
  { href: '/admin/assignment', label: 'التعيينات', icon: FiClipboard },
  { href: '/admin/operations', label: 'العمليات', icon: FiActivity },
  { href: '/admin/finance', label: 'المالية', icon: FiDollarSign },
  { href: '/admin/verification', label: 'التحقق', icon: FiShield },
  { href: '/admin/audit', label: 'الأمان والتدقيق', icon: FiShield },
];

type AdminPlatformShellProps = {
  children: ReactNode;
  adminRole: string;
};

export default function AdminPlatformShell({ children, adminRole }: AdminPlatformShellProps) {
  return (
    <div className="admin-platform-shell min-h-screen text-[var(--color-navy)]" dir="rtl">
      <header className="admin-platform-header sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-[var(--color-shell)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#D4AF37]">DIR3COM ADMIN PLATFORM</p>
              <h1 className="mt-1 text-xl font-semibold text-[var(--color-navy)]">تشغيل موحد للوحدات الإدارية</h1>
            </div>
            <div className="flex items-center gap-2">
              <AdminThemeToggle />
              <div className="inline-flex items-center rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-3 py-1 text-xs font-semibold text-[#9a6a12]">
                الصلاحية: {adminRole}
              </div>
            </div>
          </div>

          <nav aria-label="تنقل الإدارة" className="flex flex-wrap gap-2">
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              return (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[var(--color-card-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-navy)] transition hover:border-[#D4AF37]/45 hover:text-[#9a6a12]"
              >
                <Icon aria-hidden="true" />
                {item.label}
              </Link>
            );})}
          </nav>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
