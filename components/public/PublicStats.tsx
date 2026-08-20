import { ContentContainer, ResponsiveGrid, SectionContainer, SectionSurface } from '@/components/design-system';

type PublicStatsProps = {
  stats: Array<{ label: string; value: string }>;
};

export default function PublicStats({ stats }: PublicStatsProps) {
  return (
    <SectionContainer className="py-4 lg:py-6">
      <ContentContainer>
        <SectionSurface className="rounded-[32px] p-4 shadow-[0_18px_40px_rgba(13,27,42,0.06)]">
          <ResponsiveGrid className="gap-4 xl:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(239,228,210,0.82)_100%)] px-5 py-5 text-center shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                <p className="text-2xl font-semibold text-[var(--color-navy)]">{stat.value}</p>
                <p className="mt-2 text-sm text-[var(--color-muted)]">{stat.label}</p>
              </div>
            ))}
          </ResponsiveGrid>
        </SectionSurface>
      </ContentContainer>
    </SectionContainer>
  );
}