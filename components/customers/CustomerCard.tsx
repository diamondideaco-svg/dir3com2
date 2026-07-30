import type { CustomerRecord } from '@/lib/supabase/types';

type CustomerCardProps = {
  customer: CustomerRecord;
};

export default function CustomerCard({ customer }: CustomerCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-right">
      <p className="text-lg font-semibold text-white">{customer.full_name}</p>
      <p className="mt-2 text-sm text-slate-300">{customer.email}</p>
      <p className="mt-2 text-sm text-slate-400">{customer.city || '—'}</p>
    </div>
  );
}
