import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { reconcileWalletAgainstLedger } from '@/lib/finance/wallet-ledger';
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

  const wallet = data as WalletRecord | null;
  if (!wallet) {
    return { wallet: null, reconciliation: null as ReturnType<typeof reconcileWalletAgainstLedger> | null };
  }

  const { data: transactions } = await supabase
    .from('wallet_transactions')
    .select('*')
    .eq('wallet_id', wallet.id)
    .order('created_at', { ascending: false });

  const reconciliation = reconcileWalletAgainstLedger(wallet, transactions || []);
  return { wallet, reconciliation };
}

export default async function MyWalletPage() {
  const { wallet, reconciliation } = await getWallet();

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">محفظتي</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">الرصيد</h1>
          </div>
          <Link href="/my-account" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">العودة</Link>
        </div>
        <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
          {wallet ? (
            <div className="space-y-3">
              <p className="text-lg font-semibold text-white">الرصيد الحالي: {Number(reconciliation?.ledger.balance ?? wallet.balance ?? 0).toFixed(2)} {wallet.currency || 'SAR'}</p>
              <p className="text-sm text-[var(--color-muted)]">الرصيد المتاح: {Number(reconciliation?.ledger.availableBalance ?? wallet.available_balance ?? 0).toFixed(2)} {wallet.currency || 'SAR'}</p>
              <p className="text-sm text-[var(--color-muted)]">الرصيد المعلق: {Number(reconciliation?.ledger.heldBalance ?? wallet.held_balance ?? 0).toFixed(2)} {wallet.currency || 'SAR'}</p>
              {reconciliation && !reconciliation.isConsistent ? (
                <p className="text-xs text-amber-300">تم عرض الرصيد وفق دفتر القيود المالي لحماية اتساق البيانات.</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">لا توجد محفظة مرتبطة بحسابك حالياً.</p>
          )}
        </div>
      </div>
    </div>
  );
}
