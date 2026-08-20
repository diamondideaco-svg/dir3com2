import type { CustomerRecord } from '@/lib/supabase/types';

type CustomerCardProps = {
  customer: CustomerRecord;
};

export default function CustomerCard({ customer }: CustomerCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6 text-right">
      <p className="text-lg font-semibold text-white">{customer.full_name}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{customer.email}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{customer.city || '—'}</p>
    </div>
  );
}
