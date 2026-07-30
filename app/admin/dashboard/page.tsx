import Link from 'next/link';
import { ExecutiveKpiWidget } from '@/components/admin/ExecutiveKpiWidget';
import { PlatformHealthCard } from '@/components/admin/PlatformHealthCard';
import { GlobalSearch } from '@/components/admin/GlobalSearch';
import { GlobalFilterBar } from '@/components/admin/GlobalFilterBar';
import { getExecutiveDashboardData } from '@/lib/integration/dashboard-engine';

type RecentActivityItem = {
  id?: string | number;
  event_name?: string | null;
  action?: string | null;
  event_type?: string | null;
  summary?: string | null;
};

export const metadata = {
  title: 'Executive Dashboard | DIR3COM',
};

export default async function ExecutiveDashboardPage() {
  const data = await getExecutiveDashboardData();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-gold-400">Executive Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold">One operating view across the entire platform</h1>
            <p className="mt-3 max-w-3xl text-slate-400">Monitor bookings, revenue, trust, settlements, operations, and platform health from a single command center.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ['New Booking', '/admin/bookings'],
              ['New Customer', '/admin/customers'],
              ['New Partner', '/admin/partners'],
              ['Add Product', '/admin/products'],
              ['Verify Partner', '/admin/verification/partners'],
              ['Create Settlement', '/admin/finance'],
            ].map(([label, href]) => (
              <Link key={label} href={href} className="rounded-full border border-gold-500/30 px-3 py-2 text-sm text-gold-400 hover:bg-gold-500/10">
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ExecutiveKpiWidget title="Revenue" value={`SAR ${data.revenue.toFixed(2)}`} hint="Bookings total" />
          <ExecutiveKpiWidget title="Escrow Balance" value={`SAR ${data.escrowBalance.toFixed(2)}`} hint="Protected funds" />
          <ExecutiveKpiWidget title="Pending Settlements" value={String(data.pendingSettlements.length)} hint="Partner payouts" />
          <ExecutiveKpiWidget title="Pending Verifications" value={String(data.pendingVerifications.length)} hint="Review queue" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <h2 className="text-lg font-semibold text-white">Platform Health</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <PlatformHealthCard title="Database Status" value="Operational" tone="success" />
                <PlatformHealthCard title="Pending Jobs" value="0" tone="neutral" />
                <PlatformHealthCard title="Failed Notifications" value="0" tone="success" />
                <PlatformHealthCard title="Pending Refunds" value={String(data.pendingRefunds.length)} tone={data.pendingRefunds.length ? 'warning' : 'success'} />
                <PlatformHealthCard title="Pending Verification" value={String(data.pendingVerifications.length)} tone={data.pendingVerifications.length ? 'warning' : 'success'} />
                <PlatformHealthCard title="Escrow Status" value="Healthy" tone="success" />
              </div>
            </div>

            <GlobalFilterBar />
            <GlobalSearch query="" />
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
              <div className="mt-4 space-y-2">
                {data.recentActivity.slice(0, 8).map((item: RecentActivityItem, index: number) => (
                  <div key={`${item.id ?? index}`} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-400">
                    {item.event_name ?? item.action ?? item.event_type ?? item.summary ?? 'Activity'}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <h2 className="text-lg font-semibold text-white">Quick Links</h2>
              <div className="mt-4 space-y-2">
                <Link href="/admin/bookings" className="block text-sm text-slate-300">Bookings → Payments → Verification → Invoices</Link>
                <Link href="/admin/partners" className="block text-sm text-slate-300">Partners → Products → Assignments → Finance</Link>
                <Link href="/admin/customers" className="block text-sm text-slate-300">Customers → Bookings → Wallet → Timeline</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
