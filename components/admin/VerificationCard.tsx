import { getVerificationOverview } from '@/lib/actions/verification-actions';

export async function VerificationCard() {
  const overview = await getVerificationOverview();
  const pending = overview.requests.filter((item: { status?: string | null }) => item.status === 'Pending').length;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-sm text-slate-400">Pending reviews</p>
      <p className="mt-2 text-2xl font-semibold text-white">{pending}</p>
    </div>
  );
}
