import { getFinanceSummary } from '@/lib/actions/finance-actions';

export async function FinanceDashboard() {
  const { summary, error } = await getFinanceSummary()
    .then((payload) => ({ summary: payload, error: null as string | null }))
    .catch(() => ({
      summary: { wallets: [], settlements: [], invoices: [] },
      error: 'تعذر تحميل بيانات التمويل حالياً.',
    }));

  if (error) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>;
  }

  const walletBalance = summary.wallets.reduce((total: number, wallet: { balance?: number | string | null }) => total + Number(wallet.balance || 0), 0);
  const heldBalance = summary.wallets.reduce((total: number, wallet: { held_balance?: number | string | null }) => total + Number(wallet.held_balance || 0), 0);
  const pendingSettlements = summary.settlements.filter((settlement: { status?: string | null }) => settlement.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-[var(--color-muted)]">Wallet balance</p>
          <p className="mt-2 text-2xl font-semibold text-white">SAR {walletBalance.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-[var(--color-muted)]">Held funds</p>
          <p className="mt-2 text-2xl font-semibold text-white">SAR {heldBalance.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-[var(--color-muted)]">Pending settlements</p>
          <p className="mt-2 text-2xl font-semibold text-white">{pendingSettlements}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="text-lg font-semibold text-white">Recent wallets</h3>
        {summary.wallets.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-muted)]">لا توجد محافظ متاحة حالياً.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {summary.wallets.slice(0, 5).map((wallet: { id: string; owner_type?: string | null; owner_id?: string | null; available_balance?: number | string | null }) => (
              <div key={wallet.id} className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">
                <span>{wallet.owner_type} • {wallet.owner_id}</span>
                <span>SAR {Number(wallet.available_balance || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
