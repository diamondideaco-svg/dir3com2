import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ProductPriceRecord } from '@/lib/supabase/types';

async function getPrices() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('product_prices').select('*').order('created_at', { ascending: false });
  return (data || []) as ProductPriceRecord[];
}

export default async function AdminPricingPage() {
  const prices = await getPrices();

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">التسعير</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">قواعد التسعير</h1>
          </div>
          <Link href="/admin/products" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>

        <div className="space-y-4">
          {prices.map((price) => (
            <div key={price.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
              <p className="text-lg font-semibold text-white">{price.rule_name || 'Rule'}</p>
              <p className="mt-2 text-sm text-slate-300">{price.price} {price.currency}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
