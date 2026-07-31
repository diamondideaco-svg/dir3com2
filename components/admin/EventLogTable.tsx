import { getOperationsSummary } from '@/lib/actions/operations-actions';

export async function EventLogTable() {
  const { summary, error } = await getOperationsSummary()
    .then((payload) => ({ summary: payload, error: null as string | null }))
    .catch(() => ({
      summary: { notifications: [], audits: [], timeline: [], events: [] },
      error: 'تعذر تحميل سجل الأحداث حالياً.',
    }));

  if (error) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>;
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">System events</h3>
      {summary.events.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">لا توجد أحداث نظام حالياً.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {summary.events.map((item: { id: string; event_name: string; source?: string | null; entity_type?: string | null }) => (
            <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>{item.event_name}</span>
                <span className="text-slate-400">{item.source}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.entity_type ?? 'System'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
