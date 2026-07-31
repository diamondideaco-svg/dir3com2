import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { WalletRecord } from '@/lib/supabase/types';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

async function getWallet() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget('/my-wallet'));
  }

  const { data } = await supabase
    .from('wallets')
    .select('*')
    .eq('owner_id', user.id)
    .eq('owner_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as WalletRecord | null;
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
          {wallet ? (
            <div className="space-y-3">
              <p className="text-lg font-semibold text-white">الرصيد الحالي: {Number(wallet.balance || 0).toFixed(2)} {wallet.currency || 'SAR'}</p>
              <p className="text-sm text-slate-300">الرصيد المتاح: {Number(wallet.available_balance || 0).toFixed(2)} {wallet.currency || 'SAR'}</p>
              <p className="text-sm text-slate-400">الرصيد المعلق: {Number(wallet.held_balance || 0).toFixed(2)} {wallet.currency || 'SAR'}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-300">لا توجد محفظة مرتبطة بحسابك حالياً.</p>
          )}
        </div>
      </div>
    </div>
  );
}
