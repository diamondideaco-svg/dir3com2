'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import {
  formatPreviewRetrievedAt,
  previewFamilies,
  type PreviewCity,
  type PreviewCitySelection,
  type PreviewFamily,
  type PreviewProviderStatus,
  type PreviewProviderBlocker,
  type RealPreviewEvent,
  type RealPreviewStay,
} from '@/lib/marketplace/real-preview-contract';

const labels: Record<PreviewFamily, { ar: string; en: string }> = {
  'dir3-fly': { ar: 'طيران', en: 'Fly' },
  'dir3-stay': { ar: 'إقامة', en: 'Stay' },
  'dir3-drive': { ar: 'تنقّل', en: 'Drive' },
  'dir3-concierge': { ar: 'كونسيرج', en: 'Concierge' },
  'dir3-vip': { ar: 'VIP', en: 'VIP' },
};

type Providers = {
  liteapi: {
    access: 'authorized' | 'blocked';
    environment: 'production' | 'sandbox' | 'unconfigured';
    cities: Record<PreviewCity, PreviewProviderStatus | 'not_requested'>;
    blocker: PreviewProviderBlocker | null;
  };
  ticketmaster: {
    access: 'authorized' | 'blocked';
    environment: 'production';
    status: PreviewProviderStatus;
    blocker: PreviewProviderBlocker | null;
  };
};

function ProviderBlocker({ blocker, ar }: { blocker: PreviewProviderBlocker; ar: boolean }) {
  const rows = [
    [ar ? 'متغير البيئة المتوقع' : 'Expected env var', blocker.expectedEnvVar],
    [ar ? 'الحساب / منتج API' : 'Account / API product', blocker.accountProduct],
    [ar ? 'الحالة الحالية' : 'Current status', blocker.currentStatus[ar ? 'ar' : 'en']],
    [ar ? 'استجابة المزود / HTTP' : 'HTTP / provider response', blocker.providerResponse[ar ? 'ar' : 'en']],
    [ar ? 'التفعيل المطلوب' : 'Activation required', blocker.activationRequired[ar ? 'ar' : 'en']],
  ];
  return (
    <dl className="mt-4 grid gap-3 rounded-2xl border border-amber-300/70 bg-amber-50 p-5 text-sm text-[#5f4612]" data-provider-blocker>
      {rows.map(([label, value]) => (
        <div className="grid gap-1 sm:grid-cols-[12rem_1fr]" key={label}>
          <dt className="font-bold uppercase tracking-wide">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProviderImage({ src, alt, fallback }: { src: string | null; alt: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center bg-[linear-gradient(145deg,#f7f0e3,#fffdf8)] px-6 text-center text-sm font-semibold text-[#6c5931]">
        {fallback}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="aspect-[16/10] w-full object-cover"
    />
  );
}

function SourceTrace({ item, ar }: { item: RealPreviewStay | RealPreviewEvent; ar: boolean }) {
  return (
    <dl className="real-preview-source-trace mt-5 grid gap-2 border-t border-[#d4af37]/20 pt-4 text-xs text-[#64748b]">
      <div className="flex min-w-0 justify-between gap-4">
        <dt>{ar ? 'المصدر' : 'Source'}</dt>
        <dd className="font-semibold text-[#0d1b2a]">{item.provider === 'liteapi' ? 'LiteAPI' : 'Ticketmaster'}</dd>
      </div>
      <div className="flex min-w-0 justify-between gap-4">
        <dt>{ar ? 'معرّف المزود' : 'Provider item ID'}</dt>
        <dd className="max-w-[68%] break-all text-end font-mono text-[#0d1b2a]">{item.providerItemId}</dd>
      </div>
      <div className="flex min-w-0 justify-between gap-4">
        <dt>{ar ? 'البيئة' : 'Environment'}</dt>
        <dd className="font-semibold uppercase text-[#0d1b2a]">{item.environment}</dd>
      </div>
    </dl>
  );
}

function statusLabel(item: RealPreviewStay | RealPreviewEvent, ar: boolean) {
  if (item.kind === 'event' && item.availability === 'available' && item.transactionMethod === 'provider_checkout') {
    return ar ? 'إتمام لدى المزود' : 'Provider Checkout';
  }
  if (item.kind === 'event' && item.availability === 'sold_out') return ar ? 'نفدت التذاكر' : 'Sold Out';
  return ar ? 'التوفر غير مؤكد' : 'Availability Unknown';
}

function emptyStayCopy(status: PreviewProviderStatus | 'not_requested', city: PreviewCity, ar: boolean) {
  const cityLabel = city === 'Riyadh' ? (ar ? 'الرياض' : 'Riyadh') : (ar ? 'القاهرة' : 'Cairo');
  if (status === 'access_blocked') {
    return ar
      ? `وصول LiteAPI غير مهيأ لهذه المعاينة؛ لذلك لا نعرض فنادق ${cityLabel}.`
      : `LiteAPI access is not configured for this preview, so no ${cityLabel} hotels are shown.`;
  }
  if (status === 'unavailable') {
    return ar
      ? `تعذر الوصول إلى LiteAPI لنتائج ${cityLabel} الآن. لم نضف بدائل غير موثقة.`
      : `LiteAPI is unavailable for ${cityLabel} right now. No unverified substitutes were added.`;
  }
  return ar
    ? `لم يُرجع LiteAPI نتائج ${cityLabel} لهذه التواريخ. لم نختلق مخزونًا بديلًا.`
    : `LiteAPI returned no ${cityLabel} results for these dates. No substitute inventory was invented.`;
}

function StayCard({ stay, ar }: { stay: RealPreviewStay; ar: boolean }) {
  const detailHref = `/marketplace/preview/${encodeURIComponent(stay.id)}?city=${encodeURIComponent(stay.city)}&checkIn=${encodeURIComponent(stay.checkIn)}&checkOut=${encodeURIComponent(stay.checkOut)}`;
  return (
    <article
      data-provider={stay.provider}
      data-provider-item-id={stay.providerItemId}
      data-environment={stay.environment}
      data-transaction-method={stay.transactionMethod}
      data-fulfilment-state={stay.fulfilmentState}
      className="group min-w-0 overflow-hidden rounded-[28px] border border-[#d4af37]/20 bg-white shadow-[0_20px_55px_rgba(13,27,42,0.08)]"
    >
      <ProviderImage src={stay.imageUrl} alt={stay.title} fallback={ar ? 'لا توجد صورة فندق مقدّمة من LiteAPI' : 'No hotel image supplied by LiteAPI'} />
      <div className="real-preview-card-body p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-[#fff6dc] px-3 py-1 text-xs font-bold text-[#7b5b12]">
            LiteAPI · {stay.environment === 'sandbox' ? 'SANDBOX PREVIEW' : 'PROVIDER LIVE'}
          </span>
          <span className="rounded-full border border-[#d4af37]/30 px-3 py-1 text-xs font-bold text-[#0d1b2a]">{statusLabel(stay, ar)}</span>
        </div>
        <h3 className="mt-4 text-xl font-semibold text-[#0d1b2a]">{stay.title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#64748b]">{stay.city} · {stay.address}</p>
        <p className="mt-2 text-sm leading-6 text-[#64748b]">{stay.roomName}{stay.boardName ? ` · ${stay.boardName}` : ''}</p>
        {stay.rating !== null ? <p className="mt-2 text-sm text-[#64748b]">{ar ? 'تقييم المزود' : 'Provider rating'}: {stay.rating}</p> : null}
        <p className="real-preview-price mt-5 text-2xl font-semibold text-[#0d1b2a]">{stay.totalAmount} {stay.currency}</p>
        <p className="mt-1 text-xs leading-5 text-[#64748b]">
          {stay.priceState === 'provider_preview'
            ? (ar ? 'سعر معاينة من بيئة اختبار المزود؛ ليس سعر حجز إنتاجي.' : 'Provider sandbox preview price; not a production booking price.')
            : (ar ? 'سعر المزود وقت الاسترجاع؛ الحجز غير مفعّل في هذه المعاينة.' : 'Provider price at retrieval; booking is not enabled in this preview.')}
        </p>
        <SourceTrace item={stay} ar={ar} />
        <Link href={detailHref} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#0d1b2a] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1c3144]">
          {ar ? 'عرض التفاصيل' : 'View details'}
        </Link>
      </div>
    </article>
  );
}

function EventCard({ event, ar }: { event: RealPreviewEvent; ar: boolean }) {
  return (
    <article
      data-provider={event.provider}
      data-provider-item-id={event.providerItemId}
      data-source-url={event.sourceUrl ?? undefined}
      data-environment={event.environment}
      data-transaction-method={event.transactionMethod}
      data-fulfilment-state={event.fulfilmentState}
      className="group min-w-0 overflow-hidden rounded-[28px] border border-[#d4af37]/20 bg-white shadow-[0_20px_55px_rgba(13,27,42,0.08)]"
    >
      <ProviderImage src={event.imageUrl} alt={event.title} fallback={ar ? 'لا توجد صورة فعالية مقدّمة من Ticketmaster' : 'No event image supplied by Ticketmaster'} />
      <div className="real-preview-card-body p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-[#e9f3ff] px-3 py-1 text-xs font-bold text-[#1b4f82]">Ticketmaster · OFFICIAL API</span>
          <span className="rounded-full border border-[#d4af37]/30 px-3 py-1 text-xs font-bold text-[#0d1b2a]">{statusLabel(event, ar)}</span>
        </div>
        <h3 className="mt-4 text-xl font-semibold text-[#0d1b2a]">{event.title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#64748b]">{[event.localDate, event.localTime, event.venue, event.city].filter(Boolean).join(' · ')}</p>
        <p className="real-preview-price mt-5 text-xl font-semibold text-[#0d1b2a]">
          {event.priceState === 'live' && event.priceMin !== null && event.currency
            ? `${event.priceMin}${event.priceMax !== null && event.priceMax !== event.priceMin ? `–${event.priceMax}` : ''} ${event.currency}`
            : (ar ? 'لم يزوّد المزود سعرًا' : 'Price not supplied by provider')}
        </p>
        <SourceTrace item={event} ar={ar} />
        <Link href={`/marketplace/preview/${encodeURIComponent(event.id)}`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#0d1b2a] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1c3144]">
          {ar ? 'عرض التفاصيل' : 'View details'}
        </Link>
      </div>
    </article>
  );
}

export default function RealMarketplacePreviewClient({ stays, events, providers, search, retrievedAt }: {
  stays: RealPreviewStay[];
  events: RealPreviewEvent[];
  providers: Providers;
  search: { city: PreviewCitySelection; checkIn: string; checkOut: string };
  retrievedAt: string;
}) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [activeFamily, setActiveFamily] = useState<'all' | PreviewFamily>('all');
  const showStays = activeFamily === 'all' || activeFamily === 'dir3-stay';
  const showEvents = activeFamily === 'all' || activeFamily === 'dir3-concierge';
  const selectedCities: PreviewCity[] = search.city === 'all' ? ['Riyadh', 'Cairo'] : [search.city];
  const retrievedLabel = formatPreviewRetrievedAt(retrievedAt, language);

  return (
    <main className="real-preview-shell min-h-screen overflow-x-hidden bg-[#faf8f4] px-4 py-8 sm:px-6 sm:py-12" dir={ar ? 'rtl' : 'ltr'}>
      <div className="real-preview-container mx-auto max-w-7xl">
        <div className="real-preview-hero-stage">
          <section className="real-preview-hero overflow-hidden rounded-[32px] bg-[radial-gradient(circle_at_80%_0%,rgba(212,175,55,0.3),transparent_22rem),linear-gradient(135deg,#0d1b2a,#1c3144)] p-6 text-white sm:p-10">
            <span className="inline-flex rounded-full border border-[#d4af37]/60 bg-[#d4af37]/15 px-3 py-1 text-xs font-bold tracking-[0.14em] text-[#f6d77d]">
              DIR-121 · PROVIDER-SOURCED PREVIEW
            </span>
            <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">
              {ar ? 'سوق سفر بصري مبني على حقيقة المزود' : 'A visual travel marketplace grounded in provider truth'}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/75 sm:text-base">
              {ar
                ? 'إقامات LiteAPI في الرياض والقاهرة، وفعاليات Ticketmaster السعودية. نعرض السعر والتوفر وطريقة الإتمام فقط بالقدر الذي يثبته المصدر.'
                : 'LiteAPI stays in Riyadh and Cairo, plus Saudi Ticketmaster events. Price, availability, and transaction method are shown only to the extent proven by the source.'}
            </p>
            <div className="real-preview-provider-summary mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/15 bg-white/8 p-4 backdrop-blur-sm"><p className="text-xs text-white/60">LiteAPI</p><p className="mt-1 font-semibold uppercase">{providers.liteapi.environment}</p></div>
              <div className="rounded-2xl border border-white/15 bg-white/8 p-4 backdrop-blur-sm"><p className="text-xs text-white/60">Ticketmaster Saudi</p><p className="mt-1 font-semibold uppercase">{providers.ticketmaster.status}</p></div>
              <div className="rounded-2xl border border-white/15 bg-white/8 p-4 backdrop-blur-sm"><p className="text-xs text-white/60">{ar ? 'آخر استرجاع' : 'Retrieved'}</p><p className="mt-1 text-sm font-semibold">{retrievedLabel}</p></div>
            </div>
          </section>
        </div>

        <form className="real-preview-search mt-6 grid gap-4 rounded-[28px] border border-[#d4af37]/20 bg-white p-5 shadow-[0_16px_45px_rgba(13,27,42,0.06)] md:grid-cols-[1fr_1fr_1fr_auto]" action="/marketplace/preview" method="get">
          <label className="text-sm font-semibold text-[#0d1b2a]">{ar ? 'مدينة الإقامة' : 'Stay city'}
            <select name="city" defaultValue={search.city} className="mt-2 min-h-11 w-full rounded-xl border border-[#d4af37]/25 bg-white px-3 text-base">
              <option value="all">{ar ? 'الرياض والقاهرة' : 'Riyadh and Cairo'}</option>
              <option value="Riyadh">{ar ? 'الرياض' : 'Riyadh'}</option>
              <option value="Cairo">{ar ? 'القاهرة' : 'Cairo'}</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-[#0d1b2a]">{ar ? 'تسجيل الوصول' : 'Check-in'}
            <input name="checkIn" type="date" defaultValue={search.checkIn} className="mt-2 min-h-11 w-full rounded-xl border border-[#d4af37]/25 px-3 text-base" />
          </label>
          <label className="text-sm font-semibold text-[#0d1b2a]">{ar ? 'تسجيل المغادرة' : 'Check-out'}
            <input name="checkOut" type="date" defaultValue={search.checkOut} className="mt-2 min-h-11 w-full rounded-xl border border-[#d4af37]/25 px-3 text-base" />
          </label>
          <button className="min-h-11 self-end rounded-xl bg-[#d4af37] px-6 py-2.5 font-bold text-[#0d1b2a] transition hover:bg-[#e1c25b]">{ar ? 'تحديث النتائج' : 'Refresh results'}</button>
        </form>

        <div className="real-preview-family-tabs mt-6 flex max-w-full gap-2 overflow-x-auto pb-2" role="tablist" aria-label={ar ? 'عائلات السوق' : 'Marketplace families'}>
          <button type="button" role="tab" aria-selected={activeFamily === 'all'} onClick={() => setActiveFamily('all')} className={`real-preview-family-tab shrink-0 rounded-full border px-5 py-2.5 text-sm font-semibold ${activeFamily === 'all' ? 'border-[#0d1b2a] bg-[#0d1b2a] text-white' : 'border-[#d4af37]/30 bg-white text-[#0d1b2a]'}`}>{ar ? 'الكل' : 'All'}</button>
          {previewFamilies.map((family) => (
            <button type="button" role="tab" aria-selected={activeFamily === family} onClick={() => setActiveFamily(family)} key={family} className={`real-preview-family-tab shrink-0 rounded-full border px-5 py-2.5 text-sm font-semibold ${activeFamily === family ? 'border-[#0d1b2a] bg-[#0d1b2a] text-white' : 'border-[#d4af37]/30 bg-white text-[#0d1b2a]'}`}>
              {labels[family][language]}
            </button>
          ))}
        </div>

        {showStays ? (
          <section className="real-preview-section mt-10" aria-labelledby="preview-stays-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs font-bold tracking-[0.16em] text-[#9b741c]">LITEAPI</p><h2 id="preview-stays-heading" className="mt-2 text-3xl font-semibold text-[#0d1b2a]">{ar ? 'إقامات الرياض والقاهرة' : 'Riyadh & Cairo stays'}</h2></div>
              <p className="max-w-xl text-sm leading-6 text-[#64748b]">{providers.liteapi.environment === 'sandbox' ? (ar ? 'بيانات بيئة اختبار المزود للمعاينة فقط؛ لا يوجد حجز إنتاجي.' : 'Provider sandbox data for preview only; no production booking.') : (ar ? 'نتائج بحث المزود؛ الحجز غير مفعّل في هذه المعاينة.' : 'Provider search results; booking is not enabled in this preview.')}</p>
            </div>
            {providers.liteapi.blocker ? <ProviderBlocker blocker={providers.liteapi.blocker} ar={ar} /> : null}
            {selectedCities.map((city) => {
              const cityStays = stays.filter((stay) => stay.city === city);
              return (
                <div className="real-preview-city mt-7" key={city}>
                  <h3 className="text-xl font-semibold text-[#0d1b2a]">{city === 'Riyadh' ? (ar ? 'الرياض' : 'Riyadh') : (ar ? 'القاهرة' : 'Cairo')} <span className="text-sm font-normal text-[#64748b]">({cityStays.length})</span></h3>
                  {cityStays.length ? <div className="real-preview-grid mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{cityStays.map((stay) => <StayCard key={`${stay.hotelId}:${stay.rateId}`} stay={stay} ar={ar} />)}</div> : <p className="real-preview-empty mt-4 rounded-2xl border border-dashed border-[#d4af37]/35 bg-white p-6 text-sm leading-6 text-[#64748b]">{emptyStayCopy(providers.liteapi.cities[city], city, ar)}</p>}
                </div>
              );
            })}
          </section>
        ) : null}

        {showEvents ? (
          <section className="real-preview-section real-preview-events mt-12" aria-labelledby="preview-events-heading">
            <div><p className="text-xs font-bold tracking-[0.16em] text-[#1b4f82]">TICKETMASTER SAUDI</p><h2 id="preview-events-heading" className="mt-2 text-3xl font-semibold text-[#0d1b2a]">{ar ? 'فعاليات الكونسيرج السعودية' : 'Saudi concierge events'}</h2></div>
            {providers.ticketmaster.blocker ? <ProviderBlocker blocker={providers.ticketmaster.blocker} ar={ar} /> : null}
            {events.length ? <div className="real-preview-grid mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} ar={ar} />)}</div> : <p className="real-preview-empty mt-5 rounded-2xl border border-dashed border-[#d4af37]/35 bg-white p-6 text-sm leading-6 text-[#64748b]">{providers.ticketmaster.status === 'access_blocked' ? (ar ? 'وصول Ticketmaster غير مهيأ لهذه المعاينة؛ لم نعرض فعاليات بديلة.' : 'Ticketmaster access is not configured for this preview; no substitute events are shown.') : providers.ticketmaster.status === 'unavailable' ? (ar ? 'Ticketmaster غير متاح الآن؛ لم نعرض بيانات أو صورًا بديلة.' : 'Ticketmaster is unavailable right now; no substitute data or images are shown.') : (ar ? 'لم يُرجع Ticketmaster فعاليات سعودية حالية. لم نختلق نتائج بديلة.' : 'Ticketmaster returned no current Saudi events. No substitute results were invented.')}</p>}
          </section>
        ) : null}

        {activeFamily === 'dir3-drive' ? <section className="mt-10 rounded-[28px] border border-[#d4af37]/25 bg-white p-7"><h2 className="text-2xl font-semibold text-[#0d1b2a]">{ar ? 'التنقّل محفوظ في السوق الحالي' : 'Drive remains in the current marketplace'}</h2><p className="mt-3 text-sm leading-6 text-[#64748b]">{ar ? 'لم يغيّر DIR-121 مخزون التنقّل الإنتاجي أو حالته. افتح السوق الحالي لمشاهدة الخيارات المنشورة.' : 'DIR-121 does not change production Drive inventory or status. Open the current marketplace to view published options.'}</p><Link href="/marketplace?family=dir3-drive" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[#0d1b2a] px-5 py-2 text-sm font-bold text-white">{ar ? 'فتح سوق التنقّل' : 'Open Drive marketplace'}</Link></section> : null}
        {activeFamily === 'dir3-fly' || activeFamily === 'dir3-vip' ? <section className="mt-10 rounded-[28px] border border-dashed border-[#d4af37]/35 bg-white p-7"><h2 className="text-2xl font-semibold text-[#0d1b2a]">{labels[activeFamily][language]}</h2><p className="mt-3 text-sm leading-6 text-[#64748b]">{ar ? 'هذه العائلة خارج نطاق DIR-121، ولم تتم إضافة مخزون تجريبي أو بديل.' : 'This family is outside DIR-121 scope, and no test or substitute inventory was added.'}</p></section> : null}
      </div>
    </main>
  );
}
