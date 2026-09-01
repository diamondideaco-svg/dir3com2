'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
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
  return <>{new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)}</>;
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
}: {
  ar: string;
  en: string;
  className: string;
  confirmAr?: string;
  confirmEn?: string;
}) {
  const { language } = useLanguage();
  const { pending } = useFormStatus();
  const confirmation = language === 'ar' ? confirmAr : confirmEn;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (confirmation && !window.confirm(confirmation)) {
      event.preventDefault();
    }
  }

  return (
    <button type="submit" disabled={pending} onClick={handleClick} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? (language === 'ar' ? 'جارٍ التنفيذ…' : 'Working…') : (language === 'ar' ? ar : en)}
    </button>
  );
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
