'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import {
  previewFamilies,
  type PreviewFamily,
  type RealPreviewEvent,
  type RealPreviewFlightOffer,
  type RealPreviewStay,
} from '@/lib/marketplace/real-preview-contract';

const labels: Record<PreviewFamily, { ar: string; en: string }> = {
  'dir3-fly': { ar: 'طيران', en: 'Fly' },
  'dir3-stay': { ar: 'إقامة', en: 'Stay' },
  'dir3-drive': { ar: 'تنقّل', en: 'Drive' },
  'dir3-concierge': { ar: 'كونسيرج', en: 'Concierge' },
  'dir3-vip': { ar: 'VIP', en: 'VIP' },
};

export default function RealMarketplacePreviewClient({ offers, stays, events, dabraContext, search }: {
  offers: RealPreviewFlightOffer[];
  stays: RealPreviewStay[];
  events: RealPreviewEvent[];
  dabraContext: string;
  search: { from: string; to: string; departureDate: string; countryCode: 'SA' | 'EG' };
}) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [activeFamily, setActiveFamily] = useState<'all' | PreviewFamily>('all');
  const showFlights = activeFamily === 'all' || activeFamily === 'dir3-fly';
  const showStays = activeFamily === 'all' || activeFamily === 'dir3-stay';
  const showEvents = activeFamily === 'all' || activeFamily === 'dir3-concierge';
  const emptyLabel = activeFamily === 'all' ? null : labels[activeFamily][language];
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-12" dir={ar ? 'rtl' : 'ltr'}>
      <div className="rounded-3xl bg-slate-950 p-7 text-white">
        <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950">SANDBOX PREVIEW</span>
        <h1 className="mt-4 text-3xl font-bold">{ar ? 'معاينة السوق الحقيقي' : 'Real marketplace preview'}</h1>
        <p className="mt-2 text-slate-300">{ar ? 'طيران Duffel وإقامات LiteAPI تجريبية، وأحداث Ticketmaster حقيقية. تُستكمل تذاكر الأحداث لدى المزود.' : 'Duffel test flights, LiteAPI test stays, and real Ticketmaster events. Event checkout completes with the provider.'}</p>
        <p className="mt-2 text-sm text-slate-400">{search.from} → {search.to} · {search.departureDate}</p>
      </div>

      <form className="mt-7 grid gap-3 rounded-3xl border bg-white p-5 md:grid-cols-5" action="/marketplace/preview" method="get">
        <label className="text-sm font-semibold">{ar ? 'من' : 'From'}<input name="from" defaultValue={search.from} maxLength={3} pattern="[A-Za-z]{3}" className="mt-1 w-full rounded-xl border px-3 py-2 uppercase" /></label>
        <label className="text-sm font-semibold">{ar ? 'إلى' : 'To'}<input name="to" defaultValue={search.to} maxLength={3} pattern="[A-Za-z]{3}" className="mt-1 w-full rounded-xl border px-3 py-2 uppercase" /></label>
        <label className="text-sm font-semibold">{ar ? 'التاريخ' : 'Date'}<input name="date" type="date" defaultValue={search.departureDate} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>
        <label className="text-sm font-semibold">{ar ? 'سوق الأحداث' : 'Event market'}<select name="country" defaultValue={search.countryCode} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="SA">{ar ? 'السعودية' : 'Saudi Arabia'}</option><option value="EG">{ar ? 'مصر' : 'Egypt'}</option></select></label>
        <button className="self-end rounded-xl bg-amber-300 px-5 py-2.5 font-bold text-slate-950">{ar ? 'بحث' : 'Search'}</button>
      </form>

      <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-6" role="tablist" aria-label={ar ? 'عائلات السوق' : 'Marketplace families'}>
        <button type="button" role="tab" aria-selected={activeFamily === 'all'} onClick={() => setActiveFamily('all')} className={`real-preview-family-tab rounded-2xl border p-4 text-center font-semibold ${activeFamily === 'all' ? 'border-slate-950 bg-slate-950 text-white' : 'bg-white'}`}>{ar ? 'الكل' : 'All'}</button>
        {previewFamilies.map((family) => <button type="button" role="tab" aria-selected={activeFamily === family} onClick={() => setActiveFamily(family)} key={family} className={`real-preview-family-tab rounded-2xl border p-4 text-center font-semibold ${activeFamily === family ? 'border-slate-950 bg-slate-950 text-white' : 'bg-white'}`}>{labels[family][language]}</button>)}
      </div>

      {showFlights ? <section className="mt-8">
        <h2 className="text-2xl font-bold">{ar ? 'نتائج الطيران' : 'Flight results'}</h2>
        {offers.length ? (
          <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {offers.map((offer) => (
              <article key={offer.id} className="rounded-3xl border bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-amber-700">Duffel · TEST SANDBOX</p>
                <h3 className="mt-2 text-2xl font-bold">{offer.origin} → {offer.destination}</h3>
                <p className="mt-2 text-slate-600">{offer.departureDate}</p>
                <p className="mt-4 text-2xl font-bold">{offer.totalAmount} {offer.currency}</p>
                <p className="mt-2 text-xs text-slate-500">{ar ? 'متاح للعرض فقط — غير موثق للإنتاج ولا يمكن شراؤه هنا' : 'View only — not production-verified and not purchasable here'}</p>
                <Link className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-2 text-sm font-bold text-white" href={`/marketplace/preview/${encodeURIComponent(offer.id)}`}>{ar ? 'عرض التفاصيل' : 'View details'}</Link>
              </article>
            ))}
          </div>
        ) : <p className="mt-4 rounded-2xl border border-dashed p-6 text-slate-600">{ar ? 'لا توجد نتائج طيران تجريبية متاحة حالياً.' : 'No test flight results are available right now.'}</p>}
      </section> : null}

      {showStays ? <section className="mt-8">
        <h2 className="text-2xl font-bold">{ar ? 'نتائج الإقامة' : 'Stay results'}</h2>
        {stays.length ? (
          <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {stays.map((stay) => (
              <article key={stay.id} className="overflow-hidden rounded-3xl border bg-white shadow-sm">
                {stay.imageUrl ? <img src={stay.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" /> : null}
                <div className="p-6">
                  <p className="text-sm font-semibold text-amber-700">LiteAPI · TEST SANDBOX</p>
                  <h3 className="mt-2 text-xl font-bold">{stay.title}</h3>
                  <p className="mt-2 text-slate-600">{[stay.roomName, stay.address].filter(Boolean).join(' · ')}</p>
                  <p className="mt-4 text-2xl font-bold">{stay.totalAmount} {stay.currency}</p>
                  <p className="mt-2 text-xs text-slate-500">{ar ? 'نتيجة اختبار حقيقية للمعاينة فقط — لا يمكن الحجز أو الدفع هنا' : 'Actual test result for preview only — booking and payment are unavailable here'}</p>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="mt-4 rounded-2xl border border-dashed p-6 text-slate-600">{ar ? 'لا توجد نتائج إقامة تجريبية متاحة حالياً.' : 'No test stay results are available right now.'}</p>}
      </section> : null}

      {showEvents ? <section className="mt-8">
        <h2 className="text-2xl font-bold">{ar ? 'فعاليات الكونسيرج' : 'Concierge events'}</h2>
        {events.length ? (
          <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <article key={event.id} className="overflow-hidden rounded-3xl border bg-white shadow-sm">
                {event.imageUrl ? <img src={event.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" /> : null}
                <div className="p-6">
                  <p className="text-sm font-semibold text-blue-700">Ticketmaster · LIVE DISCOVERY</p>
                  <h3 className="mt-2 text-xl font-bold">{event.title}</h3>
                  <p className="mt-2 text-slate-600">{[event.localDate, event.localTime, event.city].filter(Boolean).join(' · ')}</p>
                  <p className="mt-4 text-lg font-bold">{event.priceState === 'live' && event.priceMin !== null && event.currency ? `${event.priceMin} ${event.currency}` : (ar ? 'تحقق من السعر لدى المزود' : 'Check price with provider')}</p>
                  <p className="mt-2 text-xs text-slate-500">{ar ? 'عرض حقيقي من Ticketmaster — إتمام التذكرة والدفع لدى المزود الخارجي' : 'Real Ticketmaster listing — ticket checkout and payment complete with the external provider'}</p>
                  <Link className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-2 text-sm font-bold text-white" href={`/marketplace/preview/${encodeURIComponent(event.id)}`}>{ar ? 'عرض التفاصيل' : 'View details'}</Link>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="mt-4 rounded-2xl border border-dashed p-6 text-slate-600">{ar ? 'لا توجد فعاليات Ticketmaster متاحة حاليًا لهذا السوق. لم تتم إضافة نتائج بديلة غير موثقة.' : 'Ticketmaster has no current events for this market. No unverified substitutes were added.'}</p>}
      </section> : null}

      {!showFlights && !showStays && !showEvents ? <p className="mt-8 rounded-2xl border border-dashed p-6 text-slate-600">{ar ? `لا يوجد مخزون معاينة موثق حاليًا لخدمات ${emptyLabel}. يمكنك البقاء في السوق أو طلب مساعدة دبرة.` : `No verified preview inventory is currently available for ${emptyLabel}. You can remain in the marketplace or ask DABRA for help.`}</p> : null}

      <section className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-6">
        <p className="text-sm font-bold text-emerald-900">DABRA GROUNDED PREVIEW</p>
        <p className="mt-2 text-emerald-950">{showFlights || showStays || showEvents ? dabraContext : (ar ? `لا يوجد مخزون معاينة موثق حاليًا ضمن ${emptyLabel}. لن أقترح خيارات غير موجودة، ويمكنني مساعدتك في تعديل طلبك.` : `There is no verified preview inventory for ${emptyLabel} right now. I will not invent options, but I can help refine your request.`)}</p>
      </section>
    </main>
  );
}
