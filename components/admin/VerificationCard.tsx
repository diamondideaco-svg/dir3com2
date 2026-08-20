import { getVerificationOverview } from '@/lib/actions/verification-actions';

export async function VerificationCard() {
  const { overview, error } = await getVerificationOverview()
    .then((payload) => ({ overview: payload, error: null as string | null }))
    .catch(() => ({
      overview: { requests: [], reviews: [] },
      error: 'تعذر تحميل ملخص التحقق حالياً.',
    }));

  if (error) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>;
  }

  const pending = overview.requests.filter((item: { status?: string | null }) => item.status === 'Pending').length;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-sm text-[var(--color-muted)]">Pending reviews</p>
      <p className="mt-2 text-2xl font-semibold text-white">{pending}</p>
    </div>
  );
}
