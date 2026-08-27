export const metadata = {
  title: 'Terms | الشروط | DIR3COM',
  description: 'DIR3COM and DABRA terms of use for website and ChatGPT plugin use.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#07111f] px-6 py-20 text-white" dir="auto">
      <article className="mx-auto max-w-4xl space-y-10 rounded-3xl border border-white/10 bg-white/5 p-8 md:p-12">
        <header className="space-y-3">
          <p className="text-sm font-semibold tracking-[0.2em] text-amber-300">DIR3COM · DABRA</p>
          <h1 className="text-4xl font-semibold">Terms of Use · شروط الاستخدام</h1>
          <p className="text-white/60">Effective: 26 August 2026 · ساري من: 26 أغسطس 2026</p>
        </header>
        <section className="space-y-3" lang="en" dir="ltr">
          <h2 className="text-2xl font-semibold">English</h2>
          <p>DABRA V1 provides informational, read-only travel planning. Results may include verified marketplace data or catalog-only descriptions; DABRA identifies the source and status and does not guarantee availability, price, suitability, or fulfillment.</p>
          <p>DABRA does not execute or claim to execute bookings, payments, cancellations, refunds, account changes, or database updates. Any transaction requires your explicit approval and must be completed through DIR3COM, where the applicable provider terms, price, availability, and cancellation rules will be shown.</p>
          <p>You must provide lawful, accurate inputs and must not use the service to probe systems, obtain secrets, bypass access controls, or harm others. ChatGPT use is also subject to OpenAI&apos;s applicable terms. DIR3COM may limit or suspend access to protect users and systems.</p>
          <p>Travel information can change. Verify critical details directly before relying on them. To the extent permitted by law, DIR3COM is not liable for decisions made solely from an informational brief. Contact <a className="text-amber-300 underline" href="https://www.dir3com.com/contact">support</a> with questions.</p>
        </section>
        <section className="space-y-3 text-right" lang="ar" dir="rtl">
          <h2 className="text-2xl font-semibold">العربية</h2>
          <p>تقدم DABRA V1 تخطيط سفر معلوماتيًا للقراءة فقط. قد تتضمن النتائج بيانات سوق موثقة أو أوصاف كتالوج فقط، وتوضح DABRA المصدر والحالة دون ضمان التوفر أو السعر أو الملاءمة أو التنفيذ.</p>
          <p>لا تنفّذ DABRA ولا تدّعي تنفيذ الحجز أو الدفع أو الإلغاء أو الاسترداد أو تعديل الحساب أو قاعدة البيانات. تتطلب أي معاملة موافقتك الصريحة وإتمامها عبر DIR3COM، حيث تُعرض شروط المزود والسعر والتوفر وسياسات الإلغاء المعمول بها.</p>
          <p>يجب أن تكون مدخلاتك قانونية ودقيقة، ويُمنع استخدام الخدمة لاستخراج الأسرار أو تجاوز ضوابط الوصول أو الإضرار بالآخرين. يخضع الاستخدام عبر ChatGPT أيضًا لشروط OpenAI المطبقة. قد تحد DIR3COM الوصول لحماية المستخدمين والأنظمة.</p>
          <p>قد تتغير معلومات السفر؛ تحقّق من التفاصيل المهمة مباشرة قبل الاعتماد عليها. تواصل مع <a className="text-amber-300 underline" href="https://www.dir3com.com/contact">الدعم</a> للاستفسار.</p>
        </section>
      </article>
    </main>
  );
}
