import ServiceCard, { ServiceItem } from '../shared/ServiceCard';

type ServicesGridProps = {
  services: ServiceItem[];
  loading?: boolean;
  emptyMessage?: string;
};

export default function ServicesGrid({ services, loading = false, emptyMessage = 'لا توجد خدمات متاحة حالياً.' }: ServicesGridProps) {
  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-72 animate-pulse rounded-[30px] border border-[color:var(--color-border)] bg-white/70" />
        ))}
      </div>
    );
  }

  if (!services.length) {
    return (
      <div className="rounded-[30px] border border-dashed border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 p-8 text-center text-[var(--color-muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} />
      ))}
    </div>
  );
}
