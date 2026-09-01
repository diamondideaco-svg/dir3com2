'use client';

import { useState } from 'react';
import type { PartnerRecord } from '@/lib/supabase/types';
import { useLanguage } from '@/components/i18n/LanguageProvider';

type PartnerFormProps = {
  initialData?: PartnerRecord | null;
};

const defaultValues = {
  company_name: '',
  contact_person: '',
  email: '',
  phone: '',
  country: '',
  city: '',
  commercial_registration: '',
  tax_number: '',
  iban: '',
  status: 'pending',
  shield_level: 'basic',
};

export default function PartnerForm({ initialData }: PartnerFormProps) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [form, setForm] = useState(() => ({
    ...defaultValues,
    ...(initialData || {}),
    phone: initialData?.phone ?? '',
    country: initialData?.country ?? '',
    city: initialData?.city ?? '',
    commercial_registration: initialData?.commercial_registration ?? '',
    tax_number: initialData?.tax_number ?? '',
    iban: initialData?.iban ?? '',
  }));

  const handleChange = (key: keyof typeof defaultValues, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-[var(--color-muted)]">
          <span className="mb-2 block">{ar ? 'اسم الشركة' : 'Company name'}</span>
          <input value={form.company_name} onChange={(e) => handleChange('company_name', e.target.value)} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
        </label>
        <label className="text-sm text-[var(--color-muted)]">
          <span className="mb-2 block">{ar ? 'الشخص المسؤول' : 'Contact person'}</span>
          <input value={form.contact_person} onChange={(e) => handleChange('contact_person', e.target.value)} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
        </label>
        <label className="text-sm text-[var(--color-muted)]">
          <span className="mb-2 block">{ar ? 'البريد الإلكتروني' : 'Email address'}</span>
          <input value={form.email} onChange={(e) => handleChange('email', e.target.value)} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
        </label>
        <label className="text-sm text-[var(--color-muted)]">
          <span className="mb-2 block">{ar ? 'رقم الهاتف' : 'Phone number'}</span>
          <input value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
        </label>
        <label className="text-sm text-[var(--color-muted)]">
          <span className="mb-2 block">{ar ? 'الدولة' : 'Country'}</span>
          <input value={form.country} onChange={(e) => handleChange('country', e.target.value)} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
        </label>
        <label className="text-sm text-[var(--color-muted)]">
          <span className="mb-2 block">{ar ? 'المدينة' : 'City'}</span>
          <input value={form.city} onChange={(e) => handleChange('city', e.target.value)} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
        </label>
        <label className="text-sm text-[var(--color-muted)]">
          <span className="mb-2 block">{ar ? 'السجل التجاري' : 'Commercial registration'}</span>
          <input value={form.commercial_registration} onChange={(e) => handleChange('commercial_registration', e.target.value)} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
        </label>
        <label className="text-sm text-[var(--color-muted)]">
          <span className="mb-2 block">{ar ? 'الرقم الضريبي' : 'Tax number'}</span>
          <input value={form.tax_number} onChange={(e) => handleChange('tax_number', e.target.value)} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
        </label>
        <label className="text-sm text-[var(--color-muted)]">
          <span className="mb-2 block">IBAN</span>
          <input value={form.iban} onChange={(e) => handleChange('iban', e.target.value)} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none" />
        </label>
        <label className="text-sm text-[var(--color-muted)]">
          <span className="mb-2 block">{ar ? 'الحالة' : 'Status'}</span>
          <select value={form.status} onChange={(e) => handleChange('status', e.target.value)} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none">
            <option value="active">{ar ? 'نشط' : 'Active'}</option>
            <option value="pending">{ar ? 'قيد المراجعة' : 'Under review'}</option>
            <option value="inactive">{ar ? 'غير نشط' : 'Inactive'}</option>
          </select>
        </label>
        <label className="text-sm text-[var(--color-muted)]">
          <span className="mb-2 block">{ar ? 'مستوى الحماية' : 'Shield level'}</span>
          <select value={form.shield_level} onChange={(e) => handleChange('shield_level', e.target.value)} className="w-full rounded-xl border border-[color:var(--color-border)] bg-white px-4 py-3 text-[#334155] outline-none">
            <option value="basic">{ar ? 'أساسي' : 'Basic'}</option>
            <option value="silver">{ar ? 'فضي' : 'Silver'}</option>
            <option value="gold">{ar ? 'ذهبي' : 'Gold'}</option>
            <option value="platinum">{ar ? 'بلاتيني' : 'Platinum'}</option>
          </select>
        </label>
      </div>
      <div className="mt-6 flex justify-end">
        <button type="button" disabled aria-describedby="partner-form-unavailable" className="cursor-not-allowed rounded-full bg-[#D4AF37]/50 px-5 py-3 text-sm font-semibold text-[#334155]">{ar ? 'الحفظ غير متاح في هذه الواجهة' : 'Saving is unavailable on this surface'}</button>
      </div>
      <p id="partner-form-unavailable" className="mt-3 text-xs text-[var(--color-muted)]">{ar ? 'إدارة الشريك التشغيلية تتم عبر مسار الشريك المعتمد.' : 'Operational partner changes use the approved partner workflow.'}</p>
    </form>
  );
}
