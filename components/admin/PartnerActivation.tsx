'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { activatePartnerAction } from '@/lib/actions/partner-activation-actions';

export default function PartnerActivation({ partnerId, status, updatedAt, canActivate }: {
  partnerId: string; status: string; updatedAt: string; canActivate: boolean;
}) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const active = status === 'active';

  async function submit(formData: FormData) {
    if (!window.confirm(ar ? 'أؤكد مراجعتي للشريك وأوافق على تفعيله تشغيليًا الآن.' : 'I confirm my review of this partner and authorize operational activation now.')) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await activatePartnerAction(formData);
      setResult(response.code);
      if (response.ok) router.refresh();
    } catch {
      setResult('ACTIVATION_FAILED');
    } finally {
      setBusy(false);
    }
  }

  return <section lang={ar ? 'ar' : 'en'} dir={ar ? 'rtl' : 'ltr'} className="mb-6 min-w-0 rounded-2xl border border-[#D4AF37]/30 bg-white p-5 text-[#0D1B2A]">
    <h2 className="font-semibold">{active ? (ar ? 'نشط — جاهز للتشغيل' : 'Active — Operational')
      : status === 'approved' ? (ar ? 'معتمد — بانتظار التفعيل' : 'Approved — Awaiting activation')
        : (ar ? 'غير مؤهل للتفعيل التشغيلي' : 'Not eligible for operational activation')}</h2>
    {canActivate && status === 'approved' ? <form action={submit} className="mt-4 grid min-w-0 gap-4">
      <input type="hidden" name="partnerId" value={partnerId} />
      <input type="hidden" name="expectedStatus" value={status} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <label className="grid gap-2">{ar ? 'ملاحظة المراجعة الإدارية (مطلوبة)' : 'Admin review note (required)'}
        <textarea name="reason" required minLength={3} maxLength={1000} disabled={busy} className="w-full min-w-0 rounded-xl border p-3" />
      </label>
      <label className="grid gap-2">{ar ? 'مرجع الاعتماد (اختياري)' : 'Approval reference (optional)'}
        <input name="reference" maxLength={200} disabled={busy} className="w-full min-w-0 rounded-xl border p-3" />
      </label>
      <label className="flex items-start gap-3"><input className="mt-1" type="checkbox" name="confirmed" value="true" required disabled={busy} />
        <span>{ar ? 'أقر بأنني راجعت أهلية الشريك وأتحمل مسؤولية اعتماده للتشغيل. سيُحفظ إقراري في سجل التدقيق.' : 'I attest that I reviewed this partner’s eligibility and authorize operational activation. My attestation will be recorded in the audit log.'}</span>
      </label>
      <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-[#D4AF37] px-4 py-3 font-semibold disabled:opacity-50">{busy ? (ar ? 'جارٍ التفعيل…' : 'Activating…') : (ar ? 'تفعيل الشريك' : 'Activate partner')}</button>
    </form> : null}
    {result ? <p role={result === 'ACTIVE' ? 'status' : 'alert'} className="mt-4 break-words">{result === 'ACTIVE'
      ? (ar ? 'تم التفعيل التشغيلي وحفظ الإقرار في سجل التدقيق.' : 'Operational activation and audit attestation were saved.')
      : result === 'STATE_CONFLICT'
        ? (ar ? 'تغيّرت بيانات الشريك. حدّث الصفحة وراجع الحالة قبل المحاولة مجددًا.' : 'Partner data changed. Refresh and review the current state before retrying.')
        : result === 'ATTESTATION_REQUIRED'
          ? (ar ? 'يلزم الإقرار وملاحظة مراجعة صالحة.' : 'A confirmation and valid review note are required.')
          : (ar ? 'لم يتم تأكيد التفعيل. تحقق من صلاحياتك وحدّث الصفحة قبل المحاولة مجددًا.' : 'Activation was not confirmed. Check your permissions and refresh before retrying.')}</p> : null}
  </section>;
}
