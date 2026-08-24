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
          <p className="mt-6 text-lg leading-9 text-[var(--color-muted)]">{arabic ? 'نحترم خصوصيتك ونتعامل مع المعلومات اللازمة لتقديم خدمات dir3com والتواصل معك بطريقة مسؤولة. هذه الصفحة معلومات عامة ولا تضيف التزامات أو مددًا غير منشورة.' : 'We respect your privacy and handle the information needed to provide dir3com services and communicate with you responsibly. This page is informational and does not add unpublished commitments or retention periods.'}</p>
          <div className="mt-8 space-y-5 text-base leading-8 text-[var(--color-muted)]">
            <p>{arabic ? 'قد تشمل المعلومات التي تقدمها بيانات الحساب وبيانات التواصل وتفاصيل الخدمات أو الحجوزات التي تطلبها، وتستخدم لتشغيل الطلب والرد على استفساراتك.' : 'Information you provide may include account and contact details, along with the service or booking details you request. We use it to operate the request and respond to your questions.'}</p>
            <p>{arabic ? 'تستخدم المنصة تقنيات الجلسة وملفات تعريف الارتباط اللازمة للحفاظ على تسجيل الدخول وتشغيل بعض وظائف الموقع. لا نذكر هنا تقنيات أو أغراضًا غير مدعومة في التطبيق.' : 'The platform uses session technology and cookies needed to maintain sign-in and operate parts of the site. We do not list technologies or purposes that are not supported by the application.'}</p>
            <p>{arabic ? 'عند استخدام الدبرة، قد تتم معالجة رسالتك وسياق الجلسة المرسل معها لتوليد الرد. لا تدّعي الدبرة الوصول إلى الحجوزات أو المحفظة أو المستندات ما لم يذكر التطبيق خلاف ذلك.' : 'When you use DABRA, your message and the session context sent with it may be processed to generate a reply. DABRA does not claim access to bookings, wallet data, or documents unless the application explicitly indicates otherwise.'}</p>
            <p>{arabic ? 'تستخدم خدمات المصادقة ومقدمو الخدمات التقنيون المعلومات اللازمة لتشغيل الوظائف التي تطلبها. قد تختلف التفاصيل بحسب الخدمة المستخدمة، لذلك لا نضيف من هذه الصفحة ادعاءات عن مدد الاحتفاظ أو النقل أو الحذف.' : 'Authentication services and technical service providers process information needed to operate the functions you request. Details may vary by service, so this page makes no additional claims about retention, transfers, or deletion timelines.'}</p>
          </div>
        </ContentContainer>
      </SectionContainer>
    </main>
  );
}
