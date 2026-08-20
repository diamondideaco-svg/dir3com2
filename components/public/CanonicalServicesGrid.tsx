'use client';

import Link from 'next/link';
import Image from 'next/image';
import { FiArrowLeft } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { canonicalServiceHref, canonicalServices } from '@/lib/services/canonical';

const copy = {
  ar: {
    eyebrow: 'PRIMARY SERVICES',
    title: 'خدمات dir3com الأساسية',
    description: 'خمس خدمات أساسية فقط، كل خدمة لها مسار واحد معتمد.',
    open: 'افتح الخدمة',
  },
  en: {
    eyebrow: 'PRIMARY SERVICES',
    title: 'dir3com primary services',
    description: 'Five primary services only, each with a single canonical route.',
    open: 'Open service',
  },
} as const;

export default function CanonicalServicesGrid() {
  const { language, direction } = useLanguage();
  const t = copy[language];

  return (
    <section id="primary-services" className="px-4 py-10 sm:px-6 lg:px-8 lg:py-14" dir={direction}>
      <div className="mx-auto max-w-7xl">
        <p className="ds-heading-eyebrow">{t.eyebrow}</p>
        <h2 className="ds-heading-title">{t.title}</h2>
        <p className="ds-heading-description">{t.description}</p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {canonicalServices.map((service) => (
            <Link
              key={service.slug}
              href={canonicalServiceHref(service.slug)}
              data-canonical-service={service.slug}
              className="brand-card group flex flex-col rounded-[28px] border border-[color:var(--color-border)] p-6 transition hover:-translate-y-0.5 hover:border-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/40"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface)]">
                <Image src={service.icon} alt="" width={24} height={24} />
              </span>
              <p className="mt-4 text-xs font-semibold tracking-[0.18em] text-[var(--color-gold)]">{service.eyebrow}</p>
              <h3 className="mt-2 text-2xl font-semibold text-[var(--color-navy)]">{service.name}</h3>
              <p className="mt-3 flex-1 text-sm leading-8 text-[var(--color-muted)]">
                {language === 'ar' ? service.descriptionAr : service.descriptionEn}
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-gold)] transition group-hover:gap-3">
                {t.open} <FiArrowLeft className={direction === 'ltr' ? 'rotate-180' : undefined} />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
