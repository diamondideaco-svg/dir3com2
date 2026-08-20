'use client';

import { createProductAction } from '@/lib/actions/product-actions';

export default function ProductForm() {
  return (
    <form action={createProductAction} className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-right" dir="rtl">
      <input name="nameAr" placeholder="الاسم بالعربية" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
      <input name="nameEn" placeholder="Name in English" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
      <input name="slug" placeholder="slug" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
      <input name="categoryId" placeholder="Category ID" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
      <input name="basePrice" type="number" placeholder="Base Price" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
      <input name="city" placeholder="City" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none" />
      <select name="status" className="w-full rounded-xl border border-white/10 bg-[#07111D] px-4 py-3 text-white outline-none">
        <option value="draft">Draft</option>
        <option value="published">Published</option>
      </select>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" name="featured" />
        Featured
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" name="verified" />
        Verified
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" name="shieldCertified" />
        Shield Certified
      </label>
      <button type="submit" className="rounded-full bg-[#D4AF37] px-5 py-3 text-sm font-semibold text-[#334155]">إنشاء المنتج</button>
    </form>
  );
}
