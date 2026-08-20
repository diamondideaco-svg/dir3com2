import type { CustomerRecord } from '@/lib/supabase/types';

type CustomerProfileProps = {
  customer: CustomerRecord;
};

export default function CustomerProfile({ customer }: CustomerProfileProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6 text-right">
      <h3 className="text-lg font-semibold text-white">الملف الشخصي</h3>
      <div className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
        <p>الاسم: {customer.full_name}</p>
        <p>البريد: {customer.email}</p>
        <p>الهاتف: {customer.phone || '—'}</p>
        <p>البلد: {customer.country || '—'}</p>
        <p>المدينة: {customer.city || '—'}</p>
      </div>
    </div>
  );
}
