'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';

type TimelineEvent = {
  type: string;
  at?: string | null;
  previousStatus?: string | null;
  status?: string | null;
};

type PartnerRequest = {
  id: string;
  request_reference: string;
  request_type: string;
  status: string;
  requested_for?: string | null;
  traveller_count: number;
  marketplace_family?: string | null;
  supplier_name?: string | null;
  service_name?: string | null;
  fulfilment_method?: string | null;
  transaction_method?: string | null;
  handoff_type?: string | null;
  handoff_reference?: string | null;
  handoff_started_at?: string | null;
  next_action?: string | null;
  created_at: string;
  products?: { name_ar?: string; name_en?: string; slug?: string; city?: string; country?: string } | null;
  timeline?: TimelineEvent[];
};

type RequestsPayload = {
  data?: PartnerRequest[];
  whatsappConfigured?: boolean;
  error?: { code?: string };
};

export default function PartnerRequestsClient() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [requests, setRequests] = useState<PartnerRequest[]>([]);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [handoffUrls, setHandoffUrls] = useState<Record<string, string>>({});
  const [unrecoverableHandoffs, setUnrecoverableHandoffs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/partner-portal/requests', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as RequestsPayload;
        if (!response.ok) throw new Error(payload?.error?.code || 'REQUESTS_LOAD_FAILED');
        if (cancelled) return;
        setRequests(Array.isArray(payload.data) ? payload.data : []);
        setWhatsappConfigured(Boolean(payload.whatsappConfigured));
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(ar ? 'تعذر تحميل الطلبات حالياً.' : 'Requests could not be loaded right now.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ar]);

  async function refreshRequests() {
    const response = await fetch('/api/partner-portal/requests', { cache: 'no-store' });
    const payload = (await response.json()) as RequestsPayload;
    if (!response.ok) throw new Error(payload?.error?.code || 'REQUESTS_LOAD_FAILED');
    setRequests(Array.isArray(payload.data) ? payload.data : []);
    setWhatsappConfigured(Boolean(payload.whatsappConfigured));
  }

  async function startWhatsapp(requestId: string) {
    const existing = requests.find((request) => request.id === requestId)?.handoff_started_at;
    if (!window.confirm(existing
      ? (ar ? 'فتح رابط واتساب المسجل لهذا الطلب؟' : 'Open the recorded WhatsApp handoff for this request?')
      : (ar ? 'بدء تسليم هذا الطلب عبر واتساب؟ سيتم تسجيل التسليم داخل dir3com أولاً.' : 'Start this WhatsApp handoff? DIR3COM will record the handoff before WhatsApp opens.'))) return;
    setWorkingId(requestId);
    setError(null);
    try {
      const response = await fetch('/api/partner-portal/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.data?.url) throw new Error(payload?.error?.code || 'HANDOFF_FAILED');
      const handoffUrl = String(payload.data.url);
      setHandoffUrls((current) => ({ ...current, [requestId]: handoffUrl }));
      const opened = window.open('', '_blank');
      if (opened) {
        opened.opener = null;
        opened.location.href = handoffUrl;
      }
      if (!opened) {
        setError(ar ? 'تم تسجيل التسليم، لكن المتصفح منع النافذة. استخدم رابط المتابعة الظاهر.' : 'The handoff was recorded, but the browser blocked the window. Use the visible continue link.');
      }
      try {
        await refreshRequests();
      } catch {
        setError(ar ? 'تم تسجيل التسليم، لكن تعذر تحديث القائمة. استخدم رابط المتابعة الظاهر أو أعد تحميل الصفحة.' : 'The handoff was recorded, but the list could not refresh. Use the visible continue link or reload the page.');
      }
    } catch (cause) {
      const errorCode = cause instanceof Error ? cause.message : '';
      try {
        await refreshRequests();
      } catch {
        // A response can be lost after a successful commit. A later retry is
        // safe because the server returns the same canonical handoff event.
      }
      if (errorCode === 'REQUEST_HANDOFF_REPLAY_UNAVAILABLE') {
        setUnrecoverableHandoffs((current) => ({ ...current, [requestId]: true }));
        setError(ar ? 'سجل التسليم موجود، لكن لا يمكن إعادة إنشاء رابط واتساب القديم بأمان. تواصل مع فريق العمليات.' : 'The handoff record exists, but its legacy WhatsApp link cannot be reconstructed safely. Contact operations.');
      } else {
        setError(ar ? 'تعذر فتح واتساب تلقائياً. إذا ظهر الطلب كمسجل، اختر فتح التسليم مرة أخرى بأمان.' : 'WhatsApp could not open automatically. If the request now appears recorded, safely select open handoff again.');
      }
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">PARTNER PORTAL</p>
            <h1 className="mt-2 text-3xl font-semibold">{ar ? 'الطلبات' : 'Requests'}</h1>
            <p className="mt-2 text-sm text-[#64748B]">{ar ? 'الطلبات المرتبطة بمنتجاتك فقط. كل تسليم يحتفظ برقم DIR3COM وحالته.' : 'Only requests tied to your products. Every handoff keeps the DIR3COM reference and status.'}</p>
          </div>
          <Link href="/partner-portal" className="rounded-full border border-[#D4AF37]/30 bg-white px-4 py-2 text-sm font-semibold text-[#0D1B2A]">{ar ? 'العودة للبوابة' : 'Back to portal'}</Link>
        </div>

        {error ? <div role="alert" className="mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {!whatsappConfigured && !loading ? <div role="status" className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{ar ? 'تسليم واتساب غير مفعّل في هذه البيئة. تبقى الطلبات ظاهرة بدون ادعاء تنفيذ.' : 'WhatsApp handoff is not configured in this environment. Requests remain visible without claiming execution.'}</div> : null}

        {loading ? (
          <div className="rounded-3xl border border-[#D4AF37]/20 bg-white p-8 text-center text-sm text-[#64748B]">{ar ? 'جاري تحميل الطلبات…' : 'Loading requests…'}</div>
        ) : requests.length === 0 ? (
          <div className="rounded-3xl border border-[#D4AF37]/20 bg-white p-8 text-center text-sm text-[#64748B]">{ar ? 'لا توجد طلبات مرتبطة بمنتجاتك حالياً.' : 'There are no requests tied to your products right now.'}</div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <article key={request.id} className="rounded-3xl border border-[#D4AF37]/20 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[#0D1B2A]">{request.request_reference}</span>
                      <span className="rounded-full bg-[#0D1B2A]/5 px-3 py-1 text-xs font-semibold">{request.status}</span>
                      <span className="rounded-full border border-[#D4AF37]/30 px-3 py-1 text-xs uppercase">{request.marketplace_family || request.request_type}</span>
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-[#0D1B2A]">{request.service_name || request.products?.name_en || request.products?.name_ar || '—'}</h2>
                    <p className="mt-1 text-sm text-[#64748B]">{[request.products?.city, request.products?.country].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <div className="text-end text-sm text-[#64748B]">
                    <div>{request.requested_for ? new Date(request.requested_for).toLocaleString(ar ? 'ar-EG' : 'en-GB') : (ar ? 'التاريخ غير محدد' : 'Date not specified')}</div>
                    <div className="mt-1">{ar ? 'المسافرون' : 'Travellers'}: {request.traveller_count}</div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0D1B2A]">{ar ? 'مسار الحالة' : 'Timeline'}</h3>
                    <ol className="mt-3 space-y-2 border-s border-[#D4AF37]/35 ps-4">
                      {(request.timeline || []).map((event, index) => (
                        <li key={`${event.type}-${index}`} className="relative text-xs text-[#64748B]">
                          <span className="absolute -start-[21px] top-1 h-2 w-2 rounded-full bg-[#D4AF37]" />
                          <span className="font-semibold text-[#334155]">{event.type.replaceAll('_', ' ')}</span>
                          {event.at ? ` · ${new Date(event.at).toLocaleString(ar ? 'ar-EG' : 'en-GB')}` : ''}
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="flex min-w-52 flex-col justify-end gap-2">
                    <div className="rounded-2xl bg-[#FAF8F4] p-3 text-xs text-[#64748B]">
                      <div>{ar ? 'طريقة التنفيذ' : 'Fulfilment'}: <strong>{request.fulfilment_method || (ar ? 'غير محدد' : 'Unknown')}</strong></div>
                      <div className="mt-1">{ar ? 'التسليم' : 'Handoff'}: <strong>{request.handoff_type || (ar ? 'غير محدد' : 'None recorded')}</strong></div>
                      {request.handoff_reference ? <div className="mt-1 break-all">{request.handoff_reference}</div> : null}
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(unrecoverableHandoffs[request.id]) || (!whatsappConfigured && !request.handoff_started_at) || workingId === request.id}
                      onClick={() => void startWhatsapp(request.id)}
                      className="min-h-11 rounded-full bg-[#D4AF37] px-4 py-2 text-sm font-bold text-[#0D1B2A] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {unrecoverableHandoffs[request.id]
                        ? (ar ? 'رابط التسليم غير قابل للاستعادة' : 'Handoff link unavailable')
                        : workingId === request.id
                          ? (ar ? 'جاري التسجيل…' : 'Recording…')
                          : request.handoff_started_at
                            ? (ar ? 'فتح تسليم واتساب' : 'Open WhatsApp handoff')
                            : (ar ? 'بدء تسليم واتساب' : 'Start WhatsApp handoff')}
                    </button>
                    {handoffUrls[request.id] ? (
                      <a href={handoffUrls[request.id]} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#D4AF37]/40 bg-white px-4 py-2 text-center text-sm font-semibold text-[#0D1B2A]">
                        {ar ? 'متابعة إلى واتساب' : 'Continue to WhatsApp'}
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
