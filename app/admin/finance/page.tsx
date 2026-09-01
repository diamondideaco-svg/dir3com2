import { FinanceDashboard } from '@/components/admin/FinanceDashboard';
import { AdminText } from '@/components/admin/AdminLocale';

export const metadata = {
  title: 'Finance & Trust Engine | DIR3COM',
};

export default function FinancePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-gold-400"><AdminText ar="محرك التمويل والثقة" en="Finance & Trust Engine" /></p>
        <h1 className="mt-2 text-3xl font-semibold"><AdminText ar="الخزينة والضمان والتسويات والفوترة" en="Treasury, escrow, settlements, and invoicing" /></h1>
        <p className="mt-3 max-w-2xl text-[var(--color-muted)]"><AdminText ar="راقب السيولة ومسارات الضمان والمدفوعات من مركز تحكم مستقل عن المزوّد." en="Monitor liquidity, manage escrow flows, and review payouts in one provider-agnostic control center." /></p>
        </div>

        <FinanceDashboard />
      </div>
    </main>
  );
}
