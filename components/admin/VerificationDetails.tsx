import { getVerificationOverview } from '@/lib/actions/verification-actions';

export async function VerificationDetails() {
  const overview = await getVerificationOverview();

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Recent review activity</h3>
      <div className="mt-4 space-y-2">
        {overview.reviews.map((item: { id: string; decision: string; reviewer_id?: string | null; notes?: string | null }) => (
          <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span>{item.decision}</span>
              <span className="text-slate-400">{item.reviewer_id ?? 'System'}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{item.notes ?? 'No notes'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
