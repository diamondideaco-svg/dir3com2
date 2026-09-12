'use client';

import Link from 'next/link';
import type { MarketplaceCard } from '@/lib/marketplace/cards';
import { formatPreviewRetrievedAt } from '@/lib/marketplace/real-preview-contract';
import type { ProviderProofEnvironment } from '@/lib/marketplace/provider-proof-mode';
import type { ProviderProofResult } from '@/lib/marketplace/provider-proof';

type Props = {
  enabled: boolean;
  environment: ProviderProofEnvironment;
  destination: string;
  departureFrom: string;
  departureDate: string;
  returnDate: string;
  checkIn: string;
  checkOut: string;
  language: 'ar' | 'en';
  results: ProviderProofResult[];
};

const copy = {
  en: {
    eyebrow: 'MARKETPLACE PROVIDER PROOF', title: 'Search real provider inventory', description: 'Preview-only proof surface. Results appear only when the allowlisted provider returns authoritative data.', destination: 'Destination', from: 'Departure from', departure: 'Departure date', returnDate: 'Return date', checkIn: 'Check-in', checkOut: 'Check-out', environment: 'Provider environment', sandbox: 'Sandbox', live: 'Live', search: 'Search providers', disabled: 'Provider Proof is disabled. Enable the explicit non-production flag to run a proof search.', noResults: 'No provider result was returned for this search.', accessBlocked: 'Provider access is blocked or not configured; no substitute cards were shown.', unavailable: 'Provider is unavailable; no substitute cards were shown.', noResultsStatus: 'No results for the submitted criteria.', provider: 'Provider', item: 'Provider item ID', retrieved: 'Retrieved', availability: 'Availability', available: 'Available from provider', booking: 'Booking state', sandboxBooking: 'Sandbox result — booking/payment is not enabled in this environment.', liveBooking: 'No booking claim; provider fulfilment state is shown as returned.', details: 'View provider details', priceNotSupplied: 'Price not supplied by provider', proofDisabled: 'Proof surface unavailable', trace: 'Source trace', blocked: 'Access blocked', unavailableStatus: 'Unavailable', empty: 'No results', authorized: 'Provider response received',
  },
  ar: {
    eyebrow: 'إثبات مزوّدي السوق', title: 'ابحث في مخزون المزوّد الحقيقي', description: 'مساحة معاينة فقط؛ لا تظهر النتائج إلا إذا أعاد المزوّد المدرج بيانات موثوقة.', destination: 'الوجهة', from: 'مدينة المغادرة', departure: 'تاريخ المغادرة', returnDate: 'تاريخ العودة', checkIn: 'تسجيل الوصول', checkOut: 'تسجيل المغادرة', environment: 'بيئة المزوّد', sandbox: 'بيئة الاختبار', live: 'حيّة', search: 'ابحث لدى المزوّدين', disabled: 'إثبات المزوّدين معطّل. فعّل العلم الصريح في بيئة غير إنتاجية لإجراء البحث.', noResults: 'لم يُرجع المزوّد نتيجة لهذا البحث.', accessBlocked: 'وصول المزوّد محجوب أو غير مهيأ؛ لم نعرض بطاقات بديلة.', unavailable: 'المزوّد غير متاح؛ لم نعرض بطاقات بديلة.', noResultsStatus: 'لا نتائج للمعايير المرسلة.', provider: 'المزوّد', item: 'معرّف العنصر لدى المزوّد', retrieved: 'وقت الاسترجاع', availability: 'التوفر', available: 'متاح بحسب رد المزوّد', booking: 'حالة الحجز', sandboxBooking: 'نتيجة اختبار — الحجز والدفع غير مفعّلين في هذه البيئة.', liveBooking: 'لا يوجد ادعاء حجز؛ نعرض حالة التنفيذ التي أعادها المزوّد.', details: 'عرض تفاصيل المزوّد', priceNotSupplied: 'لم يزوّد المزوّد بسعر', proofDisabled: 'مساحة الإثبات غير متاحة', trace: 'تتبّع المصدر', blocked: 'الوصول محجوب', unavailableStatus: 'غير متاح', empty: 'لا نتائج', authorized: 'تم استلام رد المزوّد',
  },
} as const;

function providerName(provider: ProviderProofResult['provider']) {
  if (provider === 'duffel') return 'Duffel';
  if (provider === 'sabre') return 'Sabre';
  return 'LiteAPI';
}

type Copy = Record<keyof typeof copy.en, string>;

function statusCopy(result: ProviderProofResult, t: Copy) {
  if (result.status === 'access_blocked') return t.accessBlocked;
  if (result.status === 'unavailable') return t.unavailable;
  if (result.status === 'no_results') return t.noResultsStatus;
  return t.authorized;
}

function ProofCard({ card, environment, language, t, query }: { card: MarketplaceCard; environment: ProviderProofEnvironment; language: 'ar' | 'en'; t: Copy; query: Props }) {
  const detailParams = new URLSearchParams({ environment, language, destination: query.destination, departureFrom: query.departureFrom, departureDate: query.departureDate, returnDate: query.returnDate, checkIn: query.checkIn, checkOut: query.checkOut });
  const href = card.deepLink ? `${card.deepLink}${card.deepLink.includes('?') ? '&' : '?'}${detailParams.toString()}` : '#';
  return (
        <article className="overflow-hidden rounded-[26px] border border-[var(--color-gold)]/25 bg-white shadow-[0_16px_40px_rgba(13,27,42,0.08)]" data-provider={card.provider} data-provider-item-id={card.providerItemId ?? undefined} data-environment={card.marketplaceEnvironment} data-availability={card.availabilityStatus} data-transaction-method={card.transactionMethod} data-fulfilment-state={card.fulfilmentState}>
      <div className="border-b border-[var(--color-border)] bg-[var(--color-shell)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-[var(--color-gold)]/14 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-navy)]">{providerName(card.provider as ProviderProofResult['provider'])}</span><span className="rounded-full border border-[var(--color-gold)]/35 px-3 py-1 text-xs font-bold uppercase text-[var(--color-navy)]">{environment}</span></div>
        <h2 className="mt-4 text-xl font-semibold text-[var(--color-navy)]">{card.title}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{card.subtitle} · {card.location}</p>
      </div>
      <dl className="grid gap-3 p-5 text-sm sm:grid-cols-2">
        <div><dt className="text-[var(--color-muted)]">{t.provider}</dt><dd className="mt-1 font-semibold text-[var(--color-navy)]">{providerName(card.provider as ProviderProofResult['provider'])}</dd></div>
        <div><dt className="text-[var(--color-muted)]">{t.item}</dt><dd className="mt-1 break-all font-mono text-xs text-[var(--color-navy)]">{card.providerItemId ?? '—'}</dd></div>
        <div><dt className="text-[var(--color-muted)]">{t.retrieved}</dt><dd className="mt-1 text-[var(--color-navy)]">{card.retrievedAt ? formatPreviewRetrievedAt(card.retrievedAt, language) : '—'}</dd></div>
        <div><dt className="text-[var(--color-muted)]">{t.availability}</dt><dd className="mt-1 font-semibold text-[var(--color-navy)]">{card.availabilityStatus === 'available' ? t.available : card.availabilityStatus}</dd></div>
      </dl>
      <div className="mx-5 rounded-2xl border border-[var(--color-gold)]/20 bg-[var(--color-shell)] p-4"><p className="text-2xl font-semibold text-[var(--color-navy)]">{card.totalPrice !== null ? `${card.totalPrice} ${card.currency}` : t.priceNotSupplied}</p><p className="mt-2 text-sm leading-6 text-[var(--color-muted)]"><span className="font-semibold text-[var(--color-navy)]">{t.booking}: </span>{environment === 'sandbox' ? t.sandboxBooking : t.liveBooking}</p></div>
      <div className="p-5"><Link href={href} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--color-navy)] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1c3144]">{t.details}</Link></div>
    </article>
  );
}

export default function ProviderProofClient(props: Props) {
  const { language, results, enabled, environment, destination, departureFrom, departureDate, returnDate, checkIn, checkOut } = props;
  const t = copy[language];
  const cards = results.flatMap((result) => result.cards);
  const query = props;
  return (
    <main className="min-h-screen bg-[var(--color-shell)] px-4 py-8 sm:px-6 sm:py-12" dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language}>
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[30px] border border-[var(--color-gold)]/20 bg-white p-6 shadow-[0_20px_55px_rgba(13,27,42,0.07)] sm:p-9"><p className="text-xs font-bold tracking-[0.22em] text-[var(--color-gold)]">{t.eyebrow}</p><h1 className="mt-3 text-3xl font-semibold text-[var(--color-navy)] sm:text-5xl">{t.title}</h1><p className="mt-3 max-w-3xl leading-7 text-[var(--color-muted)]">{t.description}</p></header>
        {!enabled ? <section role="status" className="mt-6 rounded-2xl border border-dashed border-[var(--color-gold)]/40 bg-white p-6 text-[var(--color-navy)]">{t.disabled}</section> : null}
        <form action="/marketplace/provider-proof" method="get" className="mt-6 grid gap-4 rounded-[26px] border border-[var(--color-gold)]/20 bg-white p-5 shadow-[0_16px_42px_rgba(13,27,42,0.06)] sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold text-[var(--color-navy)]">{t.destination}<select name="destination" defaultValue={destination} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3"><option>Riyadh</option><option>Cairo</option><option>Jeddah</option><option>Dammam</option></select></label>
          <label className="text-sm font-semibold text-[var(--color-navy)]">{t.from}<select name="departureFrom" defaultValue={departureFrom} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3"><option>Cairo</option><option>Riyadh</option><option>Jeddah</option><option>Dammam</option></select></label>
          <label className="text-sm font-semibold text-[var(--color-navy)]">{t.environment}<select name="environment" defaultValue={environment} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3"><option value="sandbox">{t.sandbox}</option><option value="live">{t.live}</option></select></label>
          <label className="text-sm font-semibold text-[var(--color-navy)]">{t.departure}<input name="departureDate" type="date" defaultValue={departureDate} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3" /></label>
          <label className="text-sm font-semibold text-[var(--color-navy)]">{t.returnDate}<input name="returnDate" type="date" defaultValue={returnDate} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3" /></label>
          <label className="text-sm font-semibold text-[var(--color-navy)]">{t.checkIn}<input name="checkIn" type="date" defaultValue={checkIn} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3" /></label>
          <label className="text-sm font-semibold text-[var(--color-navy)]">{t.checkOut}<input name="checkOut" type="date" defaultValue={checkOut} className="mt-2 min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-white px-3" /></label>
          <input type="hidden" name="language" value={language} /><button type="submit" className="min-h-11 self-end rounded-full bg-[var(--color-gold)] px-5 py-2.5 font-bold text-[var(--color-navy)]">{t.search}</button>
        </form>
        {enabled && results.length ? <div className="mt-8 space-y-5">{results.map((result) => <section key={result.provider} aria-labelledby={`${result.provider}-heading`}><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-gold)]">{providerName(result.provider)} · {result.environment}</p><h2 id={`${result.provider}-heading`} className="mt-2 text-2xl font-semibold text-[var(--color-navy)]">{statusCopy(result, t)}</h2></div><p className="text-sm text-[var(--color-muted)]">{result.cards.length} {language === 'ar' ? 'نتيجة' : 'result(s)'}</p></div>{result.cards.length ? <div className="mt-4 grid gap-5 lg:grid-cols-2">{result.cards.map((card) => <ProofCard key={`${result.provider}:${card.providerItemId}`} card={card} environment={result.environment} language={language} t={t} query={query} />)}</div> : <p className="mt-4 rounded-2xl border border-dashed border-[var(--color-gold)]/35 bg-white p-5 text-sm leading-7 text-[var(--color-muted)]">{statusCopy(result, t)} {result.errorCode ? `(${result.errorCode})` : ''}</p>}</section>)}</div> : null}
        {enabled && !cards.length && results.length ? <section className="mt-8 rounded-[26px] border border-dashed border-[var(--color-gold)]/35 bg-white p-6 text-[var(--color-muted)]">{t.noResults}</section> : null}
      </div>
    </main>
  );
}
