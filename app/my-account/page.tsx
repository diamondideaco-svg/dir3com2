import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import CustomerProfile from '@/components/customers/CustomerProfile';
import CustomerShieldBadge from '@/components/customers/CustomerShieldBadge';
import type { CustomerRecord } from '@/lib/supabase/types';

async function getCustomer() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(1);
  return (data?.[0] || null) as CustomerRecord | null;
}

export default async function MyAccountPage() {
  const customer = await getCustomer();

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">حسابي</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">لوحة العميل</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/my-bookings" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">حجوزاتي</Link>
            <Link href="/my-wallet" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">محفظتي</Link>
            <Link href="/my-documents" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">مستنداتي</Link>
            <Link href="/my-profile" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">ملفي</Link>
          </div>
        </div>

        {customer ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-white">{customer.full_name}</p>
                <p className="mt-2 text-sm text-slate-300">{customer.email}</p>
              </div>
              <CustomerShieldBadge shieldLevel={customer.shield_level} />
            </div>
            <div className="mt-6">
              <CustomerProfile customer={customer} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
