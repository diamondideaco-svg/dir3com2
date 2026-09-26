'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { STAY_DEMO_NOTICE, STAY_DESTINATIONS, filterStayDemoCards, parseStayDemoQuery, type StayDemoCard, type StayDemoResult } from '@/lib/marketplace/stay-demo';
import styles from './stay-sandbox.module.css';
import MarketplaceNavigation from '@/components/public/MarketplaceNavigation';
import { nationalityOptions, stayFilterSearch } from '@/lib/marketplace/discovery';

export default function StaySandbox({ initialSearch, hotelId }: { initialSearch: string; hotelId?: string }) {
  const { language, direction } = useLanguage(); const ar = language === 'ar';
  const t = (en: string, arabic: string) => ar ? arabic : en;
  const [filterSearch, setFilterSearch] = useState(initialSearch);
  const params = new URLSearchParams(filterSearch);
  const searched = params.get('searched') === '1';
  const [result, setResult] = useState<StayDemoResult | null>(null);
  const [state, setState] = useState(searched ? 'loading' : 'idle');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const query = new URLSearchParams(initialSearch);
    if (query.get('searched') !== '1') return;
    let active = true; const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    queueMicrotask(() => { if (active) { setState('loading'); setResult(null); } });
    // Preserve the published Preview proof URL without entering the legacy catalogue client.
    const proof = query.get('providerProof') === 'liteapi';
    if (proof) {
      query.set('surface', 'stay-sandbox'); query.set('family', 'dir3-stay');
      query.set('provider', 'liteapi'); query.set('environment', 'sandbox');
    }
    fetch(`/api/marketplace/${proof ? 'provider-proof' : 'stay-sandbox'}?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!active) return;
        setState(response.ok ? data.status : response.status === 400 ? 'invalid_search' : response.status === 429 ? 'rate_limited' : 'unavailable');
        if (response.ok) setResult(data);
      }).catch(() => { if (active) setState('unavailable'); }).finally(() => clearTimeout(timer));
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [initialSearch, retry]);
  const query = parseStayDemoQuery(params);
  const nights = query ? (Date.parse(query.checkOut) - Date.parse(query.checkIn)) / 86400000 : 0;
  const allCards = result?.cards ?? [];
  const cards = filterStayDemoCards(allCards, params);
  const selected = hotelId ? allCards.find(c => c.hotelId === hotelId) : undefined;
  const listHref = `/marketplace?${params}`;
  const price = (card: StayDemoCard) => new Intl.NumberFormat(ar ? 'ar' : 'en', { style:'currency', currency:card.currency }).format(card.price);
  const detailHref = (card: StayDemoCard) => `/marketplace/stay-sandbox/${encodeURIComponent(card.hotelId)}?${params}`;
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const updated = stayFilterSearch(filterSearch, { sort: String(data.get('sort') ?? ''), hotelName: String(data.get('hotelName') ?? ''), maxPrice: String(data.get('maxPrice') ?? '') });
    setFilterSearch(updated);
    // Presentation-only filters reuse the returned cards; no navigation/provider call.
    window.history.replaceState(null, '', `/marketplace?${updated}`);
  }
  function cardContent(card: StayDemoCard, detail = false) {
    return <>
      {card.image ? <Image unoptimized src={card.image} alt={card.name} width={720} height={440} className={styles.photo} referrerPolicy="no-referrer"/> : <p>{t('Provider image unavailable', 'صورة المزود غير متاحة')}</p>}
      <div className={styles.content}>
        <p className={styles.badge}>{STAY_DEMO_NOTICE[language]}</p>
        {detail ? <h1>{card.name}</h1> : <h2>{card.name}</h2>}
        <p>{card.location ?? t('Location not supplied', 'لم يحدد المزود الموقع')}</p>
        {card.rating !== null && <p>{t('Provider rating', 'تقييم المزود')}: {card.rating}</p>}
        <p>{card.room}</p>
        <strong className={styles.price}>{price(card)}</strong>
        <p>{t('Stay total', 'إجمالي الإقامة')} · {nights} {t('nights', 'ليالٍ')} · {query?.adults} {t('adults', 'بالغين')} · {query?.rooms} {t('rooms', 'غرف')}</p>
        <p>{t('Availability: returned by Sandbox; not a reservation', 'الإتاحة: نتيجة Sandbox؛ ليست حجزًا')}</p>
        <p>LiteAPI · Sandbox</p>
        <details className={styles.provenance}><summary>{t('Source and price timestamp', 'المصدر ووقت تحديث السعر')}</summary>
          <p>{t('Hotel ID', 'معرّف الفندق')}: <bdi>{card.hotelId}</bdi></p>
          <p>{t('Retrieved', 'وقت الاسترجاع')}: <time dateTime={card.retrievedAt}>{card.retrievedAt}</time></p>
          <p>{t('Provider offer ID', 'معرّف عرض المزود')}</p><p className={styles.reference} dir="ltr">{card.offerId}</p>
        </details>
        {detail ? <><p>{t('Sandbox result — booking, payment and request creation are not enabled.', 'نتيجة Sandbox — الحجز والدفع وإنشاء الطلبات غير متاحة.')}</p><button disabled aria-describedby="sandbox-boundary">{t('Booking unavailable in Sandbox', 'الحجز غير متاح في Sandbox')}</button></> : <Link prefetch={false} className={styles.action} href={detailHref(card)}>{t('View details', 'عرض التفاصيل')}</Link>}
      </div>
    </>;
  }
  return <section className={styles.page} dir={direction}>
    <MarketplaceNavigation family="dir3-stay" search={filterSearch}/>
    <p id="sandbox-boundary" className={styles.notice}>{STAY_DEMO_NOTICE[language]}</p>
    {hotelId ? <>
      <Link href={listHref}>{t('Back to results', 'العودة للنتائج')}</Link>
      <p>{query?.destination} · <bdi>{query?.checkIn} → {query?.checkOut}</bdi></p>
      {selected && <article className={styles.detail}>{cardContent(selected, true)}</article>}
      {state === 'ok' && !selected && <p role="status">{t('This hotel is no longer in the current results. Return to search.', 'لم يعد الفندق ضمن النتائج الحالية. عُد إلى البحث.')}</p>}
    </> : <>
      <h1>{t('Find your stay', 'ابحث عن إقامتك')}</h1>
      <p>{t('Choose your destination and dates to explore test hotel availability. These results cannot be booked.', 'اختر الوجهة والتواريخ لاستكشاف إتاحة الفنادق التجريبية. لا يمكن حجز هذه النتائج.')}</p>
      <Link href="/marketplace?family=dir3-stay&inventory=partners">{t('Browse published partner stays', 'تصفح إقامات الشركاء المنشورة')}</Link>
      <form className={styles.search} action="/marketplace" method="get">
        <input type="hidden" name="family" value="dir3-stay"/><input type="hidden" name="searched" value="1"/>
        <input type="hidden" name="language" value={language}/>
        {params.get('providerProof') === 'liteapi' && <input type="hidden" name="providerProof" value="liteapi"/>}
        <label>{t('Destination', 'الوجهة')}<input name="destination" list="stay-destinations" defaultValue={params.get('destination') ?? 'Cairo'} required autoComplete="off"/></label>
        <datalist id="stay-destinations">{STAY_DESTINATIONS.map(d => <option key={d.city} value={d.city}>{d.ar}</option>)}</datalist>
        <label>{t('Check-in', 'الوصول')}<input type="date" name="checkIn" defaultValue={params.get('checkIn') ?? ''} required/></label>
        <label>{t('Check-out', 'المغادرة')}<input type="date" name="checkOut" defaultValue={params.get('checkOut') ?? ''} required/></label>
        <button type="submit">{t('Search', 'بحث')}</button>
        <div className={styles.guestFields}>
        <label>{t('Adults', 'البالغون')}<input type="number" name="adults" min="1" max="9" defaultValue={params.get('adults') ?? '2'} required/></label>
        <label>{t('Rooms', 'الغرف')}<input type="number" name="rooms" min="1" max="4" defaultValue={params.get('rooms') ?? '1'} required/></label>
        <label>{t('Guest nationality', 'جنسية الضيف')}<select name="nationality" defaultValue={params.get('nationality') ?? ''} required><option value="" disabled>{t('Select nationality', 'اختر الجنسية')}</option>{nationalityOptions(language).map(country => <option key={country.code} value={country.code}>{country.label}</option>)}</select></label>
        <label>{t('Currency', 'العملة')}<select name="currency" defaultValue={params.get('currency') ?? 'SAR'}>{['SAR','USD','EGP','EUR','AED'].map(c => <option key={c}>{c}</option>)}</select></label>
        </div>
        <div className={styles.help}><p>{t('Adults only · up to 9 adults, 4 rooms and 30 nights.', 'للبالغين فقط · حتى 9 بالغين و4 غرف و30 ليلة.')}</p><details><summary>{t('How guests are allocated', 'كيف يتم توزيع الضيوف')}</summary><p>{t('Adults are allocated evenly across rooms, with any remainder in the first rooms.', 'يُوزّع البالغون بالتساوي على الغرف وتُضاف الزيادة إلى الغرف الأولى.')}</p></details></div>
      </form>
      {result && <>
        <form className={styles.filters} method="get" action="/marketplace" onSubmit={filter}>
          {[...params.entries()].filter(([key]) => !['sort','maxPrice','hotelName'].includes(key)).map(([key,value]) => <input key={key} type="hidden" name={key} value={value}/>)}
          <label>{t('Sort', 'الترتيب')}<select name="sort" defaultValue={params.get('sort') ?? 'relevance'}><option value="relevance">{t('Relevance', 'الصلة')}</option><option value="price-asc">{t('Price: low to high', 'السعر: الأقل أولًا')}</option><option value="price-desc">{t('Price: high to low', 'السعر: الأعلى أولًا')}</option></select></label>
          <label>{t('Hotel name', 'اسم الفندق')}<input name="hotelName" defaultValue={params.get('hotelName') ?? ''}/></label>
          <label>{t('Maximum stay total', 'أقصى إجمالي الإقامة')} ({query?.currency})<input name="maxPrice" type="number" min="0" step="any" defaultValue={params.get('maxPrice') ?? ''}/></label>
          <button>{t('Apply filters', 'تطبيق الفلاتر')}</button>
        </form>
        <p role="status">{cards.length} {t('results', 'نتيجة')} · {t('up to 20 hotels per search', 'حتى 20 فندقًا لكل بحث')}</p>
        <div className={styles.grid}>{cards.map(card => <article key={card.hotelId} data-stay-hotel={card.hotelId} className={styles.card}>{cardContent(card)}</article>)}</div>
        {state === 'ok' && !cards.length && <p>{t('No hotels match these filters.', 'لا توجد فنادق تطابق الفلاتر.')}</p>}
      </>}
    </>}
    {state === 'loading' && <p role="status">{t('Searching LiteAPI Sandbox…', 'جارٍ البحث في LiteAPI Sandbox…')}</p>}
    {state === 'no_results' && <p role="status">{t('No Sandbox availability for this search.', 'لا توجد إتاحة Sandbox لهذا البحث.')}</p>}
    {state === 'invalid_search' && <p role="alert">{t('Check the destination, future dates, rooms and guest counts.', 'تحقق من الوجهة والتواريخ المستقبلية وعدد الغرف والضيوف.')}</p>}
    {['unavailable','rate_limited'].includes(state) && <div role="alert"><p>{state === 'rate_limited' ? t('Search is busy. Please wait briefly and retry.', 'البحث مشغول. انتظر قليلًا ثم حاول مجددًا.') : t('Provider unavailable. No alternative results have been generated.', 'المزود غير متاح. لم تُنشأ نتائج بديلة.')}</p><button onClick={() => setRetry(n => n+1)}>{t('Retry', 'إعادة المحاولة')}</button></div>}
  </section>;
}
