'use client';
import { useActionState, useState } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { AdminSubmitButton } from '@/components/admin/AdminLocale';
import { reviewDriveRequest } from '@/app/admin/operations/drive/actions';
import { driveRequestState } from '@/lib/drive/request';
import { savedDriveModelYears, type DriveRequestRecord } from '@/lib/drive/record';
import { DRIVE_CURRENCIES, driveOffer, vehicleFor, vehicleTitle, vehicleYearAvailabilityLabel } from '@/lib/drive/catalog';
import styles from './drive.module.css';

function RequestRow({request,canWrite}:{request:DriveRequestRecord;canWrite:boolean}) {
  const {language}=useLanguage(); const ar=language==='ar'; const [result,action]=useActionState(reviewDriveRequest,'');
  const context=request.drive_request_context; const trip=context.trip; const modelYears=savedDriveModelYears(trip);
  const [selectedAction,setSelectedAction]=useState<'review'|'confirm'|'decline'>(request.status==='under_review'?'confirm':'review');
  const actionCopy={
    review:{ar:'بدء المراجعة',en:'Start review',confirmAr:'بدء مراجعة هذا الطلب؟ ستظهر بعدها حقول إعداد العرض.',confirmEn:'Start reviewing this request? The offer fields will appear next.'},
    confirm:{ar:'إرسال العرض للعميل',en:'Send offer to customer',confirmAr:'إرسال هذا العرض إلى حساب العميل للموافقة؟ هذا لا ينشئ حجزًا أو دفعًا ولا يرسل واتساب تلقائيًا.',confirmEn:'Send this offer to the customer’s account for acceptance? This does not create a booking, take payment or send WhatsApp automatically.'},
    decline:{ar:'رفض الطلب',en:'Decline request',confirmAr:'رفض هذا الطلب؟',confirmEn:'Decline this request?'},
  }[selectedAction];
  const states:Record<string,[string,string]>={request_submitted:['تم استلام الطلب','Request submitted'],under_review:['قيد المراجعة','Under review'],quote_ready:['العرض النهائي بانتظار موافقة العميل','Final quote awaiting customer acceptance'],ready_for_payment:['وافق العميل على العرض — الدفع غير مفعّل','Customer accepted the quote — payment is not enabled'],declined:['تم رفض الطلب','Request declined'],expired:['انتهت صلاحية العرض','Offer expired']};
  const active=['request_submitted','under_review'].includes(request.status);
  const messages:Record<string,[string,string]>={SAVED:['تم حفظ الإجراء في سجل التدقيق.','Action saved with audit.'],STALE:['تغير الطلب؛ حدّث الصفحة.','Request changed; refresh the page.'],FORBIDDEN:['لا توجد صلاحية لعمليات مصر.','Egypt Operations permission denied.'],UNAUTHORIZED:['انتهت الجلسة.','Session expired.'],INVALID:['تحقق من البيانات والمهلة وتسلسل الإجراء.','Check fields, expiry and action order.'],UNAVAILABLE:['تعذّر الحفظ؛ لم نؤكد نجاح الإجراء.','Unable to save; success is not confirmed.']};
  return <article className={styles.panel}><h2>{request.request_reference}</h2><p>{vehicleTitle(vehicleFor(driveOffer(request.drive_offer_id)!),language)}</p>
    <p className={styles.modelYear}>{vehicleYearAvailabilityLabel(language, {modelYears:savedDriveModelYears(trip)})}</p>
    <p>{trip.pickup} → {trip.dropoff} · {trip.pickupAt} → {trip.returnAt} (Africa/Cairo)</p><p>{trip.name} · {trip.phone} · {trip.passengers} {ar?'ركاب':'passengers'} / {trip.luggage} {ar?'أمتعة':'bags'}</p>
    {trip.mode==='airport'&&<p>{trip.flightNumber} · {trip.flightArrival}</p>}<p>{trip.specialRequest}</p><p>{trip.notes}</p><p>{ar?'سعر المورد':'Supplier rate'}: {context.supplier_amount} {context.supplier_currency}</p>
    <p>{ar?'الحالة':'State'}: {states[driveRequestState(request.status,request.quote_expires_at)]?.[ar?0:1] ?? (ar?'الحالة غير متاحة':'Status unavailable')}</p>{result&&<p role="status">{messages[result]?.[ar?0:1]}</p>}
    {active&&canWrite&&<form action={action}><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="version" value={context.version}/>
      <label>{ar?'الإجراء':'Action'}<select name="action" value={selectedAction} onChange={event=>setSelectedAction(event.target.value as typeof selectedAction)}>{request.status==='request_submitted'?<option value="review">{ar?'بدء المراجعة':'Start review'}</option>:<option value="confirm">{ar?'إرسال العرض للعميل':'Send offer to customer'}</option>}<option value="decline">{ar?'رفض الطلب':'Decline request'}</option></select></label>
      {selectedAction==='review'&&<p className={styles.muted}>{ar?'ابدأ المراجعة أولًا، ثم أدخل السيارة والسعر النهائي ومدة صلاحية العرض. بدء المراجعة لا يرسل عرضًا للعميل.':'Start the review first, then enter the vehicle, final price and offer expiry. Starting a review does not send an offer to the customer.'}</p>}
      {request.status==='under_review'&&selectedAction==='confirm'&&<fieldset className={styles.quoteFields}>
        <legend>{ar?'إعداد العرض وإرساله للعميل':'Prepare and send the customer offer'}</legend>
        <p className={styles.muted}>{ar?'سيظهر العرض في حساب العميل بانتظار موافقته. إرسال العرض لا ينشئ حجزًا أو دفعًا. إشعار واتساب التلقائي غير مفعّل حاليًا.':'The offer will appear in the customer’s account for acceptance. Sending it does not create a booking or take payment. Automatic WhatsApp notifications are not enabled yet.'}</p>
        <div className={styles.fields}>
          <label>{ar?'السيارة أو الفئة المكافئة المؤكدة':'Confirmed vehicle or equivalent class'}<input name="vehicle" required minLength={2} maxLength={200}/></label>
          <label>{ar?'سنة الموديل المؤكدة':'Confirmed model year'}{modelYears ? <select name="vehicleYear" required>{modelYears.map(year=><option key={year}>{year}</option>)}</select> : <input name="vehicleYear" type="number" min="1000" max="9999" step="1" placeholder={ar?'غير محددة — اختياري':'Unspecified — optional'}/>}</label>
          <label>{ar?'الإجمالي النهائي':'Final total'}<input name="amount" type="number" required step="0.01" min="0.01" max="99999999"/></label>
          <label>{ar?'العملة':'Currency'}<select name="currency">{DRIVE_CURRENCIES.map(currency=><option key={currency}>{currency}</option>)}</select></label>
          <label>{ar?'انتهاء صلاحية العرض — القاهرة':'Offer validity deadline — Cairo'}<input name="expires" type="datetime-local" required max={trip.pickupAt}/></label>
        </div>
      </fieldset>}
      <label>{ar?'ملاحظات العمليات الخاصة':'Private Operations notes'}<textarea name="note" maxLength={2000}/></label>
      <AdminSubmitButton {...actionCopy} className={styles.button}/>
    </form>}
  </article>;
}
export default function DriveOperations({requests,canWrite}:{requests:DriveRequestRecord[];canWrite:boolean}){
  const {language,direction}=useLanguage(); const ar=language==='ar';
  return <main className={styles.page} dir={direction}><h1>{ar?'طلبات سيارات مصر':'Egypt Drive requests'}</h1><p>{ar?'عمليات مصر — صلاحيات محددة بالنطاق. لا إرسال تلقائي للمورد ولا دفع.':'Egypt Operations — country-scoped authority. No automatic supplier communication or payment.'}</p><p>{ar?'أحدث 100 طلب':'Latest 100 requests'}</p>{requests.length?requests.map(request=><RequestRow key={`${request.id}:${request.drive_request_context.version}`} request={request} canWrite={canWrite}/>):<p>{ar?'لا توجد طلبات في نطاقك.':'No requests in your scope.'}</p>}</main>;
}
