'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Chip } from '@/components/design-system';
import { buttonVariants } from '@/components/ui/button';
import { marketplacePrimaryAction, type MarketplaceTruth } from '@/lib/marketplace/truth';
import { useLanguage } from '@/components/i18n/LanguageProvider';

export type ServiceItem = {
  id: string | number;
  name_ar: string;
  name_en?: string;
  description_ar: string;
  description_en?: string;
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
  fulfilmentState?: MarketplaceTruth['fulfilmentState'];
  transactionMethod?: MarketplaceTruth['transactionMethod'];
  marketplaceEnvironment?: MarketplaceTruth['environment'];
  supplyType?: MarketplaceTruth['supplyType'];
  supplierName?: string;
  supplierVerified?: boolean;
};

type ServiceCardProps = {
  service: ServiceItem;
};

export default function ServiceCard({ service }: ServiceCardProps) {
  const { language } = useLanguage();
  const en = language === 'en';
  const router = useRouter();
  const href = service.href?.startsWith('/') ? service.href : `/services/${service.slug}`;
  const labels = [
    service.featured ? 'Featured' : null,
    service.popular ? 'Popular' : null,
    service.recommended ? 'Recommended' : null,
  ].filter(Boolean) as string[];
  const action = marketplacePrimaryAction({
    family: service.familyLabel?.toLowerCase().includes('stay') ? 'stay' :
      service.familyLabel?.toLowerCase().includes('fly') ? 'fly' :
      service.familyLabel?.toLowerCase().includes('drive') ? 'drive' :
      service.familyLabel?.toLowerCase().includes('vip') ? 'vip' : 'concierge',
    fulfilmentState: service.fulfilmentState ?? 'catalog_only',
    transactionMethod: service.transactionMethod ?? 'none',
    environment: service.marketplaceEnvironment ?? 'production',
    supplyType: service.supplyType ?? 'unknown',
    supplierVerified: service.supplierVerified === true,
  });
  const actionLabel = action === 'continue_to_booking' ? (en ? 'Continue to booking' : 'متابعة الحجز') :
    action === 'request_to_confirm' ? (en ? 'Request confirmation' : 'طلب تأكيد') :
    action === 'request_quote' ? (en ? 'Request a quote' : 'طلب عرض سعر') :
    action === 'unavailable' ? (en ? 'Unavailable' : 'غير متاح') : (en ? 'View details' : 'عرض التفاصيل');
  const serviceName = en ? (service.name_en ?? service.name_ar) : service.name_ar;
  const serviceDescription = en ? (service.description_en ?? service.description_ar) : service.description_ar;
  const categoryEnglish: Record<string, string> = { السيارات: 'Cars', الفنادق: 'Hotels', الشقق: 'Apartments', 'النقل من وإلى المطار': 'Airport transfers', الكونسيرج: 'Concierge', التجارب: 'Experiences', العروض: 'Offers' };
  const categoryLabel = en ? (categoryEnglish[service.categoryLabel ?? ''] ?? service.categoryLabel) : service.categoryLabel;

  const navigateToService = () => {
    router.push(href || '/services');
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={navigateToService}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigateToService();
        }
      }}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[32px] border border-[color:var(--color-border)] bg-[linear-gradient(170deg,rgba(255,255,255,0.9)_0%,rgba(247,242,233,0.82)_100%)] p-6 text-right shadow-[0_20px_48px_rgba(13,27,42,0.08)] transition-all duration-200 hover:-translate-y-2 hover:border-[var(--color-gold)]/45 hover:shadow-[0_28px_62px_rgba(13,27,42,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
    >
      <div className="-mx-6 -mt-6 mb-5 border-b border-[var(--color-gold)]/14 bg-[linear-gradient(145deg,rgba(13,27,42,0.9)_0%,rgba(28,49,68,0.72)_60%,rgba(212,175,55,0.44)_140%)] px-6 py-5 text-[var(--color-light)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-1 items-start gap-4">
            <div className="mt-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/88 shadow-[0_8px_18px_rgba(13,27,42,0.2)]">
              {service.icon ? (
                <Image src={service.icon} alt={serviceName} width={28} height={28} className="h-7 w-7 rounded-lg object-cover" unoptimized />
              ) : (
                <span className="h-7 w-7 rounded-full bg-[var(--color-gold)]/30" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold tracking-[0.25em] text-[var(--color-gold)]">
                {service.badge ?? service.familyLabel ?? (en ? 'Service' : 'خدمة')}
              </p>
              <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">{serviceName}</h3>
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
            {(categoryLabel || service.metric) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {categoryLabel && (
                  <Chip className="font-medium text-[var(--color-muted)]">
                    {categoryLabel}
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

      <p className="mt-5 flex-1 text-sm leading-8 text-[var(--color-muted)]">{serviceDescription}</p>

      {service.supplierName ? (
        <p className="mt-4 text-xs text-[var(--color-muted)]">
          {en ? 'Supplier' : 'مقدم الخدمة'}: {service.supplierName}{service.supplierVerified ? (en ? ' — verified in dir3com records' : ' — موثّق وفق سجل dir3com') : ''}
        </p>
      ) : null}

      {service.tags?.length && !en ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {service.tags.slice(0, 3).map((tag) => (
            <Chip key={tag} className="bg-[var(--color-surface)] text-xs font-medium text-[var(--color-navy)]">
              {tag}
            </Chip>
          ))}
        </div>
      ) : null}

      {(service.basePrice || service.productCount || service.fulfilmentState) ? (
        <div className="mt-5 flex items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
          <span>{service.productCount ? `${service.productCount} ${en ? 'options' : 'خيار'}` : (en ? 'Service ready to view' : 'خدمة جاهزة للعرض')}</span>
          <span className="text-base font-semibold text-[var(--color-gold)]">
            {service.fulfilmentState === 'verified_quote' ? (en ? 'Quote required' : 'عرض سعر مطلوب') :
              service.fulfilmentState === 'verified_requestable' ? (en ? 'Confirmation required' : 'يتطلب تأكيداً') :
              service.fulfilmentState === 'availability_unknown' ? (en ? 'Availability unknown' : 'التوفر غير معروف') :
              service.fulfilmentState === 'unavailable' ? (en ? 'Unavailable' : 'غير متاح') :
              service.fulfilmentState === 'live_bookable' && service.basePrice ? `${service.basePrice} ${service.currency ?? 'SAR'}` :
              (en ? 'View only' : 'للاطلاع فقط')}
          </span>
        </div>
      ) : null}

      {action === 'unavailable' || action === 'none' ? (
        <span aria-disabled="true" className={`${buttonVariants({ variant: 'outline', size: 'default' })} mt-6 cursor-not-allowed opacity-60`}>
          {actionLabel}
        </span>
      ) : (
        <Link href={href} onClick={(event) => event.stopPropagation()} className={`${buttonVariants({ variant: 'gold', size: 'default' })} mt-6 cursor-pointer`}>
          {actionLabel}
        </Link>
      )}
    </article>
  );
}
