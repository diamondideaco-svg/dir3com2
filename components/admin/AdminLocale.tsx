'use client';

import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import type { MouseEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/i18n/LanguageProvider';

type LocalizedProps = {
  ar: ReactNode;
  en: ReactNode;
};

export function AdminText({ ar, en }: LocalizedProps) {
  const { language } = useLanguage();
  return <>{language === 'ar' ? ar : en}</>;
}

const statusCopy: Record<string, { ar: string; en: string }> = {
  admin: { ar: 'مدير', en: 'Admin' },
  staff: { ar: 'موظف', en: 'Staff' },
  catalog_only: { ar: 'كتالوج فقط', en: 'Catalog only' },
  verified_requestable: { ar: 'متاح بطلب تأكيد', en: 'Request to confirm' },
  verified_quote: { ar: 'عرض سعر', en: 'Quote' },
  live_bookable: { ar: 'حجز مباشر', en: 'Live bookable' },
  unavailable: { ar: 'غير متاح', en: 'Unavailable' },
  availability_unknown: { ar: 'التوفر غير معروف', en: 'Availability unknown' },
  external_provider: { ar: 'مزود خارجي', en: 'External provider' },
  test_sandbox: { ar: 'اختبار معزول', en: 'Test sandbox' },
  none: { ar: 'لا يوجد', en: 'None' },
  instant_booking: { ar: 'حجز فوري', en: 'Instant booking' },
  provider_checkout: { ar: 'الدفع لدى المزود', en: 'Provider checkout' },
  request_to_confirm: { ar: 'طلب تأكيد', en: 'Request to confirm' },
  request_quote: { ar: 'طلب عرض سعر', en: 'Request quote' },
  verified_local_partner: { ar: 'شريك محلي موثق', en: 'Verified local partner' },
  global_travel_partner: { ar: 'شريك سفر عالمي', en: 'Global travel partner' },
  dir3com_managed: { ar: 'بإدارة dir3com', en: 'dir3com managed' },
  unknown: { ar: 'غير معروف', en: 'Unknown' },
  active: { ar: 'نشط', en: 'Active' },
  inactive: { ar: 'غير نشط', en: 'Inactive' },
  pending: { ar: 'قيد الانتظار', en: 'Pending' },
  approved: { ar: 'معتمد', en: 'Approved' },
  rejected: { ar: 'مرفوض', en: 'Rejected' },
  confirmed: { ar: 'مؤكد', en: 'Confirmed' },
  completed: { ar: 'مكتمل', en: 'Completed' },
  cancelled: { ar: 'ملغي', en: 'Cancelled' },
  failed: { ar: 'متعثر', en: 'Failed' },
  draft: { ar: 'مسودة', en: 'Draft' },
  published: { ar: 'منشور', en: 'Published' },
  suspended: { ar: 'موقوف', en: 'Suspended' },
  under_review: { ar: 'قيد المراجعة', en: 'Under review' },
  'under review': { ar: 'قيد المراجعة', en: 'Under review' },
  awaiting_supplier: { ar: 'بانتظار المورّد', en: 'Awaiting supplier' },
  declined: { ar: 'مرفوض', en: 'Declined' },
  queued: { ar: 'في قائمة الإرسال', en: 'Queued' },
  sent: { ar: 'تم الإرسال', en: 'Sent' },
  delivered: { ar: 'تم التسليم', en: 'Delivered' },
  read: { ar: 'مقروء', en: 'Read' },
  archived: { ar: 'مؤرشف', en: 'Archived' },
  assigned: { ar: 'تم التعيين', en: 'Assigned' },
  platinum: { ar: 'بلاتيني', en: 'Platinum' },
  gold: { ar: 'ذهبي', en: 'Gold' },
  silver: { ar: 'فضي', en: 'Silver' },
  basic: { ar: 'أساسي', en: 'Basic' },
  'in progress': { ar: 'قيد التنفيذ', en: 'In progress' },
  'waiting review': { ar: 'بانتظار المراجعة', en: 'Waiting review' },
  'settlement released': { ar: 'تم تحرير التسوية', en: 'Settlement released' },
};

export function AdminStatusText({ value }: { value: string | null | undefined }) {
  const { language } = useLanguage();
  const normalized = value?.trim().toLowerCase() ?? '';
  const copy = statusCopy[normalized];
  if (copy) return <>{copy[language]}</>;
  return <>{value?.trim() || '—'}</>;
}

export function AdminDateTime({ value }: { value: string | null | undefined }) {
  const { language } = useLanguage();
  if (!value) return <>—</>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>—</>;
  return <>{new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)}</>;
}

export function AdminCurrency({ value, currency = 'SAR' }: { value: number; currency?: string }) {
  const { language } = useLanguage();
  const locale = language === 'ar' ? 'ar-SA' : 'en-US';
  const normalizedCurrency = currency.trim().toUpperCase();
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(locale, { style: 'currency', currency: normalizedCurrency, maximumFractionDigits: 2 }).format(value);
  } catch {
    formatted = `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} ${normalizedCurrency || '—'}`;
  }
  return <>{formatted}</>;
}

export function AdminRetryButton() {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.refresh()} className="mt-3 rounded-full border border-current px-4 py-2 text-sm font-semibold">
      <AdminText ar="إعادة المحاولة" en="Try again" />
    </button>
  );
}

export function AdminLocalizedInput({ ar, en, ...props }: { ar: string; en: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'placeholder' | 'aria-label'>) {
  const { language } = useLanguage();
  const label = language === 'ar' ? ar : en;
  return <input {...props} placeholder={label} aria-label={label} />;
}

export function AdminSubmitButton({
  ar,
  en,
  className,
  confirmAr,
  confirmEn,
  disabled = false,
}: {
  ar: string;
  en: string;
  className: string;
  confirmAr?: string;
  confirmEn?: string;
  disabled?: boolean;
}) {
  const { language } = useLanguage();
  const { pending } = useFormStatus();
  const [confirmForm, setConfirmForm] = useState<HTMLFormElement | null>(null);
  const submittingRef = useRef(false);
  const dialogId = useId();
  const confirmation = language === 'ar' ? confirmAr : confirmEn;

  useEffect(() => {
    // A retained form must be usable again after its action settles.
    if (!pending) submittingRef.current = false;
  }, [pending]);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (pending || submittingRef.current) {
      event.preventDefault();
      return;
    }

    const form = event.currentTarget.form;
    if (!form) return;
    if (!form.reportValidity()) {
      event.preventDefault();
      return;
    }

    if (!confirmation) {
      submittingRef.current = true;
      return;
    }

    event.preventDefault();
    setConfirmForm(form);
  }

  function approve() {
    if (!confirmForm || pending || submittingRef.current) return;
    const form = confirmForm;
    if (!form.reportValidity()) {
      setConfirmForm(null);
      return;
    }
    submittingRef.current = true;
    setConfirmForm(null);
    try {
      form.requestSubmit();
    } catch (error) {
      submittingRef.current = false;
      throw error;
    }
  }

  return (
    <>
      <button type="submit" disabled={pending || disabled} onClick={handleClick} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
        {pending ? (language === 'ar' ? 'جارٍ التنفيذ…' : 'Working…') : (language === 'ar' ? ar : en)}
      </button>
      {confirmForm && confirmation ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-[#0D1B2A]/45 p-4 sm:items-center" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby={dialogId} dir={language === 'ar' ? 'rtl' : 'ltr'} className="w-full max-w-md rounded-[1.75rem] border border-[#D4AF37]/40 bg-white p-5 text-[#0D1B2A] shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A67C00]">{language === 'ar' ? 'تأكيد الإجراء' : 'Confirm action'}</p>
            <h2 id={dialogId} className="mt-3 text-lg font-semibold leading-8">{confirmation}</h2>
            <p className="mt-2 text-sm leading-6 text-[#64748B]">{language === 'ar' ? 'لن يتم تنفيذ التغيير قبل تأكيدك.' : 'The change will not be executed until you confirm.'}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirmForm(null)} className="min-h-11 rounded-full border border-[#CBD5E1] px-5 text-sm font-semibold text-[#334155]">{language === 'ar' ? 'إلغاء' : 'Cancel'}</button>
              <button type="button" onClick={approve} className="min-h-11 rounded-full bg-[#D4AF37] px-5 text-sm font-bold text-[#0D1B2A]">{language === 'ar' ? 'تأكيد' : 'Confirm'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function AdminPermissionText({ value }: { value: string }) {
  const { language } = useLanguage();
  const modules: Record<string, [string,string]> = {
    admin: ['الإدارة العامة','Global administration'], operations: ['العمليات','Operations'],
    customers: ['العملاء','Customers'], partners: ['الشركاء','Partners'], products: ['المنتجات','Products'],
    finance: ['المالية','Finance'], verification: ['التحقق','Verification'],
  };
  const [module, action] = value.split(':');
  if (!modules[module] || !['read','write','full'].includes(action)) return <>{value}</>;
  const ar = language === 'ar';
  return <>{modules[module][ar ? 0 : 1]} — {action === 'read' ? (ar ? 'قراءة' : 'Read') : action === 'write' ? (ar ? 'تعديل' : 'Write') : (ar ? 'كاملة' : 'Full')}</>;
}

export function AdminUnavailableControl({
  ar,
  en,
  reasonAr,
  reasonEn,
  className,
}: {
  ar: string;
  en: string;
  reasonAr: string;
  reasonEn: string;
  className: string;
}) {
  const { language } = useLanguage();
  const reasonId = useId();

  return (
    <div className="space-y-2">
      <button type="button" disabled aria-describedby={reasonId} className={`${className} cursor-not-allowed opacity-55`}>
        {language === 'ar' ? ar : en}
      </button>
      <p id={reasonId} className="max-w-sm text-xs leading-5 text-[var(--color-muted)]">
        {language === 'ar' ? reasonAr : reasonEn}
      </p>
    </div>
  );
}
