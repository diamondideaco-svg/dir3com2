'use client';

import Link from 'next/link';
import { Chip, ContentContainer, SectionContainer, SectionSurface } from '@/components/design-system';
import { publicQuickLinks } from '@/components/public/public-page-data';
import { useLanguage } from '@/components/i18n/LanguageProvider';

export default function PublicRouteIndex() {
  const { language, direction } = useLanguage();
  const ar = language === 'ar';
  return (
    <SectionContainer className="py-8">
      <ContentContainer><div dir={direction}>
        <SectionSurface className="rounded-[32px] p-6 shadow-[0_18px_40px_rgba(13,27,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">{ar ? 'المنصة العامة' : 'PUBLIC PLATFORM'}</p>
              <h2 className="mt-3 text-2xl font-semibold text-[var(--color-navy)] sm:text-3xl">{ar ? 'استكشف صفحات وخدمات dir3com العامة.' : 'Explore DIR3COM public pages and services.'}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {publicQuickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35"
                >
                  <Chip className="px-4 py-2 text-sm font-medium transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]">{ar ? link.ar : link.en}</Chip>
                </Link>
              ))}
            </div>
          </div>
        </SectionSurface>
      </div></ContentContainer>
    </SectionContainer>
  );
}
