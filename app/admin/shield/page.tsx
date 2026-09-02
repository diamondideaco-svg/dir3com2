import { ShieldAnalytics } from '@/components/admin/ShieldAnalytics';
import { AdminText } from '@/components/admin/AdminLocale';

export const metadata = {
  title: 'Shield Dashboard | DIR3COM',
};

export default function ShieldDashboardPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold"><AdminText ar="لوحة الدرع" en="Shield dashboard" /></h1>
        <p className="mt-2 text-[var(--color-muted)]"><AdminText ar="راجع توزيع مستويات الدرع بين العملاء والشركاء والمنتجات." en="Inspect shield distribution across customers, partners, and products." /></p>
        <div className="mt-6">
          <ShieldAnalytics />
        </div>
      </div>
    </main>
  );
}
