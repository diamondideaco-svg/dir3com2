'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { RealPreviewEvent, RealPreviewFlightOffer } from '@/lib/marketplace/real-preview-contract';

export default function RealMarketplacePreviewDetail({ offer }: { offer: RealPreviewFlightOffer | RealPreviewEvent }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  if (offer.kind === 'event') {
    return <main className="mx-auto min-h-screen max-w-3xl px-5 py-12" dir={ar ? 'rtl' : 'ltr'}>
      <Link href="/marketplace/preview" className="text-sm font-bold">← {ar ? 'العودة للنتائج' : 'Back to results'}</Link>
      <article className="mt-6 overflow-hidden rounded-3xl border bg-white shadow-sm">
        {offer.imageUrl ? <img src={offer.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" /> : null}
        <div className="p-8">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-900">TICKETMASTER · LIVE DISCOVERY</span>
          <h1 className="mt-5 text-4xl font-bold">{offer.title}</h1>
          <p className="mt-3 text-slate-600">{[offer.localDate, offer.localTime, offer.venue, offer.city].filter(Boolean).join(' · ')}</p>
          <p className="mt-6 text-3xl font-bold">{offer.priceState === 'live' && offer.priceMin !== null && offer.currency ? `${offer.priceMin} ${offer.currency}` : (ar ? 'تحقق من السعر لدى Ticketmaster' : 'Check price with Ticketmaster')}</p>
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm">
            {ar ? 'هذه فعالية حقيقية من Ticketmaster. مشاهدة السعر النهائي وإتمام التذكرة والدفع يتمان لدى المزود الخارجي.' : 'This is a real Ticketmaster event. Final price, ticket checkout, and payment complete with the external provider.'}
          </div>
          <a href={offer.providerUrl} rel="noopener noreferrer sponsored" target="_blank" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white">{ar ? 'المتابعة إلى Ticketmaster' : 'Continue to Ticketmaster'}</a>
        </div>
      </article>
    </main>;
  }
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-12" dir={ar ? 'rtl' : 'ltr'}>
    <Link href="/marketplace/preview" className="text-sm font-bold">← {ar ? 'العودة للنتائج' : 'Back to results'}</Link>
    <article className="mt-6 rounded-3xl border bg-white p-8 shadow-sm">
      <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-bold">DUFFEL TEST SANDBOX</span>
      <h1 className="mt-5 text-4xl font-bold">{offer.origin} → {offer.destination}</h1>
      <p className="mt-3 text-slate-600">{offer.departureDate}</p>
      <div className="mt-6 space-y-3">
        {offer.slices.map((slice, index) => <div key={`${slice.origin}-${index}`} className="rounded-2xl bg-slate-50 p-4">{slice.origin} → {slice.destination} · {slice.segments} {ar ? 'مقطع' : 'segment(s)'}</div>)}
      </div>
      <p className="mt-6 text-3xl font-bold">{offer.totalAmount} {offer.currency}</p>
      <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm">
        {ar ? 'هذا عرض فعلي من بيئة اختبار المزود للمعاينة فقط. لا يمثل مخزون إنتاج موثقًا، ولا يتوفر الحجز أو الدفع.' : 'This is an actual provider test-environment offer for preview only. It is not verified production inventory, and booking and payment are unavailable.'}
      </div>
    </article>
  </main>;
}
