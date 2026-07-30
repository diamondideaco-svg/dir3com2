export function VerificationStatusBadge({ status }: { status: string }) {
  const tone = {
    Pending: 'bg-amber-500/15 text-amber-300',
    'Under Review': 'bg-sky-500/15 text-sky-300',
    Approved: 'bg-emerald-500/15 text-emerald-300',
    Rejected: 'bg-rose-500/15 text-rose-300',
    Expired: 'bg-slate-500/15 text-slate-300',
    Suspended: 'bg-fuchsia-500/15 text-fuchsia-300',
  } as Record<string, string>;

  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone[status] ?? 'bg-slate-500/15 text-slate-300'}`}>{status}</span>;
}
