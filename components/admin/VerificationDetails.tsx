import { getVerificationOverview } from '@/lib/actions/verification-actions';

export async function VerificationDetails() {
  const { overview, error } = await getVerificationOverview()
    .then((payload) => ({ overview: payload, error: null as string | null }))
    .catch(() => ({
      overview: { requests: [], reviews: [] },
      error: 'تعذر تحميل نشاط مراجعة التحقق حالياً.',
    }));

  if (error) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>;
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Recent review activity</h3>
      {overview.reviews.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]">لا توجد مراجعات تحقق حالياً.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {overview.reviews.map((item: { id: string; decision: string; reviewer_id?: string | null; notes?: string | null }) => (
            <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-[var(--color-muted)]">
              <div className="flex items-center justify-between">
                <span>{item.decision}</span>
                <span className="text-[var(--color-muted)]">{item.reviewer_id ?? 'System'}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.notes ?? 'No notes'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
