'use client';

import { useLanguage } from '@/components/i18n/LanguageProvider';

type MarketplaceRequest = {
  id: string;
  request_reference: string;
  status: string;
  payment_status: string;
  quote_amount: number | null;
  quote_currency: string | null;
  quote_expires_at: string | null;
};

const labels = {
  ar: {
    title: 'طلبات السوق وعروض الأسعار', empty: 'لا توجد طلبات سوق حتى الآن.', validUntil: 'صالح حتى',
    statuses: { request_submitted: 'تم استلام الطلب', awaiting_availability: 'جارٍ التحقق من التوفر', available_action_required: 'متاح — يلزم إجراء منك', awaiting_customer_acceptance: 'بانتظار موافقتك', awaiting_payment: 'بانتظار الدفع', payment_verification: 'جارٍ التحقق من الدفع', confirmed: 'مؤكد', changed: 'تم التعديل', cancellation_requested: 'طُلب الإلغاء', cancelled: 'ملغي', refund_pending: 'الاسترداد قيد المعالجة', refunded: 'تم الاسترداد', completed: 'مكتمل' },
    payments: { awaiting_payment: 'لا يوجد دفع مؤكد', bank_transfer_instructed: 'صدرت تعليمات التحويل', transfer_submitted: 'تم إرسال إثبات التحويل', verification_in_progress: 'التحقق من الدفع جارٍ', payment_verified: 'تم التحقق من الدفع', payment_failed: 'فشل الدفع', payment_rejected: 'رُفض إثبات الدفع' },
  },
  en: {
    title: 'Marketplace requests and quotes', empty: 'No marketplace requests yet.', validUntil: 'Valid until',
    statuses: { request_submitted: 'Request received', awaiting_availability: 'Checking availability', available_action_required: 'Available — action required', awaiting_customer_acceptance: 'Awaiting your acceptance', awaiting_payment: 'Awaiting payment', payment_verification: 'Verifying payment', confirmed: 'Confirmed', changed: 'Changed', cancellation_requested: 'Cancellation requested', cancelled: 'Cancelled', refund_pending: 'Refund pending', refunded: 'Refunded', completed: 'Completed' },
    payments: { awaiting_payment: 'No confirmed payment', bank_transfer_instructed: 'Bank transfer instructions issued', transfer_submitted: 'Transfer proof submitted', verification_in_progress: 'Payment verification in progress', payment_verified: 'Payment verified', payment_failed: 'Payment failed', payment_rejected: 'Payment proof rejected' },
  },
} as const;

export default function MarketplaceRequestsPanel({ requests }: { requests: MarketplaceRequest[] }) {
  const { language } = useLanguage();
  const t = labels[language];
  return (
    <div className="mt-6 rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="text-xl font-semibold text-white">{t.title}</h2>
      {requests.length ? <div className="mt-4 space-y-3">{requests.map((request) => (
        <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--color-border)] bg-white p-4 text-sm">
          <span className="font-semibold text-[var(--color-navy)]">{request.request_reference}</span>
          <span className="text-[var(--color-muted)]">{t.statuses[request.status as keyof typeof t.statuses] ?? request.status}</span>
          <span className="text-[var(--color-muted)]">{t.payments[request.payment_status as keyof typeof t.payments] ?? request.payment_status}</span>
          {request.quote_amount ? <span className="font-semibold text-[#D4AF37]">{request.quote_amount} {request.quote_currency ?? ''}</span> : null}
          {request.quote_expires_at ? <span className="text-[var(--color-muted)]">{t.validUntil} {new Date(request.quote_expires_at).toLocaleString(language === 'en' ? 'en-GB' : 'ar-SA')}</span> : null}
        </div>
      ))}</div> : <p className="mt-3 text-sm text-[var(--color-muted)]">{t.empty}</p>}
    </div>
  );
}
