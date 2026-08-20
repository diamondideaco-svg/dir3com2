'use client';

import { createCustomerAction } from '@/lib/actions/customer-actions';

export default function CustomerForm() {
  return (
    <form action={createCustomerAction} className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-right" dir="rtl">
      <input name="fullName" placeholder="الاسم الكامل" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
      <input name="email" placeholder="البريد الإلكتروني" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
      <input name="phone" placeholder="رقم الهاتف" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
      <input name="country" placeholder="الدولة" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
      <input name="city" placeholder="المدينة" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
      <select name="shieldLevel" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none">
        <option value="DIR3 Shield">DIR3 Shield</option>
        <option value="DIR3 Tactical Shield">DIR3 Tactical Shield</option>
        <option value="DIR3 Ballistic Shield">DIR3 Ballistic Shield</option>
        <option value="DIR3 Elite Shield">DIR3 Elite Shield</option>
        <option value="DIR3 VIP Shield">DIR3 VIP Shield</option>
      </select>
      <button type="submit" className="rounded-full bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-[#334155]">إنشاء عميل</button>
    </form>
  );
}
