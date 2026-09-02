import { getOperationsSummary } from '@/lib/actions/operations-actions';
import { AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';

export async function OperationSummaryCards() {
  const { summary, error } = await getOperationsSummary()
    .then((payload) => ({ summary: payload, error: null as string | null }))
    .catch(() => ({
      summary: { notifications: [], audits: [], timeline: [], events: [] },
      error: 'تعذر تحميل ملخص العمليات حالياً.',
    }));

  if (error) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100"><AdminText ar={error} en="Operations summary could not be loaded. No fallback values are shown." /><AdminRetryButton /></div>;
  }

  const cards = [
    { ar: 'الإشعارات الأخيرة المعروضة', en: 'Recent notifications shown', value: summary.notifications.length },
    { ar: 'سجلات التدقيق الأخيرة المعروضة', en: 'Recent audit entries shown', value: summary.audits.length },
    { ar: 'أحداث الخط الزمني الأخيرة المعروضة', en: 'Recent timeline events shown', value: summary.timeline.length },
    { ar: 'أحداث النظام الأخيرة المعروضة', en: 'Recent system events shown', value: summary.events.length },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div key={card.en} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-sm text-[var(--color-muted)]"><AdminText ar={card.ar} en={card.en} /></p>
          <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
