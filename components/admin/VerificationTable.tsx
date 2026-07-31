import { getVerificationOverview } from '@/lib/actions/verification-actions';

export async function VerificationTable() {
  const { overview, error } = await getVerificationOverview()
    .then((payload) => ({ overview: payload, error: null as string | null }))
    .catch(() => ({
      overview: { requests: [], reviews: [] },
      error: 'تعذر تحميل طلبات التحقق حالياً.',
    }));

  if (error) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>;
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Verification requests</h3>
      {overview.requests.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">لا توجد طلبات تحقق حالياً.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {overview.requests.map((item: { id: string; request_type: string; status: string; owner_type: string; owner_id: string }) => (
            <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>{item.request_type}</span>
                <span className="text-slate-400">{item.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.owner_type} • {item.owner_id}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
