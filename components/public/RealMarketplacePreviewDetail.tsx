'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { RealPreviewOffer } from '@/lib/marketplace/real-preview-contract';

function DetailImage({ src, alt, fallback }: { src: string | null; alt: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className="flex aspect-[16/9] items-center justify-center bg-[linear-gradient(145deg,#f7f0e3,#fffdf8)] px-6 text-center text-sm font-semibold text-[#6c5931]">{fallback}</div>;
  }
  return <img src={src} alt={alt} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="aspect-[16/9] w-full object-cover" />;
}

function Traceability({ offer, ar }: { offer: RealPreviewOffer; ar: boolean }) {
  return (
    <section className="mt-7 rounded-2xl border border-[#d4af37]/25 bg-[#fffdf8] p-5" aria-labelledby="source-trace-heading">
      <h2 id="source-trace-heading" className="font-semibold text-[#0d1b2a]">{ar ? 'تتبّع المصدر' : 'Source traceability'}</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-[#64748b]">{ar ? 'المزود' : 'Provider'}</dt><dd className="mt-1 font-semibold text-[#0d1b2a]">{offer.provider === 'liteapi' ? 'LiteAPI' : 'Ticketmaster'}</dd></div>
        <div><dt className="text-[#64748b]">{ar ? 'معرّف العنصر لدى المزود' : 'Provider item ID'}</dt><dd className="mt-1 break-all font-mono text-xs text-[#0d1b2a]">{offer.providerItemId}</dd></div>
        <div><dt className="text-[#64748b]">{ar ? 'البيئة' : 'Environment'}</dt><dd className="mt-1 font-semibold uppercase text-[#0d1b2a]">{offer.environment}</dd></div>
        <div><dt className="text-[#64748b]">{ar ? 'طريقة الإتمام' : 'Transaction method'}</dt><dd className="mt-1 font-semibold text-[#0d1b2a]">{offer.transactionMethod}</dd></div>
        <div><dt className="text-[#64748b]">{ar ? 'حالة التنفيذ' : 'Fulfilment state'}</dt><dd className="mt-1 font-semibold text-[#0d1b2a]">{offer.fulfilmentState}</dd></div>
        <div><dt className="text-[#64748b]">{ar ? 'وقت الاسترجاع' : 'Retrieved at'}</dt><dd className="mt-1 text-[#0d1b2a]">{new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(offer.retrievedAt))}</dd></div>
      </dl>
    </section>
  );
}

export default function RealMarketplacePreviewDetail({ offer }: { offer: RealPreviewOffer }) {
  const { language } = useLanguage();
  const ar = language === 'ar';

  if (offer.kind === 'unavailable') {
    const providerName = offer.provider === 'liteapi' ? 'LiteAPI' : 'Ticketmaster';
    const reason = offer.reason === 'access_blocked'
      ? (ar ? 'وصول المزود غير مهيأ لهذه المعاينة.' : 'Provider access is not configured for this preview.')
      : offer.reason === 'no_results'
        ? (ar ? 'لم يعد المزود يعيد هذا العنصر ضمن الاستعلام الحالي.' : 'The provider no longer returns this item for the current query.')
        : (ar ? 'تعذر على المزود إعادة التحقق من العنصر الآن.' : 'The provider could not revalidate this item right now.');
    return (
      <main className="real-preview-detail-shell min-h-screen bg-[#faf8f4] px-4 py-8 sm:px-6 sm:py-12" dir={ar ? 'rtl' : 'ltr'}>
        <div className="real-preview-detail-container mx-auto max-w-4xl">
          <Link href="/marketplace/preview" className="inline-flex min-h-11 items-center text-sm font-bold text-[#0d1b2a]">{ar ? 'العودة للنتائج' : 'Back to results'}</Link>
          <article className="real-preview-detail-unavailable mt-4 rounded-[32px] border border-[#d4af37]/20 bg-white p-6 shadow-[0_24px_65px_rgba(13,27,42,0.1)] sm:p-9">
            <span className="inline-flex rounded-full bg-[#fff6dc] px-3 py-1 text-xs font-bold text-[#7b5b12]">{providerName} · {offer.environment.toUpperCase()}</span>
            <h1 className="mt-5 text-3xl font-semibold leading-tight text-[#0d1b2a] sm:text-5xl">{ar ? 'تعذر إعادة التحقق من العرض' : 'Offer could not be revalidated'}</h1>
            <p className="mt-4 max-w-2xl leading-7 text-[#64748b]">{reason} {ar ? 'لم نعرض سعرًا أو توفرًا قديمًا، ولا يوجد إجراء حجز أو دفع.' : 'No stale price or availability is shown, and there is no booking or payment action.'}</p>
            {offer.city && offer.checkIn && offer.checkOut ? <p className="mt-4 text-sm text-[#64748b]">{offer.city} · {offer.checkIn} → {offer.checkOut}</p> : null}
            <Traceability offer={offer} ar={ar} />
            <span aria-disabled="true" className="mt-7 inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-full border border-[#0d1b2a]/20 bg-[#f3f4f6] px-6 py-3 text-sm font-bold text-[#64748b]">{ar ? 'لا يوجد إجراء متاح' : 'No action available'}</span>
          </article>
        </div>
      </main>
    );
  }

  if (offer.kind === 'event') {
    const status = offer.availability === 'available'
      ? (ar ? 'إتمام لدى المزود' : 'Provider Checkout')
      : offer.availability === 'sold_out'
        ? (ar ? 'نفدت التذاكر' : 'Sold Out')
        : (ar ? 'التوفر غير مؤكد' : 'Availability Unknown');
    return (
      <main className="real-preview-detail-shell min-h-screen bg-[#faf8f4] px-4 py-8 sm:px-6 sm:py-12" dir={ar ? 'rtl' : 'ltr'}>
        <div className="real-preview-detail-container mx-auto max-w-4xl">
          <Link href="/marketplace/preview" className="inline-flex min-h-11 items-center text-sm font-bold text-[#0d1b2a]">{ar ? 'العودة للنتائج' : 'Back to results'}</Link>
          <article className="mt-4 overflow-hidden rounded-[32px] border border-[#d4af37]/20 bg-white shadow-[0_24px_65px_rgba(13,27,42,0.1)]">
            <DetailImage src={offer.imageUrl} alt={offer.title} fallback={ar ? 'لا توجد صورة مقدّمة من Ticketmaster' : 'No image supplied by Ticketmaster'} />
            <div className="real-preview-detail-body p-6 sm:p-9">
              <div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#e9f3ff] px-3 py-1 text-xs font-bold text-[#1b4f82]">TICKETMASTER · OFFICIAL API</span><span className="rounded-full border border-[#d4af37]/30 px-3 py-1 text-xs font-bold text-[#0d1b2a]">{status}</span></div>
              <h1 className="mt-5 text-3xl font-semibold leading-tight text-[#0d1b2a] sm:text-5xl">{offer.title}</h1>
              <p className="mt-4 leading-7 text-[#64748b]">{[offer.localDate, offer.localTime, offer.venue, offer.city].filter(Boolean).join(' · ')}</p>
              <p className="mt-6 text-3xl font-semibold text-[#0d1b2a]">{offer.priceState === 'live' && offer.priceMin !== null && offer.currency ? `${offer.priceMin}${offer.priceMax !== null && offer.priceMax !== offer.priceMin ? `–${offer.priceMax}` : ''} ${offer.currency}` : (ar ? 'لم يزوّد Ticketmaster سعرًا' : 'Ticketmaster did not supply a price')}</p>
              <div className="mt-6 rounded-2xl border border-[#8ab5dd]/35 bg-[#f3f8fd] p-5 text-sm leading-7 text-[#1c4164]">
                {offer.availability === 'available'
                  ? (ar ? 'تعرض هذه الصفحة بيانات الفعالية من Ticketmaster. تتم مشاهدة السعر النهائي والتذكرة والدفع لدى المزود الرسمي.' : 'This page shows event data from Ticketmaster. Final price, ticketing, and payment complete with the official provider.')
                  : (ar ? 'حالة الإتاحة الحالية لا تثبت إمكانية الشراء. يمكنك فتح صفحة المزود الرسمية للتحقق، دون ادعاء حجز داخل dir3com.' : 'Current availability does not prove purchase eligibility. You can view the official provider page to verify, without a dir3com checkout claim.')}
              </div>
              <Traceability offer={offer} ar={ar} />
              <a href={offer.providerUrl} rel="noopener noreferrer sponsored" target="_blank" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-full bg-[#0d1b2a] px-6 py-3 text-sm font-bold text-white">
                {offer.availability === 'available' ? (ar ? 'المتابعة إلى Ticketmaster' : 'Continue to Ticketmaster') : (ar ? 'عرض الصفحة الرسمية' : 'View official listing')}
              </a>
            </div>
          </article>
        </div>
      </main>
    );
  }

  const returnHref = `/marketplace/preview?city=${encodeURIComponent(offer.city)}&checkIn=${encodeURIComponent(offer.checkIn)}&checkOut=${encodeURIComponent(offer.checkOut)}`;
  return (
    <main className="real-preview-detail-shell min-h-screen bg-[#faf8f4] px-4 py-8 sm:px-6 sm:py-12" dir={ar ? 'rtl' : 'ltr'}>
      <div className="real-preview-detail-container mx-auto max-w-4xl">
        <Link href={returnHref} className="inline-flex min-h-11 items-center text-sm font-bold text-[#0d1b2a]">{ar ? 'العودة للنتائج' : 'Back to results'}</Link>
        <article className="mt-4 overflow-hidden rounded-[32px] border border-[#d4af37]/20 bg-white shadow-[0_24px_65px_rgba(13,27,42,0.1)]">
          <DetailImage src={offer.imageUrl} alt={offer.title} fallback={ar ? 'لا توجد صورة فندق مقدّمة من LiteAPI' : 'No hotel image supplied by LiteAPI'} />
          <div className="real-preview-detail-body p-6 sm:p-9">
            <div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#fff6dc] px-3 py-1 text-xs font-bold text-[#7b5b12]">LiteAPI · {offer.environment === 'sandbox' ? 'SANDBOX PREVIEW' : 'PROVIDER LIVE'}</span><span className="rounded-full border border-[#d4af37]/30 px-3 py-1 text-xs font-bold text-[#0d1b2a]">{ar ? 'التوفر غير مؤكد' : 'Availability Unknown'}</span></div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight text-[#0d1b2a] sm:text-5xl">{offer.title}</h1>
            <p className="mt-4 leading-7 text-[#64748b]">{offer.city} · {offer.address}</p>
            <div className="mt-6 grid gap-3 rounded-2xl bg-[#faf8f4] p-5 text-sm sm:grid-cols-2"><p><span className="text-[#64748b]">{ar ? 'الغرفة' : 'Room'}:</span> {offer.roomName}</p><p><span className="text-[#64748b]">{ar ? 'الفترة' : 'Dates'}:</span> {offer.checkIn} → {offer.checkOut}</p>{offer.boardName ? <p><span className="text-[#64748b]">{ar ? 'الوجبات' : 'Board'}:</span> {offer.boardName}</p> : null}{offer.rating !== null ? <p><span className="text-[#64748b]">{ar ? 'تقييم المزود' : 'Provider rating'}:</span> {offer.rating}</p> : null}</div>
            <p className="mt-6 text-3xl font-semibold text-[#0d1b2a]">{offer.totalAmount} {offer.currency}</p>
            <div className="mt-6 rounded-2xl border border-[#d4af37]/30 bg-[#fffaf0] p-5 text-sm leading-7 text-[#6c5931]">
              {offer.environment === 'sandbox'
                ? (ar ? 'هذا سعر من نتيجة فعلية في بيئة اختبار LiteAPI. لا يمثل توفرًا أو سعر حجز إنتاجيًا، والحجز والدفع غير متاحين هنا.' : 'This price comes from an actual LiteAPI sandbox result. It is not production booking availability or pricing, and booking/payment are unavailable here.')
                : (ar ? 'هذه نتيجة بحث من LiteAPI وقت الاسترجاع. لم يتم تفعيل الحجز أو الدفع في هذه المعاينة، لذلك لا ندّعي الحجز الفوري.' : 'This is a LiteAPI search result at retrieval time. Booking and payment are not enabled in this preview, so no instant-booking claim is made.')}
            </div>
            <Traceability offer={offer} ar={ar} />
            <span aria-disabled="true" className="mt-7 inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-full border border-[#0d1b2a]/20 bg-[#f3f4f6] px-6 py-3 text-sm font-bold text-[#64748b]">{ar ? 'معاينة فقط — لا يوجد إجراء حجز' : 'Preview only — no booking action'}</span>
          </div>
        </article>
      </div>
    </main>
  );
}
