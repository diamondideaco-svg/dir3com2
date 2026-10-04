'use client';
import { useRef, useState } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { ContentContainer, SectionContainer } from '@/components/design-system';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PublicHero from '@/components/public/PublicHero';
const empty = { name: '', email: '', phone: '', subject: '', message: '', country: '' };
export default function ContactPublicPage() {
  const { language } = useLanguage(); const ar = language === 'ar';
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reference?: string; error?: string } | null>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const submitting = useRef(false);
  const copy = (arabic: string, english: string) => ar ? arabic : english;
  const update = (key: keyof typeof empty, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    submitting.current = true; setBusy(true); setResult(null);
    try {
      const payload = JSON.stringify(form);
      if (attempt.current?.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() };
      const response = await fetch('/api/contact', { method: 'POST', headers: {
        'Content-Type': 'application/json', 'Idempotency-Key': attempt.current.key,
      }, body: payload });
      const body = await response.json();
      if (!response.ok || body.status !== 'received' || typeof body.reference !== 'string') {
        setResult({ error: body.code || 'CONTACT_DELIVERY_UNAVAILABLE' }); return;
      }
      setResult({ reference: body.reference }); setForm(empty); attempt.current = null;
    } catch { setResult({ error: 'CONTACT_DELIVERY_UNAVAILABLE' }); }
    finally { submitting.current = false; setBusy(false); }
  }
  const fieldClass = 'mt-2 block w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-slate-900';
  return <div className="page-stack-shell" dir={ar ? 'rtl' : 'ltr'}>
    <PublicHero eyebrow="CONTACT DIR3COM" title={copy('تواصل معنا', 'Contact us')}
      description={copy('أرسل استفسارك إلى فريق العمليات واحتفظ برقم الاستلام.', 'Send your enquiry to Operations and keep your receipt reference.')}
      highlight="" chips={['dir3com.com']} />
    <SectionContainer className="py-8"><ContentContainer className="max-w-3xl">
      <Card><CardHeader><CardTitle>{copy('رسالتك لفريق العمليات', 'Your message to Operations')}</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-5 text-sm">{copy('استلام الرسالة لا يعني حجزًا أو دفعًا، ولا يؤكد إرسال بريد أو واتساب. لا ترسل كلمات مرور أو بيانات دفع.', 'A receipt is not a booking or payment and does not confirm email or WhatsApp delivery. Do not send passwords or payment details.')}</p>
          {result && <div role={result.error ? 'alert' : 'status'} className="mb-5 break-words rounded-xl border p-4">
            {result.reference ? <>{copy('حُفظت رسالتك في صندوق العمليات. رقم الاستلام:', 'Your message was saved in the Operations inbox. Receipt:')} <span dir="ltr" className="block break-all">{result.reference}</span></>
              : result.error === 'CONTACT_RATE_LIMITED' ? copy('وصلت الرسائل إلى الحد المسموح. احتفظ بنصك وحاول بعد ساعة.', 'The message limit has been reached. Keep your text and try again in an hour.')
              : result.error === 'CONTACT_INVALID' ? copy('راجع الحقول المطلوبة وصيغة البريد وحدود النص.', 'Check required fields, email format and text limits.')
              : copy('تعذر تأكيد استلام الرسالة. احتفظ بالنص وأعد المحاولة بنفس البيانات؛ لن تتكرر الرسالة عند إعادة المحاولة.', 'We could not confirm receipt. Keep your text and retry with the same details; retries of this submission are deduplicated.')}
          </div>}
          <form onSubmit={submit} className="space-y-4">
            <fieldset disabled={busy} className="min-w-0 space-y-4">
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
              <Button type="submit" variant="gold" disabled={busy}>{busy ? copy('جارٍ الحفظ…', 'Saving…') : copy('إرسال الرسالة', 'Submit message')}</Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>
    </ContentContainer></SectionContainer>
  </div>;
}
