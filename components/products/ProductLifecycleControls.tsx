'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { archiveProductAction, publishProductAction, unpublishProductAction } from '@/lib/actions/product-actions';
import { useLanguage } from '@/components/i18n/LanguageProvider';

type Props = {
  id: string;
  slug: string;
  status: string;
  lifecycleVersion?: number | null;
  canWrite?: boolean;
  publishBlockedReason?: { ar: string; en: string } | null;
};

type PendingConfirm = {
  form: HTMLFormElement;
  messageAr: string;
  messageEn: string;
};

export default function ProductLifecycleControls({ id, slug, status, lifecycleVersion, canWrite = false, publishBlockedReason = null }: Props) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const active = Number.isInteger(lifecycleVersion) && Number(lifecycleVersion) > 0;
  const [submitting, setSubmitting] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const submittingRef = useRef(false);
  const approvedRef = useRef(false);

  const confirmAction = (messageAr: string, messageEn: string) => (event: React.FormEvent<HTMLFormElement>) => {
    if (submittingRef.current) {
      event.preventDefault();
      return;
    }

    if (approvedRef.current) {
      approvedRef.current = false;
      submittingRef.current = true;
      setSubmitting(true);
      return;
    }

    event.preventDefault();
    setPendingConfirm({ form: event.currentTarget, messageAr, messageEn });
  };

  function approvePendingAction() {
    const form = pendingConfirm?.form;
    if (!form || submittingRef.current) return;
    if (!form.reportValidity()) {
      setPendingConfirm(null);
      return;
    }
    approvedRef.current = true;
    setPendingConfirm(null);
    try {
      form.requestSubmit();
    } finally {
      // requestSubmit dispatches submit synchronously; approval is single-use.
      approvedRef.current = false;
    }
  }

  async function runAction(action: (data: FormData) => Promise<void>, data: FormData) {
    try {
      await action(data);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" aria-busy={submitting}>
        {canWrite && <Link href={`/admin/products/${encodeURIComponent(id)}`} className="min-h-10 rounded-full border border-[color:var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-navy)] hover:border-[#D4AF37]">
          {ar ? 'تعديل' : 'Edit'}
        </Link>}
        <Link href={`/admin/products/${encodeURIComponent(id)}/preview`} className="min-h-10 rounded-full border border-[color:var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-navy)] hover:border-[#D4AF37]">
          {ar ? 'معاينة' : 'Preview'}
        </Link>

        {canWrite && status === 'draft' ? (
          <form action={(data) => runAction(publishProductAction, data)} onSubmit={confirmAction('نشر هذا المنتج في السوق؟', 'Publish this product to the Marketplace?')}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="expectedVersion" value={lifecycleVersion ?? ''} />
            <button disabled={!active || submitting || Boolean(publishBlockedReason)} className="min-h-10 rounded-full bg-[#D4AF37] px-3 py-2 text-xs font-bold text-[#0D1B2A] disabled:cursor-not-allowed disabled:opacity-45">
              {ar ? 'نشر' : 'Publish'}
            </button>
          </form>
        ) : canWrite && status === 'published' ? (
          <form action={(data) => runAction(unpublishProductAction, data)} onSubmit={confirmAction('إلغاء نشر هذا المنتج وإعادته لمسودة؟', 'Unpublish this product and return it to draft?')}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="expectedVersion" value={lifecycleVersion ?? ''} />
            <button disabled={!active || submitting} className="min-h-10 rounded-full border border-[#D4AF37] px-3 py-2 text-xs font-bold text-[#8B6516] disabled:cursor-not-allowed disabled:opacity-45">
              {ar ? 'إلغاء النشر' : 'Unpublish'}
            </button>
          </form>
        ) : null}

        {canWrite && <form action={(data) => runAction(archiveProductAction, data)} onSubmit={confirmAction('أرشفة المنتج؟ سيختفي من التشغيل اليومي مع بقاء السجل التاريخي.', 'Archive this product? It will leave daily operations while history is preserved.')}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="expectedVersion" value={lifecycleVersion ?? ''} />
          <button disabled={!active || submitting} className="min-h-10 rounded-full border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-45">
            {ar ? 'أرشفة' : 'Archive'}
          </button>
        </form>}

        {!canWrite ? <span className="text-xs text-[var(--color-muted)]">{ar ? 'عرض فقط' : 'Read only'}</span> : !active ? (
          <span className="text-[11px] text-amber-700" role="status">
            {ar ? 'تفعيل دورة الحياة مطلوب' : 'Lifecycle activation required'}
          </span>
        ) : null}
        {publishBlockedReason && status === 'draft' ? (
          <span className="w-full text-[11px] font-medium leading-5 text-amber-800" role="status">
            {ar ? publishBlockedReason.ar : publishBlockedReason.en}
          </span>
        ) : null}
        {submitting ? (
          <span className="text-[11px] text-[var(--color-muted)]" role="status">
            {ar ? 'جارٍ تحديث الحالة…' : 'Updating lifecycle…'}
          </span>
        ) : null}
        <span className="sr-only">{slug}</span>
      </div>

      {pendingConfirm ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[#0D1B2A]/45 p-4 sm:items-center" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby={`product-confirm-${id}`} dir={ar ? 'rtl' : 'ltr'} className="w-full max-w-md rounded-[1.75rem] border border-[#D4AF37]/40 bg-white p-5 text-[#0D1B2A] shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A67C00]">{ar ? 'تأكيد الإجراء' : 'Confirm action'}</p>
            <h2 id={`product-confirm-${id}`} className="mt-3 text-lg font-semibold leading-8">{ar ? pendingConfirm.messageAr : pendingConfirm.messageEn}</h2>
            <p className="mt-2 text-sm leading-6 text-[#64748B]">{ar ? 'لن يتم تنفيذ أي تغيير قبل تأكيدك.' : 'No change will be executed until you confirm.'}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setPendingConfirm(null)} className="min-h-11 rounded-full border border-[#CBD5E1] px-5 text-sm font-semibold text-[#334155]">{ar ? 'إلغاء' : 'Cancel'}</button>
              <button type="button" onClick={approvePendingAction} className="min-h-11 rounded-full bg-[#D4AF37] px-5 text-sm font-bold text-[#0D1B2A]">{ar ? 'تأكيد' : 'Confirm'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
