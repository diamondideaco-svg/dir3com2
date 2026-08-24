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
          <p className="mt-6 text-lg leading-9 text-[var(--color-muted)]">{arabic ? 'توضح هذه الصفحة الإطار العام لاستخدام منصة وخدمات dir3com. راجع تفاصيل الخدمة قبل الطلب، وتبقى الشروط النهائية المنشورة والمعتمدة هي المرجع عند توفرها.' : 'This page outlines the general framework for using the dir3com platform and services. Review each service detail before requesting it; published, approved terms remain authoritative when available.'}</p>
          <div className="mt-8 space-y-5 text-base leading-8 text-[var(--color-muted)]">
            <p>{arabic ? 'استخدم المنصة والخدمات وفق الأنظمة والتعليمات المعمول بها، وقدّم معلومات صحيحة عند إنشاء الحساب أو طلب خدمة.' : 'Use the platform and services in accordance with applicable rules, and provide accurate information when creating an account or requesting a service.'}</p>
            <p>{arabic ? 'قد تتغير تفاصيل الخدمات أو توفرها. تظهر المعلومات المتاحة في صفحات الخدمة، ويجب مراجعة السعر والتفاصيل قبل إرسال الطلب.' : 'Service details and availability may change. Available information is shown on service pages; review the price and details before submitting a request.'}</p>
            <p>{arabic ? 'تخضع الحجوزات والطلبات لتفاصيل الخدمة والتأكيد الفعلي من المنصة أو مقدم الخدمة. لا تنشئ هذه الصفحة ضمانًا للاسترداد أو الإلغاء أو التوفر أو الدفع.' : 'Bookings and requests depend on the service details and actual confirmation from the platform or service provider. This page does not create a guarantee of refunds, cancellation, availability, or payment.'}</p>
            <p>{arabic ? 'إذا احتجت إلى توضيح، تواصل مع فريق الدعم عبر القنوات الموضحة في مركز المساعدة وصفحة التواصل.' : 'For clarification, contact the support team through the channels listed in the help center and contact page.'}</p>
          </div>
        </ContentContainer>
      </SectionContainer>
    </main>
  );
}
