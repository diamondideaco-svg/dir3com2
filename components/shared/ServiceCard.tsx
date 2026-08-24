'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Chip } from '@/components/design-system';
import { buttonVariants } from '@/components/ui/button';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { getCanonicalService } from '@/lib/services/canonical';

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
  category?: string;
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
  const router = useRouter();
  const { language } = useLanguage();
  const href = service.href?.startsWith('/') ? service.href : `/services/${service.slug}`;
  const canonical = getCanonicalService(href.split('/').filter(Boolean).at(-1) ?? service.slug);
  const hasArabic = (value?: string) => Boolean(value && /[\u0600-\u06FF]/.test(value));
  const name = language === 'ar'
    ? service.name_ar
    : !hasArabic(service.name_en) && service.name_en
      ? service.name_en
      : canonical?.name ?? service.name_ar;
  const description = language === 'ar'
    ? service.description_ar
    : !hasArabic(service.description_en) && service.description_en
      ? service.description_en
      : canonical?.descriptionEn ?? service.description_ar;
  const categoryLabels: Record<string, { ar: string; en: string }> = {
    cars: { ar: 'السيارات', en: 'Cars' },
    hotels: { ar: 'الفنادق', en: 'Hotels' },
    apartments: { ar: 'الشقق', en: 'Apartments' },
    'airport-transfers': { ar: 'النقل من وإلى المطار', en: 'Airport transfers' },
    concierge: { ar: 'الكونسيرج', en: 'Concierge' },
    experiences: { ar: 'التجارب', en: 'Experiences' },
    offers: { ar: 'العروض', en: 'Offers' },
  };
  const tagTranslations: Record<string, string> = {
    'سائق خاص': 'Private driver', 'تنقلات مطار': 'Airport transfers', 'سيارات تنفيذية': 'Executive cars',
    'إقامة راقية': 'Premium stays', 'شقق مخدومة': 'Serviced apartments', 'خيارات مرنة': 'Flexible options',
    استقبال: 'Meet and greet', 'مسار سريع': 'Fast lane', مرافقة: 'Assistance',
    'مساعدة شخصية': 'Personal assistance', 'متابعة يومية': 'Daily follow-up', 'دعم فوري': 'Immediate support',
    'أولوية تنسيق': 'Priority coordination', وفود: 'Delegations', 'خدمة مخصصة': 'Dedicated service',
  };
  const displayedCategory = service.category && categoryLabels[service.category]
    ? categoryLabels[service.category][language]
    : service.categoryLabel;
  const displayedTags = service.tags?.map((tag) => language === 'en' ? tagTranslations[tag] ?? tag : tag);
  const labels = [
    service.featured ? (language === 'ar' ? 'مميز' : 'Featured') : null,
    service.popular ? (language === 'ar' ? 'شائع' : 'Popular') : null,
    service.recommended ? (language === 'ar' ? 'موصى به' : 'Recommended') : null,
  ].filter(Boolean) as string[];

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
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[32px] border border-[color:var(--color-border)] bg-[linear-gradient(170deg,rgba(255,255,255,0.9)_0%,rgba(247,242,233,0.82)_100%)] p-6 text-start shadow-[0_20px_48px_rgba(13,27,42,0.08)] transition-all duration-200 hover:-translate-y-2 hover:border-[var(--color-gold)]/45 hover:shadow-[0_28px_62px_rgba(13,27,42,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
    >
      <div className="-mx-6 -mt-6 mb-5 border-b border-[var(--color-gold)]/14 bg-[linear-gradient(145deg,rgba(13,27,42,0.9)_0%,rgba(28,49,68,0.72)_60%,rgba(212,175,55,0.44)_140%)] px-6 py-5 text-[var(--color-light)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-1 items-start gap-4">
            <div className="mt-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/88 shadow-[0_8px_18px_rgba(13,27,42,0.2)]">
              {service.icon ? (
                <Image src={service.icon} alt={name} width={28} height={28} className="h-7 w-7" />
              ) : (
                <span className="h-7 w-7 rounded-full bg-[var(--color-gold)]/30" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-semibold tracking-[0.25em] text-[var(--color-gold)]">
                {service.badge ?? service.familyLabel ?? (language === 'ar' ? 'خدمة مميزة' : 'Featured service')}
              </p>
              <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">{name}</h3>
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
            {(displayedCategory || service.metric) && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {displayedCategory && (
                  <Chip className="font-medium text-[var(--color-muted)]">
                    {displayedCategory}
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

      <p className="mt-5 flex-1 text-sm leading-8 text-[var(--color-muted)]">{description}</p>

      {displayedTags?.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {displayedTags.slice(0, 3).map((tag) => (
            <Chip key={tag} className="bg-[var(--color-surface)] text-xs font-medium text-[var(--color-navy)]">
              {tag}
            </Chip>
          ))}
        </div>
      ) : null}

      {(service.basePrice || service.productCount) ? (
        <div className="mt-5 flex items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
          <span>{service.productCount ? `${service.productCount} ${language === 'ar' ? 'خيار' : 'options'}` : language === 'ar' ? 'خدمة جاهزة للعرض' : 'Service available'}</span>
          <span className="text-base font-semibold text-[var(--color-gold)]">
            {service.basePrice ? `${service.basePrice} ${service.currency ?? 'SAR'}` : language === 'ar' ? 'حسب الطلب' : 'On request'}
          </span>
        </div>
      ) : null}

      <Link
        href={href}
        onClick={(event) => event.stopPropagation()}
        className={`${buttonVariants({ variant: 'gold', size: 'default' })} mt-6 cursor-pointer`}
      >
        {language === 'ar' ? 'عرض الخدمة' : 'View service'}
      </Link>
    </article>
  );
}
