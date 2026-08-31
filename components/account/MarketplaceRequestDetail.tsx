'use client';

import Link from 'next/link';

import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { CustomerMarketplaceRequest, CustomerRequestTimestamp } from '@/lib/marketplace/customer-requests';

const copy = {
  ar: {
    eyebrow: 'تفاصيل طلب السوق',
    back: 'العودة إلى طلباتي',
    reference: 'المرجع الداخلي',
    product: 'الخدمة أو المنتج',
    supplier: 'المورد',
    family: 'الفئة',
    status: 'حالة الطلب',
    createdAt: 'تاريخ إنشاء الطلب',
    updatedAt: 'آخر تحديث',
    nextAction: 'الإجراء التالي',
    classification: 'تصنيف المعاملة',
    payment: 'حالة الدفع',
    noValue: 'غير محدد',
    requestTruthTitle: 'طلب سوق — ليس سجل حجز',
    requestTruth: 'هذا سجل طلب في السوق، وليس حجزًا مؤكدًا. يظهر أي حجز موثّق كسجل منفصل في قسم حجوزاتي.',
    statuses: {
      request_submitted: 'تم استلام الطلب', under_review: 'قيد المراجعة', awaiting_supplier: 'بانتظار المورد', awaiting_availability: 'جارٍ التحقق من التوفر', available_action_required: 'متاح — يلزم إجراء منك', awaiting_customer_acceptance: 'بانتظار موافقتك', awaiting_payment: 'بانتظار الدفع', payment_verification: 'جارٍ التحقق من الدفع', confirmed: 'تم تأكيد الطلب', declined: 'تعذر تأكيد الطلب', changed: 'تم تعديل الطلب', cancellation_requested: 'طُلب الإلغاء', cancelled: 'ملغي', refund_pending: 'الاسترداد قيد المعالجة', refunded: 'تم الاسترداد', completed: 'مكتمل',
    },
    payments: {
      awaiting_payment: 'لا يوجد دفع مؤكد', bank_transfer_instructed: 'صدرت تعليمات التحويل', transfer_submitted: 'تم إرسال إثبات التحويل', verification_in_progress: 'التحقق من الدفع جارٍ', payment_verified: 'تم التحقق من الدفع', payment_failed: 'فشل الدفع', payment_rejected: 'رُفض إثبات الدفع',
    },
    classifications: { request_to_confirm: 'طلب للتأكيد', request_quote: 'طلب عرض سعر' },
    families: { drive: 'التنقل والسيارات', stay: 'الإقامة', fly: 'الطيران', concierge: 'الكونسيرج', vip: 'كبار الشخصيات' },
    nextActions: { operations_review: 'مراجعة الطلب من فريق العمليات' },
    unknownNextAction: 'متابعة الطلب وفق حالته الحالية',
  },
  en: {
    eyebrow: 'Marketplace request details',
    back: 'Back to my requests',
    reference: 'Internal reference',
    product: 'Service or product',
    supplier: 'Supplier',
    family: 'Family',
    status: 'Request status',
    createdAt: 'Request created',
    updatedAt: 'Last updated',
    nextAction: 'Next action',
    classification: 'Transaction classification',
    payment: 'Payment status',
    noValue: 'Not specified',
    requestTruthTitle: 'Marketplace request — not a booking record',
    requestTruth: 'This is a Marketplace Request record, not a confirmed booking. Any authoritative booking appears separately in My Bookings.',
    statuses: {
      request_submitted: 'Request received', under_review: 'Under review', awaiting_supplier: 'Awaiting supplier', awaiting_availability: 'Checking availability', available_action_required: 'Available — action required', awaiting_customer_acceptance: 'Awaiting your acceptance', awaiting_payment: 'Awaiting payment', payment_verification: 'Verifying payment', confirmed: 'Request confirmed', declined: 'Request could not be confirmed', changed: 'Request changed', cancellation_requested: 'Cancellation requested', cancelled: 'Cancelled', refund_pending: 'Refund pending', refunded: 'Refunded', completed: 'Completed',
    },
    payments: {
      awaiting_payment: 'No confirmed payment', bank_transfer_instructed: 'Bank transfer instructions issued', transfer_submitted: 'Transfer proof submitted', verification_in_progress: 'Payment verification in progress', payment_verified: 'Payment verified', payment_failed: 'Payment failed', payment_rejected: 'Payment proof rejected',
    },
    classifications: { request_to_confirm: 'Request to confirm', request_quote: 'Request a quote' },
    families: { drive: 'Drive', stay: 'Stay', fly: 'Fly', concierge: 'Concierge', vip: 'VIP' },
    nextActions: { operations_review: 'Operations team review' },
    unknownNextAction: 'Follow the request according to its current status',
  },
} as const;

function valueFor<T extends Record<string, string>>(values: T, key: string, fallback: string) {
  return values[key as keyof T] ?? fallback;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
      <dt className="text-xs font-semibold text-[var(--color-muted)]">{label}</dt>
      <dd className="mt-2 break-words text-sm font-semibold text-[var(--color-navy)]">{value}</dd>
    </div>
  );
}

export default function MarketplaceRequestDetail({
  request,
  createdAt,
  updatedAt,
}: {
  request: CustomerMarketplaceRequest;
  createdAt: CustomerRequestTimestamp;
  updatedAt: CustomerRequestTimestamp;
}) {
  const { language, direction } = useLanguage();
  const t = copy[language];
  const status = valueFor(t.statuses, request.status, request.status);
  const payment = valueFor(t.payments, request.payment_status, request.payment_status);
  const classification = valueFor(t.classifications, request.transaction_method || request.request_type, t.noValue);
  const family = request.marketplace_family ? valueFor(t.families, request.marketplace_family, request.marketplace_family) : t.noValue;
  const nextAction = request.next_action
    ? valueFor(t.nextActions, request.next_action, t.unknownNextAction)
    : t.unknownNextAction;

  return (
    <main className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir={direction} lang={language}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#B58A17]">{t.eyebrow}</p>
            <h1 className="mt-2 break-all text-3xl font-semibold text-[var(--color-navy)]">{request.request_reference}</h1>
          </div>
          <Link
            href="/my-bookings"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[color:var(--color-border)] bg-white px-5 py-2 text-sm font-semibold text-[var(--color-navy)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B58A17]"
          >
            {t.back}
          </Link>
        </div>

        <section className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6" aria-labelledby="request-truth-title">
          <div className="rounded-2xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 p-4">
            <h2 id="request-truth-title" className="font-semibold text-[#B58A17]">{t.requestTruthTitle}</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-navy)]">{t.requestTruth}</p>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem label={t.reference} value={request.request_reference} />
            <DetailItem label={t.product} value={request.service_name || t.noValue} />
            <DetailItem label={t.supplier} value={request.supplier_name || t.noValue} />
            <DetailItem label={t.family} value={family} />
            <DetailItem label={t.status} value={status} />
            <DetailItem label={t.classification} value={classification} />
            <DetailItem label={t.createdAt} value={createdAt[language]} />
            <DetailItem label={t.updatedAt} value={updatedAt[language]} />
            <DetailItem label={t.nextAction} value={nextAction} />
            <DetailItem label={t.payment} value={payment} />
          </dl>
        </section>
      </div>
    </main>
  );
}
