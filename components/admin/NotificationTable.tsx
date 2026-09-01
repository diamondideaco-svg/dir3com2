import { getOperationsSummary } from '@/lib/actions/operations-actions';
import { AdminRetryButton, AdminStatusText, AdminText } from '@/components/admin/AdminLocale';

export async function NotificationTable() {
  const { summary, error } = await getOperationsSummary()
    .then((payload) => ({ summary: payload, error: null as string | null }))
    .catch(() => ({
      summary: { notifications: [], audits: [], timeline: [], events: [] },
      error: 'تعذر تحميل الإشعارات حالياً.',
    }));

  if (error) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100"><AdminText ar={error} en="Notifications could not be loaded. No fallback empty state is shown." /><AdminRetryButton /></div>;
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white"><AdminText ar="الإشعارات" en="Notifications" /></h3>
      {summary.notifications.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]"><AdminText ar="لا توجد إشعارات حالياً." en="There are no notifications." /></p>
      ) : (
        <div className="mt-4 space-y-2">
          {summary.notifications.map((item: { id: string; subject?: string | null; body?: string | null; status?: string | null }) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">
              <span>{item.subject ?? item.body}</span>
              <span className="text-[var(--color-muted)]"><AdminStatusText value={item.status} /></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
