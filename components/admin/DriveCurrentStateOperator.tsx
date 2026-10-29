'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { KapsoTarget } from '@/lib/notifications/kapso-drive-whatsapp';

type Target = KapsoTarget & { category: 'customer.current_state' | 'operations.current_state' };
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const PATH = '/api/admin/drive-whatsapp/current-state';
const CODES = [
  'ACCEPTED_NOT_DELIVERED', 'IDLE_NO_RESEND', 'NOT_SENT', 'UNKNOWN_DO_NOT_RETRY',
  'FAILED_NO_RETRY', 'DISPATCH_UNCONFIRMED_DO_NOT_RETRY', 'FORBIDDEN',
  'CURRENT_STATE_MODE_REQUIRED', 'ORIGIN_REJECTED', 'INVALID_TARGET', 'METHOD_NOT_ALLOWED',
] as const;
type Code = typeof CODES[number];
type State = { kind: 'editing' } | { kind: 'invalid' } | { kind: 'submitting' } | { kind: 'terminal'; code: Code };
const RESULT: Record<Code, { ar: string; en: string }> = {
  ACCEPTED_NOT_DELIVERED: { ar: 'قبل المزود الإشعار، ولم يثبت وصوله بعد. لا تعد الإرسال؛ راجع إيصال التسليم.', en: 'The provider accepted the notice. Delivery is unconfirmed. Do not resend; check the delivery receipt.' },
  IDLE_NO_RESEND: { ar: 'لم تُنفّذ محاولة جديدة. راجع حالة الهدف وإيصالاته، ولا تعد الإرسال.', en: 'No new attempt was made. Inspect the target state and receipts. Do not resend.' },
  NOT_SENT: { ar: 'لم يُرسل الإشعار. راجع الحالة المحفوظة؛ لا توجد إعادة محاولة من هذه الشاشة.', en: 'The notice was not sent. Inspect the saved state; this screen does not retry.' },
  UNKNOWN_DO_NOT_RETRY: { ar: 'نتيجة المحاولة غير مؤكدة. لا تعد الإرسال؛ راجع الحالة المحفوظة وإيصالات المزود.', en: 'The attempt outcome is unknown. Do not resend; inspect the saved state and provider receipts.' },
  FAILED_NO_RETRY: { ar: 'سُجّل تعثر المحاولة. راجع الحالة المحفوظة، ولا تعد الإرسال.', en: 'The attempt was recorded as failed. Inspect the saved state. Do not resend.' },
  DISPATCH_UNCONFIRMED_DO_NOT_RETRY: { ar: 'تعذّر تأكيد نتيجة المحاولة. قد تكون بدأت؛ لا تعد الإرسال وراجع الحالة المحفوظة.', en: 'The attempt could not be confirmed and may have started. Do not resend; inspect the saved state.' },
  FORBIDDEN: { ar: 'لم تُقبل صلاحية الجلسة الحالية. راجع الحساب والحالة المحفوظة قبل أي إجراء آخر.', en: 'The current session was not authorized. Inspect the account and saved state before further action.' },
  CURRENT_STATE_MODE_REQUIRED: { ar: 'إعداد التشغيل لا يطابق هذا الإشعار. راجع الإعداد المعتمد دون إعادة المحاولة.', en: 'The operating mode does not match this notice. Inspect the approved configuration without retrying.' },
  ORIGIN_REJECTED: { ar: 'رُفض مصدر الطلب. راجع الجلسة والرابط المعتمد دون إعادة المحاولة.', en: 'The request origin was rejected. Inspect the session and approved URL without retrying.' },
  INVALID_TARGET: { ar: 'رُفضت بيانات الهدف. راجع القيم المحفوظة دون إعادة المحاولة من هذه الشاشة.', en: 'The target was rejected. Inspect the saved selectors without retrying from this screen.' },
  METHOD_NOT_ALLOWED: { ar: 'رُفضت طريقة الاستدعاء. راجع المشغّل المعتمد دون إعادة المحاولة.', en: 'The request method was rejected. Inspect the approved operator without retrying.' },
};

function responseCode(response: Pick<Response, 'ok' | 'status'>, value: unknown): Code {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 1 || !('code' in value)) return 'DISPATCH_UNCONFIRMED_DO_NOT_RETRY';
  const code = CODES.find(candidate => candidate === value.code);
  if (response.ok && code && ['ACCEPTED_NOT_DELIVERED', 'IDLE_NO_RESEND', 'NOT_SENT', 'UNKNOWN_DO_NOT_RETRY', 'FAILED_NO_RETRY'].includes(code)) return code;
  if ((response.status === 400 && code === 'INVALID_TARGET')
    || (response.status === 403 && (code === 'FORBIDDEN' || code === 'ORIGIN_REJECTED'))
    || (response.status === 405 && code === 'METHOD_NOT_ALLOWED')
    || (response.status === 409 && code === 'CURRENT_STATE_MODE_REQUIRED')) return code;
  return 'DISPATCH_UNCONFIRMED_DO_NOT_RETRY';
}

export default function DriveCurrentStateOperator() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const id = useId();
  const [target, setTarget] = useState<Target>({ requestId: '', outboxId: '', recipientUserId: '', category: 'customer.current_state', language: 'ar' });
  const [state, setState] = useState<State>({ kind: 'editing' });
  const started = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const locked = state.kind === 'submitting' || state.kind === 'terminal';
  useEffect(() => {
    if (state.kind === 'invalid' || state.kind === 'terminal') feedback.current?.focus();
  }, [state]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (started.current) return;
    const selection: Target = {
      requestId: target.requestId.trim(), outboxId: target.outboxId.trim(),
      recipientUserId: target.recipientUserId.trim(), category: target.category, language: target.language,
    };
    if (![selection.requestId, selection.outboxId, selection.recipientUserId].every(value => UUID.test(value))) {
      setState({ kind: 'invalid' });
      return;
    }
    started.current = true;
    setState({ kind: 'submitting' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(PATH, {
        method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection), signal: controller.signal,
      });
      const payload: unknown = await response.json();
      setState({ kind: 'terminal', code: responseCode(response, payload) });
    } catch {
      // Aborting a browser request is not proof that the server did not send.
      setState({ kind: 'terminal', code: 'DISPATCH_UNCONFIRMED_DO_NOT_RETRY' });
    } finally {
      clearTimeout(timer);
    }
  }

  function updateId(field: 'requestId' | 'outboxId' | 'recipientUserId', value: string) {
    setTarget(previous => ({ ...previous, [field]: value }));
  }
  const inputClass = 'w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900';
  const ids = [
    { field: 'requestId', ar: 'معرّف الطلب', en: 'Request ID' },
    { field: 'outboxId', ar: 'معرّف إشعار الطابور', en: 'Outbox ID' },
    { field: 'recipientUserId', ar: 'معرّف المستخدم المستلم', en: 'Recipient user ID' },
  ] as const;
  return (
    <section className="min-w-0 space-y-5" dir={ar ? 'rtl' : 'ltr'} aria-labelledby={id + '-title'}>
      <h1 id={id + '-title'} className="text-2xl font-semibold">{ar ? 'إرسال إشعار حالة الطلب المعتمد' : 'Send an approved request-state notice'}</h1>
      <p className="break-words text-sm">{ar ? 'أدخل معرّفات الهدف المهيّأ مسبقًا. الصلاحية والوجهة والمهلة تُتحقق على الخادم عند الإرسال. هذه الشاشة لا تنشئ طلبًا أو نافذة إرسال أو حجزًا.' : 'Enter the selectors of the already-prepared target. The server verifies authority, destination and expiry when sending. This screen does not create a request, sending window or booking.'}</p>
      <form method="post" onSubmit={submit} aria-busy={state.kind === 'submitting'} autoComplete="off">
        <fieldset disabled={locked} className="grid min-w-0 gap-4 border-0 p-0">
          <legend className="sr-only">{ar ? 'الهدف المهيّأ مسبقًا' : 'Already-prepared target'}</legend>
          {ids.map(({ field, ar: arLabel, en }) => (
            <label key={field} htmlFor={id + '-' + field} className="grid min-w-0 gap-2 text-sm">
              <span>{ar ? arLabel : en}</span>
              <input id={id + '-' + field} name={field} value={target[field]} onChange={event => updateId(field, event.target.value)} required pattern={UUID.source} maxLength={36} spellCheck={false} autoComplete="off" dir="ltr" className={inputClass} />
            </label>
          ))}
          <label htmlFor={id + '-category'} className="grid min-w-0 gap-2 text-sm">
            <span>{ar ? 'فئة الإشعار المهيّأ' : 'Prepared notice category'}</span>
            <select id={id + '-category'} name="category" value={target.category} className={inputClass} onChange={event => {
              const value = event.target.value;
              if (value === 'customer.current_state' || value === 'operations.current_state') setTarget(previous => ({ ...previous, category: value }));
            }}>
              <option value="customer.current_state">{ar ? 'إشعار العميل' : 'Customer notice'}</option>
              <option value="operations.current_state">{ar ? 'إشعار العمليات' : 'Operations notice'}</option>
            </select>
          </label>
          <label htmlFor={id + '-language'} className="grid min-w-0 gap-2 text-sm">
            <span>{ar ? 'لغة الهدف المهيّأ، مستقلة عن لغة الواجهة' : 'Prepared target language, separate from interface language'}</span>
            <select id={id + '-language'} name="language" value={target.language} className={inputClass} onChange={event => {
              const value = event.target.value;
              if (value === 'ar' || value === 'en') setTarget(previous => ({ ...previous, language: value }));
            }}>
              <option value="ar">العربية</option><option value="en">English</option>
            </select>
          </label>
          <button type="submit" disabled={locked} className="min-w-0 rounded-xl bg-[#D4AF37] px-4 py-3 font-semibold text-black disabled:opacity-60">
            {state.kind === 'submitting' ? (ar ? 'جارٍ انتظار نتيجة المحاولة…' : 'Waiting for the attempt outcome…') : (ar ? 'إرسال الإشعار المعتمد مرة واحدة' : 'Send approved notice once')}
          </button>
        </fieldset>
      </form>
      {state.kind === 'invalid' && <p ref={feedback} role="alert" tabIndex={-1} className="break-words rounded-xl border p-4">{ar ? 'أدخل معرّفات UUID صحيحة في الحقول الثلاثة. لم تبدأ محاولة إرسال.' : 'Enter valid UUIDs in all three ID fields. No sending attempt has started.'}</p>}
      {state.kind === 'terminal' && <p ref={feedback} role="status" aria-live="polite" tabIndex={-1} className="break-words rounded-xl border p-4">{RESULT[state.code][language]}</p>}
    </section>
  );
}
