import { getOperationsSummary } from '@/lib/actions/operations-actions';
import { AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';

export async function AuditTable() {
  const { summary, error } = await getOperationsSummary()
    .then((payload) => ({ summary: payload, error: null as string | null }))
    .catch(() => ({
      summary: { notifications: [], audits: [], timeline: [], events: [] },
      error: 'تعذر تحميل سجلات التدقيق حالياً.',
    }));

  if (error) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100"><AdminText ar={error} en="Audit records could not be loaded. No fallback empty state is shown." /><AdminRetryButton /></div>;
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white"><AdminText ar="سجل التدقيق" en="Audit log" /></h3>
      {summary.audits.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]"><AdminText ar="لا توجد سجلات تدقيق حالياً." en="There are no audit records." /></p>
      ) : (
        <div className="mt-4 space-y-2">
          {summary.audits.map((item: { id: string; action: string; entity_type: string; performed_by?: string | null }) => (
            <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">
              <div className="flex items-center justify-between">
                <span>{item.action}</span>
                <span className="text-[var(--color-muted)]">{item.entity_type}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.performed_by ?? <AdminText ar="النظام" en="System" />}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
