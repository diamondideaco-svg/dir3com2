'use client';

import { AdminUnavailableControl } from '@/components/admin/AdminLocale';
import { useLanguage } from '@/components/i18n/LanguageProvider';

export default function ProductForm() {
  const { language } = useLanguage();
  const ar = language === 'ar';
  return (
    <form className="space-y-4 rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <fieldset disabled className="space-y-4 opacity-65">
      <input name="nameAr" placeholder={ar ? 'الاسم بالعربية' : 'Arabic name'} aria-label={ar ? 'الاسم بالعربية' : 'Arabic name'} required className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <input name="nameEn" placeholder={ar ? 'الاسم بالإنجليزية' : 'English name'} aria-label={ar ? 'الاسم بالإنجليزية' : 'English name'} required className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <input name="slug" placeholder={ar ? 'المعرّف النصي' : 'Slug'} aria-label={ar ? 'المعرّف النصي' : 'Slug'} required className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <input name="categoryId" placeholder={ar ? 'معرّف الفئة' : 'Category ID'} aria-label={ar ? 'معرّف الفئة' : 'Category ID'} required className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <input name="basePrice" type="number" min="0" placeholder={ar ? 'السعر الأساسي' : 'Base price'} aria-label={ar ? 'السعر الأساسي' : 'Base price'} required className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <input name="country" placeholder={ar ? 'الدولة' : 'Country'} aria-label={ar ? 'الدولة' : 'Country'} required className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <input name="city" placeholder={ar ? 'المدينة' : 'City'} aria-label={ar ? 'المدينة' : 'City'} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <select name="status" className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-white outline-none">
        <option value="draft">{ar ? 'مسودة' : 'Draft'}</option>
        <option value="published">{ar ? 'منشور' : 'Published'}</option>
      </select>
      <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <input type="checkbox" name="featured" />
        {ar ? 'مميّز' : 'Featured'}
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <input type="checkbox" name="verified" />
        {ar ? 'موثّق' : 'Verified'}
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <input type="checkbox" name="shieldCertified" />
        {ar ? 'معتمد من الدرع' : 'Shield certified'}
      </label>
      </fieldset>
      <AdminUnavailableControl ar="إنشاء المنتج" en="Create product" reasonAr="الإنشاء غير متاح حتى تُنفَّذ عملية موافقة وتدقيق ذرّية." reasonEn="Creation is unavailable until an atomic approval and audit workflow is implemented." className="rounded-full bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-[#334155]" />
    </form>
  );
}
