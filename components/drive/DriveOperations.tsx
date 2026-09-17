'use client';
import { useActionState } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { AdminSubmitButton } from '@/components/admin/AdminLocale';
import { reviewDriveRequest } from '@/app/admin/operations/drive/actions';
import { driveRequestState } from '@/lib/drive/request';
import type { DriveRequestRecord } from '@/lib/drive/record';
import { DRIVE_CURRENCIES, driveOffer, vehicleFor, vehicleTitle } from '@/lib/drive/catalog';
import styles from './drive.module.css';

function RequestRow({request,canWrite}:{request:DriveRequestRecord;canWrite:boolean}) {
  const {language}=useLanguage(); const ar=language==='ar'; const [result,action]=useActionState(reviewDriveRequest,'');
  const context=request.drive_request_context; const trip=context.trip;
  const states:Record<string,[string,string]>={request_submitted:['تم استلام الطلب','Request submitted'],under_review:['قيد المراجعة','Under review'],confirmed_payment_pending:['تم تأكيد الطلب — بانتظار الدفع','Request confirmed — payment pending'],declined:['تم رفض الطلب','Request declined'],expired:['انتهت صلاحية العرض','Offer expired']};
  const active=['request_submitted','under_review'].includes(request.status);
  const messages:Record<string,[string,string]>={SAVED:['تم حفظ الإجراء في سجل التدقيق.','Action saved with audit.'],STALE:['تغير الطلب؛ حدّث الصفحة.','Request changed; refresh the page.'],FORBIDDEN:['لا توجد صلاحية لعمليات مصر.','Egypt Operations permission denied.'],UNAUTHORIZED:['انتهت الجلسة.','Session expired.'],INVALID:['تحقق من البيانات والمهلة وتسلسل الإجراء.','Check fields, expiry and action order.'],UNAVAILABLE:['تعذّر الحفظ؛ لم نؤكد نجاح الإجراء.','Unable to save; success is not confirmed.']};
  return <article className={styles.panel}><h2>{request.request_reference}</h2><p>{vehicleTitle(vehicleFor(driveOffer(request.drive_offer_id)!),language)}</p>
    <p>{trip.pickup} → {trip.dropoff} · {trip.pickupAt} → {trip.returnAt} (Africa/Cairo)</p><p>{trip.name} · {trip.phone} · {trip.passengers} {ar?'ركاب':'passengers'} / {trip.luggage} {ar?'أمتعة':'bags'}</p>
    {trip.mode==='airport'&&<p>{trip.flightNumber} · {trip.flightArrival}</p>}<p>{trip.specialRequest}</p><p>{trip.notes}</p><p>{ar?'سعر المورد':'Supplier rate'}: {context.supplier_amount} {context.supplier_currency}</p>
    <p>{ar?'الحالة':'State'}: {states[driveRequestState(request.status,request.quote_expires_at)]?.[ar?0:1] ?? (ar?'الحالة غير متاحة':'Status unavailable')}</p>{result&&<p role="status">{messages[result]?.[ar?0:1]}</p>}
    {active&&canWrite&&<form action={action}><input type="hidden" name="requestId" value={request.id}/><input type="hidden" name="version" value={context.version}/>
      <div className={styles.fields}><label>{ar?'الإجراء':'Action'}<select name="action">{request.status==='request_submitted'?<option value="review">{ar?'بدء المراجعة':'Start review'}</option>:<option value="confirm">{ar?'تأكيد الطلب — دون حجز أو دفع':'Confirm request — no booking or payment'}</option>}<option value="decline">{ar?'رفض':'Decline'}</option></select></label>
      {request.status==='under_review'&&<><label>{ar?'السيارة أو الفئة المكافئة المؤكدة':'Confirmed vehicle or equivalent class'}<input name="vehicle" maxLength={200}/></label><label>{ar?'الإجمالي النهائي':'Final total'}<input name="amount" type="number" step="0.01" min="0.01" max="99999999"/></label><label>{ar?'العملة':'Currency'}<select name="currency">{DRIVE_CURRENCIES.map(currency=><option key={currency}>{currency}</option>)}</select></label><label>{ar?'انتهاء صلاحية العرض — القاهرة':'Offer validity deadline — Cairo'}<input name="expires" type="datetime-local"/></label></>}
      <label>{ar?'ملاحظات العمليات الخاصة':'Private Operations notes'}<textarea name="note" maxLength={2000}/></label></div>
      <AdminSubmitButton ar="حفظ الإجراء" en="Save action" confirmAr="تنفيذ الإجراء المحدد على هذا الطلب؟ لا ينشئ حجزًا أو دفعًا." confirmEn="Apply the selected action to this request? This creates no booking or payment." className={styles.button}/>
    </form>}
  </article>;
}
export default function DriveOperations({requests,canWrite}:{requests:DriveRequestRecord[];canWrite:boolean}){
  const {language,direction}=useLanguage(); const ar=language==='ar';
  return <main className={styles.page} dir={direction}><h1>{ar?'طلبات سيارات مصر':'Egypt Drive requests'}</h1><p>{ar?'عمليات مصر — صلاحيات محددة بالنطاق. لا إرسال تلقائي للمورد ولا دفع.':'Egypt Operations — country-scoped authority. No automatic supplier communication or payment.'}</p><p>{ar?'أحدث 100 طلب':'Latest 100 requests'}</p>{requests.length?requests.map(request=><RequestRow key={`${request.id}:${request.drive_request_context.version}`} request={request} canWrite={canWrite}/>):<p>{ar?'لا توجد طلبات في نطاقك.':'No requests in your scope.'}</p>}</main>;
}
