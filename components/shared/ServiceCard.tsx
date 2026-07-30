import Image from 'next/image';
import Link from 'next/link';

export type ServiceItem = {
  id: string | number;
  name_ar: string;
  description_ar: string;
  slug: string;
  badge?: string;
  familyLabel?: string;
  categoryLabel?: string;
  icon?: string;
  metric?: string;
  tags?: string[];
  basePrice?: number;
  currency?: string;
  productCount?: number;
  featured?: boolean;
  popular?: boolean;
  recommended?: boolean;
  href?: string;
};

type ServiceCardProps = {
  service: ServiceItem;
};

export default function ServiceCard({ service }: ServiceCardProps) {
  const href = service.href ?? `/services/${service.slug}`;
  const labels = [
    service.featured ? 'Featured' : null,
    service.popular ? 'Popular' : null,
    service.recommended ? 'Recommended' : null,
  ].filter(Boolean) as string[];

  return (
    <article className="group flex h-full flex-col rounded-[30px] border border-[color:var(--color-border)] bg-white/84 p-6 text-right shadow-[0_18px_45px_rgba(13,27,42,0.08)] transition-all duration-300 hover:-translate-y-2 hover:border-[var(--color-gold)]/40">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-1 items-start gap-4">
          <div className="mt-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface)]">
            {service.icon ? (
              <Image src={service.icon} alt={service.name_ar} width={28} height={28} className="h-7 w-7" />
            ) : (
              <span className="h-7 w-7 rounded-full bg-[var(--color-gold)]/20" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-gold)]">
              {service.badge ?? service.familyLabel ?? 'خدمة مميزة'}
            </p>
            <h3 className="mt-3 text-xl font-semibold text-[var(--color-navy)]">{service.name_ar}</h3>
            {(service.categoryLabel || service.metric) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {service.categoryLabel && (
                  <span className="rounded-full bg-[var(--color-shell)] px-3 py-2 font-medium text-[var(--color-muted)]">
                    {service.categoryLabel}
                  </span>
                )}
                {service.metric && (
                  <span className="rounded-full bg-[var(--color-surface)] px-3 py-2 font-medium text-[var(--color-navy)]">
                    {service.metric}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap justify-end gap-2">
            {labels.map((label) => (
              <span key={label} className="rounded-full border border-[var(--color-gold)]/20 bg-[var(--color-gold)]/10 px-3 py-2 text-[11px] font-semibold text-[var(--color-gold)]">
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-5 flex-1 text-sm leading-8 text-[var(--color-muted)]">{service.description_ar}</p>

      {service.tags?.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {service.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-navy)]">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {(service.basePrice || service.productCount) ? (
        <div className="mt-5 flex items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
          <span>{service.productCount ? `${service.productCount} خيار` : 'خدمة جاهزة للعرض'}</span>
          <span className="text-base font-semibold text-[var(--color-gold)]">
            {service.basePrice ? `${service.basePrice} ${service.currency ?? 'SAR'}` : 'حسب الطلب'}
          </span>
        </div>
      ) : null}

      <Link
        href={href}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-gold)] px-5 py-3 text-sm font-semibold text-[var(--color-navy)] transition hover:-translate-y-1"
      >
        استكشف الخدمة
      </Link>
    </article>
  );
}
