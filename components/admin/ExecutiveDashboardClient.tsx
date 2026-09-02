'use client';

import Link from 'next/link';

import { ExecutiveKpiWidget } from '@/components/admin/ExecutiveKpiWidget';
import { PlatformHealthCard } from '@/components/admin/PlatformHealthCard';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { executiveDashboardCopy } from '@/lib/i18n/executive-dashboard';
import type {
  ExecutiveDashboardData,
  ExecutiveMetric,
} from '@/lib/integration/executive-dashboard-contract';

function metricText(
  metric: ExecutiveMetric<number>,
  unavailable: string,
  format: (value: number) => string = String,
) {
  return metric.status === 'available' ? format(metric.value) : unavailable;
}

function queueTone(metric: ExecutiveMetric<number>) {
  if (metric.status === 'unavailable') return 'danger' as const;
  return metric.value > 0 ? 'warning' as const : 'neutral' as const;
}

export default function ExecutiveDashboardClient({ data }: { data: ExecutiveDashboardData }) {
  const { language, direction } = useLanguage();
  const t = executiveDashboardCopy[language];
  const currency = new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const number = new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US');

  const actions = [
    [t.actions.booking, '/admin/bookings'],
    [t.actions.customer, '/admin/customers'],
    [t.actions.partner, '/admin/partners'],
    [t.actions.product, '/admin/products'],
    [t.actions.verification, '/admin/verification/partners'],
    [t.actions.settlement, '/admin/finance'],
  ] as const;

  const filters = [
    t.filters.country,
    t.filters.city,
    t.filters.service,
    t.filters.category,
    t.filters.shield,
    t.filters.verification,
  ];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]" dir={direction} lang={language}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-gold-400">{t.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold">{t.title}</h1>
            <p className="mt-3 max-w-3xl text-[var(--color-muted)]">{t.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-full border border-gold-500/30 px-3 py-2 text-sm text-gold-400 hover:bg-gold-500/10">
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ExecutiveKpiWidget
            title={t.metrics.productionBookings}
            value={metricText(data.productionBookings, t.unavailable, number.format)}
            hint={data.productionBookings.status === 'available' ? t.metrics.productionBookingsHint : t.unavailableHint}
          />
          <ExecutiveKpiWidget
            title={t.metrics.confirmedRevenue}
            value={metricText(data.confirmedProductionRevenue, t.unavailable, currency.format)}
            hint={data.confirmedProductionRevenue.status === 'available' ? t.metrics.confirmedRevenueHint : t.unavailableHint}
          />
          <ExecutiveKpiWidget
            title={t.metrics.pendingSettlements}
            value={metricText(data.pendingSettlements, t.unavailable, number.format)}
            hint={data.pendingSettlements.status === 'available' ? t.metrics.pendingSettlementsHint : t.unavailableHint}
          />
          <ExecutiveKpiWidget
            title={t.metrics.pendingVerifications}
            value={metricText(data.pendingVerifications, t.unavailable, number.format)}
            hint={data.pendingVerifications.status === 'available' ? t.metrics.pendingVerificationsHint : t.unavailableHint}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4" aria-labelledby="executive-queues-title">
              <h2 id="executive-queues-title" className="text-lg font-semibold text-white">{t.queues.title}</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <PlatformHealthCard
                  title={t.queues.pendingRefunds}
                  value={metricText(data.pendingRefunds, t.unavailable, number.format)}
                  tone={queueTone(data.pendingRefunds)}
                />
                <PlatformHealthCard
                  title={t.queues.failedNotifications}
                  value={metricText(data.failedNotifications, t.unavailable, number.format)}
                  tone={queueTone(data.failedNotifications)}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <h3 className="text-lg font-semibold text-white">{t.filters.title}</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                {filters.map((label) => (
                  <div key={label} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">{label}</div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <h3 className="text-lg font-semibold text-white">{t.search.title}</h3>
              <p className="mt-2 text-sm text-slate-500">{t.search.help}</p>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <h2 className="text-lg font-semibold text-white">{t.quickLinks.title}</h2>
            <div className="mt-4 space-y-2">
              <Link href="/admin/bookings" className="block text-sm text-slate-300">{t.quickLinks.bookings}</Link>
              <Link href="/admin/partners" className="block text-sm text-slate-300">{t.quickLinks.partners}</Link>
              <Link href="/admin/customers" className="block text-sm text-slate-300">{t.quickLinks.customers}</Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
