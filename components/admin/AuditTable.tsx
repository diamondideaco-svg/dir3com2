import { getOperationsSummary } from '@/lib/actions/operations-actions';

export async function AuditTable() {
  const { summary, error } = await getOperationsSummary()
    .then((payload) => ({ summary: payload, error: null as string | null }))
    .catch(() => ({
      summary: { notifications: [], audits: [], timeline: [], events: [] },
      error: 'تعذر تحميل سجلات التدقيق حالياً.',
    }));

  if (error) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>;
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Audit log</h3>
      {summary.audits.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]">لا توجد سجلات تدقيق حالياً.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {summary.audits.map((item: { id: string; action: string; entity_type: string; performed_by?: string | null }) => (
            <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">
              <div className="flex items-center justify-between">
                <span>{item.action}</span>
                <span className="text-[var(--color-muted)]">{item.entity_type}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.performed_by ?? 'System'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
