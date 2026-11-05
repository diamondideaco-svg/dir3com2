'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { ContentContainer, SectionContainer } from '@/components/design-system';
import { Button } from '@/components/ui/button';
import ContactPublicPage from '@/components/public/ContactPublicPage';
import { CustomerCaseSession } from '@/lib/contact/customer-case-session';
import { supabase } from '@/lib/supabase/client';
import type { CustomerCaseStatus } from '@/lib/contact/customer-cases';

export default function CustomerCasesPage() {
  const { language } = useLanguage(), ar = language === 'ar';
  const copy = (arabic: string, english: string) => ar ? arabic : english;
  const [session] = useState(() => new CustomerCaseSession());
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot);
  useEffect(() => {
    void session.refreshIdentity();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, authSession) => {
      if (event === 'INITIAL_SESSION') return;
      void session.refreshIdentity({ sameAccountRefresh: event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED',
        userId: authSession?.user.id ?? null });
    });
    return () => { subscription.unsubscribe(); session.clear(); };
  }, [session]);
  const status = (value: CustomerCaseStatus) => value === 'received' ? copy('مستلمة', 'Received')
    : value === 'in_progress' ? copy('قيد المتابعة', 'In progress') : copy('مغلقة', 'Closed');
  const date = (value: string) => new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-GB',
    { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(value));
  return <main className="page-stack-shell" dir={ar ? 'rtl' : 'ltr'}>
    <SectionContainer className="py-8"><ContentContainer className="max-w-3xl">
      <h1 className="text-3xl font-semibold">{copy('قضايا الدعم الخاصة بي', 'My support cases')}</h1>
      <p className="mt-3">{copy('هذه حالة متابعة فريق العمليات؛ لا تنشئ حجزًا أو دفعًا، ولا تؤكد اتصالًا أو رسالة خارج المنصة.',
        'These are Operations follow-up statuses. They do not create a booking or payment, or confirm a call or message outside the platform.')}</p>
      {state.identity === 'loading' ? <p role="status" className="mt-5">{copy('جارٍ التحقق من الجلسة…', 'Checking your session…')}</p>
      : state.identity === 'authentication_required' ? <p role="status" className="mt-5"><Link href="/login?next=%2Fsupport%2Fcases">{copy('سجّل الدخول بحساب عميل لعرض قضاياك.', 'Sign in with a Customer account to view your cases.')}</Link></p>
      : state.identity === 'unavailable' ? <p role="alert" className="mt-5">{copy('تعذر التحقق من صلاحية عرض قضايا الحساب. حدّث الصفحة ثم راجع قضاياك قبل أي إرسال جديد.', 'We could not verify access to your cases. Refresh, then check your cases before submitting again.')}</p>
      : <>
        <div className="my-5"><Button variant="outline" onClick={() => void session.reload()} disabled={state.busy}>{copy('تحديث الحالة', 'Refresh status')}</Button></div>
        {state.busy && <p role="status">{copy('جارٍ قراءة قضاياك…', 'Loading your cases…')}</p>}
        {state.error && <p role="alert">{copy('حالة القضايا غير متاحة الآن؛ هذا لا يعني عدم وجود قضايا.', 'Case status is unavailable. This does not mean you have no cases.')}</p>}
        {state.cases && state.cases.cases.length === 0 && <p>{copy('لا توجد قضايا مرتبطة بحسابك.', 'No cases are linked to your account.')}</p>}
        {state.cases?.truncated && <p>{copy('نعرض أحدث 20 قضية فقط.', 'Showing only your latest 20 cases.')}</p>}
        <div className="space-y-4">{state.cases?.cases.map(item => <article key={item.reference} className="rounded-xl border bg-[var(--color-card-strong)] p-4 text-[var(--color-navy)]">
          <h2 className="break-all font-semibold" dir="ltr">{item.reference}</h2>
          <p className="mt-2">{status(item.status)} · {item.country}</p>
          <p className="mt-1 text-sm">{copy('آخر تحديث بتوقيت الرياض:', 'Updated, Riyadh time:')} {date(item.updatedAt)}</p>
          <ol className="mt-3 space-y-1">{item.events.map((event, index) => <li key={index}>{status(event.status)} — {date(event.createdAt)}</li>)}</ol>
        </article>)}</div>
      </>}
    </ContentContainer></SectionContainer>
    {state.identity === 'customer' && <ContactPublicPage key={state.generation} customerCase submitCustomerCase={request => session.submitCase({ ...request, generation: state.generation })} onSaved={() => void session.reload()} />}
  </main>;
}
