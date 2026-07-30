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
          <div key={index} className="h-64 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/5" />
        ))}
      </div>
    );
  }

  if (!services.length) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-[#D4AF37]/30 bg-[#D4AF37]/10 p-8 text-center text-slate-300">
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
