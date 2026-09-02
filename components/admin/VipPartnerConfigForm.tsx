'use client';

import type { VipPartnerConfig } from '@/lib/travel/contracts';
import { updateVipPartnerConfigAction } from '@/lib/actions/vip-partner-actions';
import { AdminSubmitButton } from '@/components/admin/AdminLocale';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const input = 'w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-slate-800';
export default function VipPartnerConfigForm({ config }: { config: VipPartnerConfig }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  return (
    <form action={updateVipPartnerConfigAction} className="space-y-5 rounded-3xl border border-amber-300 bg-amber-50 p-6">
      <div className="rounded-xl bg-amber-200 p-4 font-bold text-amber-950">{ar ? 'غير متحقق / بيانات اختبار — عنصر اصطناعي — للتطوير المحلي فقط' : 'UNVERIFIED / TEST DATA — synthetic_test_placeholder — local development only'}</div>
      <input type="hidden" name="partnerId" value={config.partnerId} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={ar ? 'الاسم القانوني' : 'Legal name'}><input className={input} name="legalName" defaultValue={config.legalName} required /></Field>
        <Field label={ar ? 'اسم العرض' : 'Display name'}><input className={input} name="displayName" defaultValue={config.displayName} required /></Field>
        <Field label={ar ? 'الخدمة' : 'Service'}><input className={input} value="DIR3 VIP" readOnly /></Field>
        <Field label={ar ? 'العملة' : 'Currency'}><input className={input} value="EGP" readOnly /></Field>
        <Field label={ar ? 'ساعات التشغيل' : 'Operating hours'}><input className={input} name="operatingHours" defaultValue={config.operatingHours} required /></Field>
        <Field label={ar ? 'مهلة الاستجابة (دقيقة)' : 'Response SLA (minutes)'}><input className={input} name="responseSlaMinutes" type="number" min="1" defaultValue={config.responseSlaMinutes} required /></Field>
        <Field label={ar ? 'الحد الأدنى للمهلة (ساعة)' : 'Minimum lead time (hours)'}><input className={input} name="minimumLeadTimeHours" type="number" min="1" defaultValue={config.minimumLeadTimeHours} required /></Field>
        <Field label={ar ? 'صلاحية العرض (دقيقة)' : 'Quote validity (minutes)'}><input className={input} name="quoteValidityMinutes" type="number" min="1" defaultValue={config.quoteValidityMinutes} required /></Field>
        <Field label={ar ? 'طريقة الحجز' : 'Booking method'}><select className={input} name="bookingMethod" defaultValue={config.bookingMethod}><option value="partner_portal_confirmation">{ar ? 'تأكيد بوابة الشريك' : 'Partner portal confirmation'}</option><option value="admin_confirmed_request">{ar ? 'طلب يؤكده المسؤول' : 'Admin-confirmed request'}</option></select></Field>
        <Field label={ar ? 'نموذج التسعير' : 'Pricing model'}><select className={input} name="pricingModel" defaultValue={config.pricingModel}><option value="fixed_test_fixture">{ar ? 'سعر اختبار ثابت' : 'Fixed test fixture'}</option><option value="request_quote">{ar ? 'طلب عرض' : 'Request quote'}</option></select></Field>
        <Field label={ar ? 'السعر الأساسي الاصطناعي بالجنيه' : 'Base price (synthetic EGP)'}><input className={input} name="basePrice" type="number" min="1" defaultValue={config.basePrice} required /></Field>
        <Field label={ar ? 'سعر المسافر الاصطناعي بالجنيه' : 'Per-passenger price (synthetic EGP)'}><input className={input} name="perPassengerPrice" type="number" min="1" defaultValue={config.perPassengerPrice} required /></Field>
        <Field label={ar ? 'جهة الاتصال التشغيلية' : 'Operational contact'}><input className={input} name="operationalContact" defaultValue={config.operationalContact} required /></Field>
        <Field label={ar ? 'جهة اتصال التصعيد' : 'Escalation contact'}><input className={input} name="escalationContact" defaultValue={config.escalationContact} required /></Field>
        <Field label={ar ? 'الحالة' : 'Status'}><select className={input} name="status" defaultValue={config.status}><option value="ACTIVE_TEST_ONLY">{ar ? 'نشط للاختبار فقط' : 'ACTIVE_TEST_ONLY'}</option><option value="INACTIVE">{ar ? 'غير نشط' : 'INACTIVE'}</option></select></Field>
      </div>
      <Field label={ar ? 'المدن / المطارات (سطر لكل عنصر)' : 'Cities / airports (one per line)'}><textarea className={input} name="coverage" rows={7} defaultValue={config.coverage.join('\n')} required /></Field>
      <Field label={ar ? 'الضرائب / الرسوم' : 'Taxes / fees'}><textarea className={input} name="taxAndFees" defaultValue={config.taxAndFees} required /></Field>
      <Field label={ar ? 'سياسة الإلغاء' : 'Cancellation policy'}><textarea className={input} name="cancellationPolicy" rows={3} defaultValue={config.cancellationPolicy} required /></Field>
      <Field label={ar ? 'سياسة التعديل' : 'Amendment policy'}><textarea className={input} name="amendmentPolicy" rows={3} defaultValue={config.amendmentPolicy} required /></Field>
      <Field label={ar ? 'نموذج التسوية' : 'Settlement model'}><textarea className={input} name="settlementModel" rows={3} defaultValue={config.settlementModel} required /></Field>
      <AdminSubmitButton ar="حفظ إعداد الاختبار المعزول" en="Save isolated TEST configuration" confirmAr="حفظ إعداد الاختبار المحلي فقط؟" confirmEn="Save this local TEST-only configuration?" className="rounded-full bg-slate-900 px-6 py-3 font-semibold text-white" />
    </form>
  );
}
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) { return <label className="block text-sm font-semibold text-slate-700"><span className="mb-1 block">{label}</span>{children}</label>; }
