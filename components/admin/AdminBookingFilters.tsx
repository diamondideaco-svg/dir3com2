'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { AdminBookingSearch } from '@/lib/admin/booking-customer';

export default function AdminBookingFilters({ search }: { search: AdminBookingSearch }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const statuses = [
    ['all', ar ? 'الكل' : 'All'],
    ['pending', ar ? 'قيد الانتظار' : 'Pending'],
    ['confirmed', ar ? 'مؤكد' : 'Confirmed'],
    ['completed', ar ? 'مكتمل' : 'Completed'],
    ['cancelled', ar ? 'ملغي' : 'Cancelled'],
    ['failed', ar ? 'متعثر' : 'Failed'],
  ];
  const sorts = [
    ['newest', ar ? 'الأحدث' : 'Newest'],
    ['oldest', ar ? 'الأقدم' : 'Oldest'],
    ['customer_asc', ar ? 'العميل: أ–ي' : 'Customer A–Z'],
    ['customer_desc', ar ? 'العميل: ي–أ' : 'Customer Z–A'],
  ];

  return (
    <form method="get" className="mb-5 grid gap-3 rounded-2xl border border-[color:var(--color-border)] bg-white p-4 md:grid-cols-[1fr_auto_auto_auto]">
      <label className="grid gap-1 text-sm">{ar ? 'بحث الحجوزات' : 'Search bookings'}<input name="q" defaultValue={search.query ?? ''} className="rounded-xl border px-3 py-2" /></label>
      <label className="grid gap-1 text-sm">{ar ? 'الحالة' : 'Status'}<select name="status" defaultValue={search.status ?? 'all'} className="rounded-xl border px-3 py-2">{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-sm">{ar ? 'الترتيب' : 'Sort'}<select name="sort" defaultValue={search.sort ?? 'newest'} className="rounded-xl border px-3 py-2">{sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div className="flex items-end gap-2"><button type="submit" className="rounded-xl bg-[#D4AF37] px-4 py-2 font-semibold">{ar ? 'تطبيق' : 'Apply'}</button><Link href="/admin/bookings" className="rounded-xl border px-4 py-2">{ar ? 'إعادة ضبط' : 'Reset'}</Link></div>
    </form>
  );
}
