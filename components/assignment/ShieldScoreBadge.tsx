type ShieldScoreBadgeProps = {
  score: number;
  label?: string;
};

export default function ShieldScoreBadge({ score, label = 'Shield Score' }: ShieldScoreBadgeProps) {
  const tone = score >= 80 ? 'bg-emerald-500/15 text-emerald-300' : score >= 60 ? 'bg-amber-500/15 text-amber-300' : 'bg-rose-500/15 text-rose-300';

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {label}: {score}
    </span>
  );
}
