import { getOperationsSummary } from '@/lib/actions/operations-actions';

export async function NotificationTable() {
  const summary = await getOperationsSummary();

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Notifications</h3>
      <div className="mt-4 space-y-2">
        {summary.notifications.map((item: { id: string; subject?: string | null; body?: string | null; status?: string | null }) => (
          <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300">
            <span>{item.subject ?? item.body}</span>
            <span className="text-slate-400">{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
