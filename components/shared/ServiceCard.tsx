import Link from 'next/link';

export type ServiceItem = {
  id: string | number;
  name_ar: string;
  description_ar: string;
  slug: string;
  badge?: string;
};

type ServiceCardProps = {
  service: ServiceItem;
};

export default function ServiceCard({ service }: ServiceCardProps) {
  return (
    <article className="group flex h-full flex-col rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-right shadow-[0_20px_60px_rgba(0,0,0,0.18)] transition-all duration-300 hover:-translate-y-2 hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10">
      <div className="flex items-start justify-between gap-4">
        <div className="mt-1 h-10 w-10 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10" />
        <div className="flex-1">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#D4AF37]">
            {service.badge ?? 'خدمة مميزة'}
          </p>
          <h3 className="mt-3 text-xl font-semibold text-white">{service.name_ar}</h3>
        </div>
      </div>

      <p className="mt-5 flex-1 text-sm leading-8 text-slate-300">{service.description_ar}</p>

      <Link
        href={`/services/${service.slug}`}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-[#0D1B2A] transition hover:-translate-y-1"
      >
        استكشف الخدمة
      </Link>
    </article>
  );
}
