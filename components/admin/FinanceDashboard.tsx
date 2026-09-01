import { getFinanceSummary } from '@/lib/actions/finance-actions';
import { AdminCurrency, AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';

export async function FinanceDashboard() {
  const { summary, error } = await getFinanceSummary()
    .then((payload) => ({ summary: payload, error: null as string | null }))
    .catch(() => ({
      summary: { wallets: [], settlements: [], invoices: [] },
      error: 'تعذر تحميل بيانات التمويل حالياً.',
    }));

  if (error) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100"><AdminText ar={error} en="Finance data could not be loaded. No fallback values are shown." /><AdminRetryButton /></div>;
  }

  const sarWallets = summary.wallets.filter((wallet: { currency?: string | null }) => (wallet.currency ?? 'SAR') === 'SAR');
  const walletBalance = sarWallets.reduce((total: number, wallet: { balance?: number | string | null }) => total + Number(wallet.balance || 0), 0);
  const heldBalance = sarWallets.reduce((total: number, wallet: { held_balance?: number | string | null }) => total + Number(wallet.held_balance || 0), 0);
  const pendingSettlements = summary.settlements.filter((settlement: { status?: string | null }) => settlement.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-[var(--color-muted)]"><AdminText ar="رصيد المحافظ بالريال" en="SAR wallet balance" /></p>
          <p className="mt-2 text-2xl font-semibold text-white"><AdminCurrency value={walletBalance} /></p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-[var(--color-muted)]"><AdminText ar="الأموال المحجوزة بالريال" en="SAR held funds" /></p>
          <p className="mt-2 text-2xl font-semibold text-white"><AdminCurrency value={heldBalance} /></p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-[var(--color-muted)]"><AdminText ar="التسويات المعلقة" en="Pending settlements" /></p>
          <p className="mt-2 text-2xl font-semibold text-white">{pendingSettlements}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="text-lg font-semibold text-white"><AdminText ar="المحافظ الأخيرة" en="Recent wallets" /></h3>
        {summary.wallets.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-muted)]"><AdminText ar="لا توجد محافظ متاحة حالياً." en="There are no wallets." /></p>
        ) : (
          <div className="mt-4 space-y-2">
            {summary.wallets.slice(0, 5).map((wallet: { id: string; owner_type?: string | null; owner_id?: string | null; available_balance?: number | string | null; currency?: string | null }) => (
              <div key={wallet.id} className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">
                <span>{wallet.owner_type} • {wallet.owner_id}</span>
                <span><AdminCurrency value={Number(wallet.available_balance || 0)} currency={wallet.currency || 'SAR'} /></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
