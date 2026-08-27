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
          <p className="mt-6 text-lg leading-9 text-[var(--color-muted)]">{arabic ? 'يسعد فريق dir3com مساعدتك في أسئلة الخدمات والحجوزات ومتابعة الطلبات. استخدم صفحة التواصل لإرسال طلبك، واذكر رقم الطلب أو تفاصيل الخدمة إن كانت متاحة.' : 'The dir3com team can help with service, booking, and request follow-up questions. Use the contact page to send your request and include an order reference or service details when available.'}</p>
          <div className="mt-8 space-y-5 text-base leading-8 text-[var(--color-muted)]">
            <p>{arabic ? 'للاطلاع على طريقة التعامل مع معلومات الحساب والتواصل والجلسات وتفاعلات الدبرة، راجع سياسة الخصوصية.' : 'See the privacy policy for the current description of account, contact, session, and DABRA interaction data.'}</p>
            <p>{arabic ? 'لمراجعة الإطار العام لاستخدام المنصة والطلبات، راجع الشروط والأحكام.' : 'See the terms and conditions for the general framework governing platform use and requests.'}</p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/contact" className={buttonVariants({ variant: 'gold', size: 'lg' })}>{arabic ? 'تواصل معنا' : 'Contact us'}</Link>
            <Link href="/privacy" className={buttonVariants({ variant: 'outline', size: 'lg' })}>{arabic ? 'سياسة الخصوصية' : 'Privacy policy'}</Link>
            <Link href="/terms" className={buttonVariants({ variant: 'outline', size: 'lg' })}>{arabic ? 'الشروط والأحكام' : 'Terms and conditions'}</Link>
          </div>
        </ContentContainer>
      </SectionContainer>
    </main>
  );
}
