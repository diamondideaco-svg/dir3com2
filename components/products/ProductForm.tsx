'use client';

import { createProductAction } from '@/lib/actions/product-actions';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const fieldClass = 'w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20';

export default function ProductForm() {
  const { language } = useLanguage();
  const ar = language === 'ar';

  return (
    <form action={createProductAction} className="space-y-5 rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-navy)]">{ar ? 'إنشاء منتج' : 'Create product'}</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {ar ? 'يُنشأ المنتج كمسودة أولاً. النشر خطوة مستقلة ومدقّقة.' : 'Products are created as drafts first. Publishing is a separate audited action.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">
          {ar ? 'الاسم بالعربية' : 'Arabic name'}
          <input name="nameAr" required className={fieldClass} />
        </label>
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">
          {ar ? 'الاسم بالإنجليزية' : 'English name'}
          <input name="nameEn" required className={fieldClass} />
        </label>
      </div>

      <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">
        {ar ? 'المعرّف النصي' : 'Slug'}
        <input name="slug" placeholder={ar ? 'يُنشأ تلقائياً إذا تُرك فارغاً' : 'Generated automatically if blank'} className={fieldClass} />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">
          {ar ? 'الدولة' : 'Country'}
          <input name="country" required placeholder="EG" className={fieldClass} />
        </label>
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">
          {ar ? 'المدينة' : 'City'}
          <input name="city" placeholder={ar ? 'القاهرة' : 'Cairo'} className={fieldClass} />
        </label>
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">
          {ar ? 'السعر الأساسي' : 'Base price'}
          <input name="basePrice" type="number" min="0" step="0.01" defaultValue="0" required className={fieldClass} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">
          {ar ? 'العائلة' : 'Family'}
          <select name="marketplaceFamily" defaultValue="drive" className={fieldClass}>
            <option value="drive">Drive</option>
            <option value="stay">Stay</option>
            <option value="fly">Fly</option>
            <option value="concierge">Concierge</option>
            <option value="vip">VIP</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">
          {ar ? 'حالة التنفيذ' : 'Fulfilment state'}
          <select name="fulfilmentState" defaultValue="verified_requestable" className={fieldClass}>
            <option value="verified_requestable">{ar ? 'متاح للطلب والتأكيد' : 'Request to confirm'}</option>
            <option value="verified_quote">{ar ? 'يتطلب عرض سعر' : 'Quote required'}</option>
            <option value="live_bookable">{ar ? 'حجز فوري موثّق' : 'Verified instant booking'}</option>
            <option value="availability_unknown">{ar ? 'التوفر غير معروف' : 'Availability unknown'}</option>
            <option value="unavailable">{ar ? 'غير متاح' : 'Unavailable'}</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">
          {ar ? 'طريقة المعاملة' : 'Transaction method'}
          <select name="transactionMethod" defaultValue="request_to_confirm" className={fieldClass}>
            <option value="request_to_confirm">{ar ? 'طلب للتأكيد' : 'Request to confirm'}</option>
            <option value="request_quote">{ar ? 'طلب عرض سعر' : 'Request quote'}</option>
            <option value="instant_booking">{ar ? 'حجز فوري' : 'Instant booking'}</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">
          {ar ? 'نوع التوريد' : 'Supply type'}
          <select name="supplyType" defaultValue="unknown" className={fieldClass}>
            <option value="verified_local_partner">{ar ? 'شريك محلي موثّق' : 'Verified local partner'}</option>
            <option value="global_travel_partner">{ar ? 'شريك سفر عالمي' : 'Global travel partner'}</option>
            <option value="dir3com_managed">{ar ? 'بإدارة dir3com' : 'dir3com managed'}</option>
            <option value="unknown">{ar ? 'غير محدد' : 'Unknown'}</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-5 text-sm text-[var(--color-muted)]">
        <label className="flex items-center gap-2"><input type="checkbox" name="supplierVerified" />{ar ? 'المورد موثّق' : 'Supplier verified'}</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="featured" />{ar ? 'مميّز' : 'Featured'}</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="shieldCertified" />{ar ? 'معتمد من الدرع' : 'Shield certified'}</label>
      </div>

      <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">
        {ar ? 'سبب/ملاحظة التدقيق (اختياري)' : 'Audit note (optional)'}
        <input name="reason" maxLength={300} className={fieldClass} />
      </label>

      <button type="submit" className="min-h-11 rounded-full bg-[#D4AF37] px-6 py-3 text-sm font-bold text-[#0D1B2A] shadow-sm transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2">
        {ar ? 'حفظ كمسودة' : 'Save as draft'}
      </button>
    </form>
  );
}
