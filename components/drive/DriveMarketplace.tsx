'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { DRIVE_CURRENCIES, DRIVE_OFFERS, vehicleFor, vehicleTitle, vehicleClassLabel, vehicleYearAvailabilityLabel, type VehicleClass, type DriveOffer, type VehicleMaster } from '@/lib/drive/catalog';
import { driveSearchParams, readDriveSearch, validateDriveSearch, type DriveSearch } from '@/lib/drive/search';
import styles from './drive.module.css';
import MarketplaceNavigation from '@/components/public/MarketplaceNavigation';

export type PricedDriveOffer = DriveOffer & { vehicle: VehicleMaster; price: { baseAmount: number | null; currency: string; total: null }; display: { amount: number | null; currency: string; asOf: string | null; converted: boolean }; conversionUnavailable: boolean };
export const driveErrors: Record<string, [string, string]> = {
  PICKUP_TOO_SOON: ['اختر موعدًا يبعد ست ساعات على الأقل بتوقيت القاهرة.', 'Choose pickup at least six hours ahead in Cairo time.'],
  INVALID_LOCAL_TIME: ['وقت غير صالح أو ملتبس بسبب التوقيت الصيفي؛ اختر وقتًا آخر.', 'Invalid or ambiguous daylight-saving time; choose another time.'],
  INVALID_RETURN: ['اختر موعد عودة بعد الاستلام ضمن 90 يومًا.', 'Choose a return after pickup within 90 days.'],
  LOCATION_REQUIRED: ['أدخل موقع الاستلام.', 'Enter the pickup location.'],
  INVALID_TRAVELLERS: ['تحقق من عدد الركاب والأمتعة.', 'Check passenger and luggage counts.'],
};
export function DrivePrice({ offer, ar }: { offer: PricedDriveOffer; ar: boolean }) {
  return <div><p className={styles.price}>{offer.display.amount === null ? (ar ? 'الخدمة غير متاحة بهذا السعر' : 'Rate not supplied for this service') : `${offer.display.amount.toLocaleString(ar ? 'ar-EG' : 'en-GB')} ${offer.display.currency}`}</p>
    <p className={styles.muted}>{ar ? 'السعر الأساسي للمورد' : 'Original supplier base rate'}: {offer.price.baseAmount ?? '—'} {offer.price.currency}</p>
    {offer.conversionUnavailable && <p className={styles.muted}>{ar ? 'التحويل غير متاح؛ يظهر السعر بعملة المورد.' : 'Conversion unavailable; supplier currency shown.'}</p>}
    {offer.display.converted && <p className={styles.muted}>{ar ? 'تحويل للعرض فقط بتاريخ' : 'Display conversion as of'} {offer.display.asOf}</p>}
    <p>{ar ? 'الإجمالي النهائي تؤكده العمليات' : 'Final total confirmed by Operations'}</p></div>;
}
export function DriveInclusions({ ar }: { ar: boolean }) { return <ul><li>{ar ? 'سائق مشمول' : 'Chauffeur included'}</li><li>{ar ? 'وقود ومسافة حتى 120 كم مشمولان' : 'Fuel and up to 120 km included'}</li><li>{ar ? 'المسافة الإضافية وأي إضافات غير محددة تؤكدها العمليات' : 'Additional distance and unspecified extras confirmed by Operations'}</li></ul>; }

export default function DriveMarketplace({ initialSearch, discovery = false }: { initialSearch: string; discovery?: boolean }) {
  const { language, direction } = useLanguage(); const ar = language === 'ar'; const router = useRouter();
  const [search, setSearch] = useState<DriveSearch>(() => readDriveSearch(new URLSearchParams(initialSearch)));
  const [offers, setOffers] = useState<PricedDriveOffer[]>([]); const [loading, setLoading] = useState(() => new URLSearchParams(initialSearch).get('searched') === '1'); const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const [vehicleClass, setVehicleClass] = useState(''); const [make, setMake] = useState(''); const [sort, setSort] = useState('recommended');
  const [model, setModel] = useState('');
  const [capacity, setCapacity] = useState(0); const [bags, setBags] = useState(0);
  const searched = new URLSearchParams(initialSearch).get('searched') === '1';
  useEffect(() => {
    if (!searched) return;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
    let active = true;
    queueMicrotask(() => { if (active) { setLoading(true); setError(''); } });
    fetch(`/api/marketplace/drive?${initialSearch}`, { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'UNAVAILABLE');
      if (active) setOffers(data.offers);
    }).catch(reason => { if (active) { setOffers([]); setError(reason.message); } }).finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [initialSearch, searched, retry]);
  const update = (key: keyof DriveSearch, value: string | number) => setSearch(current => ({ ...current, [key]: value }));
  function submit(event: FormEvent) {
    event.preventDefault(); const invalid = validateDriveSearch(search); if (invalid) { setError(invalid); return; }
    const params = driveSearchParams(search);
    const sameSearch = params.toString() === driveSearchParams(readDriveSearch(new URLSearchParams(initialSearch))).toString();
    setError('');
    if (searched && sameSearch) setRetry(value => value + 1);
    params.set('family','dir3-drive'); params.set('searched','1'); params.set('language',language); router.push(`/marketplace?${params}`);
  }
  const visible = offers.filter(offer => (!vehicleClass || offer.vehicle.vehicleClass === vehicleClass) && (!make || offer.vehicle.make === make) && (!model || offer.vehicle.id === model)
    && (!capacity || (offer.vehicle.passengers !== null && offer.vehicle.passengers >= capacity)) && (!bags || (offer.vehicle.luggage !== null && offer.vehicle.luggage >= bags)))
    .sort((a,b) => sort === 'class' ? a.vehicle.vehicleClass.localeCompare(b.vehicle.vehicleClass) : 0);
  return <section className={`${styles.page} ${styles.browse}`} dir={direction}>
    <MarketplaceNavigation family={discovery ? undefined : 'dir3-drive'} search={initialSearch}/>
    <h1>{discovery ? (ar ? 'ابدأ رحلتك من هنا' : 'Start your journey here') : (ar ? 'تنقّل براحة في مصر' : 'Travel comfortably in Egypt')}</h1><p>{ar ? 'سيارة مع سائق ووقود حتى 120 كم، ودعم فريق العمليات المحلي.' : 'A chauffeur, fuel up to 120 km, and regional Operations support.'}</p>
    <form id="drive-search" className={styles.search} onSubmit={submit}>
      <label>{ar ? 'موقع الاستلام: مدينة، مطار، فندق أو عنوان' : 'Pickup: city, airport, hotel or address'}<input required maxLength={200} value={search.pickup} onChange={e=>update('pickup',e.target.value)} /></label>
      <label>{ar ? 'موقع تسليم مختلف (اختياري)' : 'Different drop-off (optional)'}<input maxLength={200} value={search.dropoff} onChange={e=>update('dropoff',e.target.value)} /></label>
      <label>{ar ? 'موعد الاستلام — القاهرة' : 'Pickup date/time — Cairo'}<input required type="datetime-local" value={search.pickupAt} onChange={e=>update('pickupAt',e.target.value)} /></label>
      <label>{ar ? 'موعد العودة / التسليم — القاهرة' : 'Return/drop-off — Cairo'}<input required type="datetime-local" value={search.returnAt} onChange={e=>update('returnAt',e.target.value)} /></label>
      <div className={styles.searchAction}><p className={styles.muted}>{ar ? 'جميع المواعيد بتوقيت القاهرة. اطلب قبل الاستلام بست ساعات على الأقل.' : 'All times are Cairo time. Request at least six hours before pickup.'}</p><button type="submit" disabled={loading}>{ar ? 'ابحث' : 'Search'}</button></div>
      <details className={styles.secondary}><summary>{ar ? 'الخدمة والركاب والأمتعة والعملة' : 'Service, passengers, luggage and currency'}</summary><div className={styles.secondaryFields}>
      <label>{ar ? 'الخدمة' : 'Service'}<select value={search.mode} onChange={e=>update('mode',e.target.value)}><option value="chauffeur">{ar ? 'سيارة مع سائق' : 'Chauffeur service'}</option><option value="airport">{ar ? 'انتقال المطار' : 'Airport transfer'}</option></select></label>
      <label>{ar ? 'الركاب' : 'Passengers'}<input type="number" min={1} max={20} required value={search.passengers} onChange={e=>update('passengers',Number(e.target.value))} /></label>
      <label>{ar ? 'قطع الأمتعة' : 'Luggage'}<input type="number" min={0} max={20} required value={search.luggage} onChange={e=>update('luggage',Number(e.target.value))} /></label>
      <label>{ar ? 'عملة العرض' : 'Display currency'}<select value={search.currency} onChange={e=>update('currency',e.target.value)}>{DRIVE_CURRENCIES.map(currency=><option key={currency}>{currency}</option>)}</select></label>
      </div></details>
    </form>
    {error && <div role="alert" className={styles.error}>{driveErrors[error]?.[ar ? 0 : 1] ?? (ar ? 'تعذر تحميل النتائج. حاول مجددًا.' : 'Unable to load results. Please retry.')}<button onClick={()=>setRetry(value=>value+1)}>{ar ? 'إعادة المحاولة' : 'Retry'}</button></div>}
    {loading && <p role="status">{ar ? 'جارٍ البحث…' : 'Searching…'}</p>}
    {!searched && <><p className={styles.catalogueLabel}>{DRIVE_OFFERS.length} {ar ? 'خيارات Drive في مصر · التوفر بطلب التأكيد' : 'Drive options in Egypt · availability on request'}</p><section className={styles.discoveryCards}>{DRIVE_OFFERS.map(offer=>{const vehicle=vehicleFor(offer);return <article className={styles.card} key={offer.id}><Image className={styles.cardImage} src={vehicle.image} alt={vehicleTitle(vehicle,language)} width={500} height={300}/><div className={styles.cardBody}><h2>{vehicleTitle(vehicle,language)}</h2><p className={styles.modelYear}>{vehicleYearAvailabilityLabel(language)}</p><p className={styles.badge}>{ar ? 'طلب للتأكيد' : 'Request to confirm'}</p><DriveInclusions ar={ar}/><p className={styles.price}>{offer.chauffeur} {offer.currency} / {ar ? 'يوم مع سائق' : 'chauffeur day'}</p><a className={styles.button} href="#drive-search">{ar ? 'اختر مواعيد الرحلة' : 'Choose trip dates'}</a></div></article>;})}</section></>}
    {searched && !loading && !error && <>
      <div className={`${styles.summary} ${styles.row}`}><span>{readDriveSearch(new URLSearchParams(initialSearch)).pickup} · {readDriveSearch(new URLSearchParams(initialSearch)).pickupAt.replace('T',' ')} · {ar ? 'بتوقيت القاهرة' : 'Cairo time'}</span><a href="#drive-search">{ar ? 'تعديل البحث' : 'Modify search'}</a></div>
      <div className={styles.grid}><aside className={styles.filters}>
        <h2>{ar ? 'تصفية النتائج' : 'Filter results'}</h2>
        <label>{ar ? 'فئة السيارة' : 'Vehicle class'}<select value={vehicleClass} onChange={e=>setVehicleClass(e.target.value)}><option value="">{ar?'الكل':'All'}</option>{['Economy','Sedan','SUV','Luxury','Premium SUV'].map(c=><option key={c} value={c}>{vehicleClassLabel(c as VehicleClass,language)}</option>)}</select></label>
        <label>{ar ? 'العلامة' : 'Make'}<select value={make} onChange={e=>setMake(e.target.value)}><option value="">{ar?'الكل':'All'}</option>{['Mercedes-Benz','Jetour','Nissan','Land Rover'].map(c=><option key={c}>{c}</option>)}</select></label>
        <label>{ar?'الطراز':'Model'}<select value={model} onChange={e=>setModel(e.target.value)}><option value="">{ar?'الكل':'All'}</option>{DRIVE_OFFERS.map(item=>{const v=vehicleFor(item);return <option key={v.id} value={v.id}>{v[language]}</option>;})}</select></label>
        <label>{ar ? 'سعة ركاب موثّقة' : 'Verified passenger capacity'}<select value={capacity} onChange={e=>setCapacity(Number(e.target.value))}><option value={0}>{ar?'الكل':'All'}</option>{[2,4,6].map(c=><option key={c} value={c}>{c}+</option>)}</select></label>
        <label>{ar ? 'سعة أمتعة موثّقة' : 'Verified luggage capacity'}<select value={bags} onChange={e=>setBags(Number(e.target.value))}><option value={0}>{ar?'الكل':'All'}</option>{[1,2,3].map(c=><option key={c} value={c}>{c}+</option>)}</select></label>
        <p>{ar?'سائق ووقود مشمولان في جميع العروض.':'Chauffeur and fuel included in every offer.'}</p>
        <label>{ar?'الإجمالي الأدنى':'Minimum total'}<input disabled placeholder={ar?'بعد تأكيد العمليات':'After Operations confirmation'}/></label>
        <label>{ar?'الإجمالي الأقصى':'Maximum total'}<input disabled placeholder={ar?'بعد تأكيد العمليات':'After Operations confirmation'}/></label>
        <p className={styles.muted}>{ar?'لم تحدد الإجماليات أو السعات بعد؛ لن نفترض قيمًا للمقارنة.':'Totals and capacities are not yet confirmed; no values are assumed for comparison.'}</p>
      </aside><section className={styles.cards}><div className={styles.row}><p>{visible.length} {ar?'نتيجة':'results'}</p><label>{ar?'الترتيب':'Sort'}<select value={sort} onChange={e=>setSort(e.target.value)}><option value="recommended">{ar?'ترتيب الكتالوج':'Recommended catalogue order'}</option><option value="class">{ar?'فئة السيارة':'Vehicle class'}</option><option disabled>{ar?'الأقل إجماليًا — بعد التأكيد':'Lowest total — after confirmation'}</option><option disabled>{ar?'الأعلى إجماليًا — بعد التأكيد':'Highest total — after confirmation'}</option></select></label></div>
        {visible.length===0 && <p>{ar?'لا توجد عروض تطابق هذه المعلومات الموثقة.':'No offers match these verified criteria.'}</p>}
        {visible.map(offer=><article className={styles.card} key={offer.id}><Image className={styles.cardImage} src={offer.vehicle.image} alt={vehicleTitle(offer.vehicle,language)} width={500} height={300}/><div className={styles.cardBody}><h2>{vehicleTitle(offer.vehicle,language)}</h2><p className={styles.modelYear}>{vehicleYearAvailabilityLabel(language)}</p><span className={styles.badge}>{ar?'طلب للتأكيد':'Request to confirm'}</span><p>{vehicleClassLabel(offer.vehicle.vehicleClass,language)}</p><DriveInclusions ar={ar}/><DrivePrice offer={offer} ar={ar}/>{offer.price.baseAmount===null?<p>{ar?'لم يقدّم المورد سعر انتقال المطار لهذا الطراز.':'The supplier has not provided an airport rate for this model.'}</p>:<Link className={styles.button} href={`/marketplace/drive/${offer.id}?${initialSearch}`}>{ar?'عرض التفاصيل':'View deal'}</Link>}</div></article>)}
      </section></div></>}
    <p className={styles.credits}><Link href="/marketplace/drive/image-credits">{ar?'حقوق الصور':'Image credits'}</Link></p>
  </section>;
}
