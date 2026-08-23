'use client';

import { useLanguage } from '@/components/i18n/LanguageProvider';
import { ContentContainer, SectionContainer } from '@/components/design-system';

export default function TermsPage() {
  const { language, direction } = useLanguage();
  const arabic = language === 'ar';
  return (
    <main className="page-stack-shell" dir={direction}>
      <SectionContainer className="py-16">
        <ContentContainer className="max-w-3xl">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--color-gold)]">{arabic ? 'المعلومات القانونية' : 'Legal information'}</p>
          <h1 className="mt-3 text-4xl font-semibold text-[var(--color-navy)]">{arabic ? 'الشروط والأحكام' : 'Terms and conditions'}</h1>
          <p className="mt-6 text-lg leading-9 text-[var(--color-muted)]">{arabic ? 'توضح هذه الصفحة الإطار العام لاستخدام خدمات dir3com. تخضع الشروط النهائية للنص الرسمي المعتمد من dir3com.' : 'This page outlines the general framework for using dir3com services. Final terms remain subject to the official dir3com terms.'}</p>
          <div className="mt-8 space-y-5 text-base leading-8 text-[var(--color-muted)]">
            <p>{arabic ? 'استخدم المنصة والخدمات وفق الأنظمة والتعليمات المعمول بها، وتحقق من تفاصيل كل خدمة قبل المتابعة.' : 'Use the platform and services in accordance with applicable rules, and review each service detail before continuing.'}</p>
            <p>{arabic ? 'قد تتغير تفاصيل الخدمات أو توفرها. تظهر المعلومات المتاحة في صفحات الخدمة عند توفرها.' : 'Service details and availability may change. Available information is shown on the relevant service pages.'}</p>
          </div>
        </ContentContainer>
      </SectionContainer>
    </main>
  );
}
