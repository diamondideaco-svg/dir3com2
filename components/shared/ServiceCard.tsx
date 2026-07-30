import Image from 'next/image';
import Link from 'next/link';
import { Badge, Chip } from '@/components/design-system';

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
    <article className="group flex h-full flex-col overflow-hidden rounded-[32px] border border-[color:var(--color-border)] bg-[linear-gradient(170deg,rgba(255,255,255,0.9)_0%,rgba(247,242,233,0.82)_100%)] p-6 text-right shadow-[0_20px_48px_rgba(13,27,42,0.08)] transition-all duration-300 hover:-translate-y-2 hover:border-[var(--color-gold)]/45 hover:shadow-[0_28px_62px_rgba(13,27,42,0.14)]">
      <div className="-mx-6 -mt-6 mb-5 border-b border-[var(--color-gold)]/14 bg-[linear-gradient(145deg,rgba(13,27,42,0.9)_0%,rgba(28,49,68,0.72)_60%,rgba(212,175,55,0.44)_140%)] px-6 py-5 text-[var(--color-light)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-1 items-start gap-4">
            <div className="mt-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/88 shadow-[0_8px_18px_rgba(13,27,42,0.2)]">
              {service.icon ? (
                <Image src={service.icon} alt={service.name_ar} width={28} height={28} className="h-7 w-7" />
              ) : (
                <span className="h-7 w-7 rounded-full bg-[var(--color-gold)]/30" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold tracking-[0.25em] text-[var(--color-gold)]">
                {service.badge ?? service.familyLabel ?? 'خدمة مميزة'}
              </p>
              <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">{service.name_ar}</h3>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap justify-end gap-2">
              {labels.map((label) => (
                <Badge key={label} className="border-white/25 bg-white/12 text-[11px] text-white/90 backdrop-blur-sm">
                  {label}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-1 items-start gap-4">
          <div className="flex-1">
            {(service.categoryLabel || service.metric) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {service.categoryLabel && (
                  <Chip className="font-medium text-[var(--color-muted)]">
                    {service.categoryLabel}
                  </Chip>
                )}
                {service.metric && (
                  <Chip className="bg-[var(--color-surface)] font-medium text-[var(--color-navy)]">
                    {service.metric}
                  </Chip>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="mt-5 flex-1 text-sm leading-8 text-[var(--color-muted)]">{service.description_ar}</p>

      {service.tags?.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {service.tags.slice(0, 3).map((tag) => (
            <Chip key={tag} className="bg-[var(--color-surface)] text-xs font-medium text-[var(--color-navy)]">
              {tag}
            </Chip>
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
        className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-gold)] px-5 py-3 text-sm font-semibold text-[var(--color-navy)] transition hover:-translate-y-1"
      >
        استكشف الخدمة
      </Link>
    </article>
  );
}
