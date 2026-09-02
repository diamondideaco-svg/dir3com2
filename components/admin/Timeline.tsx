import { getOperationsSummary } from '@/lib/actions/operations-actions';
import { AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';

export async function Timeline() {
  const { summary, error } = await getOperationsSummary()
    .then((payload) => ({ summary: payload, error: null as string | null }))
    .catch(() => ({
      summary: { notifications: [], audits: [], timeline: [], events: [] },
      error: 'تعذر تحميل الخط الزمني حالياً.',
    }));

  if (error) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100"><AdminText ar={error} en="Activity timeline could not be loaded. No fallback empty state is shown." /><AdminRetryButton /></div>;
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white"><AdminText ar="الخط الزمني للنشاط" en="Activity timeline" /></h3>
      {summary.timeline.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]"><AdminText ar="لا توجد أحداث في الخط الزمني حالياً." en="There are no timeline events." /></p>
      ) : (
        <div className="mt-4 space-y-2">
          {summary.timeline.map((item: { id: string; event_type: string; entity_type: string; summary?: string | null }) => (
            <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">
              <div className="flex items-center justify-between">
                <span>{item.event_type}</span>
                <span className="text-[var(--color-muted)]">{item.entity_type}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.summary ?? <AdminText ar="لا يوجد ملخص" en="No summary provided" />}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
