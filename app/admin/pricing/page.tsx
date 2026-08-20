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
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">التسعير</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">قواعد التسعير</h1>
          </div>
          <Link href="/admin/products" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">العودة</Link>
        </div>

        <div className="space-y-4">
          {prices.map((price) => (
            <div key={price.id} className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
              <p className="text-lg font-semibold text-white">{price.rule_name || 'Rule'}</p>
              <p className="mt-2 text-sm text-[var(--color-muted)]">{price.price} {price.currency}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
