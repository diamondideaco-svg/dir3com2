import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import CustomerProfile from '@/components/customers/CustomerProfile';
import type { CustomerRecord } from '@/lib/supabase/types';

async function getProfile() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(1);
  return (data?.[0] || null) as CustomerRecord | null;
}

export default async function MyProfilePage() {
  const customer = await getProfile();

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">ملفي</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">الملف الشخصي</h1>
          </div>
          <Link href="/my-account" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>
        {customer ? <CustomerProfile customer={customer} /> : null}
      </div>
    </div>
  );
}
