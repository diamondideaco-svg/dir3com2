'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { ContentContainer, SectionContainer } from '@/components/design-system';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  const { language, direction } = useLanguage();
  const arabic = language === 'ar';
  return (
    <main className="page-stack-shell" dir={direction}>
      <SectionContainer className="py-20">
        <ContentContainer className="max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--color-gold)]">404</p>
          <h1 className="mt-4 text-4xl font-semibold text-[var(--color-navy)]">{arabic ? 'الصفحة غير متاحة' : 'Page not available'}</h1>
          <p className="mt-5 text-lg leading-9 text-[var(--color-muted)]">{arabic ? 'لم نتمكن من العثور على الصفحة المطلوبة.' : 'We could not find the page you requested.'}</p>
          <Link href="/" className={`${buttonVariants({ variant: 'gold', size: 'lg' })} mt-8`}>{arabic ? 'العودة إلى الرئيسية' : 'Return home'}</Link>
        </ContentContainer>
      </SectionContainer>
    </main>
  );
}
