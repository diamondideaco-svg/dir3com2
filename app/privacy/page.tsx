'use client';

import { useLanguage } from '@/components/i18n/LanguageProvider';
import { ContentContainer, SectionContainer } from '@/components/design-system';

export default function PrivacyPage() {
  const { language, direction } = useLanguage();
  const arabic = language === 'ar';
  return (
    <main className="page-stack-shell" dir={direction}>
      <SectionContainer className="py-16">
        <ContentContainer className="max-w-3xl">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--color-gold)]">{arabic ? 'الخصوصية' : 'Privacy'}</p>
          <h1 className="mt-3 text-4xl font-semibold text-[var(--color-navy)]">{arabic ? 'سياسة الخصوصية' : 'Privacy policy'}</h1>
          <p className="mt-6 text-lg leading-9 text-[var(--color-muted)]">{arabic ? 'نحترم خصوصيتك ونسعى إلى التعامل مع معلوماتك بطريقة مسؤولة. تخضع التفاصيل النهائية لسياسة dir3com الرسمية المعتمدة.' : 'We respect your privacy and aim to handle information responsibly. Final details remain subject to the official dir3com privacy policy.'}</p>
          <div className="mt-8 space-y-5 text-base leading-8 text-[var(--color-muted)]">
            <p>{arabic ? 'تُستخدم المعلومات التي تقدمها لتقديم الخدمة والتواصل معك ضمن الغرض الذي قدمت من أجله.' : 'Information you provide is used to deliver the service and communicate with you for the purpose for which it was provided.'}</p>
            <p>{arabic ? 'لا تعرض هذه الصفحة التزامات أو مدد احتفاظ إضافية؛ يرجى الرجوع إلى النص الرسمي عند نشره.' : 'This page does not add retention commitments; please refer to the official policy for the authoritative details.'}</p>
          </div>
        </ContentContainer>
      </SectionContainer>
    </main>
  );
}
