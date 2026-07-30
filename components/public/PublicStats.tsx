type PublicStatsProps = {
  stats: Array<{ label: string; value: string }>;
};

export default function PublicStats({ stats }: PublicStatsProps) {
  return (
    <section className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 rounded-[32px] border border-[color:var(--color-border)] bg-white/78 p-4 shadow-[0_18px_40px_rgba(13,27,42,0.06)] md:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[24px] bg-[var(--color-shell)] px-5 py-5 text-center">
            <p className="text-2xl font-semibold text-[var(--color-navy)]">{stat.value}</p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}