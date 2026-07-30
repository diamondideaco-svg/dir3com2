export function PlatformHealthCard({ title, value, tone = 'neutral' }: { title: string; value: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const toneClasses = {
    neutral: 'border-slate-800 bg-slate-900/70 text-slate-300',
    success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    danger: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  } as Record<string, string>;

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-sm">{title}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
