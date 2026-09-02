'use client';

import { AdminUnavailableControl } from '@/components/admin/AdminLocale';
import { useLanguage } from '@/components/i18n/LanguageProvider';

export default function CustomerForm() {
  const { language } = useLanguage();
  const t = language === 'ar' ? { name: 'الاسم الكامل', email: 'البريد الإلكتروني', phone: 'رقم الهاتف', country: 'الدولة', city: 'المدينة' } : { name: 'Full name', email: 'Email address', phone: 'Phone number', country: 'Country', city: 'City' };
  return (
    <form className="space-y-4 rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <fieldset disabled className="space-y-4 opacity-65">
      <input name="fullName" placeholder={t.name} aria-label={t.name} required className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <input name="email" type="email" placeholder={t.email} aria-label={t.email} required className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <input name="phone" placeholder={t.phone} aria-label={t.phone} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <input name="country" placeholder={t.country} aria-label={t.country} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <input name="city" placeholder={t.city} aria-label={t.city} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
      <select name="shieldLevel" className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-white outline-none">
        <option value="DIR3 Shield">DIR3 Shield</option>
        <option value="DIR3 Tactical Shield">DIR3 Tactical Shield</option>
        <option value="DIR3 Ballistic Shield">DIR3 Ballistic Shield</option>
        <option value="DIR3 Elite Shield">DIR3 Elite Shield</option>
        <option value="DIR3 VIP Shield">DIR3 VIP Shield</option>
      </select>
      </fieldset>
      <AdminUnavailableControl ar="إنشاء عميل" en="Create customer" reasonAr="الإنشاء غير متاح حتى تُنفَّذ عملية حالة وتدقيق ذرّية." reasonEn="Creation is unavailable until an atomic state and audit workflow is implemented." className="rounded-full bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-[#334155]" />
    </form>
  );
}
