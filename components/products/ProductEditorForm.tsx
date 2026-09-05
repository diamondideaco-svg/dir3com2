'use client';

import Link from 'next/link';
import { updateProductAction } from '@/lib/actions/product-actions';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const fieldClass = 'w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20';

type ProductDraft = {
  id: string;
  name_ar: string;
  name_en: string;
  slug: string;
  base_price: number;
  country?: string | null;
  city?: string | null;
  marketplace_family?: string | null;
  fulfilment_state?: string | null;
  transaction_method?: string | null;
  supply_type?: string | null;
  supplier_verified?: boolean | null;
  featured?: boolean | null;
  shield_certified?: boolean | null;
  lifecycle_version?: number | null;
  status: string;
};

export default function ProductEditorForm({ product }: { product: ProductDraft }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const editable = product.status === 'draft' && Number(product.lifecycle_version) > 0;

  if (!editable) {
    return (
      <section className="rounded-[1.5rem] border border-amber-300/60 bg-amber-50 p-6 text-amber-900">
        <h2 className="text-lg font-semibold">{ar ? 'التعديل غير متاح في هذه الحالة' : 'Editing is unavailable in this state'}</h2>
        <p className="mt-2 text-sm leading-6">
          {ar ? 'ألغِ نشر المنتج أولاً، أو فعّل دورة الحياة لهذه البيئة، ثم عد للتعديل. لا يتم تعديل منتج منشور بصمت.' : 'Unpublish the product first, or activate the lifecycle for this environment, then return to edit. Published products are never edited silently.'}
        </p>
        <Link href="/admin/products" className="mt-4 inline-flex rounded-full border border-amber-500 px-4 py-2 text-sm font-semibold">
          {ar ? 'العودة للمنتجات' : 'Back to products'}
        </Link>
      </section>
    );
  }

  return (
    <form action={updateProductAction} className="space-y-5 rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <input type="hidden" name="id" value={product.id} />
      <input type="hidden" name="expectedVersion" value={product.lifecycle_version ?? ''} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">{ar ? 'الاسم بالعربية' : 'Arabic name'}<input name="nameAr" required defaultValue={product.name_ar} className={fieldClass} /></label>
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">{ar ? 'الاسم بالإنجليزية' : 'English name'}<input name="nameEn" required defaultValue={product.name_en} className={fieldClass} /></label>
      </div>

      <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">{ar ? 'المعرّف النصي' : 'Slug'}<input name="slug" defaultValue={product.slug} className={fieldClass} /></label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">{ar ? 'الدولة' : 'Country'}<input name="country" required defaultValue={product.country || ''} className={fieldClass} /></label>
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">{ar ? 'المدينة' : 'City'}<input name="city" defaultValue={product.city || ''} className={fieldClass} /></label>
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">{ar ? 'السعر الأساسي' : 'Base price'}<input name="basePrice" type="number" min="0" step="0.01" required defaultValue={product.base_price} className={fieldClass} /></label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">{ar ? 'العائلة' : 'Family'}
          <select name="marketplaceFamily" defaultValue={product.marketplace_family || 'drive'} className={fieldClass}>
            <option value="drive">Drive</option><option value="stay">Stay</option><option value="fly">Fly</option><option value="concierge">Concierge</option><option value="vip">VIP</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">{ar ? 'حالة التنفيذ' : 'Fulfilment state'}
          <select name="fulfilmentState" defaultValue={product.fulfilment_state || 'verified_requestable'} className={fieldClass}>
            <option value="verified_requestable">{ar ? 'متاح للطلب والتأكيد' : 'Request to confirm'}</option>
            <option value="verified_quote">{ar ? 'يتطلب عرض سعر' : 'Quote required'}</option>
            <option value="live_bookable">{ar ? 'حجز فوري موثّق' : 'Verified instant booking'}</option>
            <option value="availability_unknown">{ar ? 'التوفر غير معروف' : 'Availability unknown'}</option>
            <option value="unavailable">{ar ? 'غير متاح' : 'Unavailable'}</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">{ar ? 'طريقة المعاملة' : 'Transaction method'}
          <select name="transactionMethod" defaultValue={product.transaction_method || 'request_to_confirm'} className={fieldClass}>
            <option value="request_to_confirm">{ar ? 'طلب للتأكيد' : 'Request to confirm'}</option><option value="request_quote">{ar ? 'طلب عرض سعر' : 'Request quote'}</option><option value="instant_booking">{ar ? 'حجز فوري' : 'Instant booking'}</option><option value="none">{ar ? 'لا توجد معاملة' : 'No transaction'}</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">{ar ? 'نوع التوريد' : 'Supply type'}
          <select name="supplyType" defaultValue={product.supply_type || 'unknown'} className={fieldClass}>
            <option value="verified_local_partner">{ar ? 'شريك محلي موثّق' : 'Verified local partner'}</option><option value="global_travel_partner">{ar ? 'شريك سفر عالمي' : 'Global travel partner'}</option><option value="dir3com_managed">{ar ? 'بإدارة dir3com' : 'dir3com managed'}</option><option value="unknown">{ar ? 'غير محدد' : 'Unknown'}</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-5 text-sm text-[var(--color-muted)]">
        <label className="flex items-center gap-2"><input type="checkbox" name="supplierVerified" defaultChecked={Boolean(product.supplier_verified)} />{ar ? 'المورد موثّق' : 'Supplier verified'}</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="featured" defaultChecked={Boolean(product.featured)} />{ar ? 'مميّز' : 'Featured'}</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="shieldCertified" defaultChecked={Boolean(product.shield_certified)} />{ar ? 'معتمد من الدرع' : 'Shield certified'}</label>
      </div>

      <label className="grid gap-2 text-sm font-medium text-[var(--color-navy)]">{ar ? 'ملاحظة التدقيق' : 'Audit note'}<input name="reason" maxLength={300} className={fieldClass} /></label>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="min-h-11 rounded-full bg-[#D4AF37] px-6 py-3 text-sm font-bold text-[#0D1B2A]">{ar ? 'حفظ المسودة' : 'Save draft'}</button>
        <Link href="/admin/products" className="min-h-11 rounded-full border border-[color:var(--color-border)] px-6 py-3 text-sm font-semibold text-[var(--color-navy)]">{ar ? 'إلغاء' : 'Cancel'}</Link>
      </div>
    </form>
  );
}
