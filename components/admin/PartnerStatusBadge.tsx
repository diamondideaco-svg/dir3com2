type PartnerStatusBadgeProps = {
  status: string;
};

const toneMap: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  pending: 'bg-amber-500/15 text-amber-400',
  inactive: 'bg-rose-500/15 text-rose-400',
};

export default function PartnerStatusBadge({ status }: PartnerStatusBadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneMap[status] || 'bg-slate-500/15 text-slate-300'}`}>
      {status}
    </span>
  );
}
