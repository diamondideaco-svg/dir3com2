'use client';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { ContentContainer, SectionContainer } from '@/components/design-system';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PublicHero from '@/components/public/PublicHero';
import type { CustomerCaseSubmit } from '@/lib/contact/customer-case-session';
const empty = { name: '', email: '', phone: '', subject: '', message: '', country: '' };
type ContactPageProps =
  | { customerCase?: false; onSaved?: () => void; submitCustomerCase?: never; blocked?: never }
  | { customerCase: true; onSaved?: () => void; submitCustomerCase: CustomerCaseSubmit; blocked?: boolean };
export default function ContactPublicPage(props: ContactPageProps = {}) {
  const customerCase = props.customerCase === true, onSaved = props.onSaved;
  const blocked = props.customerCase === true && props.blocked === true;
  const { language } = useLanguage(); const ar = language === 'ar';
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reference?: string; error?: string } | null>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const submitting = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { const controller = request.current; request.current = null; controller?.abort(); }, []);
  useEffect(() => { if (blocked) request.current?.abort(); }, [blocked]);
  const copy = (arabic: string, english: string) => ar ? arabic : english;
  const update = (key: keyof typeof empty, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (blocked || submitting.current) return;
    submitting.current = true; setBusy(true); setResult(null);
    const controller = new AbortController(); request.current = controller;
    const current = () => request.current === controller && !controller.signal.aborted;
    const release = () => {
      if (request.current === controller) { request.current = null; submitting.current = false; setBusy(false); }
    };
    controller.signal.addEventListener('abort', release, { once: true });
    try {
      const payload = JSON.stringify(form);
      if (props.customerCase) {
        const result = await props.submitCustomerCase({ payload, signal: controller.signal });
        if (!current()) return;
        if (result.kind === 'inactive' || result.kind === 'busy') {
          if (result.canDisplay()) setResult({ error: result.kind === 'busy' ? 'CONTACT_SUBMISSION_PENDING' : 'CONTACT_ACCESS_UNAVAILABLE' });
          return;
        }
        if (!result.commit()) return;
        if (result.kind === 'saved') { setResult({ reference: result.reference }); setForm(empty); onSaved?.(); }
        else setResult({ error: result.code });
        return;
      }
      if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
      const response = await fetch('/api/contact', { method: 'POST', credentials: 'same-origin', signal: controller.signal, headers: {
        'Content-Type': 'application/json', 'Idempotency-Key': attempt.current.key,
      }, body: payload });
      const body = await response.json();
      if (!current()) return;
      if (!response.ok || body.status !== 'received' || typeof body.reference !== 'string') {
        setResult({ error: body.code || 'CONTACT_DELIVERY_UNAVAILABLE' }); return;
      }
      setResult({ reference: body.reference }); setForm(empty); attempt.current = null; onSaved?.();
    } catch { if (current()) setResult({ error: 'CONTACT_DELIVERY_UNAVAILABLE' }); }
    finally { controller.signal.removeEventListener('abort', release); release(); }
  }
  const fieldClass = 'mt-2 block w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-slate-900';
  return <div className="page-stack-shell" dir={ar ? 'rtl' : 'ltr'}>
    <PublicHero eyebrow="CONTACT DIR3COM" title={customerCase ? copy('قضية دعم جديدة', 'New support case') : copy('تواصل معنا', 'Contact us')}
      description={copy('أرسل استفسارك إلى فريق العمليات واحتفظ برقم الاستلام.', 'Send your enquiry to Operations and keep your receipt reference.')}
      highlight="" chips={['dir3com.com']} />
    <SectionContainer className="py-8"><ContentContainer className="max-w-3xl">
      <Card><CardHeader><CardTitle>{copy('رسالتك لفريق العمليات', 'Your message to Operations')}</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-5 text-sm">{copy('استلام الرسالة لا يعني حجزًا أو دفعًا، ولا يؤكد إرسال بريد أو واتساب. لا ترسل كلمات مرور أو بيانات دفع.', 'A receipt is not a booking or payment and does not confirm email or WhatsApp delivery. Do not send passwords or payment details.')}</p>
          {customerCase && <p className="mb-5 text-sm">{copy('لا يُحفظ النص عند مغادرة النموذج. بعد تحديث الصفحة بالكامل أو تسجيل الخروج، راجع قضاياك قبل إرسال طلب جديد؛ ينتهي ضمان إعادة المحاولة في هذه الجلسة.', 'Text is not retained when you leave the form. If you reload the page or sign out, check your cases before making a new submission; this session retry guarantee ends.')}</p>}
          {result && <div role={result.error ? 'alert' : 'status'} className="mb-5 break-words rounded-xl border p-4">
            {result.reference ? <>{copy('حُفظت رسالتك في صندوق العمليات. رقم الاستلام:', 'Your message was saved in the Operations inbox. Receipt:')} <span dir="ltr" className="block break-all">{result.reference}</span></>
              : customerCase && result.error === 'CONTACT_ACCESS_UNAVAILABLE' ? copy('تعذر التحقق من جاهزية قضاياك للإرسال. احتفظ بالنص وحدّث حالة القضايا.', 'We could not verify that your cases are ready for submission. Keep your text and refresh case status.')
              : customerCase && result.error === 'CONTACT_SUBMISSION_PENDING' ? copy('هناك محاولة قيد الانتظار. انتظر نتيجتها قبل المحاولة مجددًا.', 'A submission is pending. Wait for its result before trying again.')
              : result.error === 'CONTACT_RATE_LIMITED' ? copy('وصلت الرسائل إلى الحد المسموح. احتفظ بنصك وحاول بعد ساعة.', 'The message limit has been reached. Keep your text and try again in an hour.')
              : result.error === 'CONTACT_INVALID' ? copy('راجع الحقول المطلوبة وصيغة البريد وحدود النص.', 'Check required fields, email format and text limits.')
              : customerCase && result.error === 'CONTACT_KEY_CONFLICT' ? copy('المحاولة السابقة غير محسومة. أعد إدخال تفاصيلها الأصلية أو راجع قضاياك قبل إرسال طلب جديد.', 'The earlier submission is unresolved. Reenter its original details or check your cases before making a new submission.')
              : customerCase ? copy('تعذر تأكيد الحفظ. إعادة المحاولة في هذه الجلسة تستخدم الطلب نفسه حتى لو عدّلت الحقول؛ استخدم التفاصيل الأصلية.', 'Saving is unconfirmed. A retry in this session uses the same submission even if you edit fields; use the original details.')
              : copy('تعذر تأكيد استلام الرسالة. احتفظ بالنص وأعد المحاولة بنفس البيانات؛ لن تتكرر الرسالة عند إعادة المحاولة.', 'We could not confirm receipt. Keep your text and retry with the same details; retries of this submission are deduplicated.')}
          </div>}
          <form onSubmit={submit} className="space-y-4">
            <fieldset disabled={busy || blocked} className="min-w-0 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label>{copy('الاسم', 'Name')}<input required maxLength={120} autoComplete="name" className={fieldClass} value={form.name} onChange={e => update('name', e.target.value)} /></label>
                <label>{copy('البريد الإلكتروني', 'Email')}<input required type="email" maxLength={254} autoComplete="email" dir="ltr" className={fieldClass} value={form.email} onChange={e => update('email', e.target.value)} /></label>
                <label>{copy('الهاتف (اختياري)', 'Phone (optional)')}<input type="tel" maxLength={32} autoComplete="tel" dir="ltr" className={fieldClass} value={form.phone} onChange={e => update('phone', e.target.value)} /></label>
                <label>{copy('بلد الخدمة', 'Service country')}<select required className={fieldClass} value={form.country} onChange={e => update('country', e.target.value)}>
                  <option value="">{copy('اختر البلد', 'Choose country')}</option>
                  <option value="EG">{copy('مصر', 'Egypt')}</option><option value="SA">{copy('السعودية', 'Saudi Arabia')}</option>
                  <option value="AE">{copy('الإمارات', 'UAE')}</option><option value="OTHER">{copy('أخرى / استفسار عام', 'Other / general enquiry')}</option>
                </select></label>
              </div>
              <label className="block">{copy('الموضوع', 'Subject')}<select required className={fieldClass} value={form.subject} onChange={e => update('subject', e.target.value)}>
                <option value="">{copy('اختر الموضوع', 'Choose subject')}</option>
                <option value="booking">{copy('استفسار عن حجز', 'Booking enquiry')}</option><option value="service">{copy('استفسار عن خدمة', 'Service enquiry')}</option>
                <option value="partnership">{copy('شراكة', 'Partnership')}</option><option value="other">{copy('أخرى', 'Other')}</option>
              </select></label>
              <label className="block">{copy('الرسالة', 'Message')}<textarea required rows={6} maxLength={2000} className={fieldClass} value={form.message} onChange={e => update('message', e.target.value)} /></label>
              <Button type="submit" variant="gold" disabled={busy || blocked}>{busy ? copy('جارٍ الحفظ…', 'Saving…') : copy('إرسال الرسالة', 'Submit message')}</Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>
    </ContentContainer></SectionContainer>
  </div>;
}
