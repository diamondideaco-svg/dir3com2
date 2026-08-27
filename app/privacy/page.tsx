export const metadata = {
  title: 'Privacy | الخصوصية | DIR3COM',
  description: 'DIR3COM and DABRA privacy notice for website and ChatGPT plugin use.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#07111f] px-6 py-20 text-white" dir="auto">
      <article className="mx-auto max-w-4xl space-y-10 rounded-3xl border border-white/10 bg-white/5 p-8 md:p-12">
        <header className="space-y-3">
          <p className="text-sm font-semibold tracking-[0.2em] text-amber-300">DIR3COM · DABRA</p>
          <h1 className="text-4xl font-semibold">Privacy Notice · إشعار الخصوصية</h1>
          <p className="text-white/60">Effective: 26 August 2026 · ساري من: 26 أغسطس 2026</p>
        </header>
        <section className="space-y-3" lang="en" dir="ltr">
          <h2 className="text-2xl font-semibold">English</h2>
          <p>DABRA is DIR3COM&apos;s read-only travel-planning experience available on DIR3COM and through ChatGPT. It can read DIR3COM&apos;s public service catalog and verified marketplace records to answer questions and prepare trip briefs.</p>
          <p>We process the travel preferences you choose to send, such as destination, dates, party size, interests, and budget. In ChatGPT, OpenAI also processes your conversation under its own terms and privacy policy. DABRA V1 does not require a DIR3COM account and does not receive your ChatGPT password or payment credentials.</p>
          <p>DABRA V1 does not book, pay, cancel, refund, modify accounts, or write to DIR3COM databases. Those actions require explicit human approval and completion through DIR3COM. We do not sell personal information. Operational logs may retain limited request metadata for security, abuse prevention, and reliability; secrets and privileged credentials are not included in tool results.</p>
          <p>Requests may be handled by DIR3COM&apos;s hosting and infrastructure providers. Retention is limited to what is necessary for security, legal compliance, and service operation. You may request access, correction, or deletion through <a className="text-amber-300 underline" href="https://www.dir3com.com/contact">DIR3COM Support</a>.</p>
        </section>
        <section className="space-y-3 text-right" lang="ar" dir="rtl">
          <h2 className="text-2xl font-semibold">العربية</h2>
          <p>DABRA هي تجربة تخطيط رحلات للقراءة فقط من DIR3COM، ومتاحة عبر DIR3COM وChatGPT. يمكنها قراءة كتالوج الخدمات العام والسجلات الموثقة في سوق DIR3COM للإجابة وإعداد موجز رحلة.</p>
          <p>نعالج تفضيلات الرحلة التي تختار إرسالها، مثل الوجهة والتواريخ وعدد المسافرين والاهتمامات والميزانية. وعند الاستخدام داخل ChatGPT، تعالج OpenAI المحادثة أيضًا وفق شروطها وسياسة الخصوصية الخاصة بها. لا تتطلب DABRA V1 حساب DIR3COM ولا تستلم كلمة مرور ChatGPT أو بيانات الدفع.</p>
          <p>لا تنفّذ DABRA V1 الحجز أو الدفع أو الإلغاء أو الاسترداد أو تعديل الحسابات أو الكتابة في قواعد بيانات DIR3COM. تتطلب هذه العمليات موافقة بشرية صريحة وإتمامها عبر DIR3COM. لا نبيع المعلومات الشخصية، وقد نحتفظ بقدر محدود من بيانات الطلبات لأغراض الأمان ومنع إساءة الاستخدام والموثوقية.</p>
          <p>يمكنك طلب الوصول أو التصحيح أو الحذف عبر <a className="text-amber-300 underline" href="https://www.dir3com.com/contact">دعم DIR3COM</a>.</p>
        </section>
      </article>
    </main>
  );
}
