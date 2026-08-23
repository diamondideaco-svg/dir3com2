'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { ContentContainer, SectionContainer } from '@/components/design-system';
import { buttonVariants } from '@/components/ui/button';

export default function SupportPage() {
  const { language, direction } = useLanguage();
  const arabic = language === 'ar';
  return (
    <main className="page-stack-shell" dir={direction}>
      <SectionContainer className="py-16">
        <ContentContainer className="max-w-3xl">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--color-gold)]">{arabic ? 'المساعدة' : 'Support'}</p>
          <h1 className="mt-3 text-4xl font-semibold text-[var(--color-navy)]">{arabic ? 'مركز المساعدة' : 'Help center'}</h1>
          <p className="mt-6 text-lg leading-9 text-[var(--color-muted)]">{arabic ? 'يسعد فريق dir3com مساعدتك في أسئلة الخدمات والحجوزات. استخدم صفحة التواصل لإرسال طلبك.' : 'The dir3com team can help with service and booking questions. Use the contact page to send your request.'}</p>
          <Link href="/contact" className={`${buttonVariants({ variant: 'gold', size: 'lg' })} mt-8`}>{arabic ? 'تواصل معنا' : 'Contact us'}</Link>
        </ContentContainer>
      </SectionContainer>
    </main>
  );
}
