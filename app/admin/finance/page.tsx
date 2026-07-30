import { FinanceDashboard } from '@/components/admin/FinanceDashboard';

export const metadata = {
  title: 'Finance & Trust Engine | DIR3COM',
};

export default function FinancePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-gold-400">Finance & Trust Engine</p>
          <h1 className="mt-2 text-3xl font-semibold">Treasury, escrow, settlements, and invoicing</h1>
          <p className="mt-3 max-w-2xl text-slate-400">Monitor liquidity, manage escrow flows, and review payouts in one provider-agnostic control center.</p>
        </div>

        <FinanceDashboard />
      </div>
    </main>
  );
}
