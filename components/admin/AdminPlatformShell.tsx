import type { ReactNode } from 'react';
import Link from 'next/link';

const adminNavItems = [
  { href: '/admin', label: 'لوحة التحكم' },
  { href: '/admin/partners', label: 'الشركاء' },
  { href: '/admin/customers', label: 'العملاء' },
  { href: '/admin/products', label: 'المنتجات' },
  { href: '/admin/assignment', label: 'التعيين' },
  { href: '/admin/finance', label: 'التمويل' },
  { href: '/admin/operations', label: 'العمليات' },
  { href: '/admin/verification', label: 'التحقق' },
];

type AdminPlatformShellProps = {
  children: ReactNode;
  adminRole: string;
};

export default function AdminPlatformShell({ children, adminRole }: AdminPlatformShellProps) {
  return (
    <div className="min-h-screen bg-[#0A1726] text-white" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#FAF8F4]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#D4AF37]">DIR3COM ADMIN PLATFORM</p>
              <h1 className="mt-1 text-xl font-semibold text-white">تشغيل موحد للوحدات الإدارية</h1>
            </div>
            <div className="inline-flex items-center rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-3 py-1 text-xs font-semibold text-[#D4AF37]">
              الصلاحية: {adminRole}
            </div>
          </div>

          <nav aria-label="تنقل الإدارة" className="flex flex-wrap gap-2">
            {adminNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:border-[#D4AF37]/45 hover:text-[#D4AF37]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}