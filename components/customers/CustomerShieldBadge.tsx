type CustomerShieldBadgeProps = {
  shieldLevel?: string | null;
};

export default function CustomerShieldBadge({ shieldLevel }: CustomerShieldBadgeProps) {
  const tone = shieldLevel?.includes('VIP') ? 'bg-amber-500/15 text-amber-300' : shieldLevel?.includes('Elite') ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-[var(--color-muted)]';

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
      {shieldLevel || 'DIR3 Shield'}
    </span>
  );
}
