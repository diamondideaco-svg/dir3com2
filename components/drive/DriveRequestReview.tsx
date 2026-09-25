'use client';
import Image from 'next/image';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { acceptDriveQuote } from '@/app/my-requests/[reference]/drive/actions';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { driveOffer, vehicleFor, vehicleTitle, vehicleYearAvailabilityLabel } from '@/lib/drive/catalog';
import { driveRequestState } from '@/lib/drive/request';
import type { DriveRequestRecord } from '@/lib/drive/record';
import { DriveInclusions } from './DriveMarketplace';
import styles from './drive.module.css';

export default function DriveRequestReview({ request }: { request: DriveRequestRecord }) {
  const { language, direction } = useLanguage(); const ar = language === 'ar'; const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [acceptance, acceptAction, accepting] = useActionState(acceptDriveQuote, '');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (acceptance === 'ACCEPTED') router.refresh(); }, [acceptance, router]);
  const context = request.drive_request_context; const trip = context.trip;
  const vehicle = vehicleFor(driveOffer(request.drive_offer_id)!);
  const state = driveRequestState(request.status, request.quote_expires_at, now);
  const labels: Record<string, [string,string]> = {
    request_submitted: ['تم استلام الطلب','Request submitted'],
    under_review: ['قيد المراجعة','Under review'],
    quote_ready: ['العرض النهائي جاهز لموافقتك','Final quote ready for your acceptance'],
    ready_for_payment: ['تم قبول العرض — الدفع غير مفعّل بعد','Quote accepted — payment is not enabled yet'],
    declined: ['تم رفض الطلب','Request declined'],
    expired: ['انتهت صلاحية العرض','Offer expired'],
  };
  const quoteReady = state === 'quote_ready';
  const accepted = state === 'ready_for_payment';
  const actionMessages: Record<string,[string,string]> = {
    INVALID: ['يجب تأكيد مراجعة السعر والشروط.','Confirm that you reviewed the price and terms.'],
    INVALID_OR_EXPIRED: ['تعذر قبول العرض؛ حدّث الصفحة وتحقق من صلاحيته.','The quote could not be accepted. Refresh and check its validity.'],
    STALE: ['تغير الطلب؛ حدّث الصفحة قبل المحاولة.','The request changed. Refresh before trying again.'],
    FORBIDDEN: ['هذا الطلب غير متاح لهذا الحساب.','This request is not available to this account.'],
    UNAUTHORIZED: ['سجّل الدخول للمتابعة.','Sign in to continue.'],
    UNAVAILABLE: ['تعذر حفظ الموافقة الآن. حاول لاحقًا.','Acceptance could not be saved. Try again later.'],
    ACCEPTED: ['تم حفظ موافقتك دون حجز أو تحصيل.','Your acceptance was saved without a booking or charge.'],
  };
  return <section className={styles.page} dir={direction}>
    <h1>{quoteReady || accepted ? (ar?'مراجعة العرض النهائي':'Final quote review') : (ar?'متابعة طلب السيارة':'Your Drive request')}</h1>
    <div className={styles.row}><p>{request.request_reference}</p><button onClick={() => router.refresh()}>{ar?'تحديث الحالة':'Refresh status'}</button></div>
    <p role="status" className={styles.badge}>{labels[state]?.[ar?0:1] ?? (ar?'الحالة غير متاحة':'Status unavailable')}</p>
    <p>{ar?'هذا طلب وليس حجزًا. لم يتم تنفيذ دفع أو إصدار حجز.':'This is a request, not a booking. No payment or booking has been made.'}</p>
    <section className={styles.fields}><div className={styles.panel}>
      <Image src={vehicle.image} alt={vehicleTitle(vehicle,language)} width={800} height={500} className={styles.gallery}/>
      <h2>{context.confirmed_vehicle || vehicleTitle(vehicle,language)}</h2><p className={styles.modelYear}>{context.confirmed_vehicle_year ? `${ar?'موديل':'Model year'} ${context.confirmed_vehicle_year}` : vehicleYearAvailabilityLabel(language)}</p><DriveInclusions ar={ar}/>
    </div><div className={styles.panel}>
      <h2>{ar?'الرحلة والعميل':'Trip and customer'}</h2><p>{trip.pickup} → {trip.dropoff}</p><p dir="ltr">{trip.pickupAt} → {trip.returnAt}</p><p>Africa/Cairo</p>
      <p>{trip.name} · {trip.phone}</p><p>{trip.passengers} {ar?'ركاب':'passengers'} · {trip.luggage} {ar?'قطع أمتعة':'bags'}</p>
      {trip.mode==='airport'&&<p>{trip.flightNumber} · {trip.flightArrival}</p>}<p>{trip.specialRequest}</p><p>{trip.notes}</p>
      <h2>{ar?'تفاصيل السعر':'Price breakdown'}</h2><p>{ar?'سعر المورد الأساسي المحفوظ':'Preserved supplier base rate'}: {context.supplier_amount} {context.supplier_currency}</p>
      {request.quote_amount!==null ? <><p className={styles.price}>{ar?'الإجمالي النهائي من العمليات':'Operations final total'}: {request.quote_amount} {request.quote_currency}</p><p>{ar?'صالح حتى':'Valid until'}: {request.quote_expires_at ? new Intl.DateTimeFormat(ar?'ar-EG':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(request.quote_expires_at)) : '—'} (Africa/Cairo)</p></> : <p>{ar?'الإجمالي النهائي تؤكده العمليات':'Final total confirmed by Operations'}</p>}
      <p>{ar?'شروط التغيير والإلغاء لم تُحدد؛ يجب تأكيدها قبل الالتزام.':'Change and cancellation terms have not been supplied; confirm before committing.'}</p>
    </div></section>
    {quoteReady && <form action={acceptAction} className={styles.payment}>
      <h2>{ar?'موافقة العميل':'Customer acceptance'}</h2>
      <p>{ar?'راجع السعر النهائي والسيارة والشروط. موافقتك تحفظ قبول العرض فقط؛ لا تنشئ حجزًا ولا تنفذ دفعًا.':'Review the final price, vehicle, and terms. Acceptance only records your approval; it does not create a booking or charge.'}</p>
      <input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="version" value={context.version}/>
      <label className={styles.check}><input type="checkbox" name="acknowledged" value="yes" required/><span>{ar?'راجعت السعر النهائي والشروط وأوافق على الانتقال إلى خطوة الدفع عند تفعيلها.':'I reviewed the final price and terms and accept moving to payment when it becomes available.'}</span></label>
      <button type="submit" disabled={accepting}>{accepting ? (ar?'جارٍ الحفظ...':'Saving...') : (ar?'قبول العرض النهائي':'Accept final quote')}</button>
      {acceptance && actionMessages[acceptance] && <p role="status">{actionMessages[acceptance][ar?0:1]}</p>}
    </form>}
    <section className={styles.payment}><h2>{ar?'الدفع الآمن':'Secure payment'}</h2><p>{accepted ? (ar?'تم حفظ موافقتك. الدفع الإلكتروني غير مفعّل؛ لا يوجد حجز أو تحصيل حتى الآن.':'Your acceptance is saved. Online payment is not enabled; no booking or charge exists yet.') : (ar?'الدفع الإلكتروني غير مفعّل. لا تُدخل بيانات بطاقة. يبقى الطلب محفوظًا دون حجز أو تحصيل.':'Online payment is not enabled. Do not enter card information. Your request remains saved without a booking or charge.')}</p><button disabled>{ar?'الدفع غير متاح':'Payment unavailable'}</button></section>
  </section>;
}
