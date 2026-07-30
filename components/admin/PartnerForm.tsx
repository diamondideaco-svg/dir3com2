'use client';

import { useState } from 'react';
import type { PartnerRecord } from '@/lib/supabase/types';

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
    <form className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-right" dir="rtl">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-300">
          <span className="mb-2 block">اسم الشركة</span>
          <input value={form.company_name} onChange={(e) => handleChange('company_name', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
        </label>
        <label className="text-sm text-slate-300">
          <span className="mb-2 block">الشخص المسؤول</span>
          <input value={form.contact_person} onChange={(e) => handleChange('contact_person', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
        </label>
        <label className="text-sm text-slate-300">
          <span className="mb-2 block">البريد الإلكتروني</span>
          <input value={form.email} onChange={(e) => handleChange('email', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
        </label>
        <label className="text-sm text-slate-300">
          <span className="mb-2 block">رقم الهاتف</span>
          <input value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
        </label>
        <label className="text-sm text-slate-300">
          <span className="mb-2 block">الدولة</span>
          <input value={form.country} onChange={(e) => handleChange('country', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
        </label>
        <label className="text-sm text-slate-300">
          <span className="mb-2 block">المدينة</span>
          <input value={form.city} onChange={(e) => handleChange('city', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
        </label>
        <label className="text-sm text-slate-300">
          <span className="mb-2 block">السجل التجاري</span>
          <input value={form.commercial_registration} onChange={(e) => handleChange('commercial_registration', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
        </label>
        <label className="text-sm text-slate-300">
          <span className="mb-2 block">الرقم الضريبي</span>
          <input value={form.tax_number} onChange={(e) => handleChange('tax_number', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
        </label>
        <label className="text-sm text-slate-300">
          <span className="mb-2 block">IBAN</span>
          <input value={form.iban} onChange={(e) => handleChange('iban', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
        </label>
        <label className="text-sm text-slate-300">
          <span className="mb-2 block">الحالة</span>
          <select value={form.status} onChange={(e) => handleChange('status', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none">
            <option value="active">نشط</option>
            <option value="pending">قيد المراجعة</option>
            <option value="inactive">غير نشط</option>
          </select>
        </label>
        <label className="text-sm text-slate-300">
          <span className="mb-2 block">مستوى الحماية</span>
          <select value={form.shield_level} onChange={(e) => handleChange('shield_level', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none">
            <option value="basic">أساسي</option>
            <option value="silver">فضي</option>
            <option value="gold">ذهبي</option>
            <option value="platinum">بلاتيني</option>
          </select>
        </label>
      </div>
      <div className="mt-6 flex justify-end">
        <button type="button" className="rounded-full bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-[#0D1B2A]">حفظ الشريك</button>
      </div>
    </form>
  );
}
