'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { driveOffer, vehicleFor, vehicleTitle, vehicleYearAvailabilityLabel } from '@/lib/drive/catalog';
import { driveRequestState } from '@/lib/drive/request';
import type { DriveRequestRecord } from '@/lib/drive/record';
import { DriveInclusions } from './DriveMarketplace';
import styles from './drive.module.css';

export default function DriveRequestReview({ request }: { request: DriveRequestRecord }) {
  const { language, direction } = useLanguage(); const ar = language === 'ar'; const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const context = request.drive_request_context; const trip = context.trip;
  const vehicle = vehicleFor(driveOffer(request.drive_offer_id)!);
  const state = driveRequestState(request.status, request.quote_expires_at, now);
  const labels: Record<string, [string,string]> = { request_submitted: ['تم استلام الطلب','Request submitted'], under_review: ['قيد المراجعة','Under review'], confirmed_payment_pending: ['تم تأكيد الطلب — بانتظار الدفع','Request confirmed — payment pending'], declined: ['تم رفض الطلب','Request declined'], expired: ['انتهت صلاحية العرض','Offer expired'] };
  const confirmed = state === 'confirmed_payment_pending';
  return <section className={styles.page} dir={direction}>
    <h1>{confirmed ? (ar?'مراجعة الطلب المؤكد':'Confirmed request review') : (ar?'متابعة طلب السيارة':'Your Drive request')}</h1>
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
      {request.quote_amount!==null ? <><p className={styles.price}>{ar?'الإجمالي المؤكد من العمليات':'Operations-confirmed final total'}: {request.quote_amount} {request.quote_currency}</p><p>{ar?'صالح حتى':'Valid until'}: {request.quote_expires_at ? new Intl.DateTimeFormat(ar?'ar-EG':'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(request.quote_expires_at)) : '—'} (Africa/Cairo)</p></> : <p>{ar?'الإجمالي النهائي تؤكده العمليات':'Final total confirmed by Operations'}</p>}
      <p>{ar?'شروط التغيير والإلغاء لم تُحدد؛ يجب تأكيدها قبل الالتزام.':'Change and cancellation terms have not been supplied; confirm before committing.'}</p>
    </div></section>
    <section className={styles.payment}><h2>{ar?'الدفع الآمن':'Secure payment'}</h2><p>{ar?'الدفع الإلكتروني غير مفعّل. لا تُدخل بيانات بطاقة. يبقى الطلب محفوظًا دون حجز أو تحصيل.':'Online payment is not enabled. Do not enter card information. Your request remains saved without a booking or charge.'}</p><button disabled>{ar?'الدفع غير متاح':'Payment unavailable'}</button></section>
  </section>;
}
