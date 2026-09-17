'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { driveOffer, vehicleFor, vehicleTitle, vehicleClassLabel } from '@/lib/drive/catalog';
import { readDriveSearch, validateDriveSearch } from '@/lib/drive/search';
import { parseDriveTrip, type DriveTrip } from '@/lib/drive/request';
import { marketplaceRequestAttemptKey } from '@/lib/marketplace/request-attempt';
import { buildMarketplaceLoginHandoff } from '@/lib/auth/marketplace-request-handoff';
import { supabase } from '@/lib/supabase/client';
import { DriveInclusions, DrivePrice, driveErrors, type PricedDriveOffer } from './DriveMarketplace';
import styles from './drive.module.css';

export default function DriveDeal({ offerId, initialSearch }: { offerId: string; initialSearch: string }) {
  const { language, direction } = useLanguage(); const ar=language==='ar'; const offer=driveOffer(offerId)!; const vehicle=vehicleFor(offer);
  const [step,setStep]=useState(0); const [error,setError]=useState(''); const [sending,setSending]=useState(false); const inFlight=useRef(false); const attempt=useRef({nonce:null as string|null});
  const [priceRetry,setPriceRetry]=useState(0);
  const [priced,setPriced]=useState<PricedDriveOffer|null>(null); const [reference,setReference]=useState(''); const [email,setEmail]=useState('');
  const [trip,setTrip]=useState<DriveTrip>(()=>({...readDriveSearch(new URLSearchParams(initialSearch)),name:'',phone:'',flightNumber:'',flightArrival:'',specialRequest:'',notes:'',acknowledged:false}));
  const draftKey=`drive-draft:${offerId}:${initialSearch}`;
  useEffect(()=>{
    let active=true; const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
    queueMicrotask(()=>{if(active)setError('');});
    fetch(`/api/marketplace/drive?${initialSearch}`,{signal:controller.signal}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.error);if(active)setPriced(payload.offers.find((item:PricedDriveOffer)=>item.id===offerId)??null);}).catch(reason=>{if(active)setError(reason.message);}).finally(()=>clearTimeout(timer));
    queueMicrotask(()=>{try{const draft=sessionStorage.getItem(draftKey);if(draft&&active){const parsed=JSON.parse(draft);setTrip(current=>({...current,...parsed}));}}catch{/* An unavailable local draft is not an authenticated session. */}});
    return()=>{active=false;controller.abort();clearTimeout(timer);};
  },[initialSearch,offerId,draftKey,priceRetry]);
  const change=(key:keyof DriveTrip,value:string|number|boolean)=>setTrip(current=>({...current,[key]:value}));
  function review(event:FormEvent){event.preventDefault();const parsed=parseDriveTrip({...trip,acknowledged:true});if(parsed.error){setError(parsed.error);return;}setError('');setStep(2);}
  async function identify(){
    const {data:{session},error:sessionError}=await supabase.auth.getSession();
    const goLogin=()=>{try{sessionStorage.setItem(draftKey,JSON.stringify(trip));}catch{}window.location.assign(buildMarketplaceLoginHandoff(`/marketplace/drive/${offerId}?${initialSearch}`));};
    if(sessionError||!session){goLogin();return null;}
    const response=await fetch('/api/auth/session-identity',{cache:'no-store',headers:{Authorization:`Bearer ${session.access_token}`},signal:AbortSignal.timeout(12000)});
    const identity=await response.json();
    if(!response.ok)throw new Error('UNAVAILABLE');
    if(!identity.authenticated){goLogin();return null;}
    setEmail(identity.email??'');setTrip(current=>({...current,name:current.name||identity.displayName||''}));return session;
  }
  async function select(){try{if(await identify()){setStep(1);setError('');}}catch{setError('UNAVAILABLE');}}
  async function submit(){
    if(inFlight.current||reference)return;const parsed=parseDriveTrip(trip);if(parsed.error){setError(parsed.error);return;}
    inFlight.current=true;setSending(true);setError('');
    try{
      const session=await identify();if(!session)return;
      const body=JSON.stringify({drive_offer_id:offerId,trip:parsed.trip});
      const key=await marketplaceRequestAttemptKey(attempt.current,session.user.id,body,()=>sessionStorage);
      const response=await fetch('/api/marketplace/requests',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`,'Idempotency-Key':key},body,signal:AbortSignal.timeout(20000)});
      const payload=await response.json();
      if(response.status===401){try{sessionStorage.setItem(draftKey,JSON.stringify(trip));}catch{}window.location.assign(buildMarketplaceLoginHandoff(`/marketplace/drive/${offerId}?${initialSearch}`));return;}
      if(!response.ok)throw new Error(String(response.status));
      setReference(payload.request.request_reference);try{sessionStorage.removeItem(draftKey);}catch{}
    }catch(reason){setError(reason instanceof Error?reason.message:'UNAVAILABLE');}finally{inFlight.current=false;setSending(false);}
  }
  const errorText=driveErrors[error]?.[ar?0:1]??(error==='CONTACT_OR_ACK_REQUIRED'?(ar?'تحقق من بيانات الاتصال وأقر بأن الطلب ليس حجزًا.':'Check your contact details and acknowledge that this is not a booking.') : error==='FLIGHT_DETAILS_REQUIRED'?(ar?'أدخل رقم الرحلة ووقت الوصول الصحيح.':'Enter flight number and valid arrival time.') : error==='409'?(ar?'تغير الطلب؛ راجع البيانات قبل إعادة المحاولة.':'Request conflict; review the details before retrying.') : error==='403'?(ar?'هذا الحساب غير مخول بإرسال الطلب.':'This account cannot submit the request.') : error==='400'?(ar?'تحقق من البيانات والمواعيد.':'Check the details and dates.') : ar?'تعذر إتمام الإجراء. لم نؤكد حجزًا أو دفعًا؛ يمكنك إعادة المحاولة.':'Unable to complete the action. No booking or payment is confirmed; you can retry.');
  return <section className={styles.page} dir={direction}><Link href={`/marketplace?${initialSearch}`}>{ar?'العودة إلى النتائج':'Back to results'}</Link><h1>{vehicleTitle(vehicle,language)}</h1>
    <ol className={styles.steps}><li>{ar?'التفاصيل':'Deal details'}</li><li>{ar?'← بيانات الرحلة':'→ Trip details'}</li><li>{ar?'← مراجعة الطلب':'→ Review request'}</li></ol>
    {error&&<p role="alert" className={styles.error}>{errorText}{!priced&&<button onClick={()=>setPriceRetry(value=>value+1)}>{ar?'إعادة تحميل السعر':'Retry price loading'}</button>}</p>}
    <div className={styles.fields}><section className={styles.panel}><Image src={vehicle.image} alt={vehicleTitle(vehicle,language)} width={800} height={500} className={styles.gallery}/><p>{vehicleClassLabel(vehicle.vehicleClass,language)}</p><DriveInclusions ar={ar}/><p>{ar?'تؤكد العمليات السعة والطراز أو الفئة المكافئة.':'Operations confirms capacity and the vehicle or equivalent class.'}</p><Link href="/marketplace/drive/image-credits">{ar?'حقوق الصور':'Image credits'}</Link></section>
      <section className={styles.panel}><h2>{ar?'ملخص الرحلة':'Trip summary'}</h2><dl><dt>{ar?'الاستلام':'Pickup'}</dt><dd>{trip.pickup}</dd><dt>{ar?'التسليم':'Drop-off'}</dt><dd>{trip.dropoff||trip.pickup}</dd><dt>{ar?'الموعد':'Dates'}</dt><dd dir="ltr">{trip.pickupAt.replace('T',' ')} → {trip.returnAt.replace('T',' ')}</dd></dl><p>Africa/Cairo</p>{priced&&<DrivePrice offer={priced} ar={ar}/>}<p>{ar?'شروط التغيير والإلغاء غير محددة؛ تؤكد قبل الالتزام.':'Change and cancellation terms are not supplied; confirm them before committing.'}</p><p className={styles.badge}>{ar?'طلب للتأكيد — ليس حجزًا':'Request to confirm — not a booking'}</p>{step===0&&<button disabled={!priced||priced.price.baseAmount===null||Boolean(validateDriveSearch(trip))} onClick={select}>{ar?'اختر هذه السيارة':'Select this vehicle'}</button>}</section></div>
    {step===1&&!reference&&<form className={styles.panel} onSubmit={review}><h2>{ar?'بيانات العميل والرحلة':'Customer and trip details'}</h2><p>{email}</p><div className={styles.fields}>
      <label>{ar?'الاسم':'Name'}<input required maxLength={120} value={trip.name} onChange={e=>change('name',e.target.value)}/></label><label>{ar?'الهاتف':'Phone'}<input type="tel" required maxLength={30} value={trip.phone} onChange={e=>change('phone',e.target.value)}/></label>
      <label>{ar?'عنوان الاستلام':'Pickup address'}<input required maxLength={200} value={trip.pickup} onChange={e=>change('pickup',e.target.value)}/></label><label>{ar?'عنوان التسليم':'Drop-off address'}<input required maxLength={200} value={trip.dropoff} onChange={e=>change('dropoff',e.target.value)}/></label>
      <label>{ar?'الركاب':'Passengers'}<input type="number" min={1} max={20} required value={trip.passengers} onChange={e=>change('passengers',Number(e.target.value))}/></label><label>{ar?'الأمتعة':'Luggage'}<input type="number" min={0} max={20} required value={trip.luggage} onChange={e=>change('luggage',Number(e.target.value))}/></label>
      {trip.mode==='airport'&&<><label>{ar?'رقم الرحلة':'Flight number'}<input required maxLength={20} value={trip.flightNumber} onChange={e=>change('flightNumber',e.target.value)}/></label><label>{ar?'وقت الوصول — القاهرة':'Arrival time — Cairo'}<input required type="datetime-local" value={trip.flightArrival} onChange={e=>change('flightArrival',e.target.value)}/></label></>}
      <label>{ar?'مقعد طفل / طلب خاص (اختياري)':'Child seat / special request (optional)'}<textarea maxLength={500} value={trip.specialRequest} onChange={e=>change('specialRequest',e.target.value)}/></label><label>{ar?'ملاحظات الرحلة (اختياري)':'Trip notes (optional)'}<textarea maxLength={1000} value={trip.notes} onChange={e=>change('notes',e.target.value)}/></label>
    </div><button type="submit">{ar?'مراجعة الطلب':'Review request'}</button></form>}
    {step===2&&!reference&&<section className={styles.panel}><h2>{ar?'راجع طلبك':'Review your request'}</h2><p>{trip.name} · {email} · {trip.phone}</p><p>{trip.passengers} {ar?'ركاب':'passengers'} / {trip.luggage} {ar?'قطع أمتعة':'bags'}</p>{trip.mode==='airport'&&<p>{trip.flightNumber} · {trip.flightArrival}</p>}<p>{trip.specialRequest}</p><p>{trip.notes}</p><p>{ar?'إرسال الطلب لا يحجز سيارة ولا يضمن التوفر أو السعر النهائي. لا يُحصّل دفع.':'Submitting does not reserve a vehicle or guarantee availability or final price. No payment is collected.'}</p><label className={styles.check}><input type="checkbox" checked={trip.acknowledged} onChange={e=>change('acknowledged',e.target.checked)}/>{ar?'أوافق على إرسال طلب للمراجعة وأفهم أنه ليس حجزًا مؤكدًا.':'I agree to submit for review and understand this is not a confirmed booking.'}</label><div className={styles.row}><button disabled={sending} onClick={()=>setStep(1)}>{ar?'تعديل':'Edit'}</button><button disabled={sending||!trip.acknowledged} onClick={submit}>{sending?(ar?'جارٍ الإرسال…':'Submitting…'):(ar?'إرسال الطلب':'Submit request')}</button></div></section>}
    {reference&&<section role="status" className={styles.panel}><h2>{ar?'تم استلام الطلب':'Request submitted'}</h2><p>{reference}</p><p>{ar?'ستراجع عمليات مصر الطلب. لم يتم حجز أو دفع.':'Egypt Operations will review your request. No booking or payment has occurred.'}</p><Link className={styles.button} href={`/my-requests/${reference}/drive`}>{ar?'متابعة الطلب':'View request'}</Link></section>}
  </section>;
}
