import { AdminStatusText } from './AdminLocale';

type ShieldLevelBadgeProps = {
  level: string;
};

const toneMap: Record<string, string> = {
  platinum: 'bg-indigo-500/15 text-indigo-300',
  gold: 'bg-amber-500/15 text-amber-300',
  silver: 'bg-slate-400/15 text-[var(--color-navy)]',
  basic: 'bg-stone-500/15 text-stone-300',
};

export default function ShieldLevelBadge({ level }: ShieldLevelBadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneMap[level] || 'bg-slate-500/15 text-[var(--color-muted)]'}`}>
      <AdminStatusText value={level} />
    </span>
  );
}
