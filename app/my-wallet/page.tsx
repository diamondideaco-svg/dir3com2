import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CustomerWalletRecord } from '@/lib/supabase/types';

async function getWallet() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('customer_wallet').select('*').order('created_at', { ascending: false }).limit(1);
  return (data?.[0] || null) as CustomerWalletRecord | null;
}

export default async function MyWalletPage() {
  const wallet = await getWallet();

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">محفظتي</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">الرصيد</h1>
          </div>
          <Link href="/my-account" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
          <p className="text-lg font-semibold text-white">الرصيد الحالي: {wallet?.balance ?? 0} {wallet?.currency ?? 'SAR'}</p>
        </div>
      </div>
    </div>
  );
}
