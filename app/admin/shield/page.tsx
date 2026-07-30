import { ShieldAnalytics } from '@/components/admin/ShieldAnalytics';

export const metadata = {
  title: 'Shield Dashboard | DIR3COM',
};

export default function ShieldDashboardPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold">Shield dashboard</h1>
        <p className="mt-2 text-slate-400">Inspect shield distribution across customers, partners, and products.</p>
        <div className="mt-6">
          <ShieldAnalytics />
        </div>
      </div>
    </main>
  );
}
