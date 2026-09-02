import type { CustomerRecord } from '@/lib/supabase/types';
import { AdminText } from '@/components/admin/AdminLocale';

type CustomerProfileProps = {
  customer: CustomerRecord;
};

export default function CustomerProfile({ customer }: CustomerProfileProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-lg font-semibold text-white"><AdminText ar="الملف الشخصي" en="Profile" /></h3>
      <div className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
        <p><AdminText ar="الاسم" en="Name" />: {customer.full_name}</p>
        <p><AdminText ar="البريد" en="Email" />: {customer.email}</p>
        <p><AdminText ar="الهاتف" en="Phone" />: {customer.phone || '—'}</p>
        <p><AdminText ar="البلد" en="Country" />: {customer.country || '—'}</p>
        <p><AdminText ar="المدينة" en="City" />: {customer.city || '—'}</p>
      </div>
    </div>
  );
}
